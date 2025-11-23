import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import VideoList from "../components/video-list";
import LoadingScreen from "../components/loading-screen";
import type { CuratedVideo } from "../types/video";

interface VideosPageProps {
  preferenceId: string;
}

export default function VideosPage({ preferenceId }: VideosPageProps) {
  const [, setLocation] = useLocation();

  const { data: videos, isLoading, error } = useQuery<CuratedVideo[]>({
    queryKey: ['/api/videos', preferenceId],
    enabled: !!preferenceId,
  });

  const handleBack = () => {
    setLocation('/');
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error || !videos || videos.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-2">No videos found</h2>
          <p className="text-gray-600 mb-4">
            {error ? "Failed to load videos" : "No curated videos available"}
          </p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Extract metadata from first video
  const firstVideo = videos[0];
  
  return (
    <VideoList
      videos={videos}
      topic={firstVideo.preferenceId} // This would need to be properly passed from preferences
      learningGoal="Learn the essentials" // This would need to be properly passed from preferences
      preferenceId={preferenceId}
      onBack={handleBack}
    />
  );
}
