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
  type AnyPgColumn,
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
    pinnedAt: timestamp({ withTimezone: true }),
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

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    authorId: uuid().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    pinnedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("comments_photo").on(table.photoId, table.createdAt)]
)

export const commentLikes = pgTable(
  "comment_likes",
  {
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.userId] })]
)

export const tags = pgTable("tags", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const photoTags = pgTable(
  "photo_tags",
  {
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.tagId] }),
    index("photo_tags_tag").on(table.tagId),
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

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    photoId: uuid()
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.photoId] })]
)
