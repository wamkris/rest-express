import { useState } from "react";
import { CheckCircle, Share, BookOpen, Brain, Trophy, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getDaysSinceStarted, type TopicProgress } from "../lib/progress";

interface CompletionCelebrationProps {
  topicProgress: TopicProgress;
  onClose: () => void;
  onContinueLearning: () => void;
  onReviewConcepts: () => void;
  onTestKnowledge: () => void;
}

export default function CompletionCelebration({ 
  topicProgress, 
  onClose, 
  onContinueLearning,
  onReviewConcepts,
  onTestKnowledge
}: CompletionCelebrationProps) {
  const [showNextTopics, setShowNextTopics] = useState(false);
  const { toast } = useToast();
  
  const daysTaken = getDaysSinceStarted(topicProgress);
  const totalMinutes = Math.round(topicProgress.totalWatchTime || 0);
  
  const handleShare = async () => {
    const shareText = `🎉 I just completed learning about "${topicProgress.topic}" on YouTube! \n\n📚 ${topicProgress.totalVideos} videos watched\n⏱️ ${totalMinutes} minutes of content\n📅 Finished in ${daysTaken} day${daysTaken > 1 ? 's' : ''}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Learning Achievement",
          text: shareText,
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback - copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        toast({
          title: "Copied to clipboard!",
          description: "Share your achievement with others",
        });
      } catch (error) {
        toast({
          title: "Sharing not available",
          description: "Your browser doesn't support sharing or clipboard access",
          variant: "destructive",
        });
      }
    }
  };

  const suggestedTopics = [
    {
      name: `Advanced ${topicProgress.topic}`,
      difficulty: "Advanced",
      estimatedTime: "45-60 min",
      description: "Take your knowledge to the next level"
    },
    {
      name: `${topicProgress.topic} in Practice`,
      difficulty: "Intermediate", 
      estimatedTime: "30-45 min",
      description: "Apply what you've learned with real examples"
    },
    {
      name: `${topicProgress.topic} Tools & Resources`,
      difficulty: "Beginner",
      estimatedTime: "20-30 min", 
      description: "Discover helpful tools and resources"
    },
    {
      name: `${topicProgress.topic} Troubleshooting`,
      difficulty: "Intermediate",
      estimatedTime: "35-50 min",
      description: "Learn to solve common problems"
    }
  ];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'advanced': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Trophy className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl mb-2">
                🎉 Congratulations!
              </CardTitle>
              <p className="text-gray-600 dark:text-gray-400">
                You completed <strong>"{topicProgress.topic}"</strong>
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Completion Stats */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-center mb-3">Your Achievement</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {topicProgress.totalVideos}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Videos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {totalMinutes}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Minutes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {daysTaken}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Day{daysTaken > 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="font-medium">What's next?</h3>
            
            <Button
              onClick={onReviewConcepts}
              variant="outline"
              className="w-full justify-start"
            >
              <BookOpen className="w-4 h-4 mr-3" />
              Review Key Concepts
            </Button>
            
            <Button
              onClick={onTestKnowledge}
              variant="outline"
              className="w-full justify-start"
            >
              <Brain className="w-4 h-4 mr-3" />
              Test Your Knowledge
            </Button>
            
            <Button
              onClick={handleShare}
              variant="outline"
              className="w-full justify-start"
            >
              <Share className="w-4 h-4 mr-3" />
              Share Achievement
            </Button>
          </div>

          {/* Continue Learning Section */}
          <div className="space-y-3">
            <Button
              onClick={() => setShowNextTopics(!showNextTopics)}
              variant="default"
              className="w-full justify-between"
            >
              <span>Continue Learning</span>
              <ArrowRight className={`w-4 h-4 transition-transform ${showNextTopics ? 'rotate-90' : ''}`} />
            </Button>
            
            {showNextTopics && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Recommended topics based on what you just learned:
                </p>
                
                {suggestedTopics.map((topic, index) => (
                  <Card key={index} className="border border-gray-200 dark:border-gray-700">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm">{topic.name}</h4>
                        <Badge className={`text-xs ${getDifficultyColor(topic.difficulty)}`}>
                          {topic.difficulty}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        {topic.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          ⏱️ {topic.estimatedTime}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onContinueLearning()}
                          className="text-xs h-7"
                        >
                          Start Learning
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-sm"
                  onClick={() => toast({
                    title: "More suggestions coming soon!",
                    description: "We're working on better topic recommendations",
                  })}
                >
                  Not interested? Get different suggestions
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}