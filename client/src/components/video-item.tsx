import { openYouTubeVideo, formatViewCount } from "../lib/youtube";
import type { CuratedVideo } from "../types/video";
import { CheckCircle, Play, Square, CheckSquare, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

interface VideoItemProps {
  video: CuratedVideo;
  onVideoClick?: (videoId: string) => void;
  onToggleWatched?: (videoId: string, isWatched: boolean) => void;
  isNextVideo?: boolean;
  showSequence?: boolean;
}

function getDifficultyColor(level: string): string {
  switch (level) {
    case "beginner": return "bg-green-100 text-green-800 border-green-200";
    case "intermediate": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "advanced": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export default function VideoItem({ video, onVideoClick, onToggleWatched, isNextVideo = false, showSequence = true }: VideoItemProps) {
  const [, setLocation] = useLocation();
  
  const handleClick = () => {
    if (onVideoClick) {
      onVideoClick(video.videoId);
    } else {
      openYouTubeVideo(video.videoId);
    }
  };

  const handleToggleWatched = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleWatched) {
      onToggleWatched(video.videoId, !video.isWatched);
    }
  };

  const handleEnhancedPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/player/${video.videoId}`);
  };

  return (
    <div
      className={`rounded-xl bg-white shadow-md border-2 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 mb-4 overflow-hidden ${
        isNextVideo ? 'border-blue-400 bg-blue-50 shadow-blue-200' : 'border-gray-200 hover:border-gray-300'
      } ${video.isWatched ? 'opacity-75 bg-gray-50 border-gray-300' : ''}`}
      onClick={handleClick}
    >
      <div className="p-4">
        {/* Header with sequence number and checkbox */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            {/* Sequence Number */}
            {showSequence && (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                video.isWatched 
                  ? 'bg-green-500 text-white' 
                  : isNextVideo
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {video.isWatched ? (
                  <CheckCircle className="w-4 h-4" />
                ) : isNextVideo ? (
                  <Play className="w-3 h-3" />
                ) : (
                  video.sequenceOrder
                )}
              </div>
            )}

            {/* Difficulty Badge */}
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyColor(video.difficultyLevel)}`}>
              {video.difficultyLevel}
            </div>
          </div>

          {/* Watch Checkbox */}
          {onToggleWatched && (
            <button
              onClick={handleToggleWatched}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title={video.isWatched ? "Mark as unwatched" : "Mark as watched"}
            >
              {video.isWatched ? (
                <CheckSquare className="w-5 h-5 text-green-600" />
              ) : (
                <Square className="w-5 h-5 text-gray-400" />
              )}
            </button>
          )}
        </div>

        {/* Thumbnail */}
        <div className="relative mb-4">
          <div className="w-full aspect-video rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden">
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Fallback to a gradient background if thumbnail fails to load
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
              }}
            />
            <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-2 py-1 rounded-md font-medium">
              {video.duration}
            </div>
          </div>
        </div>

        {/* Video Info */}
        <div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug mb-2 line-height-tight">
            {video.title}
          </h3>
          
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-6 h-6 bg-gray-300 rounded-full flex-shrink-0"></div>
            <span className="text-sm text-gray-600 font-medium">{video.channelName}</span>
          </div>

          <div className="text-xs text-gray-500">
            {video.viewCount && (
              <>
                <span>{formatViewCount(video.viewCount)}</span>
                {video.uploadDate && <span> • </span>}
              </>
            )}
            {video.uploadDate && <span>{video.uploadDate}</span>}
          </div>

          {/* Next Video Indicator */}
          {isNextVideo && (
            <div className="mt-3 flex items-center space-x-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <Play className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">Next recommended video</span>
            </div>
          )}

          {/* Enhanced Player Button */}
          <button
            onClick={handleEnhancedPlayer}
            className="mt-3 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            data-testid={`button-enhanced-player-${video.videoId}`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Enhanced Player</span>
          </button>
        </div>
      </div>
    </div>
  );
}
