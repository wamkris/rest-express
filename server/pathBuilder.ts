import { storage } from "./storage";
import type { InsertLearningPath, InsertPathNode } from "@shared/schema";

interface CreatePathInput {
  title: string;
  description: string;
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  videoIds: string[];
  createdBy?: string;
}

interface PathWithNodes {
  path: any;
  nodes: any[];
}

export class PathBuilder {
  async createPath(input: CreatePathInput): Promise<PathWithNodes> {
    const pathData: InsertLearningPath = {
      title: input.title,
      description: input.description,
      topic: input.topic,
      difficulty: input.difficulty,
      estimatedDuration: this.calculateEstimatedDuration(input.videoIds.length),
      createdBy: input.createdBy || null,
    };

    const path = await storage.createLearningPath(pathData);

    const nodes = await Promise.all(
      input.videoIds.map(async (videoId, index) => {
        const video = await storage.getVideoById(videoId);
        if (!video) {
          throw new Error(`Video ${videoId} not found`);
        }

        const nodeData: InsertPathNode = {
          pathId: path.id,
          videoId,
          sequenceOrder: index + 1,
          isRequired: true,
          completionCriteria: "watched",
        };

        return storage.createPathNode(nodeData);
      })
    );

    return { path, nodes };
  }

  async addVideoToPath(
    pathId: string,
    videoId: string,
    sequenceOrder?: number
  ): Promise<any> {
    const video = await storage.getVideoById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    const existingNodes = await storage.getPathNodesByPathId(pathId);
    
    const actualSequenceOrder =
      sequenceOrder ?? existingNodes.length + 1;

    const nodeData: InsertPathNode = {
      pathId,
      videoId,
      sequenceOrder: actualSequenceOrder,
      isRequired: true,
      completionCriteria: "watched",
    };

    return storage.createPathNode(nodeData);
  }

  async removeVideoFromPath(pathId: string, nodeId: string): Promise<void> {
    await storage.deletePathNode(nodeId);

    const remainingNodes = await storage.getPathNodesByPathId(pathId);
    
    const sortedNodes = remainingNodes.sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder
    );

    await Promise.all(
      sortedNodes.map((node, index) =>
        storage.updatePathNode(node.id, { sequenceOrder: index + 1 })
      )
    );
  }

  async reorderPathVideos(
    pathId: string,
    nodeOrders: { nodeId: string; newSequence: number }[]
  ): Promise<void> {
    await Promise.all(
      nodeOrders.map(({ nodeId, newSequence }) =>
        storage.updatePathNode(nodeId, { sequenceOrder: newSequence })
      )
    );
  }

  async getPathWithVideos(pathId: string): Promise<any> {
    const path = await storage.getLearningPathById(pathId);
    if (!path) {
      return null;
    }

    const nodes = await storage.getPathNodesByPathId(pathId);
    
    const sortedNodes = nodes.sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder
    );

    const videos = await Promise.all(
      sortedNodes.map(async (node) => {
        if (!node.videoId) return null;
        const video = await storage.getVideoById(node.videoId);
        if (!video) return null;
        return {
          ...video,
          nodeId: node.id,
          sequenceOrder: node.sequenceOrder,
          isRequired: node.isRequired,
          completionCriteria: node.completionCriteria,
        };
      })
    );

    return {
      ...path,
      videos: videos.filter((v) => v !== null),
    };
  }

  async getAllPaths(topic?: string, difficulty?: string): Promise<any[]> {
    const allPaths = await storage.getAllLearningPaths();

    let filteredPaths = allPaths;

    if (topic) {
      filteredPaths = filteredPaths.filter(
        (p) => p.topic.toLowerCase() === topic.toLowerCase()
      );
    }

    if (difficulty) {
      filteredPaths = filteredPaths.filter(
        (p) => p.difficulty === difficulty
      );
    }

    return Promise.all(
      filteredPaths.map(async (path) => {
        const nodes = await storage.getPathNodesByPathId(path.id);
        return {
          ...path,
          videoCount: nodes.length,
        };
      })
    );
  }

  async getUserProgress(userId: string, pathId: string): Promise<any> {
    const path = await this.getPathWithVideos(pathId);
    if (!path) {
      return null;
    }

    const progressRecords = await storage.getUserProgressByUserId(userId);

    const pathProgress = progressRecords.filter(
      (p) => p.pathId === pathId
    );

    const completedVideoIds = new Set(
      pathProgress
        .filter((p) => p.isCompleted)
        .map((p) => p.nodeId)
    );

    const videosWithProgress = path.videos.map((video: any) => ({
      ...video,
      isCompleted: completedVideoIds.has(video.nodeId),
    }));

    const completedCount = videosWithProgress.filter(
      (v: any) => v.isCompleted
    ).length;
    const totalCount = path.videos.length;
    const completionPercentage =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      ...path,
      videos: videosWithProgress,
      progress: {
        completedVideos: completedCount,
        totalVideos: totalCount,
        completionPercentage,
        isCompleted: completedCount === totalCount && totalCount > 0,
      },
    };
  }

  async markNodeComplete(
    userId: string,
    pathId: string,
    nodeId: string
  ): Promise<void> {
    await storage.createUserProgress({
      userId,
      pathId,
      nodeId,
      isCompleted: true,
    });
  }

  private calculateEstimatedDuration(videoCount: number): number {
    return videoCount * 10;
  }

  async clonePath(
    pathId: string,
    newTitle: string,
    createdBy?: string
  ): Promise<PathWithNodes> {
    const originalPath = await this.getPathWithVideos(pathId);
    if (!originalPath) {
      throw new Error(`Path ${pathId} not found`);
    }

    const pathData: InsertLearningPath = {
      title: newTitle,
      description: originalPath.description,
      topic: originalPath.topic,
      difficulty: originalPath.difficulty,
      estimatedDuration: originalPath.estimatedDuration,
      createdBy: createdBy || null,
    };

    const newPath = await storage.createLearningPath(pathData);

    const nodes = await Promise.all(
      originalPath.videos.map(async (video: any) => {
        const nodeData: InsertPathNode = {
          pathId: newPath.id,
          videoId: video.id,
          sequenceOrder: video.sequenceOrder,
          isRequired: video.isRequired,
          completionCriteria: video.completionCriteria,
        };

        return storage.createPathNode(nodeData);
      })
    );

    return { path: newPath, nodes };
  }
}

export const pathBuilder = new PathBuilder();
