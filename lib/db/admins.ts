import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { user } from "@/lib/db/auth-schema"

// Gallery admins: they name faces and edit or delete any photo. One row per
// admin, so two admins editing at once cannot overwrite each other.
export const admins = pgTable("admins", {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  grantedBy: uuid().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})
