CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"model_provider" text,
	"model_id" text,
	"model_api_key" text,
	"model_base_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
