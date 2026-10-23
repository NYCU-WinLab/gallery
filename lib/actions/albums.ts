import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { isAdmin } from "@/lib/actions/authz"
import { defineAction, type Actor } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { albumPhotos, albums, photos, user } from "@/lib/db/schema"

const title = z.string().trim().min(1, "要有標題").max(100, "標題最多 100 字")
const description = z.string().trim().max(1000, "說明最多 1000 字")

const photoCount = sql<number>`(select count(*)::int from album_photos ap where ap.album_id = ${albums.id})`
// The cover: the chosen one, else the album's first photo.
const coverId = sql<
  string | null
>`coalesce(${albums.coverPhotoId}, (select ap.photo_id from album_photos ap where ap.album_id = ${albums.id} order by ap.position limit 1))`

export const listAlbums = defineAction({
  name: "list_albums",
  title: "相簿",
  description:
    "Every album, most recently changed first, with photo count and cover photo id. Open one with get_album by slug.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({
        id: albums.id,
        slug: albums.slug,
        title: albums.title,
        description: albums.description,
        photoCount,
        coverId,
        createdBy: albums.createdBy,
        createdByName: user.name,
        updatedAt: albums.updatedAt,
      })
      .from(albums)
      .leftJoin(user, eq(user.id, albums.createdBy))
      .orderBy(desc(albums.updatedAt)),
})

async function canEditAlbum(actor: Actor, createdBy: string | null) {
  return createdBy === actor.userId || (await isAdmin(actor))
}

export const getAlbum = defineAction({
  name: "get_album",
  title: "相簿內容",
  description:
    "One album by slug: title, description, creator, its photos in order, and whether the caller may edit it.",
  kind: "query",
  input: z.object({ slug: z.string() }),
  run: async (actor, { slug }) => {
    const [album] = await db
      .select({
        id: albums.id,
        slug: albums.slug,
        title: albums.title,
        description: albums.description,
        coverPhotoId: albums.coverPhotoId,
        createdBy: albums.createdBy,
        createdByName: user.name,
      })
      .from(albums)
      .leftJoin(user, eq(user.id, albums.createdBy))
      .where(eq(albums.slug, slug))
    if (!album) throw new Error("找不到這本相簿")
    const rows = await db
      .select({
        id: photos.id,
        name: photos.name,
        mediaType: photos.mediaType,
        width: photos.width,
        height: photos.height,
        durationSeconds: photos.durationSeconds,
        takenAt: photos.takenAt,
      })
      .from(albumPhotos)
      .innerJoin(photos, eq(photos.id, albumPhotos.photoId))
      .where(eq(albumPhotos.albumId, album.id))
      .orderBy(asc(albumPhotos.position))
    return {
      ...album,
      photos: rows,
      canEdit: await canEditAlbum(actor, album.createdBy),
    }
  },
})

async function editableAlbum(actor: Actor, id: string) {
  const [album] = await db
    .select({ createdBy: albums.createdBy })
    .from(albums)
    .where(eq(albums.id, id))
  if (!album) throw new Error("找不到這本相簿")
  if (!(await canEditAlbum(actor, album.createdBy)))
    throw new Error("只有建立的人或管理員可以改")
}

export const createAlbum = defineAction({
  name: "create_album",
  title: "建立相簿",
  description:
    "Creates an album, optionally with photos in the given order. Returns its slug.",
  kind: "mutation",
  input: z.object({
    title,
    description: description.default(""),
    photoIds: z.array(z.uuid()).max(500).default([]),
  }),
  run: async (actor, input) => {
    const slug = crypto.randomUUID().slice(0, 8)
    return db.transaction(async (tx) => {
      const [album] = await tx
        .insert(albums)
        .values({
          slug,
          title: input.title,
          description: input.description,
          createdBy: actor.userId,
        })
        .returning({ id: albums.id, slug: albums.slug })
      const ids = [...new Set(input.photoIds)]
      if (ids.length > 0)
        await tx.insert(albumPhotos).values(
          ids.map((photoId, position) => ({
            albumId: album.id,
            photoId,
            position,
          }))
        )
      return album
    })
  },
})

export const updateAlbum = defineAction({
  name: "update_album",
  title: "編輯相簿",
  description:
    "Changes an album's title, description or cover photo (one of its photos; null for the first). Creator or gallery admin.",
  kind: "mutation",
  input: z.object({
    id: z.uuid(),
    title: title.optional(),
    description: description.optional(),
    coverPhotoId: z.uuid().nullable().optional(),
  }),
  run: async (actor, { id, ...changes }) => {
    await editableAlbum(actor, id)
    await db
      .update(albums)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(albums.id, id))
    return { id }
  },
})

export const deleteAlbum = defineAction({
  name: "delete_album",
  title: "刪除相簿",
  description:
    "Deletes an album. Its photos stay on the wall. Creator or gallery admin.",
  kind: "mutation",
  input: z.object({ id: z.uuid() }),
  run: async (actor, { id }) => {
    await editableAlbum(actor, id)
    await db.delete(albums).where(eq(albums.id, id))
    return { id }
  },
})

export const setAlbumPhotos = defineAction({
  name: "set_album_photos",
  title: "排列相簿照片",
  description:
    "Adds photos to an album (add), removes them (remove), or sets the whole order (order: every photo id in the album, in the new order). Creator or gallery admin.",
  kind: "mutation",
  input: z.object({
    id: z.uuid(),
    add: z.array(z.uuid()).max(500).default([]),
    remove: z.array(z.uuid()).max(500).default([]),
    order: z.array(z.uuid()).max(2000).optional(),
  }),
  run: async (actor, { id, add, remove, order }) => {
    await editableAlbum(actor, id)
    await db.transaction(async (tx) => {
      // Lock the album so two editors cannot interleave positions.
      await tx
        .select({ id: albums.id })
        .from(albums)
        .where(eq(albums.id, id))
        .for("update")
      if (remove.length > 0)
        await tx
          .delete(albumPhotos)
          .where(
            and(
              eq(albumPhotos.albumId, id),
              inArray(albumPhotos.photoId, remove)
            )
          )
      if (add.length > 0) {
        const [{ next }] = await tx
          .select({
            next: sql<number>`coalesce(max(${albumPhotos.position}) + 1, 0)::int`,
          })
          .from(albumPhotos)
          .where(eq(albumPhotos.albumId, id))
        await tx
          .insert(albumPhotos)
          .values(
            [...new Set(add)].map((photoId, i) => ({
              albumId: id,
              photoId,
              position: next + i,
            }))
          )
          .onConflictDoNothing()
      }
      if (order) {
        const current = await tx
          .select({ photoId: albumPhotos.photoId })
          .from(albumPhotos)
          .where(eq(albumPhotos.albumId, id))
        const same =
          current.length === new Set(order).size &&
          current.every((row) => order.includes(row.photoId))
        if (!same) throw new Error("順序要列出相簿裡每一張照片")
        for (const [position, photoId] of order.entries())
          await tx
            .update(albumPhotos)
            .set({ position })
            .where(
              and(eq(albumPhotos.albumId, id), eq(albumPhotos.photoId, photoId))
            )
      }
      await tx
        .update(albums)
        .set({ updatedAt: new Date() })
        .where(eq(albums.id, id))
    })
    return { id }
  },
})
