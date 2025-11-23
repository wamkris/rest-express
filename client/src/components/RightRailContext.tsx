import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { BookOpen, CheckCircle2, AlertCircle, ArrowRight, Clock } from "lucide-react";
import { useEffect, useState } from "react";

interface VideoIntelligence {
  currentConcept: {
    id: string;
    label: string;
    definition?: string;
    difficulty?: string;
    span: {
      startTime: number;
      endTime: number;
    };
  } | null;
  transcript: {
    text: string;
    startTime: number;
    endTime: number;
    tqs?: number;
  } | null;
  keyTerms: string[];
  prerequisites: Array<{
    id: string;
    label: string;
    isMastered: boolean;
    masteryLevel: string;
  }>;
  nextConcepts: Array<{
    id: string;
    label: string;
    bestVideoSpan: {
      videoId: string;
      startTime: number;
      title: string;
    } | null;
  }>;
}

interface RightRailContextProps {
  videoId: string;
  currentTime: number;
  onSeek?: (time: number) => void;
}

export function RightRailContext({ videoId, currentTime, onSeek }: RightRailContextProps) {
  const [timeBucket, setTimeBucket] = useState(0);

  useEffect(() => {
    const bucket = Math.floor(currentTime / 30) * 30;
    setTimeBucket(bucket);
  }, [currentTime]);

  const { data: intelligence, isLoading } = useQuery<VideoIntelligence>({
    queryKey: ['/api/video-intelligence', videoId, timeBucket],
    queryFn: async () => {
      const response = await fetch(`/api/video-intelligence/${videoId}?t=${timeBucket}`);
      if (!response.ok) throw new Error('Failed to fetch intelligence');
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });

  if (isLoading) {
    return (
      <Card className="h-full" data-testid="card-intelligence-loading">
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { currentConcept, transcript, keyTerms, prerequisites, nextConcepts } = intelligence || {};

  return (
    <Card className="h-full flex flex-col" data-testid="card-live-context">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          Live Learning Context
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4" data-testid="scroll-context">
          {currentConcept ? (
            <div className="space-y-4">
              <div className="space-y-2" data-testid="section-current-concept">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">NOW LEARNING</h3>
                  {currentConcept.difficulty && (
                    <Badge variant="outline" className="text-xs" data-testid="badge-difficulty">
                      {currentConcept.difficulty}
                    </Badge>
                  )}
                </div>
                <h4 className="text-lg font-bold" data-testid="text-concept-label">
                  {currentConcept.label}
                </h4>
                {currentConcept.definition && (
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-concept-definition">
                    {currentConcept.definition}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span data-testid="text-concept-timespan">
                    {Math.floor(currentConcept.span.startTime / 60)}:{String(currentConcept.span.startTime % 60).padStart(2, '0')} 
                    {' - '}
                    {Math.floor(currentConcept.span.endTime / 60)}:{String(currentConcept.span.endTime % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>

              <Separator />

              {keyTerms && keyTerms.length > 0 && (
                <>
                  <div className="space-y-2" data-testid="section-key-terms">
                    <h3 className="text-sm font-semibold text-muted-foreground">KEY TERMS</h3>
                    <div className="flex flex-wrap gap-2">
                      {keyTerms.map((term, index) => (
                        <Badge key={index} variant="secondary" className="text-xs" data-testid={`badge-term-${index}`}>
                          {term}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {prerequisites && prerequisites.length > 0 && (
                <>
                  <div className="space-y-2" data-testid="section-prerequisites">
                    <h3 className="text-sm font-semibold text-muted-foreground">PREREQUISITES</h3>
                    <div className="space-y-2">
                      {prerequisites.map((prereq) => (
                        <div
                          key={prereq.id}
                          className="flex items-start gap-2 p-2 rounded-md bg-muted/50"
                          data-testid={`prereq-${prereq.id}`}
                        >
                          {prereq.isMastered ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" data-testid={`icon-mastered-${prereq.id}`} />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" data-testid={`icon-review-${prereq.id}`} />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" data-testid={`text-prereq-label-${prereq.id}`}>
                              {prereq.label}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-prereq-level-${prereq.id}`}>
                              {prereq.isMastered ? '✓ Mastered' : `⚠ Review needed (${prereq.masteryLevel})`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {nextConcepts && nextConcepts.length > 0 && (
                <div className="space-y-2" data-testid="section-next-concepts">
                  <h3 className="text-sm font-semibold text-muted-foreground">NEXT CONCEPTS</h3>
                  <div className="space-y-2">
                    {nextConcepts.map((next) => (
                      <div
                        key={next.id}
                        className="p-2 rounded-md bg-muted/50 space-y-1"
                        data-testid={`next-${next.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <ArrowRight className="w-4 h-4 text-primary" />
                          <p className="text-sm font-medium flex-1" data-testid={`text-next-label-${next.id}`}>
                            {next.label}
                          </p>
                        </div>
                        {next.bestVideoSpan && onSeek && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
                            onClick={() => onSeek(next.bestVideoSpan!.startTime)}
                            data-testid={`button-seek-${next.id}`}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            Jump to {Math.floor(next.bestVideoSpan.startTime / 60)}:{String(next.bestVideoSpan.startTime % 60).padStart(2, '0')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {transcript && (
                <>
                  <Separator />
                  <div className="space-y-2" data-testid="section-transcript">
                    <h3 className="text-sm font-semibold text-muted-foreground">CURRENT TRANSCRIPT</h3>
                    <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-md" data-testid="text-transcript">
                      {transcript.text}
                    </p>
                    {transcript.tqs && (
                      <Badge variant="outline" className="text-xs" data-testid="badge-tqs">
                        Quality: {transcript.tqs}/100
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground" data-testid="div-no-concept">
              <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No concept active at this time</p>
              <p className="text-xs mt-1">Concepts will appear as you watch the video</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
