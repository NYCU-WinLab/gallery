import { notFound } from "next/navigation"

import { GalleryShell } from "@/components/gallery-shell"
import { runAction } from "@/lib/actions/define"
import { getPhoto } from "@/lib/actions/photos"
import { requireActor } from "@/lib/auth/session"

import { People } from "./people"
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

  return (
    <GalleryShell
      layout="wide"
      page={{ label: photo.name, href: `/photos/${id}`, tip: "" }}
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
            <PhotoActions photo={photo} />
          </div>
          {photo.people.length > 0 && (
            <People people={photo.people} isAdmin={photo.isAdmin} />
          )}
          <Reactions
            photoId={photo.id}
            reactions={photo.reactions}
            mine={photo.myReaction}
          />
        </div>
      </div>
    </GalleryShell>
  )
}
