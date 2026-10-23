import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { runAction } from "@/lib/actions/define"
import { listPhotos } from "@/lib/actions/photos"
import { requireActor } from "@/lib/auth/session"

import { PhotoWall } from "./photo-wall"

export const dynamic = "force-dynamic"

type Search = { tag?: string; mine?: string; favorites?: string }

// The wall and nothing above it. A tag on a photo page, or 我上傳的 and
// 收藏 on the profile, open it filtered; then one line says so.
export default async function Wall({ searchParams }: PageProps<"/">) {
  const search = (await searchParams) as Search
  const actor = await requireActor("/")
  const filters = {
    tag: search.tag || undefined,
    uploaderId: search.mine ? actor.userId : undefined,
    favorites: search.favorites ? true : undefined,
  }
  const { photos, nextOffset } = await runAction(listPhotos, actor, filters)
  const filter = search.tag
    ? `#${search.tag}`
    : search.mine
      ? "我上傳的"
      : search.favorites
        ? "收藏"
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
