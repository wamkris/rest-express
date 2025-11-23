# School Alt Integration Plan
## Building on Existing Foundation

This document outlines how School Alt features will **extend** (not replace) the existing production-quality components.

---

## Existing Foundation (Keep & Extend)

### ✅ 1. Google Authentication System
**Location**: `server/googleAuth.ts`

**What's Already Built**:
- Google OAuth 2.0 strategy with Passport.js
- User table with profile data (`users` table)
- Session management with PostgreSQL store
- Login/logout/callback routes

**School Alt Extension**:
- **No changes needed** to auth system
- New tables will reference existing `users.id` foreign key
- User mastery tracking will link to authenticated users
- Learning path progress tied to user accounts

**Integration Points**:
```typescript
// Existing user model (NO CHANGES)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// NEW: User concept mastery (extends users)
export const userConceptMastery = pgTable("user_concept_mastery", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // Links to existing auth
  conceptId: varchar("concept_id").references(() => concepts.id),
  masteryLevel: text("mastery_level"), // unknown, familiar, stable, fluent
  // ... more fields
});
```

---

### ✅ 2. BYOK (Bring Your Own Key) System
**Location**: `server/keyManager.ts`, `server/apiKeySelector.ts`, `server/keyEncryption.ts`

**What's Already Built**:
- `userApiKeys` table with encrypted API keys per provider
- Multi-key rotation pool for developer (wamkris@gmail.com)
- Automatic fallback: user key → pool key
- Quota tracking and key health monitoring
- Support for YouTube Data API and Claude API

**School Alt Extension**:
- **Fully reuse** existing key selection logic for all new services
- Caption ingestion uses `selectApiKey("youtube", userId, userEmail)`
- Concept extraction uses `selectApiKey("claude", userId, userEmail)`
- TQS calculation, path building all use same BYOK infrastructure

**BYOK Type System Extension** (if adding new providers like Whisper):
```typescript
// Extend provider type union in apiKeySelector.ts
type ApiProvider = "youtube" | "claude" | "whisper" | "openai";

// Update selectApiKey signature
export async function selectApiKey(
  provider: ApiProvider,  // Extended type
  userId?: string,
  userEmail?: string
): Promise<{ key: string; source: "user" | "pool" } | null> {
  // ... existing logic works for new providers too
}

// Update keyManager.ts to support new providers
class KeyRotationManager {
  private youtubePools: KeyPool;
  private claudePools: KeyPool;
  private whisperPools: KeyPool;  // NEW
  // ...
}
```

**Note**: For School Alt v0, we only need YouTube + Claude (existing types). Whisper/OpenAI support is future enhancement.

**Integration Points**:
```typescript
// Existing BYOK (NO CHANGES)
export const userApiKeys = pgTable("user_api_keys", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  provider: varchar("provider"), // "youtube" or "claude"
  encryptedKey: text("encrypted_key"),
  isValid: boolean("is_valid"),
  quotaStatus: text("quota_status"),
  // ... more fields
});

// School Alt services reuse this:
async function extractConceptsFromTranscript(videoId: string, userId?: string, userEmail?: string) {
  // Uses existing selectApiKey() - no changes needed
  const { client, key, source } = await getClaudeClient(userId, userEmail);
  
  // Track quota usage with existing reportKeyStatus()
  reportKeyStatus("claude", key, true);
  
  // Extract concepts...
}
```

---

### ✅ 3. Curation Engine
**Location**: `server/routes.ts` (lines 70-1800+)

**What's Already Built**:
- Multi-level search strategies (beginner/intermediate/advanced)
- Depth-focused curation (conceptual/analytical/strategic/critical/evolutionary)
- Claude-powered batch video curation
- Learning goal alignment
- Difficulty level assignment
- `reasonSelected` rationales
- Depth dimension tagging
- Recency scoring

**School Alt Extension**:
- **Enhance** existing curation with additional ranking signals
- Add TQS (Transcript Quality Score) as a ranking signal (weight: 0.15)
- Add concept coverage scoring (weight: 0.20)
- Add pedagogy score based on transcript analysis (weight: 0.15)
- Generate "Why #1" explainability from signal breakdown
- Keep all existing functionality (depth dimensions, difficulty levels)

**Integration Strategy**:

```typescript
// EXISTING: curateVideosWithClaudeMultiLevel (KEEP)
// This function already does:
// - Batch processing
// - Difficulty assignment
// - Reason selected rationales

// NEW: Enhance with transcript-based signals
async function enhanceCurationWithTranscriptIntelligence(
  curatedVideos: CuratedVideoResponse[],
  userId?: string
): Promise<EnhancedCuratedVideoResponse[]> {
  
  return await Promise.all(curatedVideos.map(async (video) => {
    // Check if transcript available and TQS calculated
    const transcript = await storage.getTranscriptByVideoId(video.videoId);
    
    if (!transcript || transcript.tqs < 60) {
      // No transcript or low quality - use existing curation signals only
      return {
        ...video,
        tqsScore: null,
        conceptCoverage: null,
        pedagogyScore: null,
        explainabilityRank: null
      };
    }
    
    // Calculate new signals from transcript
    const conceptCoverage = await calculateConceptCoverage(video.videoId);
    const pedagogyScore = await analyzePedagogy(transcript);
    
    // Weighted fusion with existing signals
    const enhancedScore = calculateEnhancedRank({
      existingScore: video.existingRankScore || 0.8,
      tqsScore: transcript.tqs / 100,
      conceptCoverage,
      pedagogyScore,
      recencyScore: video.recencyScore || 0.7
    });
    
    // Generate "Why #1" explainability
    const explainability = generateExplainability({
      rank: 1,
      tqs: transcript.tqs,
      conceptCoverage,
      pedagogyScore,
      videoTitle: video.title
    });
    
    return {
      ...video,
      enhancedRankScore: enhancedScore,
      tqsScore: transcript.tqs,
      conceptCoverage,
      pedagogyScore,
      explainabilityRationale: explainability
    };
  }));
}

// Usage in existing route (MINIMAL CHANGE)
app.post("/api/curate", isAuthenticated, async (req, res) => {
  // ... existing code to curate videos ...
  const curatedVideos = await curateVideosWithClaudeMultiLevel(...);
  
  // NEW: Enhance with transcript intelligence (optional, progressive)
  const enhancedVideos = await enhanceCurationWithTranscriptIntelligence(
    curatedVideos,
    req.user?.id
  );
  
  res.json(enhancedVideos);
});
```

---

## New Components (Build from Scratch)

### 🆕 1. Transcript Ingestion & TQS Calculation

**Purpose**: Fetch captions, calculate Transcript Quality Score (0-100)

**Implementation**:
- New service: `server/services/captionService.ts`
- New table: `transcript_blocks` (extends `curatedVideos`)
- Uses existing YouTube API key via `selectApiKey("youtube", userId, userEmail)`

**Schema Addition**:

**IMPORTANT**: We need a canonical `videos` table first, since `curatedVideos.videoId` is NOT unique (multiple preferences can curate the same video).

```typescript
// NEW: Canonical videos table (one row per unique YouTube video)
export const videos = pgTable("videos", {
  id: varchar("id").primaryKey(), // YouTube video ID (e.g., "dQw4w9WgXcQ")
  title: text("title").notNull(),
  channelName: text("channel_name"),
  duration: text("duration"),
  publishedAt: timestamp("published_at"),
  thumbnailUrl: text("thumbnail_url"),
  // Metadata cached from YouTube API
  viewCount: text("view_count"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_videos_channel").on(table.channelName),
  index("idx_videos_published").on(table.publishedAt),
]);

// MODIFY: curatedVideos now references canonical videos table
// (This is backwards compatible - we just add a foreign key constraint)
export const curatedVideos = pgTable("curated_videos", {
  // ... existing fields ...
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id), // NOW points to canonical table
  // ... rest unchanged ...
});

// NEW: Transcript blocks reference canonical videos
export const transcriptBlocks = pgTable("transcript_blocks", {
  id: varchar("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id), // References canonical table
  blockIndex: integer("block_index").notNull(),
  startTime: integer("start_time").notNull(), // seconds
  endTime: integer("end_time").notNull(),
  text: text("text").notNull(),
  language: text("language").default("en"),
  source: text("source").default("auto"), // "auto" or "manual"
  tqs: integer("tqs"), // 0-100 score (calculated per video, duplicated for convenience)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_transcript_video").on(table.videoId),
  index("idx_transcript_time").on(table.videoId, table.startTime),
]);
```

**API Route**:
```typescript
// POST /api/videos/:videoId/transcripts
app.post("/api/videos/:videoId/transcripts", isAuthenticated, async (req, res) => {
  const { videoId } = req.params;
  
  // Use existing BYOK system
  const keySelection = await selectApiKey("youtube", req.user.id, req.user.email);
  
  // Fetch captions, clean, calculate TQS
  const transcript = await captionService.ingestAndScore(videoId, keySelection.key);
  
  res.json(transcript);
});
```

---

### 🆕 2. Concept Intelligence Service

**Purpose**: Extract concepts, prerequisites, definitions from transcripts

**Implementation**:
- New service: `server/services/conceptService.ts`
- New tables: `concepts`, `concept_spans`, `concept_prerequisites`
- Uses existing Claude API via `selectApiKey("claude", userId, userEmail)`

**Schema Addition**:
```typescript
export const concepts = pgTable("concepts", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(), // "PID Controller"
  definition: text("definition"), // AI-generated definition
  category: text("category"), // "robotics", "programming", etc.
  depth: integer("depth").default(1), // Hierarchy depth
  embeddingVector: text("embedding_vector"), // pgvector for search
  createdAt: timestamp("created_at").defaultNow(),
});

export const conceptSpans = pgTable("concept_spans", {
  id: varchar("id").primaryKey(),
  videoId: text("video_id")
    .notNull()
    .references(() => videos.id), // References canonical videos table
  conceptId: varchar("concept_id").references(() => concepts.id),
  startTime: integer("start_time").notNull(),
  endTime: integer("end_time").notNull(),
  relevanceScore: integer("relevance_score"), // 0-100
}, (table) => [
  index("idx_concept_spans_video").on(table.videoId),
  index("idx_concept_spans_concept").on(table.conceptId),
  index("idx_concept_spans_time").on(table.videoId, table.startTime),
]);
```

---

### 🆕 3. Knowledge Graph & Learning Paths

**Purpose**: Build prerequisite graphs, generate learning paths

**Implementation**:
- New service: `server/services/pathBuilder.ts`
- New tables: `learning_paths`, `path_nodes`, `path_versions`
- Uses concept graph to sequence learning

**Schema Addition**:
```typescript
export const learningPaths = pgTable("learning_paths", {
  id: varchar("id").primaryKey(),
  topic: text("topic").notNull(), // "Robotics", "Python", etc.
  difficultyLevel: text("difficulty_level"), // beginner, intermediate, advanced
  conceptCount: integer("concept_count"),
  estimatedMinutes: integer("estimated_minutes"),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pathNodes = pgTable("path_nodes", {
  id: varchar("id").primaryKey(),
  pathId: varchar("path_id").references(() => learningPaths.id),
  conceptId: varchar("concept_id").references(() => concepts.id),
  videoId: text("video_id").references(() => videos.id), // References canonical videos
  sequenceOrder: integer("sequence_order"),
  startTime: integer("start_time"), // Video segment start
  endTime: integer("end_time"), // Video segment end
}, (table) => [
  index("idx_path_nodes_path").on(table.pathId),
  index("idx_path_nodes_sequence").on(table.pathId, table.sequenceOrder),
]);
```

---

### 🆕 4. Video Intelligence Runtime API

**Purpose**: Sub-100ms API for live concept context during playback

**Implementation**:
- New route: `GET /api/videos/:videoId/intelligence?timestamp=123`
- Redis caching layer (L1: in-memory, L2: Redis, L3: PostgreSQL)
- Returns current concept, prerequisites, next concepts

**API Response**:
```json
{
  "timestamp": 123,
  "currentConcept": {
    "id": "concept-pid",
    "name": "PID Controller",
    "definition": "A control loop feedback mechanism...",
    "depth": 2
  },
  "prerequisites": ["concept-sensors", "concept-feedback-loops"],
  "nextConcepts": ["concept-tuning", "concept-stability"],
  "keyTerms": ["proportional", "integral", "derivative"],
  "pullQuote": "PID controllers are the backbone of modern control systems",
  "cachedAt": "2025-11-10T10:30:00Z"
}
```

---

### 🆕 5. Dual-Rail Player UI

**Purpose**: Enhanced player with left rail (path), right rail (concepts), bottom tray (reflections)

**Implementation**:
- New component: `client/src/pages/PlayerPage.tsx`
- Replaces existing simple player
- Fetches from `/api/videos/:videoId/intelligence` every 5 seconds

**Component Structure**:
```tsx
function PlayerPage() {
  return (
    <div className="grid grid-cols-[300px_1fr_300px] gap-4">
      {/* Left Rail: Learning Path */}
      <PathProgressRail pathId={pathId} currentVideoId={videoId} />
      
      {/* Center: YouTube Embed */}
      <div className="aspect-video">
        <YouTubeEmbed videoId={videoId} onTimeUpdate={handleTimeUpdate} />
      </div>
      
      {/* Right Rail: Live Concept Context */}
      <ConceptContextRail 
        currentConcept={intelligence?.currentConcept}
        prerequisites={intelligence?.prerequisites}
        nextConcepts={intelligence?.nextConcepts}
      />
      
      {/* Bottom Tray: Reflective Prompts */}
      <ReflectionTray videoId={videoId} conceptId={currentConceptId} />
    </div>
  );
}
```

---

## Migration Strategy

### Phase 1: Create Canonical Videos Table (Critical Foundation)

**Why This Comes First**: The `curatedVideos` table is per-preference (videoId is not unique), so we need a canonical `videos` table before adding transcript/concept tables.

**Migration Steps**:
```sql
-- Step 1: Create canonical videos table
CREATE TABLE videos (
  id VARCHAR PRIMARY KEY,  -- YouTube video ID
  title TEXT NOT NULL,
  channel_name TEXT,
  duration TEXT,
  published_at TIMESTAMP,
  thumbnail_url TEXT,
  view_count TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_videos_channel ON videos(channel_name);
CREATE INDEX idx_videos_published ON videos(published_at);

-- Step 2: Backfill from curatedVideos (deduplicate with proper aggregation)
INSERT INTO videos (id, title, channel_name, duration, thumbnail_url, view_count, created_at)
SELECT 
  video_id as id,
  MAX(title) as title,  -- Pick arbitrary title (they should all be the same)
  MAX(channel_name) as channel_name,
  MAX(duration) as duration,
  MAX(thumbnail_url) as thumbnail_url,
  MAX(view_count) as view_count,
  MIN(created_at) as created_at  -- Pick earliest created_at
FROM curated_videos
GROUP BY video_id
ON CONFLICT (id) DO NOTHING;  -- Skip if already exists

-- Step 3: Add foreign key constraint to curatedVideos (validates integrity)
ALTER TABLE curated_videos
ADD CONSTRAINT fk_curated_videos_video
FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE;
```

**Rollback Plan**: Drop foreign key constraint, drop videos table, revert schema.ts

**Runtime Flow for Canonical Videos** (ensures referential integrity):

All services that reference videos MUST use this pattern:

```typescript
// server/services/videoService.ts

async function ensureVideoExists(videoId: string, youtubeApiKey: string): Promise<void> {
  // Check if video already exists in canonical table
  const existing = await storage.getVideoById(videoId);
  if (existing) return; // Already exists, nothing to do
  
  // Fetch video metadata from YouTube API
  const videoData = await fetchYouTubeVideoMetadata(videoId, youtubeApiKey);
  
  // Insert into canonical videos table (upsert pattern)
  await storage.upsertVideo({
    id: videoId,
    title: videoData.title,
    channelName: videoData.channelName,
    duration: videoData.duration,
    publishedAt: videoData.publishedAt,
    thumbnailUrl: videoData.thumbnailUrl,
    viewCount: videoData.viewCount,
    description: videoData.description,
  });
}

// Usage in curation service
async function curateVideos(interest: string, userId: string) {
  const videos = await fetchYouTubeVideos(interest);
  
  // Ensure all videos exist in canonical table FIRST
  await Promise.all(videos.map(v => ensureVideoExists(v.id.videoId, apiKey)));
  
  // NOW safe to insert into curatedVideos (FK constraint satisfied)
  await storage.saveCuratedVideos(videos.map(v => ({
    videoId: v.id.videoId,  // This will pass FK constraint
    // ... other fields
  })));
}

// Usage in caption service
async function ingestCaptions(videoId: string, userId: string) {
  // Ensure video exists FIRST
  await ensureVideoExists(videoId, apiKey);
  
  // NOW safe to insert transcripts (FK constraint satisfied)
  await storage.saveTranscriptBlocks(videoId, blocks);
}
```

This pattern prevents foreign key violations and keeps canonical table synchronized.

### Phase 2: Add New Tables (No Breaking Changes)
1. Create Drizzle migration for `transcriptBlocks`, `concepts`, `conceptSpans`, etc.
2. All reference canonical `videos` table
3. Run migration (`drizzle-kit push`)
4. Existing curation functionality unaffected

### Phase 3: Build New Services (Progressive Enhancement)
1. Build caption service, concept service independently
2. Test with small video subset
3. No impact on existing curation

### Phase 4: Enhance Curation Engine
1. Add optional transcript intelligence to existing curation route
2. If transcripts available → enhanced ranking
3. If not available → existing ranking (graceful degradation)

### Phase 5: Build New UI
1. Create PlayerPage.tsx (new route `/player/:videoId`)
2. Keep existing results page working
3. Add "Open in Enhanced Player" button

### Phase 6: Seed Learning Paths
1. Manually curate 3 flagship paths (Robotics, Python, Data Science)
2. Validate with real users
3. Scale to 1,000 paths

---

## Integration Checklist

### Existing Components (Reuse)
- ✅ `server/googleAuth.ts` → No changes, reference `users.id`
- ✅ `server/keyManager.ts` → Reuse for all API calls
- ✅ `server/apiKeySelector.ts` → Reuse `selectApiKey()`, `reportKeyStatus()`
- ✅ `server/keyEncryption.ts` → Reuse for any new encrypted fields
- ✅ `shared/schema.ts` (`users`, `userApiKeys`) → Reference as foreign keys

### Enhance Existing Components
- 🔄 `server/routes.ts` → Add transcript intelligence layer to curation
- 🔄 `shared/schema.ts` (`curatedVideos`) → Add optional TQS/concept fields

### Build New Components
- 🆕 `server/services/captionService.ts` → Caption ingestion, TQS
- 🆕 `server/services/conceptService.ts` → Concept extraction
- 🆕 `server/services/pathBuilder.ts` → Learning path generation
- 🆕 `server/routes.ts` (new routes) → Video intelligence API
- 🆕 `client/src/pages/PlayerPage.tsx` → Dual-rail player
- 🆕 `shared/schema.ts` (new tables) → 10+ new tables

---

## Key Integration Principles

1. **Zero Breaking Changes**: All existing functionality continues to work
2. **Progressive Enhancement**: New features layer on top, degrade gracefully
3. **Reuse BYOK**: All new API calls use existing key selection logic
4. **Backward Compatible Schema**: New tables reference existing foreign keys
5. **Feature Flags**: Roll out enhanced features gradually

---

## Updated Task Priorities

### Immediate (Tasks 2-4)
1. **Database schema expansion** - Add new tables without breaking existing ones
2. **Infrastructure setup** - Redis, BullMQ (no impact on existing code)
3. **Caption service** - Build standalone, test independently

### Near-term (Tasks 5-12)
4. **Concept extraction** - Uses existing BYOK for Claude
5. **Knowledge graph** - New tables, no conflicts
6. **Enhanced curation** - Layer on top of existing `curateVideosWithClaudeMultiLevel()`

### Medium-term (Tasks 13-20)
7. **Video intelligence API** - New routes, existing routes unchanged
8. **Dual-rail player UI** - New component, existing player still works
9. **Mastery tracking** - Links to existing `users` table

This integration plan ensures School Alt builds on your solid foundation rather than replacing it.
