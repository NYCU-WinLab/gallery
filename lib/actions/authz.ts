import { eq } from "drizzle-orm"

import type { Actor } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { admins } from "@/lib/db/schema"

/** Whether the member is a gallery admin. */
export async function isAdmin(actor: Actor) {
  const [row] = await db
    .select({ userId: admins.userId })
    .from(admins)
    .where(eq(admins.userId, actor.userId))
    .limit(1)
  return Boolean(row)
}

/** The one check every admin-only action starts with. */
export async function requireAdmin(actor: Actor) {
  if (!(await isAdmin(actor))) throw new Error("需要管理員權限")
}
