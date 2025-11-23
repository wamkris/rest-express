import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserPreferencesSchema, learningInterestSchema, apiKeyInputSchema } from "@shared/schema";
import { z } from "zod";
import Anthropic from '@anthropic-ai/sdk';
import { setupAuth, isAuthenticated } from "./googleAuth";
import { encryptApiKey, decryptApiKey } from "./keyEncryption";
import { keyManager } from "./keyManager";
import { selectApiKey, reportKeyStatus } from "./apiKeySelector";
import { ensureVideosExist } from "./videoService";
import { captionService } from "./captionService";
import { conceptService } from "./conceptService";
import { transcriptRanker } from "./transcriptRanker";
import { pathBuilder } from "./pathBuilder";

/*
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250514", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
*/
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";

// Helper function to create an Anthropic client with the appropriate API key
async function getClaudeClient(userId?: string, userEmail?: string): Promise<{ client: Anthropic; key: string; source: string }> {
  const keySelection = await selectApiKey("claude", userId, userEmail);
  
  if (!keySelection) {
    throw new Error("Claude API key not configured. Please add your ANTHROPIC_API_KEY to environment variables or provide your own key in Settings.");
  }
  
  const { key, source } = keySelection;
  const client = new Anthropic({ apiKey: key });
  
  return { client, key, source };
}

interface YouTubeVideo {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      high: { url: string };
    };
    channelTitle: string;
    publishedAt: string;
  };
  contentDetails: {
    duration: string;
  };
  statistics: {
    viewCount: string;
  };
}

interface CuratedVideoResponse {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: string;
  channelName: string;
  viewCount: string;
  uploadDate: string;
  reasonSelected: string;
  sequenceOrder?: number;
  difficultyLevel?: "beginner" | "intermediate" | "advanced";
  depthDimension?: "conceptual" | "analytical" | "strategic" | "critical" | "evolutionary";
}

interface TaggedYouTubeVideo extends YouTubeVideo {
  depthDimension?: string;
  difficultyLevel?: string;
}

async function fetchYouTubeVideosMultiLevel(topic: string, maxResults: number = 150, userId?: string, userEmail?: string): Promise<YouTubeVideo[]> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    const keySelection = await selectApiKey("youtube", userId, userEmail);
    
    if (!keySelection) {
      throw new Error("YouTube API key not configured. Please add your YOUTUBE_API_KEY to environment variables or provide your own key in Settings.");
    }
    
    const { key: apiKey, source } = keySelection;
    console.log(`Using ${source} YouTube API key for "${topic}"`);

    try {
      console.log(`Starting multi-level search for "${topic}"...`);
    
    // Generate search strategies for all three skill levels in parallel
    const skillLevels = ["beginner", "intermediate", "advanced"] as const;
    const strategiesPromises = skillLevels.map(level => 
      generateLevelBasedSearchStrategies(topic, level, userId, userEmail)
    );
    
    const allStrategies = await Promise.all(strategiesPromises);
    
    // Log all generated strategies
    skillLevels.forEach((level, index) => {
      console.log(`${level.toUpperCase()} strategies:`, allStrategies[index]);
    });

    // Execute searches for all strategies across all skill levels
    const allSearchPromises: Promise<any[]>[] = [];
    
    allStrategies.forEach((strategies, levelIndex) => {
      const skillLevel = skillLevels[levelIndex];
      strategies.forEach((strategy) => {
        console.log(`Executing ${skillLevel} search: "${strategy}"`);
        
        const searchPromise = fetch(
          `https://www.googleapis.com/youtube/v3/search?` +
          `part=snippet&q=${encodeURIComponent(strategy)}&` +
          `type=video&maxResults=${Math.ceil(maxResults / (allStrategies.flat().length))}&key=${apiKey}&` +
          `order=relevance&videoDuration=medium&videoDefinition=high`
        ).then(async (searchResponse) => {
          if (!searchResponse.ok) {
            const errorData = await searchResponse.json();
            console.error("YouTube API error details for strategy:", strategy, errorData);

            if (searchResponse.status === 403) {
              if (errorData.error?.message?.includes("not been used")) {
                throw new Error("YouTube Data API v3 needs to be enabled. Please visit https://console.developers.google.com/apis and enable the YouTube Data API v3 for your project.");
              } else if (errorData.error?.message?.includes("quota")) {
                throw new Error("YouTube API quota exceeded. Please check your API usage limits in the Google Cloud Console.");
              } else {
                throw new Error("YouTube API access denied. Please check your API key permissions.");
              }
            }
            throw new Error(`YouTube search failed for strategy "${strategy}": ${searchResponse.statusText}`);
          }

          const searchData = await searchResponse.json();
          return searchData.items || [];
        });
        
        allSearchPromises.push(searchPromise);
      });
    });

    // Wait for all searches to complete
    const searchResults = await Promise.all(allSearchPromises);
    
    // Combine and deduplicate results with better validation
    const allVideos = searchResults.flat().filter(video => video && video.id && video.id.videoId);
    const uniqueVideos = new Map();
    
    for (const video of allVideos) {
      const videoId = video.id.videoId;
      if (videoId && typeof videoId === 'string' && videoId.length === 11 && !uniqueVideos.has(videoId)) {
        // Validate that video has required fields
        if (video.snippet && video.snippet.title && video.snippet.thumbnails) {
          uniqueVideos.set(videoId, video);
        }
      }
    }

    const deduplicatedVideos = Array.from(uniqueVideos.values());
    console.log(`Combined ${allVideos.length} videos, deduplicated to ${deduplicatedVideos.length} unique videos`);

    if (deduplicatedVideos.length === 0) {
      throw new Error("No videos found for your search query. Try different keywords.");
    }

    // Limit to maxResults and filter out invalid video IDs
    const limitedVideos = deduplicatedVideos.slice(0, maxResults);
    const validVideoIds = limitedVideos
      .map((item: any) => item.id?.videoId)
      .filter((id: string) => id && typeof id === 'string' && id.length === 11); // YouTube video IDs are always 11 characters

    if (validVideoIds.length === 0) {
      throw new Error("No valid video IDs found in search results");
    }

    console.log(`Fetching details for ${validVideoIds.length} valid video IDs`);
    
    // Process video IDs in batches to avoid API limits
    const batchSize = 50; // YouTube API allows max 50 video IDs per request
    const allVideoDetails = [];
    
    for (let i = 0; i < validVideoIds.length; i += batchSize) {
      const batch = validVideoIds.slice(i, i + batchSize);
      const videoIds = batch.join(',');
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validVideoIds.length / batchSize)} with ${batch.length} video IDs`);

      try {
        // Get detailed video information for this batch
        const videosResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?` +
          `part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoIds)}&key=${apiKey}`
        );

        if (!videosResponse.ok) {
          const errorData = await videosResponse.json().catch(() => null);
          console.error(`YouTube videos API error for batch ${Math.floor(i / batchSize) + 1}:`, {
            status: videosResponse.status,
            statusText: videosResponse.statusText,
            errorData,
            batchSize: batch.length,
            firstFewIds: batch.slice(0, 3)
          });
          
          // Continue with next batch instead of failing entirely
          console.warn(`Skipping batch ${Math.floor(i / batchSize) + 1} due to API error`);
          continue;
        }

        const videosData = await videosResponse.json();
        
        if (videosData.items && videosData.items.length > 0) {
          allVideoDetails.push(...videosData.items);
          console.log(`Batch ${Math.floor(i / batchSize) + 1} successful: fetched ${videosData.items.length} video details`);
        }
        
        // Add small delay between batches to be respectful to the API
        if (i + batchSize < validVideoIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (batchError) {
        console.error(`Error processing batch ${Math.floor(i / batchSize) + 1}:`, batchError);
        // Continue with next batch
        continue;
      }
    }
    
    if (allVideoDetails.length === 0) {
      throw new Error("No video details could be fetched from YouTube API");
    }

    console.log(`Successfully fetched details for ${allVideoDetails.length} videos from ${validVideoIds.length} requested`);
    
    // Report success
    if (source === "pool") {
      reportKeyStatus("youtube", apiKey, true);
    }
    
    return allVideoDetails;
    } catch (error) {
      console.error("YouTube API error:", error);
      
      // Detect quota errors
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("quotaExceeded"));
      
      // Handle user key failure
      if (source === "user" && userId) {
        const userKey = await storage.getUserApiKey(userId, "youtube");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User YouTube key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else {
        // Pool key failure - just report and throw
        if (source === "pool") {
          reportKeyStatus("youtube", apiKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
        }
      }
      
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Failed to fetch videos from YouTube");
    }
  }
  
  throw new Error("All API key attempts failed");
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatViewCount(count: string): string {
  const num = parseInt(count);
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

function formatUploadDate(date: string): string {
  const now = new Date();
  const uploadDate = new Date(date);
  const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}

// Learning goal-based curation strategies
function getLearningGoalDetails(learningGoal: string) {
  const goalStrategies = {
    "Quick overview": {
      description: "Get the basics",
      currationStrategy: "Focus on high-level summaries and key concepts. Prioritize concise videos that introduce main topics efficiently without overwhelming detail. Select videos that provide broad coverage and essential understanding."
    },
    "Learn the essentials": {
      description: "Core concepts",
      currationStrategy: "Focus on core foundational concepts and practical basics. Select videos that build essential knowledge and fundamental understanding with clear practical examples."
    },
    "Build solid understanding": {
      description: "Comprehensive learning",
      currationStrategy: "Provide comprehensive coverage with depth and multiple perspectives. Include detailed explanations, practical applications, and thorough understanding across all important aspects of the topic."
    },
    "Deep dive & mastery": {
      description: "Expert-level knowledge",
      currationStrategy: "Focus on expert-level content, advanced techniques, and mastery-oriented material. Include cutting-edge approaches, professional insights, and specialized knowledge for comprehensive mastery."
    }
  };

  return goalStrategies[learningGoal as keyof typeof goalStrategies] || goalStrategies["Learn the essentials"];
}

// Helper function to curate a single batch of videos
async function curateSingleBatch(
  videoData: any[], 
  interest: string, 
  learningGoal: string, 
  batchNumber: number, 
  totalBatches: number,
  targetCoreVideos: number,
  targetAdditionalVideos: number,
  userId?: string,
  userEmail?: string
): Promise<{ coreLearningPath: any[], additionalContent: any[], learningPathSummary: string }> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    let claudeKey: string | null = null;
    let keySource: string | null = null;
    
    try {
      const { client, key, source } = await getClaudeClient(userId, userEmail);
      claudeKey = key;
      keySource = source;
      console.log(`Using ${source} Claude API key for batch ${batchNumber} curation`);
  
      const learningGoalDetails = getLearningGoalDetails(learningGoal);
      
      const prompt = `Analyze these YouTube videos for someone who wants to learn "${interest}". 
Their learning goal is '${learningGoal}' which means '${learningGoalDetails.description}'.

This is batch ${batchNumber} of ${totalBatches} - you're evaluating ${videoData.length} videos from a larger collection.

As an expert educational content curator, select the HIGHEST QUALITY videos from this batch that contribute to a comprehensive learning path.

**BATCH SELECTION CRITERIA:**
- **Core Learning Path**: Select ${targetCoreVideos} best videos that build foundational understanding
- **Additional Exploration**: Select ${targetAdditionalVideos} videos for deeper exploration and alternative perspectives

**EDUCATIONAL PRINCIPLES:**
- **Smart Difficulty Assignment**: Analyze actual content complexity, not just titles
  - "beginner": Foundational concepts, assumes no prior knowledge, step-by-step guidance
  - "intermediate": Builds on basics, practical applications, moderate complexity  
  - "advanced": Expert techniques, specialized knowledge, fast-paced content

- **Content Recency Intelligence**: 
  - **Rapidly evolving topics** (tech, social media, AI, marketing): prioritize last 6-12 months
  - **Stable topics** (math, fundamentals): 2-3 year old content acceptable if high quality
  - **For "${interest}"**: ${
    interest.toLowerCase().includes('instagram') || 
    interest.toLowerCase().includes('social media') || 
    interest.toLowerCase().includes('hashtag') ||
    interest.toLowerCase().includes('marketing') ||
    interest.toLowerCase().includes('ai') ||
    interest.toLowerCase().includes('tech') ? 
    'Rapidly evolving - prioritize recent content' :
    'Evaluate based on topic evolution rate'
  }

- **Quality over Quantity**: From this batch, choose only the videos that add genuine value to the learning path
- **Learning Progression**: Ensure selected videos support the '${learningGoal}' learning intention

Each video should include in reasonSelected a concise explanation (max 120 chars):
- Why this difficulty level fits
- How this supports the learning goal

Videos to analyze:
${JSON.stringify(videoData, null, 2)}

Return ONLY a JSON object with this exact format:
{
  "coreLearningPath": [
    {
      "videoId": "string",
      "title": "string", 
      "description": "string",
      "thumbnailUrl": "string",
      "duration": "string",
      "channelName": "string",
      "viewCount": "string",
      "uploadDate": "string",
      "reasonSelected": "concise explanation max 120 chars",
      "sequenceOrder": 1,
      "difficultyLevel": "beginner",
      "pathType": "core"
    }
  ],
  "additionalContent": [
    {
      "videoId": "string",
      "title": "string", 
      "description": "string",
      "thumbnailUrl": "string",
      "duration": "string",
      "channelName": "string",
      "viewCount": "string",
      "uploadDate": "string",
      "reasonSelected": "concise explanation max 120 chars",
      "sequenceOrder": 1,
      "difficultyLevel": "intermediate",
      "pathType": "additional"
    }
  ],
  "learningPathSummary": "Brief summary of this batch's contribution to the learning path"
}`;

      const response = await client.messages.create({
        model: DEFAULT_MODEL_STR,
        max_tokens: 6000,
        system: "You are an expert educational content curator. Return ONLY a valid JSON object. Keep reasonSelected under 100 characters. No markdown, no explanations.",
        messages: [{
          role: "user",
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error("Claude returned unexpected response format");
      }

      let responseText = content.text.trim();
      
      // Extract JSON from potential markdown code blocks
      if (responseText.includes('```')) {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          responseText = jsonMatch[1];
        }
      }

      // Basic cleanup
      responseText = responseText
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/\n/g, ' ')
        .trim();

      // Parse and validate
      let curatedResponse;
      try {
        curatedResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`Batch ${batchNumber} JSON parse failed:`, parseError);
        console.error(`Response length: ${responseText.length} characters`);
        console.error(`First 500 chars:`, responseText.slice(0, 500));
        console.error(`Last 500 chars:`, responseText.slice(-500));
        
        // Report error
        const isQuotaError = parseError instanceof Error && 
          (parseError.message.includes("quota") || parseError.message.includes("rate_limit"));
        if (keySource === "pool" && claudeKey) {
          reportKeyStatus("claude", claudeKey, false, parseError instanceof Error ? parseError.message : "JSON parse error", isQuotaError);
        }
        
        throw new Error(`Batch ${batchNumber} response was truncated or malformed. Try with fewer videos.`);
      }
      
      // Report success
      if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, true);
      }
      
      return curatedResponse;
    } catch (error) {
      console.error(`Error in curateSingleBatch ${batchNumber}:`, error);
      
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("rate_limit"));
      
      // Handle user key failure
      if (keySource === "user" && userId && claudeKey) {
        const userKey = await storage.getUserApiKey(userId, "claude");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User Claude key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
      }
      
      throw error;
    }
  }
  
  throw new Error("All API key attempts failed");
}

// Multi-level curation function with batch processing
async function curateVideosWithClaudeMultiLevel(videos: YouTubeVideo[], interest: string, learningGoal: string, userId?: string, userEmail?: string): Promise<CuratedVideoResponse[]> {

  // Sanitize video data to prevent JSON parsing issues
  const sanitizeString = (str: string): string => {
    return str
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes
      .replace(/\n|\r|\t/g, ' ') // Replace newlines and tabs with spaces
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"') // Escape quotes
      .trim();
  };

  // Enhanced video data with recency scoring
  const now = new Date();
  const videoData = videos.map(video => {
    const uploadDate = new Date(video.snippet.publishedAt);
    const daysSinceUpload = Math.ceil((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate recency score (higher = more recent)
    let recencyScore = "recent";
    if (daysSinceUpload <= 90) recencyScore = "very recent (last 3 months)";
    else if (daysSinceUpload <= 365) recencyScore = "recent (last year)";
    else if (daysSinceUpload <= 730) recencyScore = "moderately recent (1-2 years)";
    else recencyScore = "older content (2+ years)";

    return {
      videoId: video.id.videoId,
      title: sanitizeString(video.snippet.title || ''),
      description: sanitizeString((video.snippet.description || '').substring(0, 200)),
      thumbnailUrl: video.snippet.thumbnails.high.url,
      duration: formatDuration(video.contentDetails.duration),
      channelName: sanitizeString(video.snippet.channelTitle || ''),
      viewCount: formatViewCount(video.statistics.viewCount),
      uploadDate: formatUploadDate(video.snippet.publishedAt),
      durationMinutes: parseDurationToMinutes(video.contentDetails.duration),
      recencyScore,
      daysSinceUpload
    };
  });

  // Log recency distribution for debugging
  const recencyStats = videoData.reduce((acc, video) => {
    acc[video.recencyScore] = (acc[video.recencyScore] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`Video recency distribution for "${interest}":`, recencyStats);
  
  // BATCH PROCESSING: Split videos into manageable batches
  const BATCH_SIZE = 25; // Smaller batches to prevent token limit issues
  const TARGET_TOTAL_VIDEOS = 50; // Aim for ~50 total videos
  const batches: any[][] = [];
  
  for (let i = 0; i < videoData.length; i += BATCH_SIZE) {
    batches.push(videoData.slice(i, i + BATCH_SIZE));
  }
  
  const totalBatches = batches.length;
  console.log(`Processing ${videoData.length} videos in ${totalBatches} batches of ~${BATCH_SIZE} videos each`);
  
  // Calculate target videos per batch to reach ~50 total
  const targetCorePerBatch = Math.ceil(30 / totalBatches); // ~30 core videos total
  const targetAdditionalPerBatch = Math.ceil(20 / totalBatches); // ~20 additional videos total
  
  // Process each batch in parallel for speed
  const batchPromises = batches.map((batch, index) => 
    curateSingleBatch(
      batch, 
      interest, 
      learningGoal, 
      index + 1, 
      totalBatches,
      targetCorePerBatch,
      targetAdditionalPerBatch,
      userId,
      userEmail
    )
  );
  
  const batchResults = await Promise.all(batchPromises);
  
  // Merge results from all batches
  let allCoreVideos: any[] = [];
  let allAdditionalVideos: any[] = [];
  
  batchResults.forEach(result => {
    allCoreVideos.push(...result.coreLearningPath);
    allAdditionalVideos.push(...result.additionalContent);
  });
  
  // Deduplicate by videoId
  const seenIds = new Set<string>();
  const deduplicatedCore = allCoreVideos.filter(video => {
    if (seenIds.has(video.videoId)) return false;
    seenIds.add(video.videoId);
    return true;
  });
  
  const deduplicatedAdditional = allAdditionalVideos.filter(video => {
    if (seenIds.has(video.videoId)) return false;
    seenIds.add(video.videoId);
    return true;
  });
  
  // Re-sequence videos for proper learning progression
  deduplicatedCore.forEach((video, index) => {
    video.sequenceOrder = index + 1;
  });
  
  deduplicatedAdditional.forEach((video, index) => {
    video.sequenceOrder = index + 1;
  });
  
  // Combine all videos
  const allVideos = [...deduplicatedCore, ...deduplicatedAdditional];
  
  // Validate each video object has required fields
  for (const video of allVideos) {
    if (!video.videoId || !video.title || !video.duration) {
      throw new Error("Batch processing returned invalid video objects missing required fields");
    }
  }

  // Log curation results for debugging
  const coreDistribution = deduplicatedCore.reduce((acc: Record<string, number>, video: any) => {
    acc[video.difficultyLevel || 'unknown'] = (acc[video.difficultyLevel || 'unknown'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const additionalDistribution = deduplicatedAdditional.reduce((acc: Record<string, number>, video: any) => {
    acc[video.difficultyLevel || 'unknown'] = (acc[video.difficultyLevel || 'unknown'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`Batch curation completed for "${interest}":`);
  console.log(`- Processed ${totalBatches} batches`);
  console.log(`- Core learning path: ${deduplicatedCore.length} videos`);
  console.log(`- Additional content: ${deduplicatedAdditional.length} videos`);
  console.log(`- Total selected: ${allVideos.length} videos`);
  console.log(`- Core difficulty distribution:`, coreDistribution);
  console.log(`- Additional difficulty distribution:`, additionalDistribution);

  return allVideos;
}

async function curateVideosWithClaude(videos: YouTubeVideo[], interest: string, learningGoal: string, skillLevel: string = "beginner", userId?: string, userEmail?: string): Promise<CuratedVideoResponse[]> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    let claudeKey: string | null = null;
    let keySource: string | null = null;
    
    try {
      const { client, key, source } = await getClaudeClient(userId, userEmail);
      claudeKey = key;
      keySource = source;
      console.log(`Using ${source} Claude API key for curation`);

  // Sanitize video data to prevent JSON parsing issues
  const sanitizeString = (str: string): string => {
    return str
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes
      .replace(/\n|\r|\t/g, ' ') // Replace newlines and tabs with spaces
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"') // Escape quotes
      .trim();
  };

  // Enhanced video data with recency scoring
  const now = new Date();
  const videoData = videos.map(video => {
    const uploadDate = new Date(video.snippet.publishedAt);
    const daysSinceUpload = Math.ceil((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate recency score (higher = more recent)
    let recencyScore = "recent";
    if (daysSinceUpload <= 90) recencyScore = "very recent (last 3 months)";
    else if (daysSinceUpload <= 365) recencyScore = "recent (last year)";
    else if (daysSinceUpload <= 730) recencyScore = "moderately recent (1-2 years)";
    else recencyScore = "older content (2+ years)";

    return {
      videoId: video.id.videoId,
      title: sanitizeString(video.snippet.title || ''),
      description: sanitizeString((video.snippet.description || '').substring(0, 200)),
      thumbnailUrl: video.snippet.thumbnails.high.url,
      duration: formatDuration(video.contentDetails.duration),
      channelName: sanitizeString(video.snippet.channelTitle || ''),
      viewCount: formatViewCount(video.statistics.viewCount),
      uploadDate: formatUploadDate(video.snippet.publishedAt),
      durationMinutes: parseDurationToMinutes(video.contentDetails.duration),
      recencyScore,
      daysSinceUpload
    };
  });

  // Log recency distribution for debugging
  const recencyStats = videoData.reduce((acc, video) => {
    acc[video.recencyScore] = (acc[video.recencyScore] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`Video recency distribution for "${interest}" at ${skillLevel} level:`, recencyStats);

  const learningGoalDetails = getLearningGoalDetails(learningGoal);
  
  const prompt = `Analyze these YouTube videos for someone who wants to learn "${interest}" at the "${skillLevel}" skill level. 
Their learning goal is '${learningGoal}' which means '${learningGoalDetails.description}'.

These videos were found using AI-generated search strategies specifically tailored for "${interest}" at the "${skillLevel}" level, leveraging contextual intelligence about how people actually search for learning content.

SKILL LEVEL CONTEXT:
${skillLevel === 'beginner' ? `
- User is completely new to "${interest}"
- Needs foundational concepts and step-by-step guidance
- Prefers slower-paced, comprehensive explanations
- Benefits from basic terminology and fundamental principles
- Requires videos that assume no prior knowledge
` : skillLevel === 'intermediate' ? `
- User has basic knowledge of "${interest}"
- Ready for practical applications and deeper concepts
- Can handle moderate complexity and technical details
- Looking to build upon existing foundation
- Benefits from examples and hands-on demonstrations
` : `
- User has significant experience with "${interest}"
- Seeking expert-level techniques and advanced concepts
- Comfortable with complex terminology and fast-paced content
- Looking for cutting-edge approaches and professional insights
- Benefits from industry best practices and specialized knowledge
`}

As an expert educational content curator, design the optimal learning path by:

1. **Analyze the Full Dataset**: You have access to ${videoData.length} high-quality videos. Use this comprehensive dataset to your advantage.

2. **Educational Intelligence**: Determine the ideal number of videos based on:
   - Topic complexity and depth requirements
   - Learning goal intention ('${learningGoal}')
   - Natural learning progression for "${interest}"
   - Quality and uniqueness of available content

3. **Smart Content Selection**: Select videos based on educational value, not arbitrary quotas:
   - Choose videos that complement each other
   - Avoid redundant content unless it provides different perspectives
   - Prioritize videos that build logical learning progression
4. **Intelligent Difficulty Distribution**: Based on the "${skillLevel}" skill level and learning goal, determine the natural mix of difficulty levels that would create the best learning experience:
   - For complex topics: Include more foundational videos to build understanding
   - For practical topics: Focus on application-oriented content
   - For theoretical topics: Balance concepts with examples
   - Let the topic and available content guide the distribution, not fixed percentages

5. **Content Recency Intelligence**: 
   - **For rapidly evolving topics** (tech, social media, AI, marketing, platforms, tools): strongly favor content from last 12 months
   - **For stable topics** (math, cooking basics, music theory, fundamental skills): 2-3 year old content acceptable if high quality
   - **Topic-specific approach for "${interest}"**: ${
     interest.toLowerCase().includes('instagram') || 
     interest.toLowerCase().includes('social media') || 
     interest.toLowerCase().includes('hashtag') ||
     interest.toLowerCase().includes('marketing') ||
     interest.toLowerCase().includes('ai') ||
     interest.toLowerCase().includes('tech') ? 
     'This is rapidly evolving - prioritize last 6-12 months content' :
     'Evaluate topic evolution rate and choose accordingly'
   }

6. **Learning Path Architecture**: Create a logical sequence that optimizes for the '${learningGoal}' intention:
   - Start with essential foundations if needed
   - Progress through concepts in natural learning order  
   - End with practical applications or advanced insights
   - Ensure each video adds unique educational value

**Your Task**: Using your educational expertise, select the most valuable videos from this comprehensive dataset to create an optimal learning experience. The number of videos should be determined by what makes educational sense for this topic and learning goal, not by arbitrary constraints.

Videos to analyze:
${JSON.stringify(videoData, null, 2)}

Each video should include in reasonSelected a brief explanation of:
- Why this difficulty level was chosen
- How recent/old the content is and why that matters for this topic
- How this video supports the '${learningGoal}' learning intention at the ${skillLevel} level

Return ONLY a JSON array with this exact format, ordered by learning sequence:
[
  {
    "videoId": "string",
    "title": "string", 
    "description": "string",
    "thumbnailUrl": "string",
    "duration": "string",
    "channelName": "string",
    "viewCount": "string",
    "uploadDate": "string",
    "reasonSelected": "explain difficulty level choice, content recency relevance, and skill level match",
    "sequenceOrder": 1,
    "difficultyLevel": "beginner"
  }
]`;

    const response = await client.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 8000, // Increased to allow more videos and detailed reasoning
      system: "You are an expert educational content curator with full autonomy to design optimal learning paths. Return ONLY a valid JSON array with no additional text, markdown formatting, or explanations. Ensure all strings in the JSON are properly escaped. Use your educational expertise to determine the ideal number of videos for this learning goal.",
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error("Unexpected response type from Claude");
    }

    // Enhanced text cleaning for larger responses
    let cleanText = content.text.trim();
    
    // Remove markdown code blocks
    cleanText = cleanText.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    
    // Find JSON object boundaries (looking for { and } instead of [ and ])
    const jsonStart = cleanText.indexOf('{');
    const jsonEnd = cleanText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
      console.error("No valid JSON object found in Claude response:", cleanText.substring(0, 500) + "...");
      throw new Error("Claude response does not contain a valid JSON object");
    }
    
    cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
    
    // Fix common JSON truncation issues
    cleanText = cleanText
      .replace(/,\s*"[^"]*"?\s*$/, '') // Remove incomplete trailing properties
      .replace(/,\s*}\s*$/, '}') // Clean up trailing commas before closing brace
      .replace(/,\s*]\s*$/, ']'); // Clean up trailing commas before closing bracket
    
    // Log the cleaned text for debugging (first 500 chars)
    console.log("Attempting to parse JSON:", cleanText.substring(0, 500) + (cleanText.length > 500 ? "..." : ""));
    
    let curatedVideos;
    try {
      curatedVideos = JSON.parse(cleanText);
    } catch (parseError) {
      const error = parseError as Error;
      const syntaxError = parseError as SyntaxError & { position?: number };
      
      console.error("JSON Parse Error Details:", {
        error: error.message,
        position: syntaxError.position || 'unknown',
        problemArea: cleanText.substring(Math.max(0, (syntaxError.position || 0) - 50), (syntaxError.position || 0) + 50)
      });
      
      // Try to fix common JSON issues
      let fixedText = cleanText
        // Fix unescaped quotes in strings
        .replace(/([^\\])"([^"]*[^\\])"([^,\]\}])/g, '$1\\"$2\\"$3')
        // Fix trailing commas
        .replace(/,(\s*[\]\}])/g, '$1')
        // Fix missing commas
        .replace(/"\s*\n\s*"/g, '",\n"')
        .replace(/}\s*\n\s*{/g, '},\n{');
      
      if (fixedText !== cleanText) {
        console.log("Attempting to parse fixed JSON");
        curatedVideos = JSON.parse(fixedText);
      } else {
        throw parseError;
      }
    }

    if (!Array.isArray(curatedVideos)) {
      throw new Error("Claude did not return a valid array");
    }

    // Validate each video object has required fields
    for (const video of curatedVideos) {
      if (!video.videoId || !video.title || !video.duration) {
        throw new Error("Claude returned invalid video objects missing required fields");
      }
    }

    // Log curation results for debugging
    const difficultyDistribution = curatedVideos.reduce((acc, video) => {
      acc[video.difficultyLevel || 'unknown'] = (acc[video.difficultyLevel || 'unknown'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`Curation completed for "${interest}" at ${skillLevel} level:`);
    console.log(`- Selected ${curatedVideos.length} videos`);
    console.log(`- Difficulty distribution:`, difficultyDistribution);
    console.log(`- Videos selected:`, curatedVideos.map(v => `${v.title} (${v.difficultyLevel}, ${v.uploadDate})`));

    // Report success
    if (keySource === "pool" && claudeKey) {
      reportKeyStatus("claude", claudeKey, true);
    }

    return curatedVideos;
    } catch (error) {
      console.error("Claude API error:", error);
      
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("rate_limit"));
      
      // Handle user key failure
      if (keySource === "user" && userId && claudeKey) {
        const userKey = await storage.getUserApiKey(userId, "claude");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User Claude key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
      }
      
      // Log additional debugging info
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        console.error("This appears to be a JSON parsing error. The Claude API may be returning malformed JSON.");
      }
      throw new Error("Failed to curate videos with AI");
    }
  }
  
  throw new Error("All API key attempts failed");
}

function parseDurationToMinutes(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  return hours * 60 + minutes + Math.ceil(seconds / 60);
}

function generateDemoVideos(interest: string, timeLimit: number): CuratedVideoResponse[] {
  const demoVideos = [
    {
      videoId: "dQw4w9WgXcQ",
      title: `Complete ${interest} Tutorial for Beginners`,
      description: `Learn ${interest} from scratch with this comprehensive tutorial covering all the fundamentals you need to get started.`,
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      duration: "15:30",
      channelName: "TechEd Pro",
      viewCount: "1.2M",
      uploadDate: "2 weeks ago",
      reasonSelected: `Foundation video that introduces core ${interest} concepts in a beginner-friendly way.`,
      sequenceOrder: 1,
      difficultyLevel: "beginner" as const
    },
    {
      videoId: "oHg5SJYRHA0",
      title: `Intermediate ${interest} Concepts`,
      description: `Build upon the basics with intermediate concepts and practical applications of ${interest}.`,
      thumbnailUrl: "https://img.youtube.com/vi/oHg5SJYRHA0/hqdefault.jpg",
      duration: "18:20",
      channelName: "SkillBuilder",
      viewCount: "745K",
      uploadDate: "1 week ago",
      reasonSelected: `Perfect second step that builds on foundational knowledge with hands-on examples.`,
      sequenceOrder: 2,
      difficultyLevel: "intermediate" as const
    },
    {
      videoId: "9bZkp7q19f0",
      title: `Advanced ${interest} Techniques`,
      description: `Master advanced ${interest} techniques and learn industry best practices for real-world applications.`,
      thumbnailUrl: "https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg",
      duration: "22:45",
      channelName: "Expert Academy",
      viewCount: "634K",
      uploadDate: "3 days ago",
      reasonSelected: `Advanced applications that demonstrate professional-level ${interest} implementation.`,
      sequenceOrder: 3,
      difficultyLevel: "advanced" as const
    }
  ];

  // Filter videos to fit within time limit
  let totalMinutes = 0;
  const selectedVideos = [];

  for (const video of demoVideos) {
    const videoDuration = video.duration.split(':').reduce((acc, time) => (60 * acc) + +time, 0) / 60;
    if (totalMinutes + videoDuration <= timeLimit) {
      selectedVideos.push(video);
      totalMinutes += videoDuration;
    }
  }

  return selectedVideos.length > 0 ? selectedVideos : [demoVideos[0]];
}

// AI-driven adaptive multi-query search strategy generation
async function generateLevelBasedSearchStrategies(topic: string, skillLevel: string, userId?: string, userEmail?: string): Promise<string[]> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    let claudeKey: string | null = null;
    let keySource: string | null = null;
    
    try {
      const { client, key, source } = await getClaudeClient(userId, userEmail);
      claudeKey = key;
      keySource = source;
      console.log(`Using ${source} Claude API key for search strategy generation`);
    
    const prompt = `You are an expert in educational content discovery. Generate 3-4 distinct, targeted search strategies for finding the best YouTube educational videos about "${topic}" for someone at the "${skillLevel}" skill level.

CRITICAL REQUIREMENTS:
- Generate search queries that reflect how people ACTUALLY search for learning content at this level
- Consider domain-specific learning progression patterns 
- Adapt to the specific context of "${topic}" - different fields have different learning approaches
- Focus on content indicators that suggest appropriate difficulty for "${skillLevel}" learners
- No generic keywords - be contextually intelligent based on the domain

For each skill level, consider:

BEGINNER: 
- How do complete newcomers search for this topic?
- What foundational concepts do they need?
- What search terms indicate step-by-step tutorials?

INTERMEDIATE:
- How do people with basic knowledge search for next-level content?
- What practical applications are they looking for?
- What terms indicate building on existing knowledge?

ADVANCED:
- How do experts search for cutting-edge content?
- What specialized terminology do they use?
- What indicates professional/industry-level content?

EXAMPLES of contextual intelligence:

Python + Beginner: ["python basics tutorial", "python first program", "python syntax explained", "learn python from zero"]
Machine Learning + Advanced: ["neural networks implementation", "ML model optimization", "deep learning architectures", "production ML systems"]  
Cooking + Intermediate: ["cooking techniques explained", "knife skills tutorial", "flavor combinations guide", "intermediate recipes"]
Guitar + Beginner: ["how to hold guitar", "basic guitar chords", "guitar for absolute beginners", "first guitar lesson"]
Photography + Advanced: ["advanced photography techniques", "professional lighting setup", "camera settings mastery", "commercial photography"]

Generate 3-4 search strategies specifically for "${topic}" at "${skillLevel}" level:

Return ONLY a JSON array of 3-4 search query strings, no other text:`;

    const response = await client.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 300,
      system: "You are a search optimization expert focused on educational content discovery. Return only valid JSON arrays with no additional text or formatting. Be contextually intelligent - adapt your search strategies to the specific domain and skill level.",
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error("Unexpected response type from Claude");
    }

    // Clean and parse the response
    let cleanText = content.text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const strategies = JSON.parse(cleanText);

    if (!Array.isArray(strategies) || strategies.length === 0) {
      throw new Error("Invalid search strategies array from Claude");
    }

    const validStrategies = strategies.filter(s => typeof s === 'string' && s.length > 0).slice(0, 4);
    
    if (validStrategies.length === 0) {
      throw new Error("No valid search strategies generated");
    }

    console.log(`Generated ${validStrategies.length} ${skillLevel} search strategies for "${topic}"`);
    
    // Report success
    if (keySource === "pool" && claudeKey) {
      reportKeyStatus("claude", claudeKey, true);
    }
    
    return validStrategies;
    } catch (error) {
      console.log("Failed to generate AI-driven search strategies, using fallback:", error);
      
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("rate_limit"));
      
      // Handle user key failure
      if (keySource === "user" && userId && claudeKey) {
        const userKey = await storage.getUserApiKey(userId, "claude");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User Claude key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
      }
      
      // Enhanced fallback with better level-specific strategies
      const enhancedFallback = {
        beginner: [
          `${topic} tutorial for beginners`,
          `learn ${topic} step by step`,
          `${topic} basics explained`,
          `how to start with ${topic}`
        ],
        intermediate: [
          `${topic} intermediate guide`,
          `${topic} practical examples`,
          `improve your ${topic} skills`,
          `${topic} techniques and tips`
        ],
        advanced: [
          `advanced ${topic} techniques`,
          `${topic} expert strategies`,
          `professional ${topic} methods`,
          `${topic} mastery course`
        ]
      };
      return enhancedFallback[skillLevel as keyof typeof enhancedFallback] || enhancedFallback.beginner;
    }
  }
  
  throw new Error("All API key attempts failed");
}

// Depth-focused search strategy generation for deep understanding
async function generateDepthFocusedSearchStrategies(topic: string, userId?: string, userEmail?: string): Promise<Record<string, string[]>> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    let claudeKey: string | null = null;
    let keySource: string | null = null;
    
    try {
      const { client, key, source } = await getClaudeClient(userId, userEmail);
      claudeKey = key;
      keySource = source;
      console.log(`Using ${source} Claude API key for depth-focused search strategies`);
    
    const prompt = `You are an expert in deep learning and educational psychology. Generate 15-25 distinct YouTube search queries for "${topic}" that prioritize DEPTH OF UNDERSTANDING over quick tutorials.

PRIMARY OBJECTIVE:
Create search queries across 5 depth dimensions that lead to conceptual mastery, analytical thinking, strategic frameworks, critical evaluation, and systemic understanding.

DEPTH DIMENSIONS (generate 3-5 queries each):

1. CONCEPTUAL DEPTH
   - Focus: Underlying principles, mechanisms, systems, theoretical foundations
   - Avoid: "how to", "tutorial", "quick", "in 5 minutes"
   - Examples: "neural network architecture principles", "hashtag algorithm mechanics", "economic theory foundations"

2. ANALYTICAL INSIGHT
   - Focus: Case studies, breakdowns, comparative analysis, research findings
   - Avoid: "tips", "tricks", "easy", "simple"
   - Examples: "Instagram algorithm analysis 2024", "successful hashtag campaign breakdown", "photography lighting case study"

3. STRATEGIC FRAMEWORKS
   - Focus: Methodologies, frameworks, systematic approaches, strategic thinking
   - Avoid: "for beginners", "step by step", "crash course"
   - Examples: "content strategy framework", "hashtag research methodology", "professional workflow system"

4. CRITICAL THINKING
   - Focus: Evaluation, critique, comparison, limitations, trade-offs
   - Avoid: "best", "top 10", "ultimate guide"
   - Examples: "hashtag strategy effectiveness evaluation", "machine learning limitations discussion", "design pattern comparison"

5. EVOLUTIONARY/HISTORICAL
   - Focus: Historical context, evolution, trends, future directions, systemic changes
   - Avoid: "latest", "new", "2024 update"
   - Examples: "Instagram algorithm evolution", "design patterns history", "future of AI research"

CRITICAL REQUIREMENTS:
✓ Use YouTube-friendly natural language (not academic jargon)
✓ Ensure semantic diversity - no overlapping meanings
✓ Focus on understanding, not procedural learning
✓ Each query should lead to educational content, not entertainment
✓ Balance foundational and advanced perspectives within each dimension

Generate 15-25 queries for "${topic}" organized by depth dimension.

Return ONLY valid JSON in this exact format (no other text):
{
  "conceptual": ["query1", "query2", "query3", "query4"],
  "analytical": ["query1", "query2", "query3"],
  "strategic": ["query1", "query2", "query3", "query4"],
  "critical": ["query1", "query2", "query3"],
  "evolutionary": ["query1", "query2", "query3", "query4"]
}`;

    const response = await client.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 1500,
      system: "You are an educational depth optimization expert. Generate search queries that prioritize conceptual understanding over procedural tutorials. Return only valid JSON with no markdown formatting or additional text.",
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error("Unexpected response type from Claude");
    }

    // Clean and parse the response
    let cleanText = content.text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }

    const strategies = JSON.parse(cleanText);

    // Validate the response structure
    const requiredDimensions = ['conceptual', 'analytical', 'strategic', 'critical', 'evolutionary'];
    const isValid = requiredDimensions.every(dim => 
      Array.isArray(strategies[dim]) && strategies[dim].length > 0
    );

    if (!isValid) {
      throw new Error("Invalid depth dimension structure from Claude");
    }

    // Count total queries
    const totalQueries = Object.values(strategies).flat().length;
    console.log(`Generated ${totalQueries} depth-focused queries for "${topic}"`);
    
    // Report success
    if (keySource === "pool" && claudeKey) {
      reportKeyStatus("claude", claudeKey, true);
    }
    
    return strategies;
    } catch (error) {
      console.log("Failed to generate depth-focused search strategies, using fallback:", error);
      
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("rate_limit"));
      
      // Handle user key failure
      if (keySource === "user" && userId && claudeKey) {
        const userKey = await storage.getUserApiKey(userId, "claude");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User Claude key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
      }
      
      // Enhanced fallback with depth-aware strategies
      return {
        conceptual: [
          `${topic} principles explained`,
          `${topic} fundamentals`,
          `understanding ${topic} concepts`,
          `${topic} theory and practice`
        ],
        analytical: [
          `${topic} analysis`,
          `${topic} case study`,
          `${topic} research findings`
        ],
        strategic: [
          `${topic} framework`,
          `${topic} methodology`,
          `${topic} strategic approach`,
          `${topic} systematic process`
        ],
        critical: [
          `${topic} evaluation`,
          `${topic} comparison`,
          `${topic} strengths and limitations`
        ],
        evolutionary: [
          `${topic} evolution`,
          `${topic} historical perspective`,
          `${topic} future trends`,
          `${topic} development over time`
        ]
      };
    }
  }
  
  throw new Error("All API key attempts failed");
}

// Fetch YouTube videos using depth-focused search strategies
async function fetchYouTubeVideosWithDepth(topic: string, maxResults: number = 150, userId?: string, userEmail?: string): Promise<TaggedYouTubeVideo[]> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    const keySelection = await selectApiKey("youtube", userId, userEmail);
    
    if (!keySelection) {
      throw new Error("YouTube API key not configured. Please add your YOUTUBE_API_KEY to environment variables or provide your own key in Settings.");
    }
    
    const { key: apiKey, source } = keySelection;
    console.log(`Using ${source} YouTube API key for depth search on "${topic}"`);

    try {
      console.log(`Starting depth-focused search for "${topic}"...`);
    
    // Generate search strategies across all depth dimensions
    const depthStrategies = await generateDepthFocusedSearchStrategies(topic, userId, userEmail);
    
    // Log all generated strategies
    const dimensions = Object.keys(depthStrategies) as Array<keyof typeof depthStrategies>;
    dimensions.forEach(dimension => {
      console.log(`${dimension.toUpperCase()} strategies:`, depthStrategies[dimension]);
    });

    // Execute searches for all strategies across all depth dimensions
    const allSearchPromises: Promise<{videos: any[], dimension: string}>[] = [];
    
    dimensions.forEach(dimension => {
      const strategies = depthStrategies[dimension];
      strategies.forEach((strategy) => {
        console.log(`Executing ${dimension} search: "${strategy}"`);
        
        const searchPromise = fetch(
          `https://www.googleapis.com/youtube/v3/search?` +
          `part=snippet&q=${encodeURIComponent(strategy)}&` +
          `type=video&maxResults=${Math.ceil(maxResults / dimensions.flatMap(d => depthStrategies[d]).length)}&key=${apiKey}&` +
          `order=relevance&videoDuration=medium&videoDefinition=high`
        ).then(async (searchResponse) => {
          if (!searchResponse.ok) {
            const errorData = await searchResponse.json();
            console.error("YouTube API error details for strategy:", strategy, errorData);

            if (searchResponse.status === 403) {
              if (errorData.error?.message?.includes("not been used")) {
                throw new Error("YouTube Data API v3 needs to be enabled. Please visit https://console.developers.google.com/apis and enable the YouTube Data API v3 for your project.");
              } else if (errorData.error?.message?.includes("quota")) {
                throw new Error("YouTube API quota exceeded. Please check your API usage limits in the Google Cloud Console.");
              } else {
                throw new Error("YouTube API access denied. Please check your API key permissions.");
              }
            }
            throw new Error(`YouTube search failed for strategy "${strategy}": ${searchResponse.statusText}`);
          }

          const searchData = await searchResponse.json();
          return { videos: searchData.items || [], dimension };
        });
        
        allSearchPromises.push(searchPromise);
      });
    });

    // Wait for all searches to complete
    const searchResults = await Promise.all(allSearchPromises);
    
    // Tag videos with their depth dimension and combine
    const taggedVideos: TaggedYouTubeVideo[] = [];
    const uniqueVideoIds = new Set<string>();
    
    for (const { videos, dimension } of searchResults) {
      for (const video of videos) {
        if (video && video.id && video.id.videoId) {
          const videoId = video.id.videoId;
          if (videoId && typeof videoId === 'string' && videoId.length === 11 && !uniqueVideoIds.has(videoId)) {
            if (video.snippet && video.snippet.title && video.snippet.thumbnails) {
              uniqueVideoIds.add(videoId);
              taggedVideos.push({
                ...video,
                depthDimension: dimension
              });
            }
          }
        }
      }
    }

    console.log(`Combined ${searchResults.flatMap(r => r.videos).length} videos, deduplicated to ${taggedVideos.length} unique videos`);

    if (taggedVideos.length === 0) {
      throw new Error("No videos found for your search query. Try different keywords.");
    }

    // Limit to maxResults
    const limitedVideos = taggedVideos.slice(0, maxResults);
    const validVideoIds = limitedVideos
      .map((item: any) => item.id?.videoId)
      .filter((id: string) => id && typeof id === 'string' && id.length === 11);

    if (validVideoIds.length === 0) {
      throw new Error("No valid video IDs found in search results");
    }

    console.log(`Fetching details for ${validVideoIds.length} valid video IDs`);
    
    // Process video IDs in batches to avoid API limits
    const batchSize = 50;
    const allVideoDetails: TaggedYouTubeVideo[] = [];
    
    for (let i = 0; i < validVideoIds.length; i += batchSize) {
      const batch = validVideoIds.slice(i, i + batchSize);
      const videoIds = batch.join(',');
      
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validVideoIds.length / batchSize)} with ${batch.length} video IDs`);

      try {
        const videosResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?` +
          `part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoIds)}&key=${apiKey}`
        );

        if (!videosResponse.ok) {
          const errorData = await videosResponse.json().catch(() => null);
          console.error(`YouTube videos API error for batch ${Math.floor(i / batchSize) + 1}:`, {
            status: videosResponse.status,
            statusText: videosResponse.statusText,
            errorData,
            batchSize: batch.length,
            firstFewIds: batch.slice(0, 3)
          });
          
          console.warn(`Skipping batch ${Math.floor(i / batchSize) + 1} due to API error`);
          continue;
        }

        const videosData = await videosResponse.json();
        const batchVideos = videosData.items || [];
        
        // Tag these videos with their depth dimension
        for (const detailedVideo of batchVideos) {
          const matchingTaggedVideo = limitedVideos.find(v => v.id.videoId === detailedVideo.id);
          if (matchingTaggedVideo) {
            allVideoDetails.push({
              ...detailedVideo,
              depthDimension: matchingTaggedVideo.depthDimension
            });
          }
        }
      } catch (batchError) {
        console.error(`Error processing batch ${Math.floor(i / batchSize) + 1}:`, batchError);
        continue;
      }
    }

    console.log(`Successfully fetched details for ${allVideoDetails.length} videos with depth tags`);
    
    // Report success
    if (source === "pool") {
      reportKeyStatus("youtube", apiKey, true);
    }
    
    return allVideoDetails;
    } catch (error) {
      console.error("Error in fetchYouTubeVideosWithDepth:", error);
      
      // Detect quota errors
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("quotaExceeded"));
      
      // Handle user key failure
      if (source === "user" && userId) {
        const userKey = await storage.getUserApiKey(userId, "youtube");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User YouTube key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else {
        // Pool key failure - just report and throw
        if (source === "pool") {
          reportKeyStatus("youtube", apiKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
        }
      }
      
      throw error;
    }
  }
  
  throw new Error("All API key attempts failed");
}

// Depth-focused curation function  
async function curateVideosWithClaudeDepth(videos: TaggedYouTubeVideo[], interest: string, learningGoal: string, userId?: string, userEmail?: string): Promise<CuratedVideoResponse[]> {

  // Sanitize video data to prevent JSON parsing issues
  const sanitizeString = (str: string): string => {
    return str
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/\n|\r|\t/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .trim();
  };

  // Enhanced video data with depth dimension tags
  const now = new Date();
  const videoData = videos.map(video => {
    const uploadDate = new Date(video.snippet.publishedAt);
    const daysSinceUpload = Math.ceil((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    
    let recencyScore = "recent";
    if (daysSinceUpload <= 90) recencyScore = "very recent (last 3 months)";
    else if (daysSinceUpload <= 365) recencyScore = "recent (last year)";
    else if (daysSinceUpload <= 730) recencyScore = "moderately recent (1-2 years)";
    else recencyScore = "older content (2+ years)";

    return {
      videoId: video.id.videoId,
      title: sanitizeString(video.snippet.title || ''),
      description: sanitizeString((video.snippet.description || '').substring(0, 200)),
      thumbnailUrl: video.snippet.thumbnails.high.url,
      duration: formatDuration(video.contentDetails.duration),
      channelName: sanitizeString(video.snippet.channelTitle || ''),
      viewCount: formatViewCount(video.statistics.viewCount),
      uploadDate: formatUploadDate(video.snippet.publishedAt),
      durationMinutes: parseDurationToMinutes(video.contentDetails.duration),
      recencyScore,
      daysSinceUpload,
      depthDimension: video.depthDimension || "conceptual"
    };
  });

  // BATCH PROCESSING: Split videos into manageable batches
  const BATCH_SIZE = 25;
  const batches: any[][] = [];
  
  for (let i = 0; i < videoData.length; i += BATCH_SIZE) {
    batches.push(videoData.slice(i, i + BATCH_SIZE));
  }
  
  const totalBatches = batches.length;
  console.log(`Processing ${videoData.length} videos for depth-focused learning in ${totalBatches} batches`);
  
  const targetVideosPerBatch = Math.ceil(50 / totalBatches);
  
  // Process each batch
  const batchPromises = batches.map((batch, index) => 
    curateDepthBatch(
      batch, 
      interest, 
      learningGoal, 
      index + 1, 
      totalBatches,
      targetVideosPerBatch,
      userId,
      userEmail
    )
  );
  
  const batchResults = await Promise.all(batchPromises);
  
  // Merge results from all batches
  let allVideos: any[] = [];
  batchResults.forEach(result => {
    allVideos.push(...result.selectedVideos);
  });
  
  // Deduplicate by videoId
  const seenIds = new Set<string>();
  const deduplicatedVideos = allVideos.filter(video => {
    if (seenIds.has(video.videoId)) return false;
    seenIds.add(video.videoId);
    return true;
  });
  
  console.log(`Depth-focused curation complete: ${deduplicatedVideos.length} videos selected`);
  
  // Assign sequence order
  const finalVideos = deduplicatedVideos.map((video, index) => ({
    ...video,
    sequenceOrder: index + 1
  }));
  
  return finalVideos;
}

// Curate a single batch for depth-focused learning
async function curateDepthBatch(
  videoData: any[], 
  interest: string, 
  learningGoal: string, 
  batchNumber: number, 
  totalBatches: number,
  targetVideos: number,
  userId?: string,
  userEmail?: string
): Promise<{ selectedVideos: any[] }> {
  let attempt = 0;
  const MAX_ATTEMPTS = 2;
  
  while (attempt < MAX_ATTEMPTS) {
    let claudeKey: string | null = null;
    let keySource: string | null = null;
    
    try {
      const { client, key, source } = await getClaudeClient(userId, userEmail);
      claudeKey = key;
      keySource = source;
      console.log(`Using ${source} Claude API key for depth batch ${batchNumber} curation`);
    
    const learningGoalDetails = getLearningGoalDetails(learningGoal);
  
    const prompt = `Analyze these YouTube videos for deep, conceptual learning about "${interest}". 
The learner's goal is '${learningGoal}' which means '${learningGoalDetails.description}'.

This is batch ${batchNumber} of ${totalBatches} - evaluating ${videoData.length} videos.

As an expert in deep learning curation, select ${targetVideos} videos that prioritize DEPTH OF UNDERSTANDING over quick tutorials.

**DEPTH-FOCUSED SELECTION CRITERIA:**

Each video has been tagged with a depth dimension based on its search query origin:
- conceptual: Principles, mechanisms, theoretical foundations
- analytical: Case studies, breakdowns, research findings
- strategic: Frameworks, methodologies, systematic approaches
- critical: Evaluation, comparison, limitations analysis
- evolutionary: Historical context, trends, future directions

**YOUR TASK:**
1. Select the BEST ${targetVideos} videos from this batch that support deep conceptual mastery
2. Prioritize videos that:
   ✓ Explain WHY and HOW, not just WHAT
   ✓ Provide frameworks and mental models
   ✓ Include analysis and critical thinking
   ✓ Avoid shallow "how-to" or "quick tips" content
   ✓ Balance across multiple depth dimensions

3. For EACH selected video:
   - Verify the depthDimension tag matches the actual content
   - Assign a difficultyLevel (beginner/intermediate/advanced) based on complexity
   - Write a concise reasonSelected (max 120 chars) explaining its educational value

**ANTI-SHALLOW CONTENT RULES:**
❌ Avoid videos with titles like: "in 5 minutes", "quick tips", "easy tutorial", "for beginners"
✓ Prefer videos with: "explained", "analysis", "framework", "principles", "case study", "deep dive"

Videos to analyze (each includes depthDimension tag):
${JSON.stringify(videoData, null, 2)}

Return ONLY valid JSON:
{
  "selectedVideos": [
    {
      "videoId": "string",
      "title": "string",
      "description": "string",
      "thumbnailUrl": "string",
      "duration": "string",
      "channelName": "string",
      "viewCount": "string",
      "uploadDate": "string",
      "reasonSelected": "max 120 chars - why this supports deep learning",
      "depthDimension": "conceptual | analytical | strategic | critical | evolutionary",
      "difficultyLevel": "beginner | intermediate | advanced"
    }
  ]
}`;

    const response = await client.messages.create({
      model: DEFAULT_MODEL_STR,
      max_tokens: 6000,
      system: "You are an expert in deep learning curation focused on conceptual mastery. Return ONLY valid JSON. Prioritize depth over breadth, understanding over procedure.",
      messages: [{
        role: "user",
        content: prompt
      }]
    });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error("Claude returned unexpected response format");
  }

  let responseText = content.text.trim();
  
  if (responseText.includes('```')) {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      responseText = jsonMatch[1];
    }
  }

  responseText = responseText
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/\n/g, ' ')
    .trim();

    let curatedResponse;
    try {
      curatedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`Depth batch ${batchNumber} JSON parse failed:`, parseError);
      
      // Report error
      const isQuotaError = parseError instanceof Error && 
        (parseError.message.includes("quota") || parseError.message.includes("rate_limit"));
      if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, parseError instanceof Error ? parseError.message : "JSON parse error", isQuotaError);
      }
      
      throw new Error(`Batch ${batchNumber} response was truncated or malformed.`);
    }
    
    // Report success
    if (keySource === "pool" && claudeKey) {
      reportKeyStatus("claude", claudeKey, true);
    }
    
    return curatedResponse;
    } catch (error) {
      console.error(`Error in curateDepthBatch ${batchNumber}:`, error);
      
      const isQuotaError = error instanceof Error && 
        (error.message.includes("quota") || error.message.includes("rate_limit"));
      
      // Handle user key failure
      if (keySource === "user" && userId && claudeKey) {
        const userKey = await storage.getUserApiKey(userId, "claude");
        if (userKey) {
          await storage.updateUserApiKey(userKey.id, {
            isValid: false,
            quotaStatus: isQuotaError ? "quota_exceeded" : "invalid"
          });
        }
        
        attempt++;
        if (attempt < MAX_ATTEMPTS) {
          console.log(`User Claude key failed, retrying with pool key (attempt ${attempt + 1})`);
          continue;
        }
      } else if (keySource === "pool" && claudeKey) {
        reportKeyStatus("claude", claudeKey, false, error instanceof Error ? error.message : "Unknown error", isQuotaError);
      }
      
      throw error;
    }
  }
  
  throw new Error("All API key attempts failed");
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // Handle both Google OAuth (req.user.id) and OIDC auth (req.user.claims.sub)
      const userId = req.user?.id || req.user?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ message: "User ID not found in session" });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // API Key Management Routes
  
  // Validate an API key
  app.post("/api/keys/validate", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = apiKeyInputSchema.parse(req.body);
      const { provider, apiKey } = validatedData;
      
      let isValid = false;
      let errorMessage = null;
      
      if (provider === "youtube") {
        // Test YouTube API key with a simple quota check
        try {
          const testResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&type=video&maxResults=1&key=${apiKey}`
          );
          isValid = testResponse.ok;
          if (!isValid) {
            const errorData = await testResponse.json();
            errorMessage = errorData.error?.message || "Invalid YouTube API key";
          }
        } catch (error) {
          errorMessage = "Failed to validate YouTube API key";
        }
      } else if (provider === "claude") {
        // Test Claude API key
        try {
          const testClient = new Anthropic({ apiKey });
          await testClient.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 10,
            messages: [{ role: "user", content: "test" }]
          });
          isValid = true;
        } catch (error: any) {
          errorMessage = error?.message || "Invalid Claude API key";
        }
      }
      
      res.json({ valid: isValid, error: errorMessage });
    } catch (error) {
      console.error("Validate API key error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Save a user's API key
  app.post("/api/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const validatedData = apiKeyInputSchema.parse(req.body);
      const { provider, apiKey } = validatedData;
      
      // Encrypt the API key
      const encryptedKey = encryptApiKey(apiKey);
      
      // Check if user already has a key for this provider
      const existingKey = await storage.getUserApiKey(userId, provider);
      
      if (existingKey) {
        // Update existing key
        const updated = await storage.updateUserApiKey(existingKey.id, {
          encryptedKey,
          isValid: true,
          lastValidatedAt: new Date(),
        });
        res.json({ success: true, keyId: updated.id });
      } else {
        // Create new key
        const newKey = await storage.createUserApiKey({
          userId,
          provider,
          encryptedKey,
          isValid: true,
          lastValidatedAt: new Date(),
        });
        res.json({ success: true, keyId: newKey.id });
      }
    } catch (error) {
      console.error("Save API key error:", error);
      res.status(500).json({ message: "Failed to save API key" });
    }
  });

  // Get user's API keys (encrypted keys are not returned)
  app.get("/api/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const keys = await storage.getUserApiKeys(userId);
      
      // Return keys without the encrypted values
      const safeKeys = keys.map(key => ({
        id: key.id,
        provider: key.provider,
        isValid: key.isValid,
        lastValidatedAt: key.lastValidatedAt,
        quotaStatus: key.quotaStatus,
        createdAt: key.createdAt,
      }));
      
      res.json(safeKeys);
    } catch (error) {
      console.error("Get API keys error:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  // Delete a user's API key
  app.delete("/api/keys/:keyId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { keyId } = req.params;
      
      // Verify the key belongs to this user
      const keys = await storage.getUserApiKeys(userId);
      const keyToDelete = keys.find(k => k.id === keyId);
      
      if (!keyToDelete) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      await storage.deleteUserApiKey(keyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete API key error:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  // Create learning preferences and curate videos
  app.post("/api/curate-videos", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = learningInterestSchema.parse(req.body);
      
      // Extract userId and userEmail (required - must be authenticated)
      const userId = req.user?.id || req.user?.claims?.sub;
      const userEmail = req.user?.email || req.user?.claims?.email;

      // Create user preferences
      const preferences = await storage.createUserPreferences({
        interest: validatedData.interest,
        learningGoal: validatedData.learningGoal,
        learningMode: validatedData.learningMode || "quick",
        notificationTime: validatedData.notificationTime || null,
      });

      let curatedVideos: CuratedVideoResponse[];
      
      // Choose search and curation strategy based on learning mode
      if (validatedData.learningMode === "deep") {
        // Depth-focused approach for deep understanding
        const youtubeVideos = await fetchYouTubeVideosWithDepth(validatedData.interest, 150, userId, userEmail);
        curatedVideos = await curateVideosWithClaudeDepth(
          youtubeVideos,
          validatedData.interest,
          validatedData.learningGoal,
          userId,
          userEmail
        );
      } else {
        // Quick learning approach (existing behavior)
        const youtubeVideos = await fetchYouTubeVideosMultiLevel(validatedData.interest, 150, userId, userEmail);
        curatedVideos = await curateVideosWithClaudeMultiLevel(
          youtubeVideos, 
          validatedData.interest, 
          validatedData.learningGoal,
          userId,
          userEmail
        );
      }

      // Apply transcript intelligence ranking if enabled
      const useTranscriptIntelligence = validatedData.useTranscriptIntelligence || "auto";
      const rankingResult = await transcriptRanker.rankVideos(
        curatedVideos,
        useTranscriptIntelligence
      );

      // Store curated videos with sequence, difficulty, and depth dimension
      const videosToStore = rankingResult.videos.map((video, index) => ({
        preferenceId: preferences.id,
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        channelName: video.channelName,
        channelThumbnail: null,
        viewCount: video.viewCount,
        uploadDate: video.uploadDate,
        reasonSelected: video.reasonSelected,
        sequenceOrder: video.sequenceOrder || (index + 1),
        difficultyLevel: video.difficultyLevel || "beginner",
        depthDimension: video.depthDimension || null,
        isWatched: false,
      }));

      await ensureVideosExist(videosToStore);

      const storedVideos = await storage.createCuratedVideos(videosToStore);

      // Trigger background transcript fetching for videos without transcripts
      if (useTranscriptIntelligence !== "disabled") {
        const videoIds = storedVideos.map(v => v.videoId);
        transcriptRanker.fetchTranscriptsInBackground(videoIds).catch(err => {
          console.error("Background transcript fetch error:", err);
        });
      }

      const response = {
        preferenceId: preferences.id,
        videos: storedVideos,
        topic: validatedData.interest,
        learningGoal: validatedData.learningGoal,
        transcriptMetadata: rankingResult.metadata,
      };

      res.json(response);
    } catch (error) {
      console.error("Video curation error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          error: "Invalid input data",
          details: error.errors 
        });
      } else {
        res.status(500).json({ 
          error: error instanceof Error ? error.message : "Failed to curate videos"
        });
      }
    }
  });

  // Refresh curated videos
  app.post("/api/refresh-videos/:preferenceId", async (req: any, res) => {
    try {
      const { preferenceId } = req.params;
      
      // Extract userId and userEmail if authenticated (optional)
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email;

      const preferences = await storage.getUserPreferences(preferenceId);
      if (!preferences) {
        return res.status(404).json({ error: "Preferences not found" });
      }

      // Delete old curated videos
      await storage.deleteCuratedVideosByPreferenceId(preferenceId);

      // Fetch fresh videos from YouTube using multi-level approach
      const youtubeVideos = await fetchYouTubeVideosMultiLevel(preferences.interest, 150, userId, userEmail);

      // Curate with Claude using multi-level approach
      const curatedVideos = await curateVideosWithClaudeMultiLevel(
        youtubeVideos, 
        preferences.interest, 
        preferences.learningGoal,
        userId,
        userEmail
      );

      // Apply transcript intelligence ranking (default to "auto")
      const rankingResult = await transcriptRanker.rankVideos(
        curatedVideos,
        "auto"
      );

      // Store new curated videos with sequence and difficulty
      const videosToStore = rankingResult.videos.map((video, index) => ({
        preferenceId: preferences.id,
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        duration: video.duration,
        channelName: video.channelName,
        channelThumbnail: null,
        viewCount: video.viewCount,
        uploadDate: video.uploadDate,
        reasonSelected: video.reasonSelected,
        sequenceOrder: video.sequenceOrder || (index + 1), // Use Claude's order or fallback to index
        difficultyLevel: video.difficultyLevel || "beginner", // Use Claude's level or fallback
        isWatched: false,
      }));

      await ensureVideosExist(videosToStore);

      const storedVideos = await storage.createCuratedVideos(videosToStore);

      // Trigger background transcript fetching
      const videoIds = storedVideos.map(v => v.videoId);
      transcriptRanker.fetchTranscriptsInBackground(videoIds).catch(err => {
        console.error("Background transcript fetch error:", err);
      });

      const response = {
        videos: storedVideos,
        transcriptMetadata: rankingResult.metadata,
      };

      res.json(response);
    } catch (error) {
      console.error("Video refresh error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to refresh videos"
      });
    }
  });

  // Get curated videos by preference ID
  app.get("/api/videos/:preferenceId", async (req, res) => {
    try {
      const { preferenceId } = req.params;
      const videos = await storage.getCuratedVideosByPreferenceId(preferenceId);
      res.json(videos);
    } catch (error) {
      console.error("Get videos error:", error);
      res.status(500).json({ 
        error: "Failed to fetch videos"
      });
    }
  });

  // School Alt Phase 3: Transcript & Concept Routes

  // Fetch and store transcript for a video
  app.post("/api/videos/:videoId/transcripts/fetch", isAuthenticated, async (req, res) => {
    try {
      const { videoId } = req.params;
      
      const result = await captionService.fetchAndStoreTranscript(videoId);
      
      if (!result) {
        return res.status(404).json({ 
          error: "Transcript not available for this video"
        });
      }

      res.json({
        videoId,
        tqs: result.tqs,
        language: result.language,
        source: result.source,
        blockCount: result.blocks.length,
        message: "Transcript fetched and stored successfully"
      });
    } catch (error) {
      console.error("Fetch transcript error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch transcript"
      });
    }
  });

  // Get transcript blocks for a video
  app.get("/api/videos/:videoId/transcripts", async (req, res) => {
    try {
      const { videoId } = req.params;
      const blocks = await storage.getTranscriptBlocksByVideoId(videoId);
      res.json(blocks);
    } catch (error) {
      console.error("Get transcript error:", error);
      res.status(500).json({ 
        error: "Failed to fetch transcript"
      });
    }
  });

  // Get transcript context at specific timestamp
  app.get("/api/videos/:videoId/transcripts/at/:timestamp", async (req, res) => {
    try {
      const { videoId, timestamp } = req.params;
      const timestampNum = parseInt(timestamp);
      
      if (isNaN(timestampNum)) {
        return res.status(400).json({ error: "Invalid timestamp" });
      }

      const context = await captionService.getTranscriptContext(videoId, timestampNum);
      res.json(context);
    } catch (error) {
      console.error("Get transcript context error:", error);
      res.status(500).json({ 
        error: "Failed to fetch transcript context"
      });
    }
  });

  // Extract concepts from video transcript
  app.post("/api/videos/:videoId/concepts/extract", isAuthenticated, async (req: any, res) => {
    try {
      const { videoId } = req.params;
      const userId = req.user?.id;
      const userEmail = req.user?.email;

      // Get transcript blocks
      const transcriptBlocks = await storage.getTranscriptBlocksByVideoId(videoId);
      
      if (transcriptBlocks.length === 0) {
        return res.status(404).json({ 
          error: "No transcript available. Please fetch transcript first."
        });
      }

      // Get Claude API key
      const keySelection = await selectApiKey("claude", userId, userEmail);
      if (!keySelection) {
        return res.status(400).json({ 
          error: "Claude API key not configured"
        });
      }

      // Extract concepts
      const result = await conceptService.extractConcepts(
        videoId,
        transcriptBlocks,
        keySelection.key
      );

      res.json({
        videoId,
        conceptCount: result.concepts.length,
        spanCount: result.conceptSpans.length,
        processingTime: result.processingTime,
        concepts: result.concepts,
        message: "Concepts extracted successfully"
      });
    } catch (error) {
      console.error("Extract concepts error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to extract concepts"
      });
    }
  });

  // Get concepts with spans for a video
  app.get("/api/videos/:videoId/concepts", async (req, res) => {
    try {
      const { videoId } = req.params;
      const conceptSpans = await storage.getConceptSpansByVideoId(videoId);
      
      const conceptIds = Array.from(new Set(conceptSpans.map(s => s.conceptId).filter((id): id is string => id !== null)));
      const concepts = await Promise.all(
        conceptIds.map(id => storage.getConceptById(id))
      );

      const conceptsWithSpans = concepts
        .filter(c => c !== undefined)
        .map(concept => ({
          ...concept,
          spans: conceptSpans.filter(span => span.conceptId === concept.id)
        }));

      res.json(conceptsWithSpans);
    } catch (error) {
      console.error("Get concepts error:", error);
      res.status(500).json({ 
        error: "Failed to fetch concepts"
      });
    }
  });

  // Get concepts active at specific timestamp
  app.get("/api/videos/:videoId/concepts/at/:timestamp", async (req, res) => {
    try {
      const { videoId, timestamp } = req.params;
      const timestampNum = parseInt(timestamp);
      
      if (isNaN(timestampNum)) {
        return res.status(400).json({ error: "Invalid timestamp" });
      }

      const concepts = await conceptService.getConceptsAtTimestamp(videoId, timestampNum);
      res.json(concepts);
    } catch (error) {
      console.error("Get concepts at timestamp error:", error);
      res.status(500).json({ 
        error: "Failed to fetch concepts at timestamp"
      });
    }
  });

  // Get learning path with nodes and user progress
  app.get("/api/paths/:pathId", isAuthenticated, async (req: any, res) => {
    try {
      const { pathId } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub;

      const path = await storage.getLearningPathById(pathId);
      if (!path) {
        return res.status(404).json({ error: "Learning path not found" });
      }

      const nodes = await storage.getPathNodesByPathId(pathId);
      const userProgress = (await storage.getUserProgressByUserId(userId)) || [];

      const nodesWithProgress = await Promise.all(
        nodes.map(async (node) => {
          const progress = userProgress.find(p => p.nodeId === node.id);
          let conceptData = null;

          if (node.conceptId) {
            conceptData = await storage.getConceptById(node.conceptId);
          }

          return {
            ...node,
            concept: conceptData,
            progress: progress ? {
              isCompleted: progress.isCompleted,
              masteryLevel: progress.masteryLevel,
              lastReviewedAt: progress.lastReviewedAt,
            } : null,
          };
        })
      );

      res.json({
        ...path,
        nodes: nodesWithProgress,
      });
    } catch (error) {
      console.error("Get learning path error:", error);
      res.status(500).json({ 
        error: "Failed to fetch learning path"
      });
    }
  });

  // Get video intelligence at specific timestamp (requires authentication for personalized learning context)
  app.get("/api/video-intelligence/:videoId", isAuthenticated, async (req: any, res) => {
    try {
      const { videoId } = req.params;
      const timestamp = parseInt(req.query.t as string || "0");
      const userId = req.user?.id || req.user?.claims?.sub;

      const conceptSpans = await storage.getConceptSpansAtTimestamp(videoId, timestamp);
      const transcriptBlock = await storage.getTranscriptAtTimestamp(videoId, timestamp);
      const userProgress = (await storage.getUserProgressByUserId(userId)) || [];

      let currentConcept = null;
      let keyTerms: string[] = [];
      let prerequisites: any[] = [];
      let nextConcepts: any[] = [];

      if (conceptSpans.length > 0) {
        const primarySpan = conceptSpans[0];
        if (primarySpan.conceptId) {
          const concept = await storage.getConceptById(primarySpan.conceptId);
          if (concept) {
            currentConcept = {
              id: concept.id,
              label: concept.name,
              definition: concept.description,
              difficulty: concept.difficulty,
              span: {
                startTime: primarySpan.startTime,
                endTime: primarySpan.endTime,
              },
            };

            keyTerms = concept.category ? [concept.category] : [];
            if (transcriptBlock?.text) {
              const words = transcriptBlock.text.split(' ').filter(w => w.length > 6);
              keyTerms = [...keyTerms, ...words.slice(0, 5)];
            }

            if (concept.prerequisites && concept.prerequisites.length > 0) {
              prerequisites = await Promise.all(
                concept.prerequisites.map(async (prereqId) => {
                  const prereqConcept = await storage.getConceptById(prereqId);
                  if (!prereqConcept) return null;

                  const progress = userProgress.find(p => p.conceptId === prereqId);
                  const isMastered = progress?.isCompleted || false;
                  const masteryLevel = progress?.masteryLevel || 0;

                  return {
                    id: prereqConcept.id,
                    label: prereqConcept.name,
                    isMastered,
                    masteryLevel: masteryLevel >= 80 ? "fluent" : masteryLevel >= 50 ? "learning" : "beginner",
                  };
                })
              );
              prerequisites = prerequisites.filter(p => p !== null);
            }

            if (concept.relatedConcepts && concept.relatedConcepts.length > 0) {
              nextConcepts = await Promise.all(
                concept.relatedConcepts.slice(0, 3).map(async (relatedId) => {
                  const relatedConcept = await storage.getConceptById(relatedId);
                  if (!relatedConcept) return null;

                  const relatedSpans = await storage.getConceptSpansByVideoId(videoId);
                  const relatedSpan = relatedSpans.find(s => s.conceptId === relatedId);

                  return {
                    id: relatedConcept.id,
                    label: relatedConcept.name,
                    bestVideoSpan: relatedSpan ? {
                      videoId: videoId,
                      startTime: relatedSpan.startTime,
                      title: relatedConcept.name,
                    } : null,
                  };
                })
              );
              nextConcepts = nextConcepts.filter(n => n !== null);
            }
          }
        }
      }

      res.json({
        currentConcept,
        transcript: transcriptBlock,
        keyTerms,
        prerequisites,
        nextConcepts,
      });
    } catch (error) {
      console.error("Get video intelligence error:", error);
      res.status(500).json({ 
        error: "Failed to fetch video intelligence"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}