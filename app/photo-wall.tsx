"use client"

import * as React from "react"
import { toast } from "sonner"

import { PhotoCard, type GridPhoto } from "@/components/photo-grid"

import { loadPhotos } from "./actions"

// Column count by width, as Tailwind's sm and lg breakpoints would.
function columnsFor(width: number) {
  return width >= 1024 ? 4 : width >= 640 ? 3 : 2
}

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

// Masonry that keeps the wall's order: photos go left to right, each into
// the column that is shortest so far, so the newest sit along the top and a
// page loaded later only adds below. (CSS columns fill top to bottom and
// reshuffle everything when more arrive.)
export function PhotoWall({
  photos: first,
  filters,
  offset: firstOffset,
}: {
  photos: GridPhoto[]
  filters: Record<string, unknown>
  offset: number | null
}) {
  const [more, setMore] = React.useState<GridPhoto[]>([])
  const [offset, setOffset] = React.useState(firstOffset)
  const loading = React.useRef(false)
  const sentinel = React.useRef<HTMLDivElement>(null)
  const columns = React.useSyncExternalStore(
    subscribe,
    () => columnsFor(window.innerWidth),
    () => 4
  )

  React.useEffect(() => {
    const node = sentinel.current
    if (!node || offset === null) return
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loading.current) return
        loading.current = true
        const result = await loadPhotos({ ...filters, offset })
        loading.current = false
        if (result.error !== undefined) {
          toast.error(result.error)
          return
        }
        setMore((list) => [...list, ...result.data.photos])
        setOffset(result.data.nextOffset)
      },
      { rootMargin: "1200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [filters, offset])

  const stacks = React.useMemo(() => {
    const all = [
      ...first,
      ...more.filter((p) => !first.some((f) => f.id === p.id)),
    ]
    const stacks = Array.from({ length: columns }, () => ({
      height: 0,
      photos: [] as GridPhoto[],
    }))
    for (const photo of all) {
      const shortest = stacks.reduce((a, b) => (b.height < a.height ? b : a))
      shortest.photos.push(photo)
      // Height in column widths, plus the caption line.
      shortest.height += photo.height / photo.width + 0.15
    }
    return stacks
  }, [first, more, columns])

  return (
    <>
      <div className="flex items-start gap-4">
        {stacks.map((stack, i) => (
          <ul key={i} className="flex min-w-0 flex-1 flex-col gap-4">
            {stack.photos.map((photo) => (
              <li key={photo.id}>
                <PhotoCard photo={photo} />
              </li>
            ))}
          </ul>
        ))}
      </div>
      {offset !== null && <div ref={sentinel} aria-hidden className="h-px" />}
    </>
  )
}
