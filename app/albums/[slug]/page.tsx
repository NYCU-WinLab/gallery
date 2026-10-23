import { notFound } from "next/navigation"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { PhotoCard, PhotoGrid } from "@/components/photo-grid"
import { getAlbum } from "@/lib/actions/albums"
import { runAction } from "@/lib/actions/define"
import { requireActor } from "@/lib/auth/session"

import { AlbumPhotoTools, EditAlbum } from "../album-forms"

export const dynamic = "force-dynamic"

export default async function AlbumPage({
  params,
}: PageProps<"/albums/[slug]">) {
  const { slug } = await params
  const actor = await requireActor(`/albums/${slug}`)
  const album = await runAction(getAlbum, actor, { slug }).catch(() => null)
  if (!album) notFound()
  const cover = album.coverPhotoId ?? album.photos[0]?.id

  return (
    <GalleryShell
      layout="wide"
      page={{
        label: album.title,
        href: `/albums/${slug}`,
        tip: `${album.createdByName ?? "已離開的成員"} 建立`,
      }}
    >
      <div className="flex flex-col gap-8">
        <PageHeader
          title={album.title}
          actions={album.canEdit && <EditAlbum album={album} />}
        />
        {album.description && (
          <p className="whitespace-pre-wrap text-muted-foreground">
            {album.description}
          </p>
        )}
        {album.photos.length === 0 ? (
          <EmptyState noun="照片" />
        ) : (
          <PhotoGrid>
            {album.photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                footer={
                  album.canEdit && (
                    <AlbumPhotoTools
                      albumId={album.id}
                      photoId={photo.id}
                      cover={photo.id === cover}
                    />
                  )
                }
              />
            ))}
          </PhotoGrid>
        )}
      </div>
    </GalleryShell>
  )
}
