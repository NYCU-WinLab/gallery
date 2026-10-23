import Link from "next/link"
import { CopyIcon, PlayIcon } from "lucide-react"

import { reactionEmoji, type ReactionName } from "@/lib/reactions"

export type GridPhoto = {
  id: string
  name: string
  mediaType: string
  width: number
  height: number
  durationSeconds: number | null
  sequenceSize?: number
  /** How many picked each reaction. */
  reactionCounts?: Record<string, number>
}

/** 0:42 */
export function duration(seconds: number) {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// One card on a wall: the thumbnail at its own shape, with what the
// thumbnail cannot show (a video, a set of photos) in the corner,
// and the reactions under it, each with its count when more than one.
export function PhotoCard({ photo }: { photo: GridPhoto }) {
  const reactions = (Object.keys(reactionEmoji) as ReactionName[]).filter(
    (name) => (photo.reactionCounts?.[name] ?? 0) > 0
  )
  return (
    <Link href={`/photos/${photo.id}`} className="group flex flex-col gap-2">
      <span className="relative block overflow-hidden rounded-control bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
        <img
          src={`/media/${photo.id}/thumb`}
          alt={photo.name}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full transition-opacity duration-state group-hover:opacity-90"
        />
        <span className="absolute top-2 right-2 flex gap-1">
          {photo.mediaType === "video" && (
            <Badge>
              <PlayIcon />
              {photo.durationSeconds ? duration(photo.durationSeconds) : null}
            </Badge>
          )}
          {(photo.sequenceSize ?? 1) > 1 && (
            <Badge>
              <CopyIcon />
              {photo.sequenceSize}
            </Badge>
          )}
        </span>
      </span>
      <span className="flex items-center gap-3 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{photo.name}</span>
        {reactions.length > 0 && (
          <span className="flex shrink-0 items-center gap-2 tabular-nums">
            {reactions.map((name) => (
              <span key={name} className="flex items-center gap-1">
                <span>{reactionEmoji[name]}</span>
                {photo.reactionCounts![name] > 1 && photo.reactionCounts![name]}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 items-center gap-1 rounded-full bg-background/80 px-2 tabular-nums backdrop-blur-md [&_svg]:size-4">
      {children}
    </span>
  )
}
