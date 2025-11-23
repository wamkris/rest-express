
# Comprehensive Video Curation Process - Technical Breakdown

Based on the codebase, here's a comprehensive breakdown of the video curation process from start to finish:

## 1. Initial User Input & Form Submission

The process begins in `client/src/pages/home.tsx` when a user submits the learning form:

```typescript
const handleFormSubmit = async (data: LearningInterestForm) => {
  setLastFormData(data);
  setCurrentState('loading');
  curationMutation.mutate(data); // Triggers the curation process
};
```

The form data includes:
- **interest**: What the user wants to learn (e.g., "Instagram Hash tags")
- **timeLimit**: Available time in minutes (15, 30, 60, or custom)
- **notificationTime**: Optional reminder settings

## 2. API Call to Curation Endpoint

The mutation calls `curateVideos` function which makes a POST request to `/api/curate-videos` endpoint in `server/routes.ts`.

## 3. Multi-Level Video Search Strategy

### Step 3a: AI-Driven Search Strategy Generation

The system calls `generateLevelBasedSearchStrategies()` for each skill level (beginner, intermediate, advanced):

**Claude Prompt for Search Strategy Generation:**

```
You are an expert in educational content discovery. Generate 3-4 distinct, targeted search strategies for finding the best YouTube educational videos about "${topic}" for someone at the "${skillLevel}" skill level.

CRITICAL REQUIREMENTS:
- Generate search queries that reflect how people ACTUALLY search for learning content at this level
- Consider domain-specific learning progression patterns 
- Adapt to the specific context of "${topic}" - different fields have different learning approaches
- Focus on content indicators that suggest appropriate difficulty for "${skillLevel}" learners
```

This generates contextually intelligent search terms like:

- **Beginner**: "Instagram hashtags for beginners tutorial", "how to use hashtags step by step"
- **Intermediate**: "Instagram hashtag strategy 2024", "hashtag performance tracking"
- **Advanced**: "Instagram hashtag analytics ROI optimization", "branded hashtag campaign case studies"

### Step 3b: Parallel YouTube API Searches

`fetchYouTubeVideosMultiLevel()` executes all search strategies in parallel:

```typescript
// Execute searches for all strategies across all skill levels
const allSearchPromises = [];
allStrategies.forEach((strategies, levelIndex) => {
  strategies.forEach((strategy) => {
    const searchPromise = fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(strategy)}&` +
      `type=video&maxResults=${Math.ceil(maxResults / (allStrategies.flat().length))}&key=${apiKey}`
    );
    allSearchPromises.push(searchPromise);
  });
});
```

## 4. Video Data Processing & Enhancement

### Step 4a: Deduplication & Validation

The system combines results from all searches and deduplicates by video ID:

```typescript
const uniqueVideos = new Map();
for (const video of allVideos) {
  const videoId = video.id.videoId;
  if (videoId && !uniqueVideos.has(videoId)) {
    uniqueVideos.set(videoId, video);
  }
}
```

### Step 4b: Batch Video Details Fetching

Processes video IDs in batches of 50 to get detailed metadata:

```typescript
const videosResponse = await fetch(
  `https://www.googleapis.com/youtube/v3/videos?` +
  `part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoIds)}&key=${apiKey}`
);
```

### Step 4c: Recency Scoring

Each video gets enhanced with recency metadata:

```typescript
const daysSinceUpload = Math.ceil((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
let recencyScore = "recent";
if (daysSinceUpload <= 90) recencyScore = "very recent (last 3 months)";
else if (daysSinceUpload <= 365) recencyScore = "recent (last year)";
else if (daysSinceUpload <= 730) recencyScore = "moderately recent (1-2 years)";
else recencyScore = "older content (2+ years)";
```

## 5. AI-Powered Video Curation

### Step 5a: Claude Multi-Level Curation

`curateVideosWithClaudeMultiLevel()` sends the enhanced video data to Claude with a sophisticated prompt:

**Claude Curation Prompt Key Elements:**

```
Analyze these YouTube videos for someone who wants to learn "${interest}". 
They have ${timeLimit} minutes available.

TASK: Create a BALANCED MULTI-LEVEL learning path by:

1. **Select 8-10 most educational videos** with optimal recency and quality
2. **Assign accurate difficulty levels** to each video based on content analysis:
   - "beginner": Foundational concepts, assumes no prior knowledge
   - "intermediate": Builds on basics, practical applications
   - "advanced": Expert techniques, specialized knowledge
3. **Content Recency Priority**: 
   - For rapidly evolving topics (tech, social media, AI): heavily favor last 12 months
   - For stable topics (math, cooking basics): 2-3 year old content acceptable
4. **Balanced Difficulty Distribution**:
   - 30-40% beginner-level videos
   - 40-50% intermediate-level videos  
   - 20-30% advanced-level videos
5. **Create logical progression** from foundational to advanced concepts
```

### Step 5b: Video Selection Logic

Claude analyzes each video considering:

- **Content Analysis**: Title, description, channel reputation
- **Recency Relevance**: How important freshness is for the specific topic
- **Difficulty Assessment**: Technical complexity, assumed knowledge level
- **Learning Progression**: How videos build upon each other
- **Quality Indicators**: View count, engagement, production value

## 6. Response Processing & Storage

### Step 6a: JSON Response Validation

The system validates Claude's JSON response and handles parsing errors:

```typescript
let curatedVideos;
try {
  curatedVideos = JSON.parse(responseText);
} catch (parseError) {
  // Fix common JSON formatting issues
  responseText = responseText
    .replace(/,\s*}/g, '}') // Remove trailing commas
    .replace(/,\s*]/g, ']')
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys
}
```

### Step 6b: Database Storage

The curated videos are stored in PostgreSQL with enhanced metadata:

```typescript
const videosToStore = curatedVideos.map((video, index) => ({
  preferenceId: preferences.id,
  videoId: video.videoId,
  title: video.title,
  description: video.description,
  thumbnailUrl: video.thumbnailUrl,
  duration: video.duration,
  channelName: video.channelName,
  viewCount: video.viewCount,
  uploadDate: video.uploadDate,
  reasonSelected: video.reasonSelected, // Claude's explanation
  sequenceOrder: video.sequenceOrder || (index + 1),
  difficultyLevel: video.difficultyLevel || "beginner",
  isWatched: false,
}));
```

## 7. Final Response & UI Display

The API returns structured data:

```typescript
const response = {
  preferenceId: preferences.id,
  videos: storedVideos,
  topic: validatedData.interest,
  timeLimit: validatedData.timeLimit
};
```

This triggers the UI to display the VideoList component with:

- Progress tracking with sequence numbers
- Difficulty badges (beginner/intermediate/advanced)
- Tabbed interface to filter by difficulty level
- Detailed reasoning for why each video was selected

## Key Intelligence Features

1. **Contextual Search Strategy**: AI generates domain-specific search terms rather than generic keywords
2. **Multi-Level Parallel Processing**: Searches all skill levels simultaneously for comprehensive coverage
3. **Recency-Aware Curation**: Prioritizes fresh content for rapidly evolving topics like social media
4. **Balanced Learning Paths**: Ensures appropriate difficulty distribution and logical progression
5. **Quality Assessment**: Considers multiple factors beyond just search relevance

## Performance Metrics

The entire process typically takes 30-50 seconds and results in 8-10 carefully curated videos with clear learning progression and difficulty classification.

### Example Console Output for "Instagram Hash tags":
- **Total Processing Time**: ~50 seconds
- **Search Strategies Generated**: 12 across 3 difficulty levels
- **Videos Found**: 156 total across all searches
- **After Deduplication**: 128 unique videos
- **Final Curated Selection**: 9 optimally selected videos
- **Success Rate**: 100% (all API calls successful)
