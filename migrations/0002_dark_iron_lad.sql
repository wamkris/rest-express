ALTER TABLE "curated_videos" ADD COLUMN "conceptual_depth_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "clarity_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "content_density_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "recency_relevance_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "cognitive_match_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "overall_depth_score" integer;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "depth_reasoning" text;--> statement-breakpoint
ALTER TABLE "curated_videos" ADD COLUMN "is_conceptual" boolean;