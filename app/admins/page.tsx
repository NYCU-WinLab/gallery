import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { listAdmins, listMembers } from "@/lib/actions/admins"
import { isAdmin } from "@/lib/actions/authz"
import { runAction } from "@/lib/actions/define"
import { requireActor } from "@/lib/auth/session"

import { GrantDialog } from "./grant-dialog"
import { RevokeButton } from "./revoke-button"

export const dynamic = "force-dynamic"

export default async function AdminsPage() {
  const actor = await requireActor("/admins")
  const [admins, canEdit] = await Promise.all([
    runAction(listAdmins, actor, {}),
    isAdmin(actor),
  ])
  const members = canEdit ? await runAction(listMembers, actor, {}) : []

  return (
    <GalleryShell
      page={{
        label: "管理員",
        href: "/admins",
        tip: "置頂、管標籤、改任何照片",
      }}
    >
      <div className="flex flex-col gap-8">
        <PageHeader
          title="管理員"
          actions={canEdit && <GrantDialog members={members} />}
        />
        <ul className="flex stagger-rise flex-col">
          {admins.map((admin) => (
            <li
              key={admin.userId}
              className="flex min-h-14 items-center gap-4 border-b border-border py-2"
            >
              <span className="flex-1">{admin.name}</span>
              {canEdit && (
                <RevokeButton userId={admin.userId} name={admin.name} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </GalleryShell>
  )
}
