export interface CuratedVideo {
  id: string;
  preferenceId: string;
  videoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string;
  duration: string;
  channelName: string;
  channelThumbnail: string | null;
  viewCount: string | null;
  uploadDate: string | null;
  reasonSelected: string | null;
  sequenceOrder: number; // Learning sequence 1-8
  difficultyLevel: "beginner" | "intermediate" | "advanced"; // Difficulty badge
  depthDimension?: "conceptual" | "analytical" | "strategic" | "critical" | "evolutionary" | null; // Depth dimension for deep learning mode
  isWatched: boolean; // Progress tracking
  createdAt: Date;
}

export interface CurationResponse {
  preferenceId: string;
  videos: CuratedVideo[];
  topic: string;
  learningGoal: string;
}

export interface RefreshResponse {
  videos: CuratedVideo[];
}
