import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PathNode {
  id: string;
  sequenceOrder: number;
  conceptId?: string;
  concept?: {
    id: string;
    name: string;
    difficulty?: string;
  };
  progress?: {
    isCompleted: boolean;
    masteryLevel: number;
  } | null;
}

interface LearningPath {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  nodes: PathNode[];
}

interface LeftRailPathProps {
  pathId?: string;
  pathData?: LearningPath;
  isLoading?: boolean;
  currentNodeId?: string;
}

export function LeftRailPath({ pathData, isLoading, currentNodeId }: LeftRailPathProps) {
  if (isLoading) {
    return (
      <Card className="h-full" data-testid="card-path-loading">
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pathData) {
    return (
      <Card className="h-full" data-testid="card-path-empty">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Learning Path</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Circle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active learning path</p>
            <p className="text-xs mt-1">This video is not part of a structured path</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedNodes = pathData.nodes.filter(n => n.progress?.isCompleted).length;
  const totalNodes = pathData.nodes.length;
  const progressPercent = totalNodes > 0 ? (completedNodes / totalNodes) * 100 : 0;

  return (
    <Card className="h-full flex flex-col" data-testid="card-learning-path">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold" data-testid="text-path-title">
          {pathData.title}
        </CardTitle>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-xs" data-testid="badge-difficulty">
            {pathData.difficulty}
          </Badge>
          <Badge variant="secondary" className="text-xs" data-testid="badge-topic">
            {pathData.topic}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        <div className="space-y-1" data-testid="div-progress-section">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span data-testid="text-progress-count">
              {completedNodes}/{totalNodes} complete
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" data-testid="progress-bar" />
        </div>

        <ScrollArea className="flex-1 pr-4" data-testid="scroll-path-nodes">
          <div className="space-y-2">
            {pathData.nodes
              .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
              .map((node) => {
                const isActive = currentNodeId === node.id;
                const isCompleted = node.progress?.isCompleted || false;
                const masteryLevel = node.progress?.masteryLevel || 0;

                return (
                  <div
                    key={node.id}
                    className={`
                      flex items-start gap-2 p-2 rounded-md transition-colors
                      ${isActive ? 'bg-primary/10 border border-primary' : 'hover:bg-muted/50'}
                    `}
                    data-testid={`node-${node.id}`}
                  >
                    <div className="mt-0.5">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-completed-${node.id}`} />
                      ) : isActive ? (
                        <PlayCircle className="w-5 h-5 text-primary" data-testid={`icon-active-${node.id}`} />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" data-testid={`icon-pending-${node.id}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none mb-1" data-testid={`text-concept-name-${node.id}`}>
                        {node.concept?.name || `Step ${node.sequenceOrder}`}
                      </p>
                      {isActive && (
                        <Badge variant="default" className="text-xs" data-testid={`badge-current-${node.id}`}>
                          You are here
                        </Badge>
                      )}
                      {isCompleted && masteryLevel > 0 && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid={`text-mastery-${node.id}`}>
                          Mastery: {masteryLevel}%
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
