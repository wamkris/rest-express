import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { learningInterestSchema, type LearningInterestForm } from "@shared/schema";
import { Play } from "lucide-react";
import ResumeLearning from "./resume-learning";
import NotificationsViewer from "./notifications-viewer";
import type { TopicProgress } from "../lib/progress";

interface InputScreenProps {
  onSubmit: (data: LearningInterestForm) => void;
  isLoading: boolean;
  incompleteTopics?: TopicProgress[];
  onResumeTopic?: (preferenceId: string) => void;
}

export default function InputScreen({ onSubmit, isLoading, incompleteTopics = [], onResumeTopic }: InputScreenProps) {
  const [selectedMode, setSelectedMode] = useState<"quick" | "deep">("quick");

  const form = useForm<LearningInterestForm>({
    resolver: zodResolver(learningInterestSchema),
    defaultValues: {
      interest: "",
      learningGoal: "Learn the essentials",
      learningMode: "quick",
    },
  });

  const handleModeSelect = (mode: "quick" | "deep") => {
    setSelectedMode(mode);
    form.setValue("learningMode", mode);
    // Map learning mode to learning goal
    const learningGoal = mode === "quick" ? "Learn the essentials" : "Build solid understanding";
    form.setValue("learningGoal", learningGoal);
  };

  const handleSubmit = (data: LearningInterestForm) => {
    onSubmit(data);
  };

  return (
    <div className="min-h-screen flex flex-col p-4 bg-white">
      {/* Header */}
      <div className="text-center py-8 relative">
        {/* Notifications Viewer in top right */}
        <div className="absolute top-0 right-0">
          <NotificationsViewer />
        </div>
        
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
            <Play className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Learn on YouTube</h1>
        <p className="text-gray-600">AI-curated educational content</p>
      </div>

      {/* Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col">
          <div className="flex-1 space-y-6">
            {/* Learning Interest */}
            <FormField
              control={form.control}
              name="interest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-gray-900">
                    What do you want to learn?
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="AI, sales, freelancing, cooking..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent text-base"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />



            {/* Learning Mode Selection */}
            <div>
              <Label className="block text-sm font-medium text-gray-900 mb-3">
                Learning approach
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleModeSelect("quick")}
                  className={`px-4 py-4 border rounded-lg text-left transition-colors ${
                    selectedMode === "quick"
                      ? "border-red-600 bg-red-50"
                      : "border-gray-300 hover:border-red-600 hover:bg-red-50"
                  }`}
                  data-testid="button-mode-quick"
                >
                  <div className={`font-medium text-sm ${
                    selectedMode === "quick" ? "text-red-600" : "text-gray-900"
                  }`}>
                    Quick Learning
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Practical tutorials & how-tos
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleModeSelect("deep")}
                  className={`px-4 py-4 border rounded-lg text-left transition-colors ${
                    selectedMode === "deep"
                      ? "border-red-600 bg-red-50"
                      : "border-gray-300 hover:border-red-600 hover:bg-red-50"
                  }`}
                  data-testid="button-mode-deep"
                >
                  <div className={`font-medium text-sm ${
                    selectedMode === "deep" ? "text-red-600" : "text-gray-900"
                  }`}>
                    Deep Understanding
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Conceptual mastery & frameworks
                  </div>
                </button>
              </div>
            </div>

          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-red-600 text-white py-4 rounded-lg font-medium text-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-8"
            data-testid="button-start-learning"
          >
            {isLoading ? "Creating Learning Path..." : "Start Learning"}
          </Button>

          {/* Resume Learning Section - After Submit Button */}
          {incompleteTopics.length > 0 && onResumeTopic && (
            <div className="mt-8">
              <ResumeLearning
                incompleteTopics={incompleteTopics}
                onResumeTopic={onResumeTopic}
              />
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
