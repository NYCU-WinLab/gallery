import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { listAlbums } from "@/lib/actions/albums"
import { runAction } from "@/lib/actions/define"
import { requireActor } from "@/lib/auth/session"

import { CreateAlbum } from "./album-forms"

export const dynamic = "force-dynamic"

export default async function AlbumsPage() {
  const actor = await requireActor("/albums")
  const albums = await runAction(listAlbums, actor, {})
  return (
    <GalleryShell
      layout="wide"
      page={{ label: "相簿", href: "/albums", tip: "整理好的一組組照片" }}
    >
      <div className="flex flex-col gap-8">
        <PageHeader title="相簿" actions={<CreateAlbum />} />
        {albums.length === 0 ? (
          <EmptyState noun="相簿" action={<CreateAlbum />} />
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`/albums/${album.slug}`}
                  prefetch
                  className="group flex flex-col gap-2"
                >
                  <span className="block aspect-4/3 overflow-hidden rounded-control bg-muted">
                    {album.coverId && (
                      // eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session
                      <img
                        src={`/media/${album.coverId}/thumb`}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-opacity duration-state group-hover:opacity-90"
                      />
                    )}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {album.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {album.photoCount}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GalleryShell>
  )
}
