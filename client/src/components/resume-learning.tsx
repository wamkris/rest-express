import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProgressBar from "./progress-bar";
import type { TopicProgress } from "../lib/progress";

interface ResumeLearningProps {
  incompleteTopics: TopicProgress[];
  onResumeTopic: (preferenceId: string) => void;
}

export default function ResumeLearning({ incompleteTopics, onResumeTopic }: ResumeLearningProps) {
  if (incompleteTopics.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Play className="w-5 h-5 mr-2 text-blue-600" />
        Resume Learning
      </h3>
      
      <div className="space-y-3">
        {incompleteTopics.slice(0, 3).map((topic) => {
          const percentage = Math.round((topic.completedVideos / topic.totalVideos) * 100);
          
          return (
            <div
              key={topic.preferenceId}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              onClick={() => onResumeTopic(topic.preferenceId)}
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">
                  {topic.topic}
                </h4>
                <div className="mt-1">
                  <ProgressBar
                    completed={topic.completedVideos}
                    total={topic.totalVideos}
                    showText={false}
                    className="max-w-32"
                  />
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {topic.completedVideos} of {topic.totalVideos} complete ({percentage}%)
                </p>
              </div>
              
              <Button variant="ghost" size="sm" className="ml-3 flex-shrink-0">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
      
      {incompleteTopics.length > 3 && (
        <p className="text-sm text-gray-500 text-center mt-3">
          And {incompleteTopics.length - 3} more topics...
        </p>
      )}
    </div>
  );
}