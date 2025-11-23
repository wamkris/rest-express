CREATE TABLE "curated_videos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preference_id" varchar NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"thumbnail_url" text NOT NULL,
	"duration" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_thumbnail" text,
	"view_count" text,
	"upload_date" text,
	"reason_selected" text,
	"sequence_order" integer DEFAULT 1 NOT NULL,
	"difficulty_level" text DEFAULT 'beginner' NOT NULL,
	"depth_dimension" text,
	"is_watched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interest" text NOT NULL,
	"learning_goal" text NOT NULL,
	"learning_mode" text DEFAULT 'quick' NOT NULL,
	"notification_time" text,
	"created_at" timestamp DEFAULT now()
);
