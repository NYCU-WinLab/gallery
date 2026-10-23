import { and, asc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { isAdmin, requireAdmin } from "@/lib/actions/authz"
import { defineAction, type Actor } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { commentLikes, comments, photos, user } from "@/lib/db/schema"

const body = z
  .string()
  .trim()
  .min(1, "留言不能空白")
  .max(2000, "留言最多 2000 字")

export const listComments = defineAction({
  name: "list_comments",
  title: "留言",
  description:
    "Comments on a photo, oldest first, pinned ones first. A reply has parentId. Each carries its like count, whether the caller liked it, and whether the caller may edit or delete it.",
  kind: "query",
  input: z.object({ photoId: z.uuid() }),
  run: async (actor, { photoId }) => {
    const [rows, admin] = await Promise.all([
      db
        .select({
          id: comments.id,
          parentId: comments.parentId,
          body: comments.body,
          authorId: comments.authorId,
          authorName: user.name,
          pinnedAt: comments.pinnedAt,
          createdAt: comments.createdAt,
          edited: sql<boolean>`${comments.updatedAt} > ${comments.createdAt} + interval '1 second'`,
          likes: sql<number>`(select count(*)::int from comment_likes l where l.comment_id = ${comments.id})`,
          liked: sql<boolean>`exists (select 1 from comment_likes l where l.comment_id = ${comments.id} and l.user_id = ${actor.userId})`,
        })
        .from(comments)
        .leftJoin(user, eq(user.id, comments.authorId))
        .where(eq(comments.photoId, photoId))
        .orderBy(
          sql`${comments.pinnedAt} desc nulls last`,
          asc(comments.createdAt)
        ),
      isAdmin(actor),
    ])
    return {
      comments: rows.map((row) => ({
        ...row,
        canEdit: row.authorId === actor.userId,
        canDelete: admin || row.authorId === actor.userId,
      })),
      isAdmin: admin,
    }
  },
})

export const addComment = defineAction({
  name: "add_comment",
  title: "留言",
  description:
    "Comments on a photo, or replies to a comment on it with parentId. @name mentions are plain text.",
  kind: "mutation",
  input: z.object({ photoId: z.uuid(), parentId: z.uuid().optional(), body }),
  run: async (actor, { photoId, parentId, body }) => {
    const [photo] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.id, photoId))
    if (!photo) throw new Error("找不到這張照片")
    if (parentId) {
      const [parent] = await db
        .select({ photoId: comments.photoId })
        .from(comments)
        .where(eq(comments.id, parentId))
      if (parent?.photoId !== photoId) throw new Error("找不到要回覆的留言")
    }
    const [row] = await db
      .insert(comments)
      .values({ photoId, parentId, body, authorId: actor.userId })
      .returning({ id: comments.id })
    return row
  },
})

async function ownComment(actor: Actor, id: string) {
  const [row] = await db
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, id))
  if (!row) throw new Error("找不到這則留言")
  return row.authorId === actor.userId
}

export const editComment = defineAction({
  name: "edit_comment",
  title: "編輯留言",
  description: "Changes the text of the caller's own comment.",
  kind: "mutation",
  input: z.object({ id: z.uuid(), body }),
  run: async (actor, { id, body }) => {
    if (!(await ownComment(actor, id))) throw new Error("只能改自己的留言")
    await db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(eq(comments.id, id))
    return { id }
  },
})

export const deleteComment = defineAction({
  name: "delete_comment",
  title: "刪除留言",
  description:
    "Deletes a comment and its replies. The author or a gallery admin.",
  kind: "mutation",
  input: z.object({ id: z.uuid() }),
  run: async (actor, { id }) => {
    if (!(await ownComment(actor, id)) && !(await isAdmin(actor)))
      throw new Error("只能刪自己的留言")
    await db.delete(comments).where(eq(comments.id, id))
    return { id }
  },
})

export const pinComment = defineAction({
  name: "pin_comment",
  title: "置頂留言",
  description:
    "Pins a comment to the top of its photo's comments, or unpins it. Gallery admins only.",
  kind: "mutation",
  input: z.object({ id: z.uuid(), pinned: z.boolean() }),
  run: async (actor, { id, pinned }) => {
    await requireAdmin(actor)
    await db
      .update(comments)
      .set({ pinnedAt: pinned ? new Date() : null })
      .where(eq(comments.id, id))
    return { id, pinned }
  },
})

export const likeComment = defineAction({
  name: "like_comment",
  title: "喜歡留言",
  description: "Likes a comment, or takes the like back.",
  kind: "mutation",
  input: z.object({ id: z.uuid(), liked: z.boolean() }),
  run: async (actor, { id, liked }) => {
    if (liked)
      await db
        .insert(commentLikes)
        .values({ commentId: id, userId: actor.userId })
        .onConflictDoNothing()
    else
      await db
        .delete(commentLikes)
        .where(
          and(
            eq(commentLikes.commentId, id),
            eq(commentLikes.userId, actor.userId)
          )
        )
    return { id, liked }
  },
})
