import { useState, useEffect } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePullRefresh } from "../hooks/use-pull-refresh";
import { refreshVideos } from "../lib/claude";
import VideoItem from "./video-item";
import CompletionCelebration from "./completion-celebration";
import ReviewConcepts from "./review-concepts";
import TestKnowledge from "./test-knowledge";

import ProgressBar from "./progress-bar";
import ResultsNotificationSettings from "./results-notification-settings";
import { 
  initializeTopicProgress, 
  toggleVideoProgress, 
  getTopicProgress, 
  mergeVideoProgress,
  isRecentlyCompleted,
  type TopicProgress 
} from "../lib/progress";
import type { CuratedVideo } from "../types/video";

interface VideoListProps {
  videos: CuratedVideo[];
  topic: string;
  learningGoal: string;
  preferenceId: string;
  onBack: () => void;
}

export default function VideoList({ videos, topic, learningGoal, preferenceId, onBack }: VideoListProps) {
  const [currentVideos, setCurrentVideos] = useState(videos);
  const [activeTab, setActiveTab] = useState("all");
  const [topicProgress, setTopicProgress] = useState<TopicProgress | null>(null);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [showReviewConcepts, setShowReviewConcepts] = useState(false);
  const [showTestKnowledge, setShowTestKnowledge] = useState(false);
  const { toast} = useToast();
  const queryClient = useQueryClient();
  
  // Detect if this is a depth-focused learning session
  const hasDepthDimensions = videos.some(v => v.depthDimension);

  // Initialize progress tracking when component mounts
  useEffect(() => {
    const progress = initializeTopicProgress(preferenceId, topic, videos, learningGoal);
    setTopicProgress(progress);
    
    // Merge progress data with videos
    const videosWithProgress = mergeVideoProgress(videos, progress);
    setCurrentVideos(videosWithProgress);
    
    // Scroll to top when component mounts (especially important for resume learning)
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [preferenceId, topic, videos, learningGoal]);

  const refreshMutation = useMutation({
    mutationFn: () => refreshVideos(preferenceId),
    onSuccess: (data) => {
      setCurrentVideos(data.videos);
      queryClient.invalidateQueries({ queryKey: ['/api/videos', preferenceId] });
      toast({
        title: "Videos refreshed!",
        description: "New educational content has been curated for you.",
      });
    },
    onError: (error) => {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Failed to refresh videos",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = async () => {
    await refreshMutation.mutateAsync();
  };

  // Filter videos by difficulty level
  const filterVideosByDifficulty = (difficulty: string) => {
    if (difficulty === "all") return currentVideos;
    return currentVideos.filter(video => video.difficultyLevel === difficulty);
  };

  // Filter videos by depth dimension
  const filterVideosByDepth = (dimension: string) => {
    if (dimension === "all") return currentVideos;
    return currentVideos.filter(video => video.depthDimension === dimension);
  };

  // Get video counts for each tab
  const getVideoCounts = () => {
    if (hasDepthDimensions) {
      // Depth-based counts
      return {
        all: currentVideos.length,
        conceptual: currentVideos.filter(v => v.depthDimension === "conceptual").length,
        analytical: currentVideos.filter(v => v.depthDimension === "analytical").length,
        strategic: currentVideos.filter(v => v.depthDimension === "strategic").length,
        critical: currentVideos.filter(v => v.depthDimension === "critical").length,
        evolutionary: currentVideos.filter(v => v.depthDimension === "evolutionary").length,
      };
    }
    
    // Difficulty-based counts
    const beginnerCount = currentVideos.filter(v => v.difficultyLevel === "beginner").length;
    const intermediateCount = currentVideos.filter(v => v.difficultyLevel === "intermediate").length;
    const advancedCount = currentVideos.filter(v => v.difficultyLevel === "advanced").length;
    
    return {
      all: currentVideos.length,
      beginner: beginnerCount,
      intermediate: intermediateCount,
      advanced: advancedCount
    };
  };

  const videoCounts = getVideoCounts();

  const { showIndicator, pullDistance, isRefreshing } = usePullRefresh({
    onRefresh: handleRefresh,
    threshold: 80,
  });

  // Helper functions for progress tracking
  const getNextVideoNumber = () => {
    const sortedVideos = [...currentVideos].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const nextUnwatched = sortedVideos.find(video => !video.isWatched);
    return nextUnwatched ? nextUnwatched.sequenceOrder : sortedVideos.length;
  };

  const getNextVideo = () => {
    const sortedVideos = [...currentVideos].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    return sortedVideos.find(video => !video.isWatched);
  };

  const handleVideoClick = (videoId: string) => {
    toast({
      title: "Opening video...",
      description: "Opening in new tab",
    });
    
    // Open the YouTube video in new tab only
    const youtubeWebUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeWebUrl, '_blank', 'noopener,noreferrer');
  };

  const handleToggleWatched = (videoId: string, isWatched: boolean) => {
    // Update local progress
    const updatedProgress = toggleVideoProgress(preferenceId, videoId, isWatched);
    if (updatedProgress) {
      setTopicProgress(updatedProgress);
      
      // Update current videos with new progress
      const updatedVideos = currentVideos.map(video => 
        video.videoId === videoId ? { ...video, isWatched } : video
      );
      setCurrentVideos(updatedVideos);
      
      // Check if topic was just completed
      if (updatedProgress.isCompleted && isRecentlyCompleted(updatedProgress)) {
        setShowCompletionCelebration(true);
      }
      
      toast({
        title: isWatched ? "Marked as watched" : "Marked as unwatched",
        description: `Progress: ${updatedProgress.completedVideos}/${updatedProgress.totalVideos} completed`,
      });
    }
  };

  // Modal handlers
  const handleCloseCelebration = () => {
    setShowCompletionCelebration(false);
  };

  const handleContinueLearning = () => {
    setShowCompletionCelebration(false);
    onBack(); // Go back to home to start new topic
  };

  const handleReviewConcepts = () => {
    setShowCompletionCelebration(false);
    setShowReviewConcepts(true);
  };

  const handleTestKnowledge = () => {
    setShowCompletionCelebration(false);
    setShowTestKnowledge(true);
  };

  const handleBackToCelebration = () => {
    setShowReviewConcepts(false);
    setShowTestKnowledge(false);
    setShowCompletionCelebration(true);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="text-center flex-1">
            <h2 className="font-medium text-gray-900">Learning {topic}</h2>
            <div className="text-sm text-gray-600">
              <div>Video {getNextVideoNumber()} of {currentVideos.length}</div>
            </div>
            {/* Progress Bar */}
            {topicProgress && (
              <div className="mt-2 max-w-xs mx-auto">
                <ProgressBar
                  completed={topicProgress.completedVideos}
                  total={topicProgress.totalVideos}
                  showText={false}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {topicProgress.completedVideos} of {topicProgress.totalVideos} completed ({Math.round((topicProgress.completedVideos / topicProgress.totalVideos) * 100)}%)
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <ResultsNotificationSettings 
              topic={topic}
              learningGoal={learningGoal}
              preferenceId={preferenceId}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <RotateCcw className={`w-6 h-6 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Pull to Refresh Indicator */}
      {showIndicator && (
        <div 
          className="text-center py-2 text-sm text-gray-600 transition-opacity duration-200"
          style={{ 
            transform: `translateY(${Math.min(pullDistance - 20, 40)}px)`,
            opacity: Math.min(pullDistance / 60, 1)
          }}
        >
          {isRefreshing ? "Refreshing..." : "Pull to refresh"}
        </div>
      )}

      {/* Tabs - Depth or Difficulty based */}
      <div className="px-4 pb-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {hasDepthDimensions ? (
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="all" className="text-xs" data-testid="tab-all">
                All ({videoCounts.all})
              </TabsTrigger>
              <TabsTrigger value="conceptual" className="text-xs" data-testid="tab-conceptual">
                Conceptual ({(videoCounts as any).conceptual})
              </TabsTrigger>
              <TabsTrigger value="analytical" className="text-xs" data-testid="tab-analytical">
                Analytical ({(videoCounts as any).analytical})
              </TabsTrigger>
              <TabsTrigger value="strategic" className="text-xs" data-testid="tab-strategic">
                Strategic ({(videoCounts as any).strategic})
              </TabsTrigger>
              <TabsTrigger value="critical" className="text-xs" data-testid="tab-critical">
                Critical ({(videoCounts as any).critical})
              </TabsTrigger>
              <TabsTrigger value="evolutionary" className="text-xs" data-testid="tab-evolutionary">
                Evolutionary ({(videoCounts as any).evolutionary})
              </TabsTrigger>
            </TabsList>
          ) : (
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="all" className="text-sm" data-testid="tab-all">
                All ({videoCounts.all})
              </TabsTrigger>
              <TabsTrigger value="beginner" className="text-sm" data-testid="tab-beginner">
                Beginner ({(videoCounts as any).beginner})
              </TabsTrigger>
              <TabsTrigger value="intermediate" className="text-sm" data-testid="tab-intermediate">
                Intermediate ({(videoCounts as any).intermediate})
              </TabsTrigger>
              <TabsTrigger value="advanced" className="text-sm" data-testid="tab-advanced">
                Advanced ({(videoCounts as any).advanced})
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="all" className="mt-0">
            <div className="video-list">
              {filterVideosByDifficulty("all")
                .sort((a, b) => {
                  const nextVideo = getNextVideo();
                  const aIsNext = nextVideo?.id === a.id;
                  const bIsNext = nextVideo?.id === b.id;
                  
                  // Priority 1: Next recommended video goes first
                  if (aIsNext && !bIsNext) return -1;
                  if (!aIsNext && bIsNext) return 1;
                  
                  // Priority 2: Unwatched videos before watched videos
                  if (!a.isWatched && b.isWatched) return -1;
                  if (a.isWatched && !b.isWatched) return 1;
                  
                  // Priority 3: Within same watch status, sort by sequence order
                  return a.sequenceOrder - b.sequenceOrder;
                })
                .map((video) => {
                  const nextVideo = getNextVideo();
                  const isNextVideo = nextVideo?.id === video.id;
                  
                  return (
                    <VideoItem
                      key={video.id}
                      video={video}
                      onVideoClick={handleVideoClick}
                      onToggleWatched={handleToggleWatched}
                      isNextVideo={isNextVideo}
                      showSequence={true}
                    />
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="beginner" className="mt-0">
            <div className="video-list">
              {filterVideosByDifficulty("beginner")
                .sort((a, b) => {
                  const nextVideo = getNextVideo();
                  const aIsNext = nextVideo?.id === a.id;
                  const bIsNext = nextVideo?.id === b.id;
                  
                  if (aIsNext && !bIsNext) return -1;
                  if (!aIsNext && bIsNext) return 1;
                  if (!a.isWatched && b.isWatched) return -1;
                  if (a.isWatched && !b.isWatched) return 1;
                  
                  return a.sequenceOrder - b.sequenceOrder;
                })
                .map((video) => {
                  const nextVideo = getNextVideo();
                  const isNextVideo = nextVideo?.id === video.id;
                  
                  return (
                    <VideoItem
                      key={video.id}
                      video={video}
                      onVideoClick={handleVideoClick}
                      onToggleWatched={handleToggleWatched}
                      isNextVideo={isNextVideo}
                      showSequence={true}
                    />
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="intermediate" className="mt-0">
            <div className="video-list">
              {filterVideosByDifficulty("intermediate")
                .sort((a, b) => {
                  const nextVideo = getNextVideo();
                  const aIsNext = nextVideo?.id === a.id;
                  const bIsNext = nextVideo?.id === b.id;
                  
                  if (aIsNext && !bIsNext) return -1;
                  if (!aIsNext && bIsNext) return 1;
                  if (!a.isWatched && b.isWatched) return -1;
                  if (a.isWatched && !b.isWatched) return 1;
                  
                  return a.sequenceOrder - b.sequenceOrder;
                })
                .map((video) => {
                  const nextVideo = getNextVideo();
                  const isNextVideo = nextVideo?.id === video.id;
                  
                  return (
                    <VideoItem
                      key={video.id}
                      video={video}
                      onVideoClick={handleVideoClick}
                      onToggleWatched={handleToggleWatched}
                      isNextVideo={isNextVideo}
                      showSequence={true}
                    />
                  );
                })}
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="mt-0">
            <div className="video-list">
              {filterVideosByDifficulty("advanced")
                .sort((a, b) => {
                  const nextVideo = getNextVideo();
                  const aIsNext = nextVideo?.id === a.id;
                  const bIsNext = nextVideo?.id === b.id;
                  
                  if (aIsNext && !bIsNext) return -1;
                  if (!aIsNext && bIsNext) return 1;
                  if (!a.isWatched && b.isWatched) return -1;
                  if (a.isWatched && !b.isWatched) return 1;
                  
                  return a.sequenceOrder - b.sequenceOrder;
                })
                .map((video) => {
                  const nextVideo = getNextVideo();
                  const isNextVideo = nextVideo?.id === video.id;
                  
                  return (
                    <VideoItem
                      key={video.id}
                      video={video}
                      onVideoClick={handleVideoClick}
                      onToggleWatched={handleToggleWatched}
                      isNextVideo={isNextVideo}
                      showSequence={true}
                    />
                  );
                })}
            </div>
          </TabsContent>

          {/* Depth-based tabs */}
          {hasDepthDimensions && (
            <>
              <TabsContent value="conceptual" className="mt-0">
                <div className="video-list">
                  {filterVideosByDepth("conceptual")
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((video) => (
                      <VideoItem
                        key={video.id}
                        video={video}
                        onVideoClick={handleVideoClick}
                        onToggleWatched={handleToggleWatched}
                        isNextVideo={false}
                        showSequence={true}
                      />
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="analytical" className="mt-0">
                <div className="video-list">
                  {filterVideosByDepth("analytical")
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((video) => (
                      <VideoItem
                        key={video.id}
                        video={video}
                        onVideoClick={handleVideoClick}
                        onToggleWatched={handleToggleWatched}
                        isNextVideo={false}
                        showSequence={true}
                      />
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="strategic" className="mt-0">
                <div className="video-list">
                  {filterVideosByDepth("strategic")
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((video) => (
                      <VideoItem
                        key={video.id}
                        video={video}
                        onVideoClick={handleVideoClick}
                        onToggleWatched={handleToggleWatched}
                        isNextVideo={false}
                        showSequence={true}
                      />
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="critical" className="mt-0">
                <div className="video-list">
                  {filterVideosByDepth("critical")
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((video) => (
                      <VideoItem
                        key={video.id}
                        video={video}
                        onVideoClick={handleVideoClick}
                        onToggleWatched={handleToggleWatched}
                        isNextVideo={false}
                        showSequence={true}
                      />
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="evolutionary" className="mt-0">
                <div className="video-list">
                  {filterVideosByDepth("evolutionary")
                    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                    .map((video) => (
                      <VideoItem
                        key={video.id}
                        video={video}
                        onVideoClick={handleVideoClick}
                        onToggleWatched={handleToggleWatched}
                        isNextVideo={false}
                        showSequence={true}
                      />
                    ))}
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Bottom spacing */}
      <div className="h-20"></div>

      {/* Completion Modals */}
      {showCompletionCelebration && topicProgress && (
        <CompletionCelebration
          topicProgress={topicProgress}
          onClose={handleCloseCelebration}
          onContinueLearning={handleContinueLearning}
          onReviewConcepts={handleReviewConcepts}
          onTestKnowledge={handleTestKnowledge}
        />
      )}
      
      {showReviewConcepts && topicProgress && (
        <ReviewConcepts
          topicProgress={topicProgress}
          onBack={handleBackToCelebration}
        />
      )}
      
      {showTestKnowledge && topicProgress && (
        <TestKnowledge
          topicProgress={topicProgress}
          onBack={handleBackToCelebration}
        />
      )}
    </div>
  );
}
