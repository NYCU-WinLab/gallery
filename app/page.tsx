import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { PhotoCard, PhotoGrid } from "@/components/photo-grid"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { runAction } from "@/lib/actions/define"
import { listPhotos } from "@/lib/actions/photos"
import { listTags } from "@/lib/actions/tags"
import { requireActor } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

import { MorePhotos } from "./more-photos"

export const dynamic = "force-dynamic"

type Search = { q?: string; tag?: string; mine?: string; favorites?: string }

function chip(active: boolean) {
  return cn(
    buttonVariants({ variant: active ? "default" : "outline" }),
    "rounded-full"
  )
}

export default async function Wall({ searchParams }: PageProps<"/">) {
  const search = (await searchParams) as Search
  const actor = await requireActor("/")
  const filters = {
    query: search.q || undefined,
    tag: search.tag || undefined,
    uploaderId: search.mine ? actor.userId : undefined,
    favorites: search.favorites ? true : undefined,
  }
  const [{ photos, nextOffset }, tags] = await Promise.all([
    runAction(listPhotos, actor, filters),
    runAction(listTags, actor, {}),
  ])
  // Filters stack: each link keeps the others and flips its own.
  const href = (change: Partial<Search>) => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...search, ...change }))
      if (value) next.set(key, value)
    const query = next.toString()
    return query ? `/?${query}` : "/"
  }

  return (
    <GalleryShell layout="wide">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="照片牆"
          actions={
            <form action="/" className="flex gap-3">
              {search.tag && (
                <input type="hidden" name="tag" value={search.tag} />
              )}
              {search.mine && <input type="hidden" name="mine" value="1" />}
              {search.favorites && (
                <input type="hidden" name="favorites" value="1" />
              )}
              <Input
                name="q"
                defaultValue={search.q}
                placeholder="搜尋名稱、標籤、上傳者"
                className="w-64"
              />
            </form>
          }
        />
        <nav className="flex flex-wrap gap-2">
          <Link
            href={href({ mine: search.mine ? undefined : "1" })}
            className={chip(!!search.mine)}
          >
            我上傳的
          </Link>
          <Link
            href={href({ favorites: search.favorites ? undefined : "1" })}
            className={chip(!!search.favorites)}
          >
            收藏
          </Link>
          {tags.slice(0, 12).map((tag) => (
            <Link
              key={tag.id}
              href={href({
                tag: search.tag === tag.name ? undefined : tag.name,
              })}
              className={chip(search.tag === tag.name)}
            >
              #{tag.name}
            </Link>
          ))}
        </nav>
        {photos.length === 0 ? (
          <EmptyState
            noun="照片"
            query={search.q}
            action={
              <Link href="/upload" className={buttonVariants()}>
                上傳
              </Link>
            }
          />
        ) : (
          <PhotoGrid>
            {photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} />
            ))}
            <MorePhotos
              key={JSON.stringify(filters)}
              filters={filters}
              offset={nextOffset}
            />
          </PhotoGrid>
        )}
      </div>
    </GalleryShell>
  )
}
