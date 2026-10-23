import Link from "next/link"
import { notFound } from "next/navigation"

import { GalleryShell } from "@/components/gallery-shell"
import { SectionHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { listAlbums } from "@/lib/actions/albums"
import { listComments } from "@/lib/actions/comments"
import { runAction } from "@/lib/actions/define"
import { getPhoto } from "@/lib/actions/photos"
import { requireActor } from "@/lib/auth/session"
import { cn } from "@/lib/utils"

import { Comments } from "./comments"
import { PhotoActions } from "./photo-actions"
import { Reactions } from "./reactions"
import { Viewer } from "./viewer"

export const dynamic = "force-dynamic"

const dateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export default async function PhotoPage({ params }: PageProps<"/photos/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const actor = await requireActor(`/photos/${id}`)
  const photo = await runAction(getPhoto, actor, { id }).catch(() => null)
  if (!photo) notFound()
  const [{ comments, isAdmin }, albums] = await Promise.all([
    runAction(listComments, actor, { photoId: id }),
    runAction(listAlbums, actor, {}),
  ])
  const myAlbums = albums
    .filter((album) => photo.isAdmin || album.createdBy === actor.userId)
    .map(({ id, title }) => ({ id, title }))

  return (
    <GalleryShell
      layout="wide"
      page={{ label: photo.name, href: `/photos/${id}`, tip: "照片" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Viewer photo={photo} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-title font-medium break-words">
                {photo.name}
              </h1>
              <p className="text-muted-foreground">
                {photo.uploaderName ?? "已離開的成員"}，
                {dateTime.format(photo.takenAt)}
              </p>
            </div>
            <PhotoActions photo={photo} albums={myAlbums} />
          </div>
          {(photo.tags.length > 0 || photo.albums.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {photo.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/?tag=${encodeURIComponent(tag)}`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "rounded-full"
                  )}
                >
                  #{tag}
                </Link>
              ))}
              {photo.albums.map((album) => (
                <Link
                  key={album.slug}
                  href={`/albums/${album.slug}`}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "rounded-full"
                  )}
                >
                  {album.title}
                </Link>
              ))}
            </div>
          )}
          <Reactions
            photoId={photo.id}
            reactions={photo.reactions}
            mine={photo.myReaction}
          />
        </div>
        <section className="flex flex-col gap-4">
          <SectionHeader title={`留言 ${comments.length || ""}`.trim()} />
          <Comments photoId={photo.id} comments={comments} isAdmin={isAdmin} />
        </section>
      </div>
    </GalleryShell>
  )
}
