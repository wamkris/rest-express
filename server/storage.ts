import { 
  userPreferences, 
  curatedVideos,
  videos,
  users,
  userApiKeys,
  transcriptBlocks,
  concepts,
  conceptSpans,
  learningPaths,
  pathNodes,
  userProgress,
  type UserPreferences, 
  type InsertUserPreferences, 
  type CuratedVideo, 
  type InsertCuratedVideo,
  type Video,
  type InsertVideo,
  type User,
  type UpsertUser,
  type UserApiKey,
  type InsertUserApiKey,
  type TranscriptBlock,
  type InsertTranscriptBlock,
  type Concept,
  type InsertConcept,
  type ConceptSpan,
  type InsertConceptSpan,
  type LearningPath,
  type InsertLearningPath,
  type PathNode,
  type InsertPathNode,
  type UserProgress,
  type InsertUserProgress
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // User preferences operations
  createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  getUserPreferences(id: string): Promise<UserPreferences | undefined>;
  
  // Canonical videos operations (Phase 1: School Alt)
  getVideoById(id: string): Promise<Video | undefined>;
  upsertVideo(video: InsertVideo): Promise<Video>;
  
  // Curated videos operations
  createCuratedVideos(videos: InsertCuratedVideo[]): Promise<CuratedVideo[]>;
  getCuratedVideosByPreferenceId(preferenceId: string): Promise<CuratedVideo[]>;
  deleteCuratedVideosByPreferenceId(preferenceId: string): Promise<void>;
  
  // API keys operations
  createUserApiKey(apiKey: InsertUserApiKey): Promise<UserApiKey>;
  getUserApiKey(userId: string, provider: string): Promise<UserApiKey | undefined>;
  getUserApiKeys(userId: string): Promise<UserApiKey[]>;
  updateUserApiKey(id: string, updates: Partial<InsertUserApiKey>): Promise<UserApiKey>;
  deleteUserApiKey(id: string): Promise<void>;
  
  // Transcript operations (Phase 2: School Alt)
  getTranscriptBlocksByVideoId(videoId: string): Promise<TranscriptBlock[]>;
  createTranscriptBlocks(blocks: InsertTranscriptBlock[]): Promise<TranscriptBlock[]>;
  getTranscriptAtTimestamp(videoId: string, timestamp: number): Promise<TranscriptBlock | undefined>;
  
  // Concept operations (Phase 2: School Alt)
  getConceptById(id: string): Promise<Concept | undefined>;
  createConcept(concept: InsertConcept): Promise<Concept>;
  getConceptsByCategory(category: string): Promise<Concept[]>;
  
  // Concept span operations (Phase 2: School Alt)
  getConceptSpansByVideoId(videoId: string): Promise<ConceptSpan[]>;
  getConceptSpansAtTimestamp(videoId: string, timestamp: number): Promise<ConceptSpan[]>;
  createConceptSpans(spans: InsertConceptSpan[]): Promise<ConceptSpan[]>;
  
  // Learning path operations (Phase 2: School Alt)
  getLearningPathById(id: string): Promise<LearningPath | undefined>;
  getLearningPathsByTopic(topic: string): Promise<LearningPath[]>;
  getAllLearningPaths(): Promise<LearningPath[]>;
  createLearningPath(path: InsertLearningPath): Promise<LearningPath>;
  
  // Path node operations (Phase 2: School Alt)
  getPathNodesByPathId(pathId: string): Promise<PathNode[]>;
  createPathNodes(nodes: InsertPathNode[]): Promise<PathNode[]>;
  createPathNode(node: InsertPathNode): Promise<PathNode>;
  updatePathNode(id: string, updates: Partial<InsertPathNode>): Promise<PathNode>;
  deletePathNode(id: string): Promise<void>;
  
  // User progress operations (Phase 2: School Alt)
  getUserProgress(userId: string, conceptId: string): Promise<UserProgress | undefined>;
  getUserProgressByUserId(userId: string): Promise<UserProgress[]>;
  upsertUserProgress(progress: InsertUserProgress & { userId: string; conceptId: string }): Promise<UserProgress>;
  createUserProgress(progress: InsertUserProgress): Promise<UserProgress>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userPreferences: Map<string, UserPreferences>;
  private videos: Map<string, Video>;
  private curatedVideos: Map<string, CuratedVideo>;
  private apiKeys: Map<string, UserApiKey>;

  constructor() {
    this.users = new Map();
    this.userPreferences = new Map();
    this.videos = new Map();
    this.curatedVideos = new Map();
    this.apiKeys = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = this.users.get(userData.id!);
    const user: User = {
      id: userData.id || randomUUID(),
      email: userData.email ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async createUserPreferences(insertPreferences: InsertUserPreferences): Promise<UserPreferences> {
    const id = randomUUID();
    const preferences: UserPreferences = { 
      ...insertPreferences,
      learningMode: insertPreferences.learningMode ?? "quick",
      id,
      notificationTime: insertPreferences.notificationTime ?? null,
      createdAt: new Date()
    };
    this.userPreferences.set(id, preferences);
    return preferences;
  }

  async getUserPreferences(id: string): Promise<UserPreferences | undefined> {
    return this.userPreferences.get(id);
  }

  async getVideoById(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async upsertVideo(videoData: InsertVideo): Promise<Video> {
    const existing = this.videos.get(videoData.id);
    const video: Video = {
      ...videoData,
      publishedAt: videoData.publishedAt ?? null,
      viewCount: videoData.viewCount ?? null,
      description: videoData.description ?? null,
      createdAt: existing?.createdAt || new Date(),
    };
    this.videos.set(video.id, video);
    return video;
  }

  async createCuratedVideos(insertVideos: InsertCuratedVideo[]): Promise<CuratedVideo[]> {
    const videos: CuratedVideo[] = insertVideos.map(video => ({
      ...video,
      id: randomUUID(),
      description: video.description ?? null,
      channelThumbnail: video.channelThumbnail ?? null,
      viewCount: video.viewCount ?? null,
      uploadDate: video.uploadDate ?? null,
      reasonSelected: video.reasonSelected ?? null,
      sequenceOrder: video.sequenceOrder ?? 1,
      difficultyLevel: video.difficultyLevel ?? "beginner",
      depthDimension: video.depthDimension ?? null,
      isWatched: video.isWatched ?? false,
      conceptualDepthScore: video.conceptualDepthScore ?? null,
      clarityScore: video.clarityScore ?? null,
      contentDensityScore: video.contentDensityScore ?? null,
      recencyRelevanceScore: video.recencyRelevanceScore ?? null,
      cognitiveMatchScore: video.cognitiveMatchScore ?? null,
      overallDepthScore: video.overallDepthScore ?? null,
      depthReasoning: video.depthReasoning ?? null,
      isConceptual: video.isConceptual ?? null,
      createdAt: new Date()
    }));

    videos.forEach(video => {
      this.curatedVideos.set(video.id, video);
    });

    return videos;
  }

  async getCuratedVideosByPreferenceId(preferenceId: string): Promise<CuratedVideo[]> {
    return Array.from(this.curatedVideos.values()).filter(
      video => video.preferenceId === preferenceId
    );
  }

  async deleteCuratedVideosByPreferenceId(preferenceId: string): Promise<void> {
    const videosToDelete = Array.from(this.curatedVideos.values()).filter(
      video => video.preferenceId === preferenceId
    );
    
    videosToDelete.forEach(video => {
      this.curatedVideos.delete(video.id);
    });
  }

  async createUserApiKey(apiKeyData: InsertUserApiKey): Promise<UserApiKey> {
    const id = randomUUID();
    const apiKey: UserApiKey = {
      ...apiKeyData,
      id,
      isValid: apiKeyData.isValid ?? true,
      lastValidatedAt: apiKeyData.lastValidatedAt ?? null,
      quotaStatus: apiKeyData.quotaStatus ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }

  async getUserApiKey(userId: string, provider: string): Promise<UserApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find(
      key => key.userId === userId && key.provider === provider
    );
  }

  async getUserApiKeys(userId: string): Promise<UserApiKey[]> {
    return Array.from(this.apiKeys.values()).filter(
      key => key.userId === userId
    );
  }

  async updateUserApiKey(id: string, updates: Partial<InsertUserApiKey>): Promise<UserApiKey> {
    const existing = this.apiKeys.get(id);
    if (!existing) {
      throw new Error("API key not found");
    }
    const updated: UserApiKey = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.apiKeys.set(id, updated);
    return updated;
  }

  async deleteUserApiKey(id: string): Promise<void> {
    this.apiKeys.delete(id);
  }

  // Phase 2: School Alt methods (not implemented for MemStorage - use DatabaseStorage in production)
  async getTranscriptBlocksByVideoId(_videoId: string): Promise<TranscriptBlock[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async createTranscriptBlocks(_blocks: InsertTranscriptBlock[]): Promise<TranscriptBlock[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getTranscriptAtTimestamp(_videoId: string, _timestamp: number): Promise<TranscriptBlock | undefined> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getConceptById(_id: string): Promise<Concept | undefined> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async createConcept(_concept: InsertConcept): Promise<Concept> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getConceptsByCategory(_category: string): Promise<Concept[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getConceptSpansByVideoId(_videoId: string): Promise<ConceptSpan[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getConceptSpansAtTimestamp(_videoId: string, _timestamp: number): Promise<ConceptSpan[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async createConceptSpans(_spans: InsertConceptSpan[]): Promise<ConceptSpan[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getLearningPathById(_id: string): Promise<LearningPath | undefined> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getLearningPathsByTopic(_topic: string): Promise<LearningPath[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async createLearningPath(_path: InsertLearningPath): Promise<LearningPath> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getPathNodesByPathId(_pathId: string): Promise<PathNode[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async createPathNodes(_nodes: InsertPathNode[]): Promise<PathNode[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getUserProgress(_userId: string, _conceptId: string): Promise<UserProgress | undefined> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async getUserProgressByUserId(_userId: string): Promise<UserProgress[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
  
  async upsertUserProgress(_progress: InsertUserProgress & { userId: string; conceptId: string }): Promise<UserProgress> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }

  async getAllLearningPaths(): Promise<LearningPath[]> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }

  async createPathNode(_node: InsertPathNode): Promise<PathNode> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }

  async updatePathNode(_id: string, _updates: Partial<InsertPathNode>): Promise<PathNode> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }

  async deletePathNode(_id: string): Promise<void> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }

  async createUserProgress(_progress: InsertUserProgress): Promise<UserProgress> {
    throw new Error("MemStorage not supported for School Alt features. Use DatabaseStorage.");
  }
}

export class DatabaseStorage implements IStorage {
  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // User preferences operations
  async createUserPreferences(insertPreferences: InsertUserPreferences): Promise<UserPreferences> {
    const [preferences] = await db
      .insert(userPreferences)
      .values(insertPreferences)
      .returning();
    return preferences;
  }

  async getUserPreferences(id: string): Promise<UserPreferences | undefined> {
    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, id));
    return preferences || undefined;
  }

  // Canonical videos operations (Phase 1: School Alt)
  async getVideoById(id: string): Promise<Video | undefined> {
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id));
    return video;
  }

  async upsertVideo(videoData: InsertVideo): Promise<Video> {
    const [video] = await db
      .insert(videos)
      .values(videoData)
      .onConflictDoUpdate({
        target: videos.id,
        set: {
          title: videoData.title,
          channelName: videoData.channelName,
          duration: videoData.duration,
          publishedAt: videoData.publishedAt,
          thumbnailUrl: videoData.thumbnailUrl,
          viewCount: videoData.viewCount,
          description: videoData.description,
        },
      })
      .returning();
    return video;
  }

  async createCuratedVideos(insertVideos: InsertCuratedVideo[]): Promise<CuratedVideo[]> {
    const videos = await db
      .insert(curatedVideos)
      .values(insertVideos)
      .returning();
    return videos;
  }

  async getCuratedVideosByPreferenceId(preferenceId: string): Promise<CuratedVideo[]> {
    const videos = await db
      .select()
      .from(curatedVideos)
      .where(eq(curatedVideos.preferenceId, preferenceId));
    return videos;
  }

  async deleteCuratedVideosByPreferenceId(preferenceId: string): Promise<void> {
    await db
      .delete(curatedVideos)
      .where(eq(curatedVideos.preferenceId, preferenceId));
  }

  // API keys operations
  async createUserApiKey(apiKeyData: InsertUserApiKey): Promise<UserApiKey> {
    const [apiKey] = await db
      .insert(userApiKeys)
      .values(apiKeyData)
      .returning();
    return apiKey;
  }

  async getUserApiKey(userId: string, provider: string): Promise<UserApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    return apiKey;
  }

  async getUserApiKeys(userId: string): Promise<UserApiKey[]> {
    return await db
      .select()
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, userId));
  }

  async updateUserApiKey(id: string, updates: Partial<InsertUserApiKey>): Promise<UserApiKey> {
    const [apiKey] = await db
      .update(userApiKeys)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userApiKeys.id, id))
      .returning();
    return apiKey;
  }

  async deleteUserApiKey(id: string): Promise<void> {
    await db
      .delete(userApiKeys)
      .where(eq(userApiKeys.id, id));
  }

  // Transcript operations (Phase 2: School Alt)
  async getTranscriptBlocksByVideoId(videoId: string): Promise<TranscriptBlock[]> {
    return await db
      .select()
      .from(transcriptBlocks)
      .where(eq(transcriptBlocks.videoId, videoId))
      .orderBy(transcriptBlocks.startTime);
  }

  async createTranscriptBlocks(blocks: InsertTranscriptBlock[]): Promise<TranscriptBlock[]> {
    const inserted = await db
      .insert(transcriptBlocks)
      .values(blocks)
      .returning();
    return inserted;
  }

  async getTranscriptAtTimestamp(videoId: string, timestamp: number): Promise<TranscriptBlock | undefined> {
    const [block] = await db
      .select()
      .from(transcriptBlocks)
      .where(
        and(
          eq(transcriptBlocks.videoId, videoId),
          lte(transcriptBlocks.startTime, timestamp),
          gte(transcriptBlocks.endTime, timestamp)
        )
      );
    return block;
  }

  // Concept operations (Phase 2: School Alt)
  async getConceptById(id: string): Promise<Concept | undefined> {
    const [concept] = await db
      .select()
      .from(concepts)
      .where(eq(concepts.id, id));
    return concept;
  }

  async createConcept(conceptData: InsertConcept): Promise<Concept> {
    const [concept] = await db
      .insert(concepts)
      .values(conceptData)
      .returning();
    return concept;
  }

  async getConceptsByCategory(category: string): Promise<Concept[]> {
    return await db
      .select()
      .from(concepts)
      .where(eq(concepts.category, category));
  }

  // Concept span operations (Phase 2: School Alt)
  async getConceptSpansByVideoId(videoId: string): Promise<ConceptSpan[]> {
    return await db
      .select()
      .from(conceptSpans)
      .where(eq(conceptSpans.videoId, videoId))
      .orderBy(conceptSpans.startTime);
  }

  async getConceptSpansAtTimestamp(videoId: string, timestamp: number): Promise<ConceptSpan[]> {
    return await db
      .select()
      .from(conceptSpans)
      .where(
        and(
          eq(conceptSpans.videoId, videoId),
          lte(conceptSpans.startTime, timestamp),
          gte(conceptSpans.endTime, timestamp)
        )
      );
  }

  async createConceptSpans(spans: InsertConceptSpan[]): Promise<ConceptSpan[]> {
    const inserted = await db
      .insert(conceptSpans)
      .values(spans)
      .returning();
    return inserted;
  }

  // Learning path operations (Phase 2: School Alt)
  async getLearningPathById(id: string): Promise<LearningPath | undefined> {
    const [path] = await db
      .select()
      .from(learningPaths)
      .where(eq(learningPaths.id, id));
    return path;
  }

  async getLearningPathsByTopic(topic: string): Promise<LearningPath[]> {
    return await db
      .select()
      .from(learningPaths)
      .where(eq(learningPaths.topic, topic));
  }

  async createLearningPath(pathData: InsertLearningPath): Promise<LearningPath> {
    const [path] = await db
      .insert(learningPaths)
      .values(pathData)
      .returning();
    return path;
  }

  // Path node operations (Phase 2: School Alt)
  async getPathNodesByPathId(pathId: string): Promise<PathNode[]> {
    return await db
      .select()
      .from(pathNodes)
      .where(eq(pathNodes.pathId, pathId))
      .orderBy(pathNodes.sequenceOrder);
  }

  async createPathNodes(nodes: InsertPathNode[]): Promise<PathNode[]> {
    const inserted = await db
      .insert(pathNodes)
      .values(nodes)
      .returning();
    return inserted;
  }

  // User progress operations (Phase 2: School Alt)
  async getUserProgress(userId: string, conceptId: string): Promise<UserProgress | undefined> {
    const [progress] = await db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, userId),
          eq(userProgress.conceptId, conceptId)
        )
      );
    return progress;
  }

  async getUserProgressByUserId(userId: string): Promise<UserProgress[]> {
    return await db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId));
  }

  async upsertUserProgress(progressData: InsertUserProgress & { userId: string; conceptId: string }): Promise<UserProgress> {
    const [progress] = await db
      .insert(userProgress)
      .values(progressData)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.conceptId],
        set: {
          masteryLevel: progressData.masteryLevel,
          lastReviewedAt: progressData.lastReviewedAt || new Date(),
        },
      })
      .returning();
    return progress;
  }

  async getAllLearningPaths(): Promise<LearningPath[]> {
    return await db
      .select()
      .from(learningPaths)
      .orderBy(learningPaths.createdAt);
  }

  async createPathNode(node: InsertPathNode): Promise<PathNode> {
    const [created] = await db
      .insert(pathNodes)
      .values(node)
      .returning();
    return created;
  }

  async updatePathNode(id: string, updates: Partial<InsertPathNode>): Promise<PathNode> {
    const [updated] = await db
      .update(pathNodes)
      .set(updates)
      .where(eq(pathNodes.id, id))
      .returning();
    return updated;
  }

  async deletePathNode(id: string): Promise<void> {
    await db
      .delete(pathNodes)
      .where(eq(pathNodes.id, id));
  }

  async createUserProgress(progress: InsertUserProgress): Promise<UserProgress> {
    const [created] = await db
      .insert(userProgress)
      .values(progress)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
