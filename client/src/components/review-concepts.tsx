import { useState } from "react";
import { BookOpen, CheckCircle, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type TopicProgress } from "../lib/progress";
import { type CuratedVideo } from "../types/video";

interface ReviewConceptsProps {
  topicProgress: TopicProgress;
  onBack: () => void;
}

export default function ReviewConcepts({ topicProgress, onBack }: ReviewConceptsProps) {
  const [selectedVideo, setSelectedVideo] = useState<CuratedVideo | null>(null);
  
  const cachedVideos = topicProgress.cachedVideos || [];
  const sortedVideos = [...cachedVideos].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  const handleVideoClick = (videoId: string) => {
    const youtubeWebUrl = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(youtubeWebUrl, '_blank', 'noopener,noreferrer');
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const conceptsSummary = [
    `Foundation of ${topicProgress.topic}`,
    `Core principles and best practices`,
    `Advanced techniques and applications`,
    `Real-world implementation examples`
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <CardTitle>Review Key Concepts</CardTitle>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-12">
            Revisit what you learned about <strong>{topicProgress.topic}</strong>
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6 ml-12 mr-4">
          {/* Learning Summary */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h3 className="font-medium mb-3 text-blue-900 dark:text-blue-100">
              What You Learned
            </h3>
            <div className="space-y-2">
              {conceptsSummary.map((concept, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <span className="text-sm text-blue-800 dark:text-blue-200">
                    {concept}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Video Learning Path */}
          <div>
            <h3 className="font-medium mb-3">Your Learning Journey</h3>
            <div className="space-y-3">
              {sortedVideos.map((video, index) => (
                <Card key={video.videoId} className="border border-gray-200 dark:border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-20 h-14 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0 overflow-hidden">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                              #{video.sequenceOrder}
                            </span>
                            <Badge className={`text-xs ${getDifficultyColor(video.difficultyLevel)}`}>
                              {video.difficultyLevel}
                            </Badge>
                          </div>
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        </div>
                        
                        <h4 className="font-medium text-sm mb-1 line-clamp-2">
                          {video.title}
                        </h4>
                        
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                          {video.reasonSelected}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{video.duration}</span>
                            <span>{video.channelName}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVideoClick(video.videoId)}
                            className="text-xs h-7"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Rewatch
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Key Takeaways */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="font-medium mb-3">Key Takeaways</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
              <p>
                • You progressed from beginner concepts to advanced techniques
              </p>
              <p>
                • Each video built upon the previous one for structured learning
              </p>
              <p>
                • You now have a solid foundation in {topicProgress.topic}
              </p>
              <p>
                • The videos you watched were carefully curated for optimal learning flow
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onBack}
              variant="default"
              className="flex-1"
            >
              Back to Celebration
            </Button>
            <Button
              onClick={() => {
                // Open all videos in tabs for quick reference
                sortedVideos.forEach(video => {
                  handleVideoClick(video.videoId);
                });
              }}
              variant="outline"
              className="flex-1"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open All Videos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}