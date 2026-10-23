"use client"

import Link from "next/link"
import { SearchIcon } from "lucide-react"
import * as React from "react"

import { loadPhotos } from "@/app/actions"
import { cornerLinkClassName } from "@/components/app-shell"
import { type GridPhoto } from "@/components/photo-grid"
import { UploadForm } from "@/components/upload-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// The gallery's actions, after the page tabs in the top right: search and
// upload, each over the page instead of a page of its own. Search also opens with / or Cmd+K.
export function GalleryCorners() {
  const [open, setOpen] = React.useState<"search" | "upload" | null>(null)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable]")
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault()
        setOpen("search")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const close = (next: boolean) => !next && setOpen(null)
  return (
    <>
      {/* Sets the actions apart from the page tabs before them. */}
      <span aria-hidden className="hidden h-4 w-px bg-border md:block" />
      <nav aria-label="動作" className="flex items-center gap-4">
        <button
          type="button"
          className={cornerLinkClassName}
          onClick={() => setOpen("search")}
        >
          搜尋
        </button>
        <button
          type="button"
          className={cornerLinkClassName}
          onClick={() => setOpen("upload")}
        >
          上傳
        </button>
      </nav>
      <Dialog open={open === "search"} onOpenChange={close}>
        <DialogContent size="wide" showCloseButton={false}>
          <SearchPanel onPick={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={open === "upload"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上傳</DialogTitle>
          </DialogHeader>
          <UploadForm onDone={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
    </>
  )
}

// Results as you type, by name, uploader and what the photo shows.
function SearchPanel({ onPick }: { onPick: () => void }) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<GridPhoto[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const latest = React.useRef(0)

  React.useEffect(() => {
    const text = query.trim()
    if (!text) return
    const ticket = ++latest.current
    const timer = setTimeout(async () => {
      const result = await loadPhotos({ query: text })
      // A slower answer to an older query never replaces a newer one.
      if (ticket !== latest.current) return
      setError(result.error ?? null)
      setResults(result.data?.photos ?? [])
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const shown = query.trim() ? results : null
  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="生日蛋糕、有人在睡覺"
          aria-label="搜尋照片"
          className="pl-9"
        />
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {shown && shown.length === 0 && !error && (
        <p className="text-center text-muted-foreground">
          找不到符合「{query.trim()}」的照片
        </p>
      )}
      {shown && shown.length > 0 && (
        <ul className="grid max-h-120 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {shown.map((photo) => (
            <li key={photo.id}>
              <Link
                href={`/photos/${photo.id}`}
                onClick={onPick}
                className="group block aspect-square overflow-hidden rounded-control bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
                <img
                  src={`/media/${photo.id}/thumb`}
                  alt={photo.name}
                  loading="lazy"
                  className="size-full object-cover transition-opacity duration-state group-hover:opacity-90"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
