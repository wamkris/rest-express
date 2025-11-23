import { storage } from "./storage";
import type { InsertVideo } from "@shared/schema";

interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  duration: string;
  thumbnailUrl: string;
  viewCount?: string;
  uploadDate?: string;
  description?: string;
}

export async function ensureVideosExist(videos: VideoMetadata[]): Promise<void> {
  const uniqueVideos = new Map<string, InsertVideo>();
  
  for (const video of videos) {
    if (!uniqueVideos.has(video.videoId)) {
      const canonicalVideo: InsertVideo = {
        id: video.videoId,
        title: video.title,
        channelName: video.channelName,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount || null,
        publishedAt: video.uploadDate || null,
        description: video.description || null,
      };
      uniqueVideos.set(video.videoId, canonicalVideo);
    }
  }
  
  const videosToUpsert = Array.from(uniqueVideos.values());
  
  console.log(`Ensuring ${videosToUpsert.length} unique videos exist in canonical table`);
  
  await Promise.all(
    videosToUpsert.map(video => storage.upsertVideo(video))
  );
  
  console.log(`Successfully ensured ${videosToUpsert.length} videos exist`);
}
