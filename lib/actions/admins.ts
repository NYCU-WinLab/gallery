import { and, asc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { requireAdmin } from "@/lib/actions/authz"
import { defineAction } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { account, admins, user } from "@/lib/db/schema"
import { labMembers } from "@/lib/keycloak"

export const listMembers = defineAction({
  name: "list_members",
  title: "成員名單",
  description:
    "Every WinLab member (Keycloak /lab-member, alumni included) and everyone who has signed in to the gallery: id, name (Chinese), account name and email, sorted by name. The id works wherever a member id is asked for, even for members who never signed in.",
  kind: "query",
  input: z.object({}),
  run: async () => {
    const [rows, lab] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          sub: account.accountId,
        })
        .from(user)
        .leftJoin(
          account,
          and(eq(account.userId, user.id), eq(account.providerId, "keycloak"))
        ),
      // Without Keycloak, the list is who has signed in.
      labMembers().catch(() => []),
    ])
    const known = new Set(rows.map((row) => row.sub))
    const bySub = new Map(lab.map((member) => [member.sub, member]))
    const members = [
      ...rows.map(({ id, name, username, email, sub }) => ({
        id,
        name,
        username,
        // Named before they signed in: show Keycloak's email, not the
        // placeholder.
        email: email.endsWith("@keycloak.invalid")
          ? (bySub.get(sub ?? "")?.email ?? "")
          : email,
      })),
      // Members who never signed in go by their Keycloak id until they do.
      ...lab
        .filter((member) => !known.has(member.sub))
        .map((member) => ({
          id: member.sub,
          name: member.name,
          username: member.username,
          email: member.email ?? "",
        })),
    ]
    return members.sort((a, b) => a.name.localeCompare(b.name, "zh-TW"))
  },
})

/** The gallery user for a member id from list_members. A lab member who
 * never signed in gets their user now, linked to their Keycloak account
 * the way sign-in links it, so their first sign-in lands on it. */
export async function memberUserId(id: string) {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, id))
  if (existing) return existing.id
  const [linked] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, "keycloak"), eq(account.accountId, id)))
  if (linked) return linked.userId
  const member = (await labMembers()).find((m) => m.sub === id)
  if (!member) throw new Error("找不到這位成員")
  return db.transaction(async (tx) => {
    // Two admins naming the same new member at once: the second waits here
    // and finds the first one's user.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`)
    const [again] = await tx
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, "keycloak"), eq(account.accountId, id)))
    if (again) return again.userId
    const [created] = await tx
      .insert(user)
      .values({
        name: member.name,
        // users.email is unique and required. A placeholder, never the real
        // email: a real one held here would block whoever Keycloak gives it
        // to next. Their first sign-in sets the Keycloak email.
        email: `${member.sub}@keycloak.invalid`,
        emailVerified: false,
        username: member.username,
      })
      .returning({ id: user.id })
    await tx.insert(account).values({
      accountId: member.sub,
      providerId: "keycloak",
      userId: created.id,
      updatedAt: new Date(),
    })
    return created.id
  })
}

export const listAdmins = defineAction({
  name: "list_admins",
  title: "管理員名單",
  description: "Gallery admins: they name faces and edit or delete any photo.",
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
    const memberId = await memberUserId(userId)
    const [added] = await db
      .insert(admins)
      .values({ userId: memberId, grantedBy: actor.userId })
      .onConflictDoNothing()
      .returning({ userId: admins.userId })
    if (!added) throw new Error("已經是管理員了")
    return { userId: memberId }
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
