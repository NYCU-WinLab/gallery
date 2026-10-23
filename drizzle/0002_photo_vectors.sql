CREATE TABLE "photo_vectors" (
	"photo_id" uuid PRIMARY KEY NOT NULL,
	"image" real[] NOT NULL,
	"name" real[] NOT NULL,
	"name_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_vectors" ADD CONSTRAINT "photo_vectors_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;