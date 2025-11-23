import { storage } from "./storage";
import type { TranscriptBlock } from "@shared/schema";

interface RankedVideo {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  duration: string;
  channelName: string;
  viewCount?: string;
  uploadDate?: string;
  reasonSelected?: string;
  sequenceOrder?: number;
  difficultyLevel?: string;
  depthDimension?: string | null;
  transcriptQuality?: {
    tqs: number;
    hasTranscript: boolean;
    blockCount: number;
  };
}

interface TranscriptRankingResult {
  videos: RankedVideo[];
  metadata: {
    transcriptIntelligenceUsed: boolean;
    videosWithTranscripts: number;
    totalVideos: number;
    averageTqs?: number;
  };
}

export class TranscriptRanker {
  async rankVideos(
    videos: any[],
    useTranscriptIntelligence: "auto" | "enabled" | "disabled"
  ): Promise<TranscriptRankingResult> {
    if (useTranscriptIntelligence === "disabled" || videos.length === 0) {
      return {
        videos: videos as RankedVideo[],
        metadata: {
          transcriptIntelligenceUsed: false,
          videosWithTranscripts: 0,
          totalVideos: videos.length,
        },
      };
    }

    const videoIds = videos.map((v) => v.videoId);
    const transcriptData = await this.getTranscriptMetadata(videoIds);

    const videosWithTqs = videos.filter(
      (v) => transcriptData[v.videoId]?.tqs !== undefined
    ).length;

    const shouldUseTranscripts =
      useTranscriptIntelligence === "enabled" ||
      (useTranscriptIntelligence === "auto" && videosWithTqs > 0);

    if (!shouldUseTranscripts) {
      return {
        videos: videos as RankedVideo[],
        metadata: {
          transcriptIntelligenceUsed: false,
          videosWithTranscripts: videosWithTqs,
          totalVideos: videos.length,
        },
      };
    }

    const rankedVideos = this.applyTranscriptRanking(videos, transcriptData);

    const tqsValues = Object.values(transcriptData)
      .map((t) => t.tqs)
      .filter((tqs): tqs is number => tqs !== undefined);
    
    const averageTqs =
      tqsValues.length > 0
        ? Math.round(tqsValues.reduce((sum, tqs) => sum + tqs, 0) / tqsValues.length)
        : undefined;

    return {
      videos: rankedVideos,
      metadata: {
        transcriptIntelligenceUsed: true,
        videosWithTranscripts: videosWithTqs,
        totalVideos: videos.length,
        averageTqs,
      },
    };
  }

  private async getTranscriptMetadata(
    videoIds: string[]
  ): Promise<Record<string, { tqs: number; blockCount: number }>> {
    const metadata: Record<string, { tqs: number; blockCount: number }> = {};

    await Promise.all(
      videoIds.map(async (videoId) => {
        try {
          const blocks = await storage.getTranscriptBlocksByVideoId(videoId);
          
          if (blocks.length > 0) {
            const firstBlock = blocks[0];
            if (firstBlock.tqs !== null && firstBlock.tqs !== undefined) {
              metadata[videoId] = {
                tqs: firstBlock.tqs,
                blockCount: blocks.length,
              };
            }
          }
        } catch (error) {
          console.error(`Error fetching transcript metadata for ${videoId}:`, error);
        }
      })
    );

    return metadata;
  }

  private applyTranscriptRanking(
    videos: any[],
    transcriptData: Record<string, { tqs: number; blockCount: number }>
  ): RankedVideo[] {
    const videosWithScores = videos.map((video) => {
      const transcript = transcriptData[video.videoId];
      
      let transcriptScore = 0;
      if (transcript && transcript.tqs !== undefined) {
        transcriptScore = transcript.tqs / 100;
      }

      const baseScore = video.sequenceOrder ? 1 / video.sequenceOrder : 0;
      
      const combinedScore = transcript
        ? baseScore * 0.6 + transcriptScore * 0.4
        : baseScore;

      return {
        ...video,
        transcriptQuality: transcript
          ? {
              tqs: transcript.tqs,
              hasTranscript: true,
              blockCount: transcript.blockCount,
            }
          : undefined,
        _combinedScore: combinedScore,
      };
    });

    videosWithScores.sort((a, b) => {
      if (a._combinedScore !== b._combinedScore) {
        return b._combinedScore - a._combinedScore;
      }
      
      return (a.sequenceOrder || 999) - (b.sequenceOrder || 999);
    });

    return videosWithScores.map((video, index) => {
      const { _combinedScore, ...videoWithoutScore } = video;
      return {
        ...videoWithoutScore,
        sequenceOrder: index + 1,
      };
    });
  }

  async fetchTranscriptsInBackground(videoIds: string[]): Promise<void> {
    console.log(`Background transcript fetch initiated for ${videoIds.length} videos`);
    
    const captionService = await import("./captionService");
    
    Promise.all(
      videoIds.map(async (videoId) => {
        try {
          const existingBlocks = await storage.getTranscriptBlocksByVideoId(videoId);
          
          if (existingBlocks.length === 0) {
            await captionService.captionService.fetchAndStoreTranscript(videoId);
            console.log(`Background fetch completed for ${videoId}`);
          }
        } catch (error) {
          console.error(`Background transcript fetch failed for ${videoId}:`, error);
        }
      })
    ).catch((error) => {
      console.error("Background transcript fetch error:", error);
    });
  }
}

export const transcriptRanker = new TranscriptRanker();
