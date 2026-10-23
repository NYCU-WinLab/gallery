DROP TABLE "comment_likes" CASCADE;--> statement-breakpoint
DROP TABLE "comments" CASCADE;--> statement-breakpoint
DROP TABLE "favorites" CASCADE;--> statement-breakpoint
ALTER TABLE "photos" DROP COLUMN "pinned_at";