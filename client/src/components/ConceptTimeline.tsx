import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Concept, ConceptSpan as ConceptSpanType } from "@shared/schema";

interface ConceptWithSpans extends Concept {
  spans: ConceptSpanType[];
}

interface ConceptTimelineProps {
  concepts: ConceptWithSpans[];
  currentTime: number;
  videoDuration: number;
  onSeek?: (time: number) => void;
}

interface ConceptSpanDisplay {
  concept: Concept;
  startTime: number;
  endTime: number;
}

export function ConceptTimeline({ concepts, currentTime, videoDuration, onSeek }: ConceptTimelineProps) {
  const conceptSpans = useMemo<ConceptSpanDisplay[]>(() => {
    const spans: ConceptSpanDisplay[] = [];
    concepts.forEach(concept => {
      if (concept.spans && concept.spans.length > 0) {
        concept.spans.forEach(span => {
          spans.push({
            concept,
            startTime: span.startTime,
            endTime: span.endTime,
          });
        });
      }
    });
    return spans;
  }, [concepts]);

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500 dark:bg-green-600";
      case "intermediate":
        return "bg-yellow-500 dark:bg-yellow-600";
      case "advanced":
        return "bg-red-500 dark:bg-red-600";
      default:
        return "bg-blue-500 dark:bg-blue-600";
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const currentProgress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  if (concepts.length === 0) {
    return null;
  }

  return (
    <Card className="w-full" data-testid="card-concept-timeline">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Concept Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
            style={{ width: `${currentProgress}%` }}
            data-testid="progress-bar"
          />
          <div 
            className="absolute top-0 h-full w-0.5 bg-red-500 dark:bg-red-400 transition-all duration-100"
            style={{ left: `${currentProgress}%` }}
            data-testid="playhead"
          />
        </div>

        <div className="space-y-2" data-testid="concept-list">
          {conceptSpans.map((span, index) => {
            const isActive = currentTime >= span.startTime && currentTime <= span.endTime;
            
            return (
              <Tooltip key={span.concept.id || index}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                      isActive 
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 dark:border-blue-400' 
                        : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onClick={() => onSeek?.(span.startTime)}
                    data-testid={`concept-timeline-item-${span.concept.id}`}
                  >
                    <div 
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${getDifficultyColor(span.concept.difficulty || undefined)}`}
                      data-testid={`indicator-${span.concept.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`title-${span.concept.id}`}>
                        {span.concept.name}
                      </p>
                    </div>
                    {span.concept.difficulty && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        data-testid={`badge-difficulty-${span.concept.id}`}
                      >
                        {span.concept.difficulty}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{span.concept.name}</p>
                    {span.concept.description && (
                      <p className="text-sm text-muted-foreground">{span.concept.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatTime(span.startTime)} - {formatTime(span.endTime)}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
