# School Alt - Production System Design Document

## Executive Summary

School Alt is a production-grade educational learning platform that transforms YouTube videos into structured learning paths with AI-powered intelligence. Unlike traditional video curation, School Alt provides:

- **Transcript-based intelligence** with quality scoring (TQS 0-100)
- **Concept extraction and knowledge graphs** connecting ideas across videos
- **Explainable curation** showing why each video is ranked #1
- **Live learning context** with prerequisite/next concept overlays during playback
- **Mastery tracking** with spaced repetition scheduling

This document defines the architecture for a scalable, production-ready system supporting 1,000+ learning paths with sub-100ms API latency.

---

## System Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SCHOOL ALT PLATFORM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐   │
│  │   React UI   │   │   Express    │   │   Worker Processes       │   │
│  │              │◄──┤   API        │◄──┤   (BullMQ)               │   │
│  │  - Search    │   │              │   │   - Caption Ingestion    │   │
│  │  - Player    │   │  - Routes    │   │   - Transcript Cleaning  │   │
│  │  - Path Viz  │   │  - Services  │   │   - Concept Extraction   │   │
│  └──────────────┘   └──────────────┘   │   - Path Building        │   │
│                                         └──────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    CORE INTELLIGENCE LAYER                        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                    │  │
│  │  [1] Ingestion &     [2] Concept         [3] Knowledge           │  │
│  │      Caption Service     Intelligence        Graph & Path        │  │
│  │      • YouTube API       Service             Builder             │  │
│  │      • Caption fetch     • Claude extraction • Graph modeling    │  │
│  │      • Whisper (BYOC)    • Entity linking   • Path generation   │  │
│  │      • TQS scoring       • Concept spans    • Versioning         │  │
│  │                                                                    │  │
│  │  [4] Curation Engine [5] Video Intelligence Runtime              │  │
│  │      • Multi-signal      • Current concept                       │  │
│  │        ranking           • Prerequisites                         │  │
│  │      • Explainability    • Next recommendations                  │  │
│  │      • A/B testing       • Redis caching                         │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    DATA & INFRASTRUCTURE                          │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │                                                                    │  │
│  │  PostgreSQL (Neon)          Redis Cache          BullMQ Queues   │  │
│  │  • Videos, Transcripts      • Graph slices       • Job processing│  │
│  │  • Concepts, Paths          • Intelligence       • Retry logic   │  │
│  │  • User mastery             • Rankings           • DLQ           │  │
│  │  • pgvector (embeddings)    • 1hr - 24hr TTL     • Monitoring    │  │
│  │                                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

         External APIs: YouTube Data v3 | Anthropic Claude | (Whisper optional)
```

---

## Service Boundaries & Responsibilities

### 1. Ingestion & Caption Service

**Purpose**: Fetch and score YouTube captions for quality and clarity.

**Responsibilities**:
- YouTube caption API integration (supports 100+ languages)
- Language detection and auto-caption fallback
- Whisper transcription for consented/uploaded videos (BYOC - Bring Your Own Consent)
- Transcript format normalization (WebVTT → structured blocks)
- **Transcript Quality Score (TQS)** calculation (0-100)

**TQS Scoring Algorithm**:
```
TQS = weighted_avg([
  caption_source_score (human=100, auto=70),
  mean_word_confidence (0-100),
  filler_ratio_penalty (uh, um frequency),
  sentence_completeness (proper punctuation),
  glossary_match_rate (technical term accuracy)
])

Routing:
- TQS 80-100: Use as-is for concept extraction
- TQS 60-79: Run repair pass with LLM + glossary
- TQS <60: Exclude from concept extraction, downrank in curation
```

**Quality Guards**:
- Max 15% low-confidence words per minute
- No segments >30s without punctuation
- Forced glossary replacements with audit log

**API Contract**:
```typescript
POST /api/captions/ingest
{
  videoId: string,
  forceRefresh?: boolean
}

Response:
{
  transcriptId: string,
  blocks: TranscriptBlock[],
  tqs: number (0-100),
  language: string,
  source: "human" | "auto" | "whisper"
}
```

---

### 2. Concept Intelligence Service

**Purpose**: Extract learning concepts from high-quality transcripts.

**Responsibilities**:
- Batch concept extraction using Claude AI
- Definition generation and prerequisite identification
- Entity linking to canonical ontology
- Concept span creation (videoId + timestamp range)
- Depth level tagging (foundational → advanced)

**Processing Pipeline**:
```
1. Fetch cleaned transcripts (TQS ≥ 60)
2. Batch by topic (max 10 videos per Claude call)
3. Extract concepts with Claude prompt engineering:
   - "Identify key concepts from this robotics video transcript"
   - "For each concept: name, definition, prerequisites, depth level"
4. Link to existing ontology (fuzzy matching + embeddings)
5. Create concept spans with timestamps
6. Store in concepts + concept_spans tables
```

**Example Extraction**:
```json
{
  "concepts": [
    {
      "label": "PID Control",
      "definition": "Proportional-Integral-Derivative feedback loop for error correction",
      "prerequisites": ["feedback_loops", "control_theory_basics"],
      "depthLevel": "intermediate",
      "spans": [
        {
          "videoId": "abc123",
          "startTime": 315, // 5:15
          "endTime": 480,   // 8:00
          "clarityScore": 92
        }
      ]
    }
  ]
}
```

**API Contract**:
```typescript
POST /api/concepts/extract
{
  videoIds: string[],
  topic: string
}

Response:
{
  conceptsExtracted: number,
  spansCreated: number,
  processingTime: number
}
```

---

### 3. Knowledge Graph Service

**Purpose**: Manage canonical concept ontology and prerequisite relationships.

**Responsibilities**:
- Maintain concept ontology per topic (CRUD operations)
- Prerequisite relationship graph (DAG validation, cycle detection)
- Concept similarity search (embeddings-based)
- Manual curation tools (admin edits, merges, aliases)
- Schema versioning and migration

**Graph Model**:
```
Concept Node:
  - id, label, definition, aliases[]
  - depthLevel (1-5: foundational → cutting-edge)
  - parent_ids[] (broader concepts)
  - prerequisite_ids[] (must learn first)
  - embedding (vector for similarity)

Prerequisite Edge:
  - strength (0-1: optional vs critical)
  - type ("hard_prerequisite", "recommended", "related")
```

**API Contracts**:
```typescript
// Concept CRUD
POST /api/knowledge-graph/concepts
{
  label: string,
  definition: string,
  topicId: string,
  prerequisites?: string[],
  depthLevel: 1-5
}

GET /api/knowledge-graph/concepts/:conceptId/prerequisites
Response: { prerequisites: Concept[], depth: number }

GET /api/knowledge-graph/concepts/:conceptId/next
Response: { nextConcepts: Concept[] }

// Graph traversal
GET /api/knowledge-graph/topics/:topicId/graph
Response: {
  nodes: Concept[],
  edges: { from, to, strength, type }[]
}

// Similarity search
POST /api/knowledge-graph/concepts/search
{ query: string, topicId: string, limit: 10 }
Response: { concepts: Concept[], scores: number[] }
```

**Governance & Versioning**:
- All concept edits create audit log entries
- Schema migrations tracked in `ontology_versions` table
- Admin approval required for ontology merges
- Export/import functionality for backup/restore

---

### 3b. Learning Path Builder Service

**Purpose**: Generate and manage structured learning paths from concept graphs.

**Responsibilities**:
- Path variant generation (beginner/intermediate/advanced)
- Video segment → concept node mapping
- Path validation (prerequisite coherence, no cycles)
- Versioned path releases with feature flags
- Path quality scoring (coverage, clarity, progression)

**Path Generation Algorithm**:
```
Input: topicId, variant (beginner|intermediate|advanced)

1. Load concept graph for topic
2. Topological sort by prerequisites (DAG traversal)
3. Filter concepts by depth level:
   - Beginner: depth 1-2 (foundational)
   - Intermediate: depth 2-4 (applied)
   - Advanced: depth 4-5 (specialized)
4. For each concept node:
   - Query concept_spans for best video segments
   - Rank by: clarity_score DESC, tqs DESC
   - Select top 3 video spans per concept
5. Validate path coherence:
   - All prerequisites satisfied before dependents
   - No orphaned concepts (unreachable)
   - Estimated hours within target range
6. Assign feature flags for gradual rollout
7. Store in learning_paths + path_nodes tables
8. Return pathId + metadata
```

**API Contracts**:
```typescript
// Generate new path
POST /api/paths/generate
{
  topicId: string,
  variant: "beginner" | "intermediate" | "advanced",
  dryRun?: boolean  // Preview without saving
}

Response:
{
  pathId: string,
  topic: string,
  variant: string,
  nodes: PathNode[],
  validation: {
    isCoherent: boolean,
    issues: string[]
  },
  estimatedHours: number,
  version: string
}

// Get existing path
GET /api/paths/:pathId

Response:
{
  pathId: string,
  topic: string,
  variant: string,
  nodes: [
    {
      sequenceOrder: 1,
      conceptId: string,
      label: "Sensors in Robotics",
      definition: "...",
      bestSpans: [
        { 
          videoId, title, channelName,
          startTime, endTime, 
          clarityScore, tqs 
        }
      ],
      prerequisites: [{ conceptId, label }],
      nextConcepts: [{ conceptId, label }]
    }
  ],
  estimatedHours: 12,
  version: "v1.2",
  isActive: true,
  featureFlags: { "rollout_percentage": 50 }
}

// List all paths for topic
GET /api/paths/topics/:topicId

Response:
{
  paths: [
    { pathId, variant, estimatedHours, version, isActive }
  ]
}

// Update path (admin only)
PATCH /api/paths/:pathId
{
  isActive?: boolean,
  featureFlags?: object,
  version?: string
}

// Delete path (admin only, soft delete)
DELETE /api/paths/:pathId
```

**Path Quality Metrics**:
```
quality_score = weighted_avg([
  concept_coverage (all key concepts present),
  video_clarity (avg TQS + clarity scores),
  progression_smoothness (prerequisite gaps < 2),
  estimated_hours_accuracy (user feedback)
])
```

---

### 4. Curation Engine (Enhanced Ranking)

**Purpose**: Rank videos with explainable multi-signal scoring.

**Responsibilities**:
- Weighted fusion of ranking signals
- Explainability generation ("Why #1")
- A/B testing framework for signal weights

**Ranking Signals** (with weights):
```
final_rank = weighted_sum([
  topic_match (0.25)         // tf-idf + embeddings
  concept_coverage (0.20)    // fills path gaps
  tqs_score (0.15)           // transcript quality
  pedagogy_score (0.15)      // structure, analogies, clarity
  community_signals (0.15)   // "this finally clicked" comments
  freshness (0.10)           // content recency
])
```

**Explainability Example**:
```json
{
  "rank": 1,
  "videoId": "xyz789",
  "score": 94.2,
  "rationale": "Highest clarity on Sensors (TQS 96); precise examples at 05:12; perfect prerequisite fit for Control Theory next",
  "signalBreakdown": {
    "topic_match": 0.92,
    "concept_coverage": 0.88,
    "tqs_score": 0.96,
    "pedagogy_score": 0.91,
    "community_signals": 0.84,
    "freshness": 0.95
  }
}
```

**API Contract**:
```typescript
POST /api/curate
{
  topic: string,
  pathId?: string,
  userMasteryState?: object
}

Response:
{
  videos: [
    {
      videoId, title, rank, score,
      rationale: string,
      signalBreakdown: object
    }
  ]
}
```

---

### 5. Video Intelligence Runtime Service

**Purpose**: Power real-time overlays in the player UI.

**Responsibilities**:
- Current concept at timestamp lookup
- Prerequisite/next concept recommendations
- Key terms and definitions retrieval
- Pull-quotes and frame tags
- Sub-100ms latency via Redis caching

**Caching Strategy**:
```
Cache Key Pattern: video_intelligence:{videoId}:{timestamp_bucket}
TTL: 24 hours
Bucket Size: 30-second intervals

Precompute for popular paths:
- Top 100 videos per topic
- All timestamps in 30s buckets
- Warm cache on path publish
```

**API Contract**:
```typescript
GET /api/video-intelligence/:videoId?t=315

Response:
{
  currentConcept: {
    id, label, definition,
    span: { startTime, endTime }
  },
  prerequisites: [
    { id, label, isMastered: boolean }
  ],
  nextConcepts: [
    { id, label, bestVideoSpan }
  ],
  keyTerms: ["actuator", "servo motor"],
  latency_ms: 42
}
```

---

## Data Model (PostgreSQL)

### Core Tables

```sql
-- Transcript storage
CREATE TABLE transcript_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL,
  language VARCHAR(10),
  start_time FLOAT NOT NULL,   -- seconds
  end_time FLOAT NOT NULL,
  text TEXT NOT NULL,
  confidence FLOAT,             -- 0-1 word confidence
  tqs_score INT,                -- 0-100 transcript quality
  source VARCHAR(20),           -- 'human', 'auto', 'whisper'
  cleaned_text TEXT,            -- post-processing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_video_time (video_id, start_time)
);

-- Concepts (ontology)
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  definition TEXT,
  aliases TEXT[],               -- alternative names
  depth_level INT,              -- 1-5: foundational → advanced
  topic_id UUID,                -- e.g., "robotics"
  embedding VECTOR(1536),       -- pgvector for similarity search
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_topic (topic_id),
  INDEX idx_embedding vector_cosine_ops (embedding)
);

-- Concept prerequisites (DAG)
CREATE TABLE concept_prerequisites (
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  prerequisite_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  strength FLOAT DEFAULT 1.0,   -- how critical (0-1)
  PRIMARY KEY (concept_id, prerequisite_id)
);

-- Concept spans (video segments)
CREATE TABLE concept_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES concepts(id),
  video_id TEXT NOT NULL,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  clarity_score INT,            -- 0-100 how well explained
  depth_level INT,              -- beginner/intermediate/advanced
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_concept (concept_id),
  INDEX idx_video (video_id)
);

-- Learning paths
CREATE TABLE learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL,
  variant VARCHAR(20),          -- 'beginner', 'intermediate', 'advanced'
  estimated_hours INT,
  version VARCHAR(20),          -- for A/B testing
  is_active BOOLEAN DEFAULT true,
  feature_flags JSONB,          -- gradual rollout control
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_topic_variant (topic_id, variant)
);

-- Path nodes (ordered sequence)
CREATE TABLE path_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  concept_id UUID NOT NULL REFERENCES concepts(id),
  sequence_order INT NOT NULL,
  best_span_id UUID REFERENCES concept_spans(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_path_order (path_id, sequence_order)
);

-- User mastery tracking
CREATE TABLE user_concept_mastery (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id UUID NOT NULL REFERENCES concepts(id),
  mastery_level VARCHAR(20),    -- 'unknown', 'familiar', 'stable', 'fluent'
  last_evidence_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,   -- spaced repetition
  evidence_count INT DEFAULT 0,
  PRIMARY KEY (user_id, concept_id),
  
  INDEX idx_next_review (user_id, next_review_at)
);

-- Processing jobs (audit trail)
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50),         -- 'caption_ingest', 'concept_extract', etc.
  video_id TEXT,
  status VARCHAR(20),           -- 'pending', 'processing', 'completed', 'failed'
  error_message TEXT,
  metadata JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_status (status, created_at)
);
```

### Indexes & Performance

**Critical Indexes**:
- `transcript_blocks`: B-tree on (video_id, start_time) for fast timestamp lookups
- `concepts`: GiST index on embeddings for similarity search
- `concept_spans`: Composite index on (concept_id, clarity_score DESC)
- `path_nodes`: Composite index on (path_id, sequence_order)
- `user_concept_mastery`: Composite index on (user_id, next_review_at) for scheduler

**Partitioning Strategy** (future scale):
- Partition `transcript_blocks` by video upload year
- Partition `processing_jobs` by created_at month (auto-archive old jobs)

---

## Technology Stack

### Core Technologies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Frontend** | React + TypeScript + Vite | Fast dev, type safety, modern tooling |
| **UI Library** | Shadcn/ui + Tailwind | Accessible, customizable, mobile-first |
| **Backend** | Node.js + Express | Existing stack, fast iteration |
| **Database** | PostgreSQL (Neon) | Relational integrity, pgvector for embeddings |
| **ORM** | Drizzle | Type-safe, migration support |
| **Caching** | Redis | Sub-100ms lookups, TTL management |
| **Job Queue** | BullMQ | Robust worker processing, retry logic, DLQ |
| **AI** | Anthropic Claude | Concept extraction, curation reasoning |
| **Video API** | YouTube Data v3 | Official caption access, metadata |
| **Embeddings** | OpenAI text-embedding-3-small | Concept similarity, search |

### Infrastructure Additions

**New Dependencies to Install**:
```json
{
  "bullmq": "^5.0.0",
  "ioredis": "^5.3.0",
  "pgvector": "^0.1.8",
  "@openai/api": "^4.0.0",
  "natural": "^6.0.0",        // NLP for cleaning
  "compromise": "^14.0.0",    // Sentence segmentation
  "toxicity": "^1.2.0"        // Content filtering
}
```

**Environment Variables**:
```bash
# Existing
DATABASE_URL=...
ANTHROPIC_API_KEY=...
YOUTUBE_API_KEY=...

# New
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=...  # For embeddings
WORKER_CONCURRENCY=5
ENABLE_WHISPER=false  # Feature flag
```

---

## Deployment Topology

### Development Environment
```
Single Replit instance:
- Express server (port 5000)
- Worker process (same container)
- Redis (local or external)
- Neon PostgreSQL (serverless)
```

### Production Scaling (future)
```
Load Balancer
  ├── API Servers (3x)      // Express + routing only
  ├── Worker Pool (5x)      // BullMQ consumers
  ├── Redis Cluster (2x)    // Cache + queue persistence
  └── Neon PostgreSQL       // Auto-scaling database
```

---

## Processing Strategy

### Offline Batch Processing

**Initial Seeding** (1,000 paths):
1. Manual topic selection (Robotics, Python, Data Science)
2. YouTube API search → 50-100 seed videos per topic
3. Queue caption ingestion jobs (BullMQ)
4. Workers fetch captions + calculate TQS
5. High-TQS videos → concept extraction queue
6. Concept extraction → knowledge graph updates
7. Path builder generates variants → stores in learning_paths
8. Cache warming for video intelligence

**Estimated Processing**:
- 1,000 videos × 15 min avg = 15,000 min content
- Caption fetch: ~2s/video = 33 min
- Transcript cleaning: ~5s/video = 83 min
- Concept extraction: ~30s/video (Claude) = 8.3 hrs
- Path building: ~10 min/topic = 30 min
- **Total: ~9 hours for initial seeding**

### Real-Time Processing

**New Video Flow**:
1. User searches topic → YouTube API
2. Check if video processed (cache hit)
3. If not: queue caption job (async)
4. Return existing curated results immediately
5. Worker processes in background
6. Next search includes new video if TQS ≥ 60

### Rate Limiting & Quotas

**YouTube API** (10,000 units/day default):
- Search: 100 units each (limit 100 searches/day)
- Video details: 1 unit each (plenty for 10K videos)
- Captions: 50 units each (200 caption fetches/day)
- **Strategy**: Cache aggressively, deduplicate requests

**Claude API** (pay-per-token):
- Concept extraction: ~1,500 tokens/video
- Curation: ~2,000 tokens/batch
- Cost: ~$0.02/video (Sonnet pricing)
- **Strategy**: Batch processing, use cache for re-ranking

**Rate Limit Middleware**:
```typescript
// Per-user limits
- 10 searches/hour
- 50 video intelligence lookups/hour
- 5 path generations/day

// Global limits
- 1,000 concept extractions/day (budget cap)
- Graceful degradation (return cached results)
```

---

## Caching Strategy

### Cache Layers

```
L1 - In-Memory Cache (Express)
  - Path metadata (1 hour TTL)
  - User sessions

L2 - Redis Cache (Distributed)
  - Video intelligence by timestamp (24hr TTL)
  - Concept graph slices (12hr TTL)
  - Curation rankings (6hr TTL)
  - User mastery state (1hr TTL)

L3 - PostgreSQL (Source of Truth)
  - All persistent data
  - Query result caching (Neon auto-manages)
```

### Cache Warming

**On Path Publish**:
1. Pre-generate video intelligence for all path videos
2. Cache concept graph slices for path traversal
3. Pre-compute curation rankings for common searches

**Invalidation Rules**:
- New concept span → invalidate video intelligence cache
- Path updated → invalidate graph slices
- User watches segment → invalidate mastery cache

---

## Frontend System Architecture

### User Interface Components

The frontend must support three critical views specified in the requirements:

#### 1. Search & Path Discovery Page

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  [Search: "Robotics"]  [Go]                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────── Recommended Learning Path ──────────────┐ │
│  │  🎯 Robotics: Beginner Path                           │ │
│  │  📊 25 concepts • 12 hours • 48 videos                 │ │
│  │  [Start Learning →]                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  Alternative Paths:                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Robotics: Hands-on Projects                          │ │
│  │  20 concepts • 10 hours                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Robotics: Theory-first Approach                      │ │
│  │  30 concepts • 15 hours                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  Top Ranked Videos:                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  #1 [Video Thumbnail]  "Introduction to Sensors"      │ │
│  │  🏆 Why #1: Highest clarity on Sensors (TQS 96);      │ │
│  │            precise examples at 05:12; perfect          │ │
│  │            prerequisite fit for Control Theory         │ │
│  │  [Watch →]                                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  #2 [Video Thumbnail]  "Motor Control Basics"         │ │
│  │  🏆 Why #2: Comprehensive coverage; strong pedagogy   │ │
│  │  [Watch →]                                              │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Features**:
- Path preview cards with concept count, estimated hours
- "Why #1" badges with expandable explanation tooltips
- Alternative path recommendations (beginner/intermediate/advanced)
- Visual indicators for path difficulty and focus area

**API Integration**:
```typescript
GET /api/search?topic=robotics

Response:
{
  recommendedPath: {
    pathId, variant, conceptCount, estimatedHours,
    videoCount, description
  },
  alternativePaths: [...],
  topVideos: [
    {
      rank: 1,
      videoId, title, thumbnailUrl,
      rationale: "Why #1 explanation",
      signalBreakdown: { ... }
    }
  ]
}
```

---

#### 2. Player Page (Dual-Rail Layout)

**Layout** (from requirements):
```
┌───────────────────────────────────────────────────────────────────┐
│  [← Back to Search]               Robotics: Beginner Path        │
├──────────┬────────────────────────────────────┬───────────────────┤
│          │                                     │                   │
│  LEFT    │       YOUTUBE EMBED                │    RIGHT RAIL     │
│  RAIL    │       (centered, 16:9)             │                   │
│          │                                     │  📚 Now Learning  │
│  Path:   │   [YouTube Official Player]        │  Sensors in       │
│          │                                     │  Robotics         │
│  ✓ Intro │                                     │                   │
│  ● YOU   │                                     │  Definition:      │
│    ARE   │                                     │  Devices that...  │
│    HERE  │                                     │                   │
│  ○ Servo │                                     │  Key Terms:       │
│  ○ PID   │                                     │  • Transducer     │
│          │                                     │  • Analog signal  │
│  ...     │                                     │                   │
│          │                                     │  Prerequisites:   │
│  [Heat   │                                     │  ✓ Basic Elec.    │
│   map]   │                                     │                   │
│          │                                     │  Next:            │
│          │                                     │  → Sensor Fusion  │
│          │                                     │  → Motor Control  │
│          │                                     │                   │
├──────────┴────────────────────────────────────┴───────────────────┤
│  [Optional Bottom Tray - Reflective Prompts]                     │
│  💡 Quick Recap: Summarize what you learned in 2 lines           │
│  [Skip] [Submit →]                                                 │
└───────────────────────────────────────────────────────────────────┘
```

**Left Rail - Learning Path Visualization**:
- Collapsible concept nodes (click to expand/collapse)
- Progress indicators (✓ watched, ● current, ○ upcoming)
- "You are here" marker
- Progress heatmap (visual bar showing % complete)
- Estimated time remaining

**Right Rail - Live Concept Context** (from Video Intelligence API):
- Current concept name + definition
- Key terminology glossary
- Prerequisites (with mastery indicators: ✓ mastered, ⚠ review needed)
- Next recommended concepts with best video links
- Updates every 30 seconds based on video timestamp

**Bottom Tray - Reflective Prompts** (optional, collapsible):
- One-click recap input
- Concept checkpoint questions at milestones
- "Transfer task" suggestions (apply concept to new scenario)
- Integration with mastery tracking

**API Integration**:
```typescript
// Initial page load
GET /api/paths/:pathId
GET /api/video-intelligence/:videoId?t=0

// As video plays (polling every 30s or on seek)
GET /api/video-intelligence/:videoId?t=315

Response:
{
  currentConcept: {
    id, label, definition,
    span: { startTime, endTime }
  },
  keyTerms: ["transducer", "analog signal"],
  prerequisites: [
    { id, label, isMastered: true, masteryLevel: "fluent" }
  ],
  nextConcepts: [
    { 
      id, label,
      bestVideoSpan: { videoId, startTime, title }
    }
  ]
}

// Submit reflection
POST /api/mastery/reflections
{
  userId, conceptId, videoId, timestamp,
  reflectionText: "...",
  checkpoint: { question, answer }
}
```

**Real-time Updates**:
- Video Intelligence updates via polling (every 30s)
- Mastery state updates on reflection submit
- Path progress updates on video completion

---

#### 3. Path Explorer View (Full Visualization)

**Layout**:
```
┌──────────────────────────────────────────────────────────────────┐
│  Robotics Learning Path (Beginner)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Concept Graph:                                                   │
│                                                                   │
│      [Intro to Robotics] ────► [Sensors] ────► [Sensor Fusion]  │
│            │                       │                              │
│            ▼                       ▼                              │
│      [Basic Electronics]     [Motor Control] ───► [PID Control]  │
│            │                       │                              │
│            ▼                       ▼                              │
│      [Programming]           [Path Planning]                      │
│                                                                   │
│  Legend: ✓ Mastered  ● In Progress  ○ Not Started              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Selected: Sensors in Robotics                             │ │
│  │  Definition: Devices that detect physical properties...     │ │
│  │  Depth Level: Foundational (1/5)                            │ │
│  │                                                              │ │
│  │  Best Video Segments:                                        │ │
│  │  1. "Sensor Types Explained" (05:12-08:30) - TQS: 96       │ │
│  │  2. "Understanding Transducers" (02:45-06:10) - TQS: 89    │ │
│  │  3. "Sensor Calibration" (10:00-14:30) - TQS: 85           │ │
│  │                                                              │ │
│  │  [Watch Segment →] [Mark as Reviewed]                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [Export Path] [Share Link] [Reset Progress]                     │
└──────────────────────────────────────────────────────────────────┘
```

**Features**:
- Interactive concept graph (D3.js or similar)
- Click nodes to view details + best video segments
- Visual depth/breadth indicators (color coding)
- Progress overlay (user mastery state)
- Jump to specific concepts in player
- Export path as PDF/JSON
- Share path with unique link

**API Integration**:
```typescript
GET /api/paths/:pathId/explorer

Response:
{
  graph: {
    nodes: [
      { 
        conceptId, label, depthLevel,
        position: { x, y },
        userMastery: "stable"
      }
    ],
    edges: [
      { from, to, type: "prerequisite", strength: 0.9 }
    ]
  },
  conceptDetails: {
    [conceptId]: {
      definition, keyTerms,
      bestSpans: [...]
    }
  }
}
```

---

## Observability & Monitoring

### Comprehensive Observability Strategy

School Alt requires production-grade observability covering metrics, logs, traces, and cost monitoring.

### Structured Logging

**Implementation**:
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'school-alt',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 10
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Service-specific loggers
const captionLogger = logger.child({ service: 'caption-service' });
const conceptLogger = logger.child({ service: 'concept-service' });
const curationLogger = logger.child({ service: 'curation-engine' });
```

**Log Structure** (standardized fields):
```json
{
  "timestamp": "2025-01-15T10:30:00.123Z",
  "level": "info",
  "service": "caption-service",
  "operation": "caption_ingest",
  "videoId": "abc123",
  "userId": "user-456",
  "tqs": 87,
  "latency_ms": 1234,
  "success": true,
  "metadata": {
    "language": "en",
    "source": "auto",
    "blockCount": 142
  },
  "message": "Caption ingestion completed successfully"
}
```

**Log Levels by Service**:
- `error`: API failures, job crashes, quota exceeded
- `warn`: Low TQS (<60), slow queries (>500ms), cache misses
- `info`: Job completions, API requests, cache warming
- `debug`: Detailed processing steps, intermediate results
- `trace`: Full request/response payloads (dev only)

---

### Metrics Collection

**Prometheus-Compatible Metrics**:

```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

const register = new Registry();

// API Performance Metrics
const apiLatency = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'API endpoint latency',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const apiRequests = new Counter({
  name: 'api_requests_total',
  help: 'Total API requests',
  labelNames: ['method', 'route', 'status_code']
});

// Cache Metrics
const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Cache hits',
  labelNames: ['layer', 'key_prefix']
});

const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Cache misses',
  labelNames: ['layer', 'key_prefix']
});

// Worker Job Metrics
const jobsProcessed = new Counter({
  name: 'jobs_processed_total',
  help: 'Jobs processed by type',
  labelNames: ['job_type', 'status']
});

const jobDuration = new Histogram({
  name: 'job_duration_seconds',
  help: 'Job processing time',
  labelNames: ['job_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

// Business Metrics
const videosProcessed = new Counter({
  name: 'videos_processed_total',
  help: 'Videos processed successfully',
  labelNames: ['tqs_tier']  // <60, 60-79, 80-100
});

const conceptsExtracted = new Counter({
  name: 'concepts_extracted_total',
  help: 'Concepts extracted',
  labelNames: ['topic']
});

const userMasteryProgression = new Counter({
  name: 'user_mastery_progression_total',
  help: 'User mastery level changes',
  labelNames: ['from_level', 'to_level']
});

// Resource Metrics
const redisConnections = new Gauge({
  name: 'redis_connections_active',
  help: 'Active Redis connections'
});

const dbPoolSize = new Gauge({
  name: 'db_pool_size',
  help: 'Database connection pool size'
});

// Cost Metrics
const apiCosts = new Counter({
  name: 'api_costs_usd_total',
  help: 'Cumulative API costs',
  labelNames: ['provider']  // 'youtube', 'claude', 'openai'
});

register.registerMetric(apiLatency);
register.registerMetric(apiRequests);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(jobsProcessed);
register.registerMetric(jobDuration);
register.registerMetric(videosProcessed);
register.registerMetric(conceptsExtracted);
register.registerMetric(userMasteryProgression);
register.registerMetric(redisConnections);
register.registerMetric(dbPoolSize);
register.registerMetric(apiCosts);

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Key Metrics Dashboard**:
```
Performance:
- API latency (p50, p95, p99) by endpoint
- Cache hit rate by layer (L1, L2, L3)
- Worker job processing time by type
- Video intelligence response time (<100ms target)

Business:
- Videos processed/day by TQS tier
- Concepts extracted/day by topic
- Active learning paths (accessed last 7 days)
- User mastery progression rate
- Path completion rate (%)

Reliability:
- Error rate by service (%)
- Failed job count by type
- API quota utilization (%)
- Circuit breaker status

Cost:
- Daily API spend by provider
- Cost per video processed
- Budget burn rate vs. target
```

---

### Distributed Tracing

**OpenTelemetry Integration**:

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({
  endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

// Trace complex flows
const tracer = trace.getTracer('school-alt');

async function processVideo(videoId: string) {
  const span = tracer.startSpan('process_video');
  span.setAttribute('video.id', videoId);
  
  try {
    // Child span for caption fetch
    const captionSpan = tracer.startSpan('fetch_captions', {
      parent: span
    });
    const transcript = await fetchCaptions(videoId);
    captionSpan.setAttribute('transcript.tqs', transcript.tqs);
    captionSpan.end();
    
    // Child span for concept extraction
    const conceptSpan = tracer.startSpan('extract_concepts', {
      parent: span
    });
    const concepts = await extractConcepts(transcript);
    conceptSpan.setAttribute('concepts.count', concepts.length);
    conceptSpan.end();
    
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ 
      code: SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    span.end();
  }
}
```

**Trace Key Flows**:
- Caption ingestion → cleaning → TQS scoring → storage
- Concept extraction → entity linking → graph update
- Search query → curation → ranking → explainability
- Player page load → path fetch → video intelligence → UI render

---

### Alerting & Incident Response

**Alert Definitions** (PagerDuty, Slack, email):

```yaml
alerts:
  - name: YouTube API Quota Critical
    condition: youtube_quota_utilization > 0.9
    severity: critical
    notification: slack, email
    action: Throttle new video ingestion, use cache
    
  - name: Claude API Cost Budget Exceeded
    condition: daily_claude_cost_usd > 100
    severity: high
    notification: slack
    action: Pause concept extraction jobs until manual review
    
  - name: TQS Failure Rate High
    condition: tqs_below_60_rate > 0.3
    severity: medium
    notification: slack
    action: Review transcript cleaning pipeline, check glossaries
    
  - name: Video Intelligence Latency Degraded
    condition: video_intelligence_p95_latency_ms > 200
    severity: high
    notification: slack
    action: Check Redis cache health, review query performance
    
  - name: Worker Queue Backlog
    condition: bullmq_jobs_waiting > 1000
    severity: medium
    notification: slack
    action: Scale worker concurrency, check for stuck jobs
    
  - name: Database Connection Pool Exhausted
    condition: db_pool_size / db_pool_max > 0.9
    severity: critical
    notification: slack, pagerduty
    action: Scale database connections, review slow queries
    
  - name: Error Rate Spike
    condition: error_rate_5min > 0.05
    severity: high
    notification: slack
    action: Check recent deployments, review error logs
    
  - name: Cache Miss Rate High
    condition: cache_miss_rate_1hour > 0.3
    severity: low
    notification: slack
    action: Review cache warming strategy, check TTL configs
```

**Incident Response Runbook**:
1. **Alert received** → Auto-create incident ticket
2. **Triage** (5 min) → Assess severity, assign owner
3. **Investigate** → Check logs, metrics, traces
4. **Mitigate** → Apply runbook action (throttle, scale, rollback)
5. **Resolve** → Validate metrics return to normal
6. **Post-mortem** → Document root cause, preventive actions

---

### Cost Management & Budget Controls

**Cost Tracking System**:

```typescript
// server/services/costTracker.ts

class CostTracker {
  private dailyBudget = {
    youtube: 0,      // Free tier (10K units/day)
    claude: 100,     // $100/day limit
    openai: 10,      // $10/day limit
    total: 110
  };
  
  private currentSpend = {
    youtube: 0,
    claude: 0,
    openai: 0
  };
  
  async trackUsage(provider: string, usage: number, cost: number) {
    // Increment cost counter
    this.currentSpend[provider] += cost;
    
    // Log to metrics
    apiCosts.inc({ provider }, cost);
    
    // Store in database for historical tracking
    await db.insert(apiUsageLogs).values({
      provider,
      usage,
      cost,
      timestamp: new Date()
    });
    
    // Check budget threshold
    if (this.currentSpend[provider] > this.dailyBudget[provider] * 0.9) {
      logger.warn('Budget threshold approaching', {
        provider,
        current: this.currentSpend[provider],
        budget: this.dailyBudget[provider],
        utilization: this.currentSpend[provider] / this.dailyBudget[provider]
      });
      
      // Trigger alert
      this.sendBudgetAlert(provider);
    }
    
    // Hard stop if budget exceeded
    if (this.currentSpend[provider] > this.dailyBudget[provider]) {
      throw new BudgetExceededError(`${provider} daily budget exceeded`);
    }
  }
  
  resetDaily() {
    // Reset counters at midnight UTC
    this.currentSpend = { youtube: 0, claude: 0, openai: 0 };
  }
}

// Usage in services
async function extractConcepts(videoId: string) {
  const startTokens = estimateTokens(transcript);
  const cost = calculateClaudeCost(startTokens);
  
  // Check budget before call
  await costTracker.trackUsage('claude', startTokens, cost);
  
  // Proceed with API call
  const response = await claude.messages.create(...);
  
  return response;
}
```

**Circuit Breaker Implementation**:

```typescript
// server/middleware/circuitBreaker.ts

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private failureThreshold = 5;
  private timeout = 60000; // 1 minute
  private lastFailureTime = 0;
  
  async execute(fn: () => Promise<any>, fallback?: () => Promise<any>) {
    if (this.state === 'open') {
      // Check if timeout elapsed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        logger.warn('Circuit breaker open, using fallback');
        if (fallback) return await fallback();
        throw new Error('Circuit breaker open, no fallback available');
      }
    }
    
    try {
      const result = await fn();
      
      // Reset on success in half-open state
      if (this.state === 'half-open') {
        this.reset();
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      
      if (fallback) return await fallback();
      throw error;
    }
  }
  
  private recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.error('Circuit breaker opened', {
        failureCount: this.failureCount,
        threshold: this.failureThreshold
      });
    }
  }
  
  private reset() {
    this.state = 'closed';
    this.failureCount = 0;
    logger.info('Circuit breaker reset');
  }
}

// Usage
const youtubeCircuitBreaker = new CircuitBreaker();

async function fetchYouTubeData(videoId: string) {
  return await youtubeCircuitBreaker.execute(
    () => youtubeAPI.videos.list({ id: videoId }),
    () => getCachedVideoData(videoId) // Fallback to cache
  );
}
```

**Back-Pressure Handling**:

```typescript
// server/workers/queueManager.ts

const queue = new Queue('video-processing', {
  connection: redis,
  limiter: {
    max: 10,          // Max 10 jobs per interval
    duration: 1000,   // 1 second interval
  },
  settings: {
    backoffStrategies: {
      exponential: (attemptsMade) => {
        return Math.min(Math.pow(2, attemptsMade) * 1000, 60000);
      }
    }
  }
});

// Pause queue if budget exceeded
async function checkBudgetAndPause() {
  const budgetStatus = await costTracker.getBudgetStatus();
  
  if (budgetStatus.claude.exceeded) {
    await queue.pause();
    logger.warn('Queue paused due to budget limits');
    
    // Resume next day
    schedule.scheduleJob('0 0 * * *', async () => {
      await queue.resume();
      logger.info('Queue resumed after budget reset');
    });
  }
}
```

---

### Health Checks & Status Pages

**Health Check Endpoints**:

```typescript
// server/routes/health.ts

app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      youtube_api: await checkYouTubeAPI(),
      claude_api: await checkClaudeAPI(),
      workers: await checkWorkers()
    }
  };
  
  const allHealthy = Object.values(health.checks).every(c => c.status === 'ok');
  const statusCode = allHealthy ? 200 : 503;
  
  res.status(statusCode).json(health);
});

async function checkDatabase() {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latency_ms: 0 };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

async function checkRedis() {
  try {
    const start = Date.now();
    await redis.ping();
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}
```

**Public Status Page** (status.schoolalt.com):
- Current system status (operational, degraded, outage)
- Recent incidents and resolutions
- Planned maintenance windows
- API quota utilization (anonymized)
- Performance metrics (latency, uptime)

---

## Compliance & Safety

### YouTube Terms of Service

**Non-Negotiables** (from requirements):
1. **Playback**: Always via official YouTube embed
2. **Captions**: Official YouTube API preferred; Whisper only for:
   - Creator-consented videos (BYOC)
   - User-uploaded content with processing rights
3. **Attribution**: Prominent channel/video credit + link
4. **Monetization**: Never remove ads or monetization

**Implementation**:
- Embed YouTube player (iframe API)
- Display channel name + thumbnail prominently
- Link to original video page
- No direct video downloads
- Caption API with proper attribution in UI

### Data Safety

- **Toxicity Filtering**: Run all transcripts through toxicity classifier
- **NSFW Detection**: Flag videos with mature content
- **User Data**: Encrypt API keys, GDPR-compliant mastery data
- **Audit Logs**: Track all caption fetches, concept modifications

---

## Cost Estimates

### Monthly Operational Costs (1,000 active paths)

| Service | Usage | Cost |
|---------|-------|------|
| **Neon PostgreSQL** | 10GB storage, 1M rows | $19/month |
| **Redis** (Upstash) | 1GB cache, 10M commands | $10/month |
| **YouTube API** | 10K units/day (free tier) | $0 |
| **Claude API** | 1,000 videos/month × $0.02 | $20/month |
| **OpenAI Embeddings** | 50K concepts × $0.0001 | $5/month |
| **Replit Hosting** | Always-on deployment | $20/month |
| **Total** | | **~$74/month** |

**Scale Estimates** (10,000 paths):
- PostgreSQL: ~$50/month
- Redis: ~$30/month
- Claude: ~$200/month (batch processing)
- **Total: ~$310/month**

---

## Testing Strategy

### Unit Tests
- Transcript cleaning functions
- TQS calculation accuracy
- Concept extraction parsing
- Path graph validation (DAG checks)

### Integration Tests
- Caption ingestion end-to-end
- Concept extraction with mock Claude
- Video intelligence API contracts
- Cache invalidation flows

### Performance Tests
- Load test video intelligence (1000 req/s)
- Benchmark concept graph queries
- Cache hit rate optimization
- Worker throughput (jobs/min)

### Backtesting
- Ranking algorithm validation
- Compare human-curated vs AI-ranked paths
- TQS correlation with video quality ratings

---

## Migration Plan

### Phase 1: Foundation (Week 1-2)
- Expand database schema (migrations)
- Install infrastructure (Redis, BullMQ)
- Setup worker architecture
- Basic logging and monitoring

### Phase 2: Intelligence Services (Week 3-4)
- Caption ingestion service
- Transcript cleaning pipeline
- Concept extraction (single topic proof)
- Knowledge graph basic CRUD

### Phase 3: Path Building (Week 5-6)
- Path builder service
- Seed 3 flagship paths manually
- Video intelligence runtime
- Cache layer implementation

### Phase 4: Enhanced Curation (Week 7-8)
- Multi-signal ranking
- Explainability generation
- UI updates (player rails, path viz)
- Mastery tracking basics

### Phase 5: Production Hardening (Week 9-10)
- Rate limiting & quota management
- Admin dashboard
- Comprehensive testing
- Performance optimization

### Phase 6: Scale & Launch (Week 11-12)
- Scale to 100 paths
- User testing & feedback
- Documentation finalization
- Production deployment

---

## Success Metrics

**Technical**:
- TQS >80 for 70% of processed videos
- Video intelligence latency <100ms (p95)
- Cache hit rate >85%
- Worker job success rate >98%

**User Experience**:
- Path completion rate >40%
- Concept mastery progression (familiar → stable) within 3 sessions
- User-reported "aha moments" correlation with concept clarity scores
- Search-to-play time <5 seconds

**Business**:
- 1,000 learning paths seeded
- 100K+ concept spans mapped
- Support 1,000 concurrent learners
- <$500/month operational cost

---

## Next Steps

1. **Review and approve this design document**
2. **Expand database schema** (Task 2)
3. **Set up infrastructure** (Task 3)
4. **Build caption service MVP** (Task 4)
5. **Iterate based on feedback**

This design provides a clear roadmap to transform the current MVP into a production-grade learning platform. Each service is designed to be independently testable, scalable, and maintainable for long-term success.
