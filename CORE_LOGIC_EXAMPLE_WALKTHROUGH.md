
# Core Logic of the App: Detailed Example Walkthrough

This document explains the core logic of the video curation app by walking through a complete example: **"Learning Instagram Hashtags"**

## Example Flow: Learning Instagram Hashtags

### Stage 1: User Input (Home Page)

User fills out the form:
- **Interest**: "Instagram Hashtags"
- **Learning Goal**: "Build solid understanding" (comprehensive learning)
- **Notification Time**: "8:00 PM" (optional)

When submitted, this data is sent to `/api/curate-videos`

### Stage 2: Multi-Level Search Strategy Generation

The system calls Claude AI to generate **12 search strategies** (4 per difficulty level):

**Beginner strategies generated:**
```
"Instagram hashtags for beginners tutorial"
"how to use hashtags on Instagram step by step"
"Instagram hashtag basics explained simple"
"beginner guide Instagram hashtags 2024"
```

**Intermediate strategies generated:**
```
"Instagram hashtag strategy 2024 intermediate tips engagement boost"
"how to research hashtags Instagram analytics tools growth"
"Instagram hashtag mix popular niche branded strategy guide"
"hashtag performance tracking Instagram insights optimization techniques"
```

**Advanced strategies generated:**
```
"Instagram hashtag analytics strategy ROI optimization"
"advanced hashtag research tools influencer marketing"
"Instagram algorithm hashtag performance metrics 2024"
"branded hashtag campaign case studies social media marketing"
```

### Stage 3: Parallel YouTube API Searches

The system executes **all 12 searches simultaneously**:

```typescript
// Executes 12 parallel searches to YouTube API
const allSearchPromises = strategies.map(query => 
  searchYouTube(query, maxResults: ~13 videos each)
);
```

**Results from actual run:**
- Total videos found: **156 videos**
- After deduplication by videoId: **128 unique videos**

### Stage 4: Video Enhancement & Batch Processing

Each video gets enhanced with metadata:

```javascript
{
  videoId: "abc123",
  title: "Instagram Hashtag Strategy 2024",
  duration: "15:30",
  channelName: "Social Media Pro",
  viewCount: "245K",
  uploadDate: "2 weeks ago",
  daysSinceUpload: 14,
  recencyScore: "very recent (last 3 months)", // AI uses this
  durationMinutes: 15
}
```

The 128 videos are split into **batches of 25** to prevent Claude API token limits.

### Stage 5: AI Curation (The Brain)

For each batch, Claude receives this prompt:

```
"Analyze these 25 YouTube videos for someone who wants to learn 
'Instagram Hashtags'. Their learning goal is 'Build solid understanding' 
which means 'Comprehensive learning'.

This is batch 1 of 6 - select the HIGHEST QUALITY videos.

SELECTION CRITERIA:
- Core Learning Path: Select 5 best videos for foundation
- Additional Exploration: Select 3 videos for deeper perspectives

EDUCATIONAL PRINCIPLES:
- Smart Difficulty Assignment based on actual content complexity
- Content Recency Intelligence: Instagram is rapidly evolving - 
  prioritize last 6-12 months
- Quality over Quantity: only videos that add genuine value

For each video include reasonSelected (max 120 chars):
- Why this difficulty level fits
- How this supports the learning goal"
```

**Claude analyzes each video considering:**
1. **Title & Description Analysis**: "Hashtag Strategy 2024" → intermediate level
2. **Recency**: 2 weeks old → excellent for Instagram (rapidly evolving)
3. **Content Complexity**: Mentions "strategy" and "analytics" → not beginner
4. **Learning Progression**: This builds on basic hashtag knowledge

**Claude's response for one video:**
```json
{
  "videoId": "abc123",
  "title": "Instagram Hashtag Strategy 2024",
  "difficultyLevel": "intermediate",
  "sequenceOrder": 4,
  "pathType": "core",
  "reasonSelected": "Recent practical strategy guide. Intermediate: builds on basics with analytics. Supports comprehensive understanding goal."
}
```

### Stage 6: Batch Merging & Final Selection

After processing all 6 batches:
- **Core learning path videos**: 30 videos (5 per batch × 6 batches)
- **Additional content videos**: 18 videos (3 per batch × 6 batches)
- **After deduplication**: ~45-50 unique videos total

Videos are re-sequenced for optimal learning order:
```
1. Beginner: "What are Instagram Hashtags?"
2. Beginner: "How to Find Hashtags"
3. Intermediate: "Hashtag Research Tools"
4. Intermediate: "Hashtag Strategy 2024"
...
50. Advanced: "Enterprise Hashtag Analytics"
```

### Stage 7: Database Storage

Videos stored in PostgreSQL with this structure:

```typescript
{
  id: "uuid-1",
  preferenceId: "user-pref-123",
  videoId: "abc123",
  title: "Instagram Hashtag Strategy 2024",
  duration: "15:30",
  sequenceOrder: 4,
  difficultyLevel: "intermediate",
  pathType: "core",
  reasonSelected: "Recent practical strategy guide...",
  isWatched: false // Progress tracking
}
```

### Stage 8: UI Display

The frontend receives the response and displays:

**Two Learning Paths:**

**🎯 Core Learning Path (30 videos)**
- Tab filters: All | Beginner (8) | Intermediate (15) | Advanced (7)
- Videos sorted by sequenceOrder
- Each video card shows:
  - Thumbnail from YouTube
  - Title with difficulty badge (blue/yellow/red)
  - "Video X of 30" sequence indicator
  - Duration and channel name
  - Progress checkbox
  - AI's reasoning tooltip

**📚 Additional Content (18 videos)**
- Similar structure but marked as "supplementary"
- Provides alternative perspectives
- Can explore after core path

### Stage 9: User Interaction

**User watches video 1:**
1. Taps video card
2. Opens YouTube in new tab
3. Returns to app
4. Checks "Mark as watched"
5. Progress saved to database + localStorage
6. Video moves to bottom of list
7. Next unwatched video highlighted

**Progress tracking:**
```
Core Path: 1/30 completed (3%)
Additional: 0/18 completed (0%)
Total: 1/48 videos watched
```

### Real Performance Metrics

From actual console logs for "Instagram Hashtags":

```
Starting multi-level search for "Instagram Hashtags"...
BEGINNER strategies: ["Instagram hashtags...", ...]
INTERMEDIATE strategies: ["Instagram hashtag strategy...", ...]
ADVANCED strategies: ["Instagram hashtag analytics...", ...]

Executing 12 parallel searches...
Combined 156 videos, deduplicated to 128 unique videos
Fetching details for 128 valid video IDs
Processing batch 1/3 with 50 video IDs
Processing batch 2/3 with 50 video IDs
Processing batch 3/3 with 28 video IDs

Processing 128 videos in 6 batches of ~25 videos each
Batch curation completed:
- Core learning path: 30 videos
- Additional content: 18 videos
- Total selected: 48 videos
- Core difficulty distribution: { beginner: 8, intermediate: 15, advanced: 7 }

Total processing time: ~50 seconds
✓ Success rate: 100%
```

## Key Intelligence Features

1. **Contextual Search**: AI knows "Instagram Hashtags" is rapidly evolving → generates recency-focused queries with "2024"

2. **Multi-Level Coverage**: Searches all skill levels simultaneously → comprehensive dataset of 128 videos

3. **Smart Batch Processing**: 25 videos per batch prevents token limits while maintaining quality

4. **Recency-Aware Curation**: For Instagram (fast-changing), heavily favors last 6-12 months content

5. **Balanced Learning Path**: Automatic distribution: ~25% beginner, ~50% intermediate, ~25% advanced

6. **Progressive Sequence**: Videos ordered logically: foundation → practical application → advanced mastery

This creates a **personalized learning curriculum** of 48 high-quality videos, intelligently organized for optimal learning progression.
