import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import { requireAdmin } from "@/lib/actions/authz"
import { defineAction } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { admins, user } from "@/lib/db/schema"

export const listMembers = defineAction({
  name: "list_members",
  title: "成員名單",
  description:
    "Every member who has signed in to the gallery: id, name (Chinese), account name and email, sorted by name.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
      })
      .from(user)
      .orderBy(asc(user.name)),
})

export const listAdmins = defineAction({
  name: "list_admins",
  title: "管理員名單",
  description:
    "Gallery admins: they name faces, run the tags, and edit or delete any photo.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({ userId: user.id, name: user.name })
      .from(admins)
      .innerJoin(user, eq(user.id, admins.userId))
      .orderBy(asc(user.name)),
})

const memberInput = z.object({ userId: z.uuid("請選擇成員") })

export const grantAdmin = defineAction({
  name: "grant_admin",
  title: "新增管理員",
  description:
    "Makes a member a gallery admin. Admins only; userId comes from list_members.",
  kind: "mutation",
  input: memberInput,
  run: async (actor, { userId }) => {
    await requireAdmin(actor)
    const [added] = await db
      .insert(admins)
      .values({ userId, grantedBy: actor.userId })
      .onConflictDoNothing()
      .returning({ userId: admins.userId })
    if (!added) throw new Error("已經是管理員了")
    return { userId }
  },
})

export const revokeAdmin = defineAction({
  name: "revoke_admin",
  title: "移除管理員",
  description:
    "Removes a gallery admin. Admins only; the last admin cannot be removed.",
  kind: "mutation",
  input: memberInput,
  run: async (actor, { userId }) => {
    await requireAdmin(actor)
    return db.transaction(async (tx) => {
      // Lock every row so two revokes at once cannot both pass.
      const rows = await tx
        .select({ userId: admins.userId })
        .from(admins)
        .for("update")
      if (!rows.some((row) => row.userId === userId))
        throw new Error("他不是管理員")
      if (rows.length <= 1) throw new Error("至少要留 1 位管理員")
      await tx.delete(admins).where(eq(admins.userId, userId))
      return { userId }
    })
  },
})
