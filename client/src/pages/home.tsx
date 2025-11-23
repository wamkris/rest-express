import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw, ArrowLeft, Settings, User, LogOut, Key } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { curateVideos } from "../lib/claude";
import InputScreen from "../components/input-screen";
import LoadingScreen from "../components/loading-screen";
import VideoList from "../components/video-list";
import ResumeLearning from "../components/resume-learning";
import NotificationPreview from "../components/notification-preview";
import { getIncompleteTopics, getCachedVideos } from "../lib/progress";
import { scheduleLearningReminder, requestNotificationPermission } from "../lib/notifications";
import { useAuth } from "@/hooks/useAuth";
import type { LearningInterestForm } from "@shared/schema";
import type { CurationResponse, CuratedVideo } from "../types/video";
import type { TopicProgress } from "../lib/progress";

type AppState = 'input' | 'loading' | 'videos' | 'error';

export default function Home() {
  const [currentState, setCurrentState] = useState<AppState>('input');
  const [curationData, setCurationData] = useState<CurationResponse | null>(null);
  const [incompleteTopics, setIncompleteTopics] = useState<TopicProgress[]>([]);
  const [showNotificationPreview, setShowNotificationPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const { toast } = useToast();
  const { user, login, logout, isLoading: authLoading } = useAuth();

  // Load incomplete topics on component mount
  useEffect(() => {
    const topics = getIncompleteTopics();
    setIncompleteTopics(topics);
  }, [currentState]); // Refresh when state changes

  // Check for pending learning request after login
  useEffect(() => {
    if (user && !authLoading) {
      const pendingRequest = localStorage.getItem('pendingLearningRequest');
      if (pendingRequest) {
        try {
          const data = JSON.parse(pendingRequest) as LearningInterestForm;
          localStorage.removeItem('pendingLearningRequest');
          
          toast({
            title: "Processing your search",
            description: "Continuing with your previous request...",
          });
          
          // Process the saved request
          handleFormSubmit(data);
        } catch (error) {
          console.error('Failed to process pending request:', error);
          localStorage.removeItem('pendingLearningRequest');
        }
      }
    }
  }, [user, authLoading]);

  // Check for resume parameter in URL (for notification clicks)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resumeParam = urlParams.get('resume');
    
    if (resumeParam) {
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Try to resume the topic
      const topic = getIncompleteTopics().find(t => t.preferenceId === resumeParam);
      if (topic && topic.completedVideos < topic.totalVideos) {
        handleResumeTopic(resumeParam);
      } else {
        toast({
          title: "Topic not found",
          description: "The learning topic you're looking for is no longer available.",
          variant: "destructive",
        });
      }
    }
  }, []);  // Only run on mount

  const curationMutation = useMutation({
    mutationFn: curateVideos,
    onSuccess: (data) => {
      setCurationData(data);
      setCurrentState('videos');
      
      // Schedule learning reminder if notification time was provided
      if (lastFormData && lastFormData.notificationTime) {
        const customTime = (lastFormData as any).customNotificationTime;
        scheduleLearningReminder(
          data.preferenceId,
          data.topic,
          data.learningGoal,
          lastFormData.notificationTime,
          customTime
        );
      }
      
      toast({
        title: "Videos curated successfully!",
        description: `Found ${data.videos.length} educational videos for you.`,
      });
    },
    onError: (error) => {
      const errorMsg = error instanceof Error ? error.message : "Failed to curate videos";
      
      // Check if error is about missing API keys
      if (errorMsg.includes("add your own") && errorMsg.includes("API key")) {
        // Save form data to localStorage so user can retry after adding keys
        if (lastFormData) {
          localStorage.setItem('pendingLearningRequest', JSON.stringify(lastFormData));
        }
        setShowApiKeyModal(true);
        setCurrentState('input');
        return;
      }
      
      setErrorMessage(errorMsg);
      setCurrentState('error');
    },
  });

  // Store form data to use for notification scheduling
  const [lastFormData, setLastFormData] = useState<LearningInterestForm | null>(null);

  const handleFormSubmit = async (data: LearningInterestForm) => {
    setLastFormData(data);
    
    // Check if user is authenticated
    if (!user) {
      // Save form data to localStorage before redirecting to login
      localStorage.setItem('pendingLearningRequest', JSON.stringify(data));
      
      toast({
        title: "Login Required",
        description: "Please log in to curate videos. Your search will be processed after login.",
      });
      
      // Redirect to login
      login();
      return;
    }
    
    // User is authenticated - start the video curation process
    setCurrentState('loading');
    curationMutation.mutate(data);
    
    // Handle notifications in parallel (non-blocking)
    if (data.notificationTime) {
      try {
        console.log('Requesting notification permission...');
        const hasPermission = await requestNotificationPermission();
        console.log('Permission result:', hasPermission);
        
        if (hasPermission) {
          // Show notification preview modal while curation is running
          console.log('Showing notification preview...');
          setShowNotificationPreview(true);
          
          // Schedule the notification immediately
          const customTime = (data as any).customNotificationTime;
          scheduleLearningReminder(data.interest, data.interest, data.learningGoal, data.notificationTime, customTime);
        } else {
          toast({
            title: "Notifications blocked",
            description: "Enable notifications in browser settings to get learning reminders",
            variant: "destructive",
            duration: 5000,
          });
        }
      } catch (error) {
        console.error('Notification setup failed:', error);
        toast({
          title: "Notification setup failed",
          description: "Could not set up learning reminders",
          variant: "destructive",
        });
      }
    }
  };

  const handleNotificationPreviewClose = () => {
    setShowNotificationPreview(false);
    // Video curation already started, no need to restart it
  };

  const handleBack = () => {
    setCurrentState('input');
    setCurationData(null);
    setErrorMessage('');
    // Refresh incomplete topics when returning to input state
    const topics = getIncompleteTopics();
    setIncompleteTopics(topics);
  };

  const handleRetry = () => {
    if (lastFormData) {
      setCurrentState('loading');
      curationMutation.mutate(lastFormData);
    }
  };

  const handleResumeTopic = async (preferenceId: string) => {
    try {
      setCurrentState('loading');
      
      // Get topic progress info
      const topicProgress = incompleteTopics.find(t => t.preferenceId === preferenceId);
      if (!topicProgress) {
        throw new Error('Topic progress not found');
      }
      
      // Try to get cached videos first (faster and works offline)
      let videos = getCachedVideos(preferenceId);
      
      // If no cached videos, try to fetch from server
      if (!videos || videos.length === 0) {
        try {
          const response = await fetch(`/api/videos/${preferenceId}`);
          if (response.ok) {
            videos = await response.json();
          }
        } catch (apiError) {
          console.log('Server fetch failed, cached videos not available:', apiError);
        }
      }
      
      if (!videos || videos.length === 0) {
        throw new Error('No videos found for this topic. Try creating a new search.');
      }
      
      // Create curation data for resume
      const resumeData: CurationResponse = {
        preferenceId,
        videos,
        topic: topicProgress.topic,
        learningGoal: topicProgress.learningGoal || "Learn the essentials"
      };
      
      setCurationData(resumeData);
      setCurrentState('videos');
      
      toast({
        title: "Resumed learning!",
        description: `Continuing with ${topicProgress.topic}`,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Could not load previous learning session";
      setErrorMessage(errorMsg);
      setCurrentState('error');
    }
  };

  if (currentState === 'loading') {
    return <LoadingScreen />;
  }

  if (currentState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-8 w-8 text-red-500 flex-shrink-0" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Search Failed</h1>
                <p className="text-sm text-gray-600 mt-1">Unable to curate videos</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-6">
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>

            <div className="flex flex-col gap-3">
              <Button 
                onClick={handleRetry}
                disabled={curationMutation.isPending}
                className="w-full flex items-center justify-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${curationMutation.isPending ? 'animate-spin' : ''}`} />
                {curationMutation.isPending ? 'Retrying...' : 'Try Again'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleBack}
                className="w-full flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Search
              </Button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Common fixes:</strong> Check your internet connection, verify API keys are configured, or try different search terms.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentState === 'videos' && curationData) {
    return (
      <VideoList
        videos={curationData.videos}
        topic={curationData.topic}
        learningGoal={curationData.learningGoal}
        preferenceId={curationData.preferenceId}
        onBack={handleBack}
      />
    );
  }

  return (
    <>
      <InputScreen
        onSubmit={handleFormSubmit}
        isLoading={curationMutation.isPending}
        incompleteTopics={incompleteTopics}
        onResumeTopic={handleResumeTopic}
      />
      
      {/* Notification Preview Modal */}
      {lastFormData && (
        <NotificationPreview
          isOpen={showNotificationPreview}
          onClose={handleNotificationPreviewClose}
          notificationTime={lastFormData.notificationTime || "evening"}
          topic={lastFormData.interest}
          learningGoal={lastFormData.learningGoal}
          customTime={(lastFormData as any).customNotificationTime}
        />
      )}

      {/* API Key Setup Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent className="sm:max-w-md" data-testid="modal-api-key-setup">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys Required
            </DialogTitle>
            <DialogDescription>
              To curate videos, you need to provide your own YouTube and Claude API keys. These keys are encrypted and stored securely.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900">
                <strong>Why do I need API keys?</strong><br />
                We use YouTube Data API to search for educational videos and Claude AI to curate the best ones for you. 
                Your own keys ensure you have dedicated access without quota limitations.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Get your API keys:</h4>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>
                  • <strong>YouTube:</strong>{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Google Cloud Console
                  </a>
                </li>
                <li>
                  • <strong>Claude:</strong>{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Anthropic Console
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Link href="/settings">
              <Button
                onClick={() => setShowApiKeyModal(false)}
                className="w-full"
                data-testid="button-goto-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Go to Settings to Add Keys
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setShowApiKeyModal(false);
                // Clear the pending request if user chooses not to add keys now
                localStorage.removeItem('pendingLearningRequest');
              }}
              data-testid="button-close-modal"
            >
              Maybe Later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
