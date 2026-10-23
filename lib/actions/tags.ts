import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { requireAdmin } from "@/lib/actions/authz"
import { defineAction } from "@/lib/actions/define"
import { requireEditor } from "@/lib/actions/photos"
import { db } from "@/lib/db"
import { photoTags, tags } from "@/lib/db/schema"

const tagName = z
  .string()
  .trim()
  .min(1, "標籤不能空白")
  .max(50, "標籤最多 50 字")
  .refine((name) => !/[,#]/.test(name), "標籤不能有逗號或 #")

export const listTags = defineAction({
  name: "list_tags",
  title: "標籤",
  description: "Every tag with how many photos carry it, most used first.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({
        id: tags.id,
        name: tags.name,
        count: sql<number>`(select count(*)::int from photo_tags pt where pt.tag_id = ${tags.id})`,
      })
      .from(tags)
      .orderBy(desc(sql`3`), asc(tags.name)),
})

export const setPhotoTags = defineAction({
  name: "set_photo_tags",
  title: "設定標籤",
  description:
    "Replaces a photo's tags with names, creating tags that do not exist yet. Only the uploader or a gallery admin.",
  kind: "mutation",
  input: z.object({ photoId: z.uuid(), names: z.array(tagName).max(20) }),
  run: async (actor, { photoId, names }) => {
    await requireEditor(actor, photoId)
    const unique = [...new Set(names)]
    await db.transaction(async (tx) => {
      if (unique.length > 0)
        await tx
          .insert(tags)
          .values(unique.map((name) => ({ name })))
          .onConflictDoNothing()
      const rows = unique.length
        ? await tx
            .select({ id: tags.id })
            .from(tags)
            .where(inArray(tags.name, unique))
        : []
      await tx.delete(photoTags).where(eq(photoTags.photoId, photoId))
      if (rows.length > 0)
        await tx
          .insert(photoTags)
          .values(rows.map((row) => ({ photoId, tagId: row.id })))
    })
    return { photoId, names: unique }
  },
})

export const renameTag = defineAction({
  name: "rename_tag",
  title: "改標籤名稱",
  description:
    "Renames a tag. If a tag with the new name exists, the two merge into it. Gallery admins only.",
  kind: "mutation",
  input: z.object({ id: z.uuid(), name: tagName }),
  run: async (actor, { id, name }) => {
    await requireAdmin(actor)
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name))
      if (existing && existing.id !== id) {
        // Move the photos over, skipping ones that already carry the target.
        await tx.execute(
          sql`insert into photo_tags (photo_id, tag_id) select photo_id, ${existing.id} from photo_tags where tag_id = ${id} on conflict do nothing`
        )
        await tx.delete(tags).where(eq(tags.id, id))
        return { id: existing.id, name, merged: true }
      }
      await tx.update(tags).set({ name }).where(eq(tags.id, id))
      return { id, name, merged: false }
    })
  },
})

export const deleteTag = defineAction({
  name: "delete_tag",
  title: "刪除標籤",
  description:
    "Deletes a tag and takes it off every photo. Gallery admins only.",
  kind: "mutation",
  input: z.object({ id: z.uuid() }),
  run: async (actor, { id }) => {
    await requireAdmin(actor)
    const removed = await db
      .delete(tags)
      .where(and(eq(tags.id, id)))
      .returning({ id: tags.id })
    if (removed.length === 0) throw new Error("找不到這個標籤")
    return { id }
  },
})
