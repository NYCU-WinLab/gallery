"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { cn } from "@/lib/utils"

type Photo = {
  id: string
  name: string
  mediaType: string
  width: number
  height: number
  sequence: { id: string; mediaType: string; width: number; height: number }[]
}

// The photo at full size (a video plays), then the rest of its sequence as
// a strip. Left and right arrows step through the sequence.
export function Viewer({ photo }: { photo: Photo }) {
  const router = useRouter()
  const index = photo.sequence.findIndex((item) => item.id === photo.id)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable]")
      )
        return
      const step =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
      const next = photo.sequence[index + step]
      if (step && next) router.replace(`/photos/${next.id}`, { scroll: false })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, photo.sequence, router])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center overflow-hidden rounded-surface bg-muted">
        {photo.mediaType === "video" ? (
          <video
            key={photo.id}
            src={`/media/${photo.id}/original`}
            poster={`/media/${photo.id}/large`}
            controls
            playsInline
            className="max-h-180 w-auto"
            width={photo.width}
            height={photo.height}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session
          <img
            key={photo.id}
            src={`/media/${photo.id}/large`}
            alt={photo.name}
            width={photo.width}
            height={photo.height}
            className="max-h-180 w-auto object-contain"
          />
        )}
      </div>
      {photo.sequence.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {photo.sequence.map((item) => (
            <li key={item.id} className="shrink-0">
              <Link
                href={`/photos/${item.id}`}
                replace
                scroll={false}
                aria-current={item.id === photo.id}
                className={cn(
                  "block overflow-hidden rounded-control border-2 transition-opacity duration-state",
                  item.id === photo.id
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
                <img
                  src={`/media/${item.id}/thumb`}
                  alt=""
                  className="size-16 object-cover"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
