import type { CuratedVideo } from "../types/video";

// Progress tracking data structure
export interface VideoProgress {
  videoId: string;
  isWatched: boolean;
  watchedAt?: Date;
}

export interface TopicProgress {
  preferenceId: string;
  topic: string;
  learningGoal?: string;
  videos: VideoProgress[];
  totalVideos: number;
  completedVideos: number;
  createdAt: Date;
  lastUpdated: Date;
  // Store full video data for resume functionality
  cachedVideos?: CuratedVideo[];
  // Completion tracking
  isCompleted?: boolean;
  completedAt?: Date;
  totalWatchTime?: number; // in minutes
}

// localStorage key for progress data
const PROGRESS_STORAGE_KEY = 'youtube_curator_progress';

// Get all progress data from localStorage
export function getAllProgress(): TopicProgress[] {
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!stored) return [];
    
    const data = JSON.parse(stored);
    return data.map((topic: any) => ({
      ...topic,
      createdAt: new Date(topic.createdAt),
      lastUpdated: new Date(topic.lastUpdated),
      videos: topic.videos.map((video: any) => ({
        ...video,
        watchedAt: video.watchedAt ? new Date(video.watchedAt) : undefined
      }))
    }));
  } catch (error) {
    console.error('Failed to load progress data:', error);
    return [];
  }
}

// Get progress for a specific topic/preference
export function getTopicProgress(preferenceId: string): TopicProgress | null {
  const allProgress = getAllProgress();
  return allProgress.find(topic => topic.preferenceId === preferenceId) || null;
}

// Save progress data to localStorage
function saveProgress(progressData: TopicProgress[]): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressData));
  } catch (error) {
    console.error('Failed to save progress data:', error);
  }
}

// Initialize progress tracking for a new topic
export function initializeTopicProgress(preferenceId: string, topic: string, videos: CuratedVideo[], learningGoal?: string): TopicProgress {
  const existingProgress = getTopicProgress(preferenceId);
  
  if (existingProgress) {
    // Update existing progress with any new videos
    const existingVideoIds = new Set(existingProgress.videos.map(v => v.videoId));
    const newVideos = videos
      .filter(v => !existingVideoIds.has(v.videoId))
      .map(v => ({
        videoId: v.videoId,
        isWatched: false
      }));
    
    if (newVideos.length > 0) {
      existingProgress.videos.push(...newVideos);
      existingProgress.totalVideos = videos.length;
      existingProgress.lastUpdated = new Date();
      existingProgress.learningGoal = learningGoal;
      existingProgress.cachedVideos = videos; // Update cached videos
      updateTopicProgress(existingProgress);
    }
    
    return existingProgress;
  }
  
  // Create new progress tracking
  const newProgress: TopicProgress = {
    preferenceId,
    topic,
    learningGoal,
    videos: videos.map(video => ({
      videoId: video.videoId,
      isWatched: video.isWatched || false
    })),
    totalVideos: videos.length,
    completedVideos: videos.filter(v => v.isWatched).length,
    createdAt: new Date(),
    lastUpdated: new Date(),
    cachedVideos: videos
  };
  
  const allProgress = getAllProgress();
  allProgress.push(newProgress);
  saveProgress(allProgress);
  
  return newProgress;
}

// Update progress for a specific topic
export function updateTopicProgress(updatedProgress: TopicProgress): void {
  const allProgress = getAllProgress();
  const index = allProgress.findIndex(topic => topic.preferenceId === updatedProgress.preferenceId);
  
  if (index >= 0) {
    allProgress[index] = {
      ...updatedProgress,
      lastUpdated: new Date()
      // Don't recalculate completedVideos here since it's already done in toggleVideoProgress
    };
    saveProgress(allProgress);
  }
}

// Mark a video as watched/unwatched
export function toggleVideoProgress(preferenceId: string, videoId: string, isWatched: boolean): TopicProgress | null {
  const topicProgress = getTopicProgress(preferenceId);
  if (!topicProgress) return null;
  
  const videoProgress = topicProgress.videos.find(v => v.videoId === videoId);
  if (!videoProgress) return null;
  
  videoProgress.isWatched = isWatched;
  videoProgress.watchedAt = isWatched ? new Date() : undefined;
  
  // Immediately recalculate completedVideos to ensure accuracy
  topicProgress.completedVideos = topicProgress.videos.filter(v => v.isWatched).length;
  
  // Check for completion - mark as completed when all videos are watched
  const wasCompleted = topicProgress.isCompleted;
  topicProgress.isCompleted = topicProgress.completedVideos === topicProgress.totalVideos;
  
  if (topicProgress.isCompleted && !wasCompleted) {
    // First time completion
    topicProgress.completedAt = new Date();
    
    // Calculate total watch time from cached videos
    if (topicProgress.cachedVideos) {
      topicProgress.totalWatchTime = topicProgress.cachedVideos.reduce((total, video) => {
        const duration = parseDuration(video.duration);
        return total + duration;
      }, 0);
    }
  } else if (!topicProgress.isCompleted && wasCompleted) {
    // Unmarked a video - no longer completed
    topicProgress.completedAt = undefined;
    topicProgress.totalWatchTime = undefined;
  }
  
  updateTopicProgress(topicProgress);
  return topicProgress;
}

// Helper function to parse YouTube duration format (e.g., "10:35" -> 10.58 minutes)
function parseDuration(duration: string): number {
  const parts = duration.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] + (parts[1] / 60);
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return (parts[0] * 60) + parts[1] + (parts[2] / 60);
  }
  return 0;
}

// Get incomplete topics for resume functionality
export function getIncompleteTopics(): TopicProgress[] {
  const allProgress = getAllProgress();
  return allProgress
    .filter(topic => topic.completedVideos < topic.totalVideos)
    .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
}

// Calculate progress percentage
export function calculateProgress(topicProgress: TopicProgress): number {
  if (topicProgress.totalVideos === 0) return 0;
  return Math.round((topicProgress.completedVideos / topicProgress.totalVideos) * 100);
}

// Merge server video data with local progress
export function mergeVideoProgress(videos: CuratedVideo[], topicProgress: TopicProgress | null): CuratedVideo[] {
  if (!topicProgress) return videos;
  
  const progressMap = new Map(topicProgress.videos.map(v => [v.videoId, v.isWatched]));
  
  return videos.map(video => ({
    ...video,
    isWatched: progressMap.get(video.videoId) || video.isWatched || false
  }));
}

// Get cached videos for a topic (for resume functionality)
export function getCachedVideos(preferenceId: string): CuratedVideo[] | null {
  const topicProgress = getTopicProgress(preferenceId);
  if (!topicProgress?.cachedVideos) return null;
  
  // Merge with current progress data
  return mergeVideoProgress(topicProgress.cachedVideos, topicProgress);
}

// Clear all progress data (for debugging/reset)
export function clearAllProgress(): void {
  localStorage.removeItem(PROGRESS_STORAGE_KEY);
}

// Get completed topics for completion celebration
export function getCompletedTopics(): TopicProgress[] {
  const allProgress = getAllProgress();
  return allProgress
    .filter(topic => topic.isCompleted)
    .sort((a, b) => {
      const aCompletedAt = a.completedAt?.getTime() || 0;
      const bCompletedAt = b.completedAt?.getTime() || 0;
      return bCompletedAt - aCompletedAt; // Most recent first
    });
}

// Check if a topic was just completed (within last few seconds)
export function isRecentlyCompleted(topicProgress: TopicProgress): boolean {
  if (!topicProgress.completedAt) return false;
  const now = new Date().getTime();
  const completedAt = topicProgress.completedAt.getTime();
  return (now - completedAt) < 5000; // Within 5 seconds
}

// Calculate days since topic was started
export function getDaysSinceStarted(topicProgress: TopicProgress): number {
  const now = new Date();
  const started = topicProgress.createdAt;
  const diffTime = Math.abs(now.getTime() - started.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}