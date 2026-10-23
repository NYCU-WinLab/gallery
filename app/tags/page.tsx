import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { isAdmin } from "@/lib/actions/authz"
import { runAction } from "@/lib/actions/define"
import { listTags } from "@/lib/actions/tags"
import { requireActor } from "@/lib/auth/session"

import { TagTools } from "./tag-tools"

export const dynamic = "force-dynamic"

export default async function TagsPage() {
  const actor = await requireActor("/tags")
  const [tags, admin] = await Promise.all([
    runAction(listTags, actor, {}),
    isAdmin(actor),
  ])
  return (
    <GalleryShell page={{ label: "標籤", href: "/tags", tip: "" }}>
      <div className="flex flex-col gap-8">
        <PageHeader title="標籤" />
        {tags.length === 0 && <EmptyState noun="標籤" />}
        <ul className="flex flex-col">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex min-h-14 items-center gap-4 border-b border-border py-2"
            >
              <Link
                href={`/?tag=${encodeURIComponent(tag.name)}`}
                className="flex-1 hover:text-muted-foreground"
              >
                #{tag.name}
              </Link>
              <span className="text-muted-foreground tabular-nums">
                {tag.count}
              </span>
              {admin && <TagTools id={tag.id} name={tag.name} />}
            </li>
          ))}
        </ul>
      </div>
    </GalleryShell>
  )
}
