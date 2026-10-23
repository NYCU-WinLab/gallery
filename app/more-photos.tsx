"use client"

import * as React from "react"
import { toast } from "sonner"

import { PhotoCard, type GridPhoto } from "@/components/photo-grid"

import { loadPhotos } from "./actions"

// The rest of the wall, a page at a time as the member scrolls near the end.
// The wall keys it by its filters, so a new filter starts it over.
export function MorePhotos({
  filters,
  offset: first,
}: {
  filters: Record<string, unknown>
  offset: number | null
}) {
  const [photos, setPhotos] = React.useState<GridPhoto[]>([])
  const [offset, setOffset] = React.useState(first)
  const loading = React.useRef(false)
  const sentinel = React.useRef<HTMLLIElement>(null)
  const key = JSON.stringify(filters)

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
        setPhotos((list) => [...list, ...result.data.photos])
        setOffset(result.data.nextOffset)
      },
      { rootMargin: "1200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is key
  }, [key, offset])

  return (
    <>
      {photos.map((photo) => (
        <PhotoCard key={photo.id} photo={photo} />
      ))}
      {offset !== null && <li ref={sentinel} aria-hidden className="h-px" />}
    </>
  )
}
