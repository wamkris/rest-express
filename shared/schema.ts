import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User API keys table for BYOK (Bring Your Own Key)
export const userApiKeys = pgTable("user_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(), // "youtube" or "claude"
  encryptedKey: text("encrypted_key").notNull(), // encrypted API key
  isValid: boolean("is_valid").notNull().default(true), // validation status
  lastValidatedAt: timestamp("last_validated_at"),
  quotaStatus: text("quota_status"), // JSON string with quota info
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  interest: text("interest").notNull(),
  learningGoal: text("learning_goal").notNull(), // semantic learning goal (label)
  learningMode: text("learning_mode").notNull().default("quick"), // "quick" or "deep"
  notificationTime: text("notification_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Canonical videos table (one row per unique YouTube video)
// This is the single source of truth for video metadata
export const videos = pgTable(
  "videos",
  {
    id: text("id").primaryKey(), // YouTube video ID (e.g., "dQw4w9WgXcQ")
    title: text("title").notNull(),
    channelName: text("channel_name").notNull(),
    duration: text("duration").notNull(), // ISO 8601 duration (e.g., "PT4M33S")
    publishedAt: text("published_at"), // ISO 8601 timestamp
    thumbnailUrl: text("thumbnail_url").notNull(),
    viewCount: text("view_count"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(), // When ingested into our system
  },
  (table) => [
    index("idx_videos_channel").on(table.channelName),
    index("idx_videos_published").on(table.publishedAt),
  ]
);

export const curatedVideos = pgTable("curated_videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  preferenceId: varchar("preference_id").notNull(),
  videoId: text("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }), // FK to canonical videos
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url").notNull(),
  duration: text("duration").notNull(),
  channelName: text("channel_name").notNull(),
  channelThumbnail: text("channel_thumbnail"),
  viewCount: text("view_count"),
  uploadDate: text("upload_date"),
  reasonSelected: text("reason_selected"),
  sequenceOrder: integer("sequence_order").notNull().default(1), // Learning sequence 1-8
  difficultyLevel: text("difficulty_level").notNull().default("beginner"), // beginner, intermediate, advanced
  depthDimension: text("depth_dimension"), // conceptual, analytical, strategic, critical, evolutionary (for deep learning mode)
  isWatched: boolean("is_watched").notNull().default(false), // Progress tracking
  // Depth scoring fields
  conceptualDepthScore: integer("conceptual_depth_score"),
  clarityScore: integer("clarity_score"),
  contentDensityScore: integer("content_density_score"),
  recencyRelevanceScore: integer("recency_relevance_score"),
  cognitiveMatchScore: integer("cognitive_match_score"),
  overallDepthScore: integer("overall_depth_score"),
  depthReasoning: text("depth_reasoning"),
  isConceptual: boolean("is_conceptual"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transcript blocks for video captions (School Alt Phase 2)
export const transcriptBlocks = pgTable(
  "transcript_blocks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    blockIndex: integer("block_index").notNull(),
    startTime: integer("start_time").notNull(),
    endTime: integer("end_time").notNull(),
    text: text("text").notNull(),
    language: text("language").default("en"),
    source: text("source").default("auto"),
    tqs: integer("tqs"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_transcript_video").on(table.videoId),
    index("idx_transcript_time").on(table.videoId, table.startTime),
  ]
);

// Concepts extracted from videos (School Alt Phase 2)
export const concepts = pgTable("concepts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  difficulty: text("difficulty").default('intermediate'),
  prerequisites: text("prerequisites").array(),
  relatedConcepts: text("related_concepts").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Concept spans - links concepts to specific video timestamps (School Alt Phase 2)
export const conceptSpans = pgTable(
  "concept_spans",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    conceptId: varchar("concept_id").references(() => concepts.id, { onDelete: "cascade" }),
    startTime: integer("start_time").notNull(),
    endTime: integer("end_time").notNull(),
    relevanceScore: integer("relevance_score"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_concept_spans_video").on(table.videoId),
    index("idx_concept_spans_concept").on(table.conceptId),
    index("idx_concept_spans_time").on(table.videoId, table.startTime),
  ]
);

// Learning paths - curated sequences of concepts (School Alt Phase 2)
export const learningPaths = pgTable("learning_paths", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull().default("beginner"),
  estimatedDuration: integer("estimated_duration"),
  createdBy: varchar("created_by").references(() => users.id),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

// Path nodes - individual steps in a learning path (School Alt Phase 2)
export const pathNodes = pgTable(
  "path_nodes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    pathId: varchar("path_id")
      .notNull()
      .references(() => learningPaths.id, { onDelete: "cascade" }),
    conceptId: varchar("concept_id").references(() => concepts.id),
    videoId: text("video_id").references(() => videos.id),
    sequenceOrder: integer("sequence_order").notNull(),
    isRequired: boolean("is_required").default(true),
    completionCriteria: text("completion_criteria").default("watched"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_path_nodes_path").on(table.pathId),
    index("idx_path_nodes_sequence").on(table.pathId, table.sequenceOrder),
  ]
);

// User progress tracking (School Alt Phase 2)
export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pathId: varchar("path_id").references(() => learningPaths.id, { onDelete: "cascade" }),
  nodeId: varchar("node_id").references(() => pathNodes.id, { onDelete: "cascade" }),
  conceptId: varchar("concept_id").references(() => concepts.id, { onDelete: "cascade" }),
  masteryLevel: integer("mastery_level").default(0),
  isCompleted: boolean("is_completed").default(false),
  lastReviewedAt: timestamp("last_reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  createdAt: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
});

export const insertCuratedVideoSchema = createInsertSchema(curatedVideos).omit({
  id: true,
  createdAt: true,
});

export const insertTranscriptBlockSchema = createInsertSchema(transcriptBlocks).omit({
  id: true,
  createdAt: true,
});

export const insertConceptSchema = createInsertSchema(concepts).omit({
  id: true,
  createdAt: true,
});

export const insertConceptSpanSchema = createInsertSchema(conceptSpans).omit({
  id: true,
  createdAt: true,
});

export const insertLearningPathSchema = createInsertSchema(learningPaths).omit({
  id: true,
  createdAt: true,
});

export const insertPathNodeSchema = createInsertSchema(pathNodes).omit({
  id: true,
  createdAt: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
  createdAt: true,
});

export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertCuratedVideo = z.infer<typeof insertCuratedVideoSchema>;
export type CuratedVideo = typeof curatedVideos.$inferSelect;
export type InsertTranscriptBlock = z.infer<typeof insertTranscriptBlockSchema>;
export type TranscriptBlock = typeof transcriptBlocks.$inferSelect;
export type InsertConcept = z.infer<typeof insertConceptSchema>;
export type Concept = typeof concepts.$inferSelect;
export type InsertConceptSpan = z.infer<typeof insertConceptSpanSchema>;
export type ConceptSpan = typeof conceptSpans.$inferSelect;
export type InsertLearningPath = z.infer<typeof insertLearningPathSchema>;
export type LearningPath = typeof learningPaths.$inferSelect;
export type InsertPathNode = z.infer<typeof insertPathNodeSchema>;
export type PathNode = typeof pathNodes.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
export type UserProgress = typeof userProgress.$inferSelect;

// Client-side types for form validation
export const learningInterestSchema = z.object({
  interest: z.string().min(1, "Please enter what you want to learn"),
  learningGoal: z.string().min(1, "Please select a learning goal"),
  learningMode: z.enum(["quick", "deep"]).default("quick"),
  notificationTime: z.string().optional(),
  useTranscriptIntelligence: z.enum(["auto", "enabled", "disabled"]).default("auto"),
});

export type LearningInterestForm = z.infer<typeof learningInterestSchema>;

// Auth-related types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// API Key types
export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
export type UserApiKey = typeof userApiKeys.$inferSelect;

// API Key validation schema
export const apiKeyInputSchema = z.object({
  provider: z.enum(["youtube", "claude"]),
  apiKey: z.string().min(1, "API key is required"),
});
