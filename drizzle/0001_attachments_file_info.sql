ALTER TABLE "attachments" ADD COLUMN "file_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "content_type" text DEFAULT 'application/octet-stream' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "size_bytes" integer DEFAULT 0 NOT NULL;