import { randomUUID } from "node:crypto"
import { readFile, rm, stat } from "node:fs/promises"
import { resolve } from "node:path"

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { z } from "zod"

import { isAdmin } from "@/lib/actions/authz"
import { defineAction, type Actor } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { faces, photoReactions, photos, user } from "@/lib/db/schema"
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  mediaTypeOf,
  processImage,
  processVideo,
  uploadDir,
} from "@/lib/media"
import { deletePhotoFiles, putPhotoFiles } from "@/lib/nextcloud"
import { searchByMeaning } from "@/lib/actions/vectors"

const PAGE = 48

/** The columns a wall card needs. */
const card = {
  id: photos.id,
  name: photos.name,
  mediaType: photos.mediaType,
  width: photos.width,
  height: photos.height,
  durationSeconds: photos.durationSeconds,
  sequenceId: photos.sequenceId,
  takenAt: photos.takenAt,
  uploaderId: photos.uploaderId,
  uploaderName: user.name,
}

// A sequence shows on the wall as its first photo; the card carries how
// many it holds.
const sequenceSize = sql<number>`case when ${photos.sequenceId} is null then 1 else (select count(*)::int from ${photos} s where s.sequence_id = ${photos.sequenceId}) end`
const isCover = or(
  isNull(photos.sequenceId),
  sql`${photos.sequenceIndex} = (select min(s.sequence_index) from ${photos} s where s.sequence_id = ${photos.sequenceId})`
)!
// Each reaction on the photo with how many picked it, e.g. { haha: 2, love: 1 }.
const reactionCounts = sql<
  Record<string, number>
>`(select coalesce(jsonb_object_agg(reaction, n), '{}'::jsonb) from (select reaction, count(*)::int n from photo_reactions r where r.photo_id = ${photos.id} group by reaction) c)`

const wallInput = z.object({
  query: z.string().trim().max(100).optional(),
  uploaderId: z.uuid().optional(),
  memberId: z.uuid().optional(),
  offset: z.number().int().min(0).default(0),
})

export const listPhotos = defineAction({
  name: "list_photos",
  title: "照片牆",
  description: `The wall, newest taken first, ${PAGE} cards per page (pass offset for the next page; nextOffset is null at the end). A card is a photo, or the first photo of a sequence uploaded together (sequenceSize > 1; get_photo lists the rest). Filters: query (photo name or uploader name as text, and what photos show by meaning, e.g. \"birthday cake\"; best matches first), uploaderId, memberId (photos that show this member, from list_people).`,
  kind: "query",
  input: wallInput,
  run: async (actor, input) => {
    const filters: SQL[] = [isCover]
    // A search matches names and uploaders as text, and photos by
    // meaning; text matches come first, then the closest in meaning.
    let ranking: SQL[] = []
    if (input.query) {
      const like = `%${input.query.replace(/[%_\\]/g, "\\$&")}%`
      const text = or(ilike(photos.name, like), ilike(user.name, like))!
      const meaning = await searchByMeaning(input.query)
      if (meaning?.length) {
        const cards = sql`${`{${meaning.join(",")}}`}::uuid[]`
        const cardId = sql`coalesce(${photos.sequenceId}, ${photos.id})`
        filters.push(or(text, sql`${cardId} = any(${cards})`)!)
        ranking = [
          sql`(${text}) desc`,
          sql`array_position(${cards}, ${cardId}) nulls last`,
        ]
      } else filters.push(text)
    }
    if (input.uploaderId) filters.push(eq(photos.uploaderId, input.uploaderId))
    if (input.memberId)
      filters.push(
        sql`exists (select 1 from faces f where f.member_id = ${input.memberId} and f.photo_id in (select s.id from photos s where s.id = ${photos.id} or (${photos.sequenceId} is not null and s.sequence_id = ${photos.sequenceId})))`
      )
    const rows = await db
      .select({
        ...card,
        sequenceSize,
        reactionCounts,
      })
      .from(photos)
      .leftJoin(user, eq(user.id, photos.uploaderId))
      .where(and(...filters))
      .orderBy(...ranking, desc(photos.takenAt), desc(photos.id))
      .limit(PAGE + 1)
      .offset(input.offset)
    return {
      photos: rows.slice(0, PAGE),
      nextOffset: rows.length > PAGE ? input.offset + PAGE : null,
    }
  },
})

export const getPhoto = defineAction({
  name: "get_photo",
  title: "照片",
  description:
    "One photo with everything around it: uploader, the other photos of its sequence, the members it shows (people, with their faces in it), reaction counts and the caller's own reaction, and whether the caller may edit it.",
  kind: "query",
  input: z.object({ id: z.uuid() }),
  run: async (actor, { id }) => {
    const [photo] = await db
      .select({
        ...card,
        original: photos.original,
        contentType: photos.contentType,
        bytes: photos.bytes,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .leftJoin(user, eq(user.id, photos.uploaderId))
      .where(eq(photos.id, id))
    if (!photo) throw new Error("找不到這張照片")
    const [sequence, people, reactionRows, admin] = await Promise.all([
      photo.sequenceId
        ? db
            .select({
              id: photos.id,
              mediaType: photos.mediaType,
              width: photos.width,
              height: photos.height,
            })
            .from(photos)
            .where(eq(photos.sequenceId, photo.sequenceId))
            .orderBy(asc(photos.sequenceIndex), asc(photos.createdAt))
        : Promise.resolve([
            {
              id: photo.id,
              mediaType: photo.mediaType,
              width: photo.width,
              height: photo.height,
            },
          ]),
      db
        .select({
          memberId: user.id,
          name: user.name,
          faceIds: sql<
            string[]
          >`array_agg(${faces.id} order by ${faces.score} desc)`,
        })
        .from(faces)
        .innerJoin(user, eq(user.id, faces.memberId))
        .where(eq(faces.photoId, id))
        .groupBy(user.id, user.name),
      db
        .select({
          reaction: photoReactions.reaction,
          userId: photoReactions.userId,
          name: user.name,
        })
        .from(photoReactions)
        .innerJoin(user, eq(user.id, photoReactions.userId))
        .where(eq(photoReactions.photoId, id))
        .orderBy(asc(photoReactions.createdAt)),
      isAdmin(actor),
    ])
    return {
      ...photo,
      sequence,
      people: people.sort((a, b) => a.name.localeCompare(b.name, "zh-TW")),
      reactions: reactionRows,
      myReaction:
        reactionRows.find((row) => row.userId === actor.userId)?.reaction ??
        null,
      canEdit: admin || photo.uploaderId === actor.userId,
      isAdmin: admin,
    }
  },
})

/** The uploader or a gallery admin; everyone else is refused. */
export async function requireEditor(actor: Actor, photoId: string) {
  const [photo] = await db
    .select({ uploaderId: photos.uploaderId, sequenceId: photos.sequenceId })
    .from(photos)
    .where(eq(photos.id, photoId))
  if (!photo) throw new Error("找不到這張照片")
  if (photo.uploaderId !== actor.userId && !(await isAdmin(actor)))
    throw new Error("只有上傳的人或管理員可以改")
  return photo
}

export const uploadPhoto = defineAction({
  name: "upload_photo",
  title: "上傳照片",
  description:
    "Stores one uploaded file as a photo or video. Called by the upload page after it streams the file to the server.",
  kind: "mutation",
  mcpExcludedBecause:
    "the file arrives as a server-side temp file from /api/upload, which an MCP client cannot supply",
  input: z.object({
    file: z.string(),
    contentType: z.string(),
    name: z.string().trim().min(1, "要有名稱").max(200),
    sequenceId: z.uuid().optional(),
    sequenceIndex: z.number().int().min(0).max(999).default(0),
  }),
  run: async (actor, input) => {
    // Only files the upload route wrote may be read.
    const file = resolve(input.file)
    if (!file.startsWith(`${uploadDir}/`)) throw new Error("Bad upload path")
    try {
      const mediaType = mediaTypeOf(input.contentType)
      if (!mediaType) throw new Error("只收照片和影片")
      const { size } = await stat(file)
      const limit = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
      if (size > limit) throw new Error(`檔案超過 ${limit / 1024 / 1024} MB`)
      const processed =
        mediaType === "image"
          ? await processImage(await readFile(file), input.contentType)
          : await processVideo(file)
      if (input.sequenceId) {
        // A sequence belongs to whoever started it.
        const [other] = await db
          .select({ uploaderId: photos.uploaderId })
          .from(photos)
          .where(eq(photos.sequenceId, input.sequenceId))
          .limit(1)
        if (other && other.uploaderId !== actor.userId)
          throw new Error("這組照片不是你的")
      }
      const id = randomUUID()
      await putPhotoFiles(id, [
        processed.original,
        { name: "thumb.webp", type: "image/webp", body: processed.thumb },
        { name: "large.webp", type: "image/webp", body: processed.large },
      ])
      try {
        await db.insert(photos).values({
          id,
          name: input.name,
          uploaderId: actor.userId,
          mediaType,
          original: processed.original.name,
          contentType: processed.original.type,
          bytes: processed.original.body.byteLength,
          width: processed.width,
          height: processed.height,
          durationSeconds: processed.durationSeconds,
          sequenceId: input.sequenceId ?? null,
          sequenceIndex: input.sequenceIndex,
          takenAt: processed.takenAt ?? new Date(),
        })
      } catch (error) {
        await deletePhotoFiles(id).catch(() => {})
        throw error
      }
      return { id }
    } finally {
      await rm(file, { force: true })
    }
  },
})

export const updatePhoto = defineAction({
  name: "update_photo",
  title: "編輯照片",
  description:
    "Renames a photo or changes when it was taken (ISO date-time). Only the uploader or a gallery admin.",
  kind: "mutation",
  input: z.object({
    id: z.uuid(),
    name: z.string().trim().min(1, "要有名稱").max(200).optional(),
    takenAt: z.coerce.date().optional(),
  }),
  run: async (actor, { id, name, takenAt }) => {
    await requireEditor(actor, id)
    if (name === undefined && takenAt === undefined) return { id }
    await db
      .update(photos)
      .set({ ...(name !== undefined && { name }), ...(takenAt && { takenAt }) })
      .where(eq(photos.id, id))
    return { id }
  },
})

export const deletePhoto = defineAction({
  name: "delete_photo",
  title: "刪除照片",
  description:
    "Deletes a photo with its files, reactions and faces. Only the uploader or a gallery admin. Cannot be undone.",
  kind: "mutation",
  input: z.object({ id: z.uuid() }),
  run: async (actor, { id }) => {
    await requireEditor(actor, id)
    await db.delete(photos).where(eq(photos.id, id))
    // The row goes first: a file left behind costs space, a row left
    // without files shows a broken card.
    await deletePhotoFiles(id).catch(() => {})
    return { id }
  },
})

export const setReaction = defineAction({
  name: "set_reaction",
  title: "回應照片",
  description:
    "Sets the caller's reaction to a photo (like, love, haha, wow, sad, angry, point, cheers), replacing any earlier one; null removes it.",
  kind: "mutation",
  input: z.object({
    photoId: z.uuid(),
    reaction: z
      .enum(["like", "love", "haha", "wow", "sad", "angry", "point", "cheers"])
      .nullable(),
  }),
  run: async (actor, { photoId, reaction }) => {
    if (reaction === null)
      await db
        .delete(photoReactions)
        .where(
          and(
            eq(photoReactions.photoId, photoId),
            eq(photoReactions.userId, actor.userId)
          )
        )
    else
      await db
        .insert(photoReactions)
        .values({ photoId, userId: actor.userId, reaction })
        .onConflictDoUpdate({
          target: [photoReactions.photoId, photoReactions.userId],
          set: { reaction, createdAt: new Date() },
        })
    return { photoId, reaction }
  },
})

export const listUploaders = defineAction({
  name: "list_uploaders",
  title: "上傳者",
  description:
    "Members who uploaded at least one photo, with how many, most first. Use an id as uploaderId in list_photos.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({
        id: user.id,
        name: user.name,
        count: sql<number>`count(*)::int`,
      })
      .from(photos)
      .innerJoin(user, eq(user.id, photos.uploaderId))
      .groupBy(user.id, user.name)
      .orderBy(desc(sql`count(*)`)),
})

export const getPhotoFile = defineAction({
  name: "get_photo_file",
  title: "照片檔案",
  description:
    "The stored file name and type of a photo, for the /media route.",
  kind: "query",
  mcpExcludedBecause:
    "the /media route serves the bytes; get_photo already tells agents the type",
  input: z.object({ id: z.uuid() }),
  run: async (_actor, { id }) => {
    const [row] = await db
      .select({
        original: photos.original,
        contentType: photos.contentType,
        name: photos.name,
      })
      .from(photos)
      .where(eq(photos.id, id))
    return row ?? null
  },
})
