import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { LeftRailPath } from "@/components/LeftRailPath";
import { RightRailContext } from "@/components/RightRailContext";
import { ReflectiveTray } from "@/components/ReflectiveTray";
import { ConceptTimeline } from "@/components/ConceptTimeline";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import type { Concept, ConceptSpan } from "@shared/schema";

interface PlayerPageProps {
  videoId: string;
  pathId?: string;
}

interface ConceptWithSpans extends Concept {
  spans: ConceptSpan[];
}

interface LearningPath {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  nodes: Array<{
    id: string;
    sequenceOrder: number;
    conceptId?: string;
    videoId?: string;
    concept?: {
      id: string;
      name: string;
      difficulty?: string;
    };
    progress?: {
      isCompleted: boolean;
      masteryLevel: number;
    } | null;
  }>;
}

function PlayerPage({ videoId, pathId }: PlayerPageProps) {
  const [location] = useLocation();
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const pathIdFromUrl = pathId || new URLSearchParams(location.split('?')[1] || '').get('pathId') || undefined;

  const { player, ready, error, currentTime, isPlaying, duration } = useYouTubePlayer({
    videoId,
    containerRef: playerContainerRef,
    onReady: () => {
      console.log('YouTube player ready');
    },
    onStateChange: (state) => {
      console.log('Player state changed:', state);
    },
    onError: (errorCode) => {
      console.error('YouTube player error:', errorCode);
    },
  });

  const { data: pathData, isLoading: pathLoading } = useQuery<LearningPath>({
    queryKey: ['/api/paths', pathIdFromUrl],
    enabled: !!pathIdFromUrl,
  });

  const { data: conceptsWithSpans } = useQuery<ConceptWithSpans[]>({
    queryKey: ['/api/videos', videoId, 'concepts'],
  });

  const currentConcept = conceptsWithSpans?.find(concept => 
    concept.spans.some(span => 
      currentTime >= span.startTime && currentTime <= span.endTime
    )
  );

  const currentNodeId = pathData?.nodes.find(
    node => node.videoId === videoId || node.conceptId === currentConcept?.id
  )?.id;

  const handleSeek = (time: number) => {
    if (player && ready) {
      try {
        player.seekTo(time, true);
      } catch (e) {
        console.error('Error seeking player:', e);
      }
    }
  };

  const handleReflectionSubmit = (reflection: string) => {
    console.log('Reflection submitted:', reflection);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-4 max-w-[1800px]">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="mb-3"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-140px)]">
          <div className="lg:col-span-3 h-full overflow-hidden" data-testid="div-left-rail">
            <LeftRailPath
              pathData={pathData}
              isLoading={pathLoading}
              currentNodeId={currentNodeId}
            />
          </div>

          <div className="lg:col-span-6 flex flex-col gap-4 h-full overflow-hidden" data-testid="div-center-column">
            <Card className="overflow-hidden shadow-lg flex-shrink-0" data-testid="card-player">
              <CardContent className="p-0">
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <div 
                    ref={playerContainerRef}
                    className="absolute top-0 left-0 w-full h-full"
                    data-testid="div-youtube-player-container"
                  />
                </div>
                {error && (
                  <Alert variant="destructive" className="mt-4 mx-4 mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {conceptsWithSpans && conceptsWithSpans.length > 0 && ready && (
              <div className="flex-shrink-0" data-testid="div-concept-timeline">
                <ConceptTimeline
                  concepts={conceptsWithSpans}
                  currentTime={currentTime}
                  videoDuration={duration || 600}
                  onSeek={handleSeek}
                />
              </div>
            )}

            <div className="flex-1 min-h-0">
              <div className="lg:hidden h-full overflow-hidden">
                <RightRailContext
                  videoId={videoId}
                  currentTime={currentTime}
                  onSeek={handleSeek}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 h-full overflow-hidden hidden lg:block" data-testid="div-right-rail">
            <RightRailContext
              videoId={videoId}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </div>

        <div className="mt-4" data-testid="div-reflective-tray">
          <ReflectiveTray
            conceptName={currentConcept?.name}
            onSubmit={handleReflectionSubmit}
          />
        </div>
      </div>
    </div>
  );
}

export default PlayerPage;
