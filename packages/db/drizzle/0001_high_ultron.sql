ALTER TABLE "users" ADD COLUMN "clerk_user_id" varchar(128);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;