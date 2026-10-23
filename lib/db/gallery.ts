import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "@/lib/db/auth-schema"

export const mediaTypes = ["image", "video"] as const
export const reactions = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
  "point",
  "cheers",
] as const
export type Reaction = (typeof reactions)[number]

const list = (values: readonly string[]) =>
  values.map((value) => `'${value}'`).join(", ")

// One uploaded photo or video. The files live in Nextcloud under
// gallery/<id>/ (lib/nextcloud.ts); this row only names them. Photos
// uploaded together share a sequence and show as one card on the wall.
export const photos = pgTable(
  "photos",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    uploaderId: uuid().references(() => user.id, { onDelete: "set null" }),
    mediaType: text().notNull(),
    /** File name of the original under gallery/<id>/, e.g. original.jpg. */
    original: text().notNull(),
    contentType: text().notNull(),
    bytes: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    durationSeconds: real(),
    sequenceId: uuid(),
    sequenceIndex: integer().notNull().default(0),
    takenAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("photos_media_type", sql.raw(`media_type in (${list(mediaTypes)})`)),
    index("photos_taken_at").on(table.takenAt),
    index("photos_sequence").on(table.sequenceId, table.sequenceIndex),
    index("photos_uploader").on(table.uploaderId),
  ]
)

// One reaction per member per photo; picking another replaces it.
export const photoReactions = pgTable(
  "photo_reactions",
  {
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reaction: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.userId] }),
    check("photo_reactions_known", sql.raw(`reaction in (${list(reactions)})`)),
  ]
)

// What a photo shows and what it is called, as EmbeddingGemma 2 vectors,
// for search by meaning. The embedder fills rows in the background; nameText
// is the name the name vector was made from, so a rename gets a new one.
export const photoVectors = pgTable("photo_vectors", {
  photoId: uuid()
    .primaryKey()
    .references(() => photos.id, { onDelete: "cascade" }),
  image: real().array().notNull(),
  name: real().array().notNull(),
  nameText: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const faceLabelers = ["admin", "auto"] as const

// A face found in a photo (embed/faces.py), with its ArcFace vector. An
// admin names whose it is; the matcher then names faces close to one an
// admin named. labeledBy says who decided: admin, auto, or null when nobody
// has. An admin may also set it to admin with no member, meaning "not
// anyone to name" (a stranger, or not a face), which the matcher leaves be.
export const faces = pgTable(
  "faces",
  {
    id: uuid().primaryKey().defaultRandom(),
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    /** x1, y1, x2, y2 as fractions of the photo's width and height. */
    box: real().array().notNull(),
    score: real().notNull(),
    vector: real().array().notNull(),
    memberId: uuid().references(() => user.id, { onDelete: "set null" }),
    labeledBy: text(),
    labeledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("faces_labeled_by", sql.raw(`labeled_by in (${list(faceLabelers)})`)),
    index("faces_photo").on(table.photoId),
    index("faces_member").on(table.memberId),
  ]
)

// Photos the face finder has looked at, faces or not, so it does each once.
export const faceScans = pgTable("face_scans", {
  photoId: uuid()
    .primaryKey()
    .references(() => photos.id, { onDelete: "cascade" }),
  faceCount: integer().notNull(),
  scannedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})
