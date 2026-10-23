CREATE TABLE "face_scans" (
	"photo_id" uuid PRIMARY KEY NOT NULL,
	"face_count" integer NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"box" real[] NOT NULL,
	"score" real NOT NULL,
	"vector" real[] NOT NULL,
	"member_id" uuid,
	"labeled_by" text,
	"labeled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faces_labeled_by" CHECK (labeled_by in ('admin', 'auto'))
);
--> statement-breakpoint
ALTER TABLE "face_scans" ADD CONSTRAINT "face_scans_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faces" ADD CONSTRAINT "faces_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faces_photo" ON "faces" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "faces_member" ON "faces" USING btree ("member_id");