import Anthropic from '@anthropic-ai/sdk';
import { storage } from './storage';
import { InsertConcept, InsertConceptSpan, TranscriptBlock, Concept, ConceptSpan } from '@shared/schema';

interface ConceptExtractionResult {
  concepts: Concept[];
  conceptSpans: ConceptSpan[];
  processingTime: number;
}

interface ExtractedConcept {
  name: string;
  category: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  relatedConcepts?: string[];
  spans: Array<{
    startTime: number;
    endTime: number;
    relevanceScore: number;
  }>;
}

export class ConceptService {
  private anthropic: Anthropic | null = null;

  private getClient(apiKey?: string): Anthropic {
    if (!apiKey) {
      throw new Error('Claude API key required for concept extraction');
    }
    if (!this.anthropic || this.anthropic.apiKey !== apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  async extractConcepts(
    videoId: string,
    transcriptBlocks: TranscriptBlock[],
    apiKey: string
  ): Promise<ConceptExtractionResult> {
    const startTime = Date.now();

    if (transcriptBlocks.length === 0) {
      return { concepts: [], conceptSpans: [], processingTime: 0 };
    }

    const client = this.getClient(apiKey);

    const fullTranscript = transcriptBlocks
      .map(block => `[${block.startTime}s-${block.endTime}s] ${block.text}`)
      .join('\n');

    const prompt = this.buildExtractionPrompt(fullTranscript);

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const extracted = this.parseConceptResponse(content.text);
    
    const insertedConcepts: Concept[] = [];
    const conceptNameToId = new Map<string, string>();

    for (const item of extracted) {
      const insertData: InsertConcept = {
        name: item.name,
        category: item.category,
        description: item.description,
        difficulty: item.difficulty,
        prerequisites: item.prerequisites,
        relatedConcepts: item.relatedConcepts,
      };
      
      const inserted = await storage.createConcept(insertData);
      insertedConcepts.push(inserted);
      conceptNameToId.set(item.name, inserted.id);
    }

    const conceptSpansToInsert: InsertConceptSpan[] = [];
    for (const item of extracted) {
      const conceptId = conceptNameToId.get(item.name);
      if (!conceptId) continue;

      for (const span of item.spans) {
        conceptSpansToInsert.push({
          videoId,
          conceptId,
          startTime: span.startTime,
          endTime: span.endTime,
          relevanceScore: span.relevanceScore,
        });
      }
    }

    const insertedSpans = conceptSpansToInsert.length > 0
      ? await storage.createConceptSpans(conceptSpansToInsert)
      : [];

    const processingTime = Date.now() - startTime;
    return { 
      concepts: insertedConcepts, 
      conceptSpans: insertedSpans, 
      processingTime 
    };
  }

  private buildExtractionPrompt(transcript: string): string {
    return `You are an expert educational content analyzer. Extract key learning concepts from this video transcript.

TRANSCRIPT:
${transcript}

TASK:
Identify all educational concepts taught in this video. For each concept, provide:
1. Name (concise, 2-4 words)
2. Category (e.g., "programming", "mathematics", "design", "science", "business")
3. Description (1-2 sentences explaining the concept)
4. Difficulty level (beginner/intermediate/advanced)
5. Prerequisites (optional, concepts that should be learned first)
6. Related concepts (optional, concepts that connect to this one)
7. Time spans where this concept appears (use the [XXs-XXs] timestamps)

FORMAT YOUR RESPONSE AS JSON:
{
  "concepts": [
    {
      "name": "Concept Name",
      "category": "category_name",
      "description": "Brief explanation of the concept",
      "difficulty": "beginner|intermediate|advanced",
      "prerequisites": ["prerequisite1", "prerequisite2"],
      "relatedConcepts": ["concept1", "concept2"],
      "spans": [
        {
          "startTime": 10,
          "endTime": 45,
          "relevanceScore": 95
        }
      ]
    }
  ]
}

GUIDELINES:
- Focus on concepts that can be learned and mastered
- Relevance score (0-100): How central is this concept during this time span?
- Only include spans where the concept is actively explained or demonstrated
- Merge overlapping or very close time spans
- Limit to 15 most important concepts maximum
- Be precise with timestamps based on the [XXs-XXs] markers

Return ONLY the JSON object, no other text.`;
  }

  private parseConceptResponse(response: string): ExtractedConcept[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in response, using empty result');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.concepts || [];
    } catch (error) {
      console.error('Failed to parse concept extraction response:', error);
      return [];
    }
  }

  async getConceptsAtTimestamp(videoId: string, timestamp: number) {
    const conceptSpans = await storage.getConceptSpansAtTimestamp(videoId, timestamp);
    
    const conceptsWithScores = await Promise.all(
      conceptSpans.map(async span => {
        const concept = await storage.getConceptById(span.conceptId!);
        return {
          ...concept,
          relevanceScore: span.relevanceScore,
          spanStart: span.startTime,
          spanEnd: span.endTime
        };
      })
    );

    return conceptsWithScores
      .filter(c => c.id)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  async buildKnowledgeGraph(videoIds: string[]) {
    const allConcepts = new Map<string, InsertConcept & { videoCount: number; videos: string[] }>();
    const edges: Array<{ from: string; to: string; relationship: string }> = [];

    for (const videoId of videoIds) {
      const spans = await storage.getConceptSpansByVideoId(videoId);
      const conceptIds = Array.from(new Set(spans.map(s => s.conceptId).filter((id): id is string => id !== null)));

      for (const conceptId of conceptIds) {
        const concept = await storage.getConceptById(conceptId);
        if (!concept) continue;

        if (allConcepts.has(concept.name)) {
          const existing = allConcepts.get(concept.name)!;
          existing.videoCount++;
          existing.videos.push(videoId);
        } else {
          allConcepts.set(concept.name, {
            ...concept,
            videoCount: 1,
            videos: [videoId]
          });
        }

        if (concept.prerequisites) {
          for (const prereq of concept.prerequisites) {
            edges.push({
              from: prereq,
              to: concept.name,
              relationship: 'prerequisite'
            });
          }
        }

        if (concept.relatedConcepts) {
          for (const related of concept.relatedConcepts) {
            edges.push({
              from: concept.name,
              to: related,
              relationship: 'related'
            });
          }
        }
      }
    }

    return {
      nodes: Array.from(allConcepts.values()),
      edges
    };
  }
}

export const conceptService = new ConceptService();
