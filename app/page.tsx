import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { runAction } from "@/lib/actions/define"
import { listPeople } from "@/lib/actions/faces"
import { listPhotos } from "@/lib/actions/photos"
import { requireActor } from "@/lib/auth/session"

import { PhotoWall } from "./photo-wall"

export const dynamic = "force-dynamic"

type Search = {
  tag?: string
  mine?: string
  person?: string
}

// The wall and nothing above it. A tag or a person on a photo page, or
// 我上傳的 on the profile, open it filtered; then one line says so.
export default async function Wall({ searchParams }: PageProps<"/">) {
  const search = (await searchParams) as Search
  // A mangled link shows the whole wall instead of failing.
  if (search.person && !/^[0-9a-f-]{36}$/.test(search.person))
    search.person = undefined
  const actor = await requireActor("/")
  const filters = {
    tag: search.tag || undefined,
    uploaderId: search.mine ? actor.userId : undefined,
    memberId: search.person || undefined,
  }
  const [{ photos, nextOffset }, people] = await Promise.all([
    runAction(listPhotos, actor, filters),
    search.person ? runAction(listPeople, actor, {}) : [],
  ])
  const person = people.find((p) => p.memberId === search.person)
  const filter = search.tag
    ? `#${search.tag}`
    : search.person
      ? (person?.name ?? "人物")
      : search.mine
        ? "我上傳的"
        : null

  return (
    <GalleryShell layout="wide">
      <div className="flex flex-col gap-8">
        {filter && (
          <div className="flex items-center gap-4">
            <h1 className="text-title font-medium">{filter}</h1>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground"
            >
              清除
            </Link>
          </div>
        )}
        {photos.length === 0 ? (
          <EmptyState noun="照片" />
        ) : (
          <PhotoWall
            key={JSON.stringify(filters)}
            photos={photos}
            filters={filters}
            offset={nextOffset}
          />
        )}
      </div>
    </GalleryShell>
  )
}
