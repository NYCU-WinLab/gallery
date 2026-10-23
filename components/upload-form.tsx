"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { FileUpload } from "@/components/file-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const MB = 1024 * 1024

/** IMG_0412.HEIC → IMG_0412 */
const baseName = (file: File) => file.name.replace(/\.[^.]+$/, "") || "未命名"

// Browsers leave some types empty or nonstandard (HEIC on Windows, .mov).
function typeOf(file: File) {
  if (file.type) return file.type === "image/jpg" ? "image/jpeg" : file.type
  const ext = file.name.split(".").pop()?.toLowerCase()
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    heic: "image/heic",
    heif: "image/heif",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mov: "video/quicktime",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
  }
  return byExt[ext ?? ""] ?? "image/jpeg"
}

/** PUT one file to /api/upload, reporting progress 0 to 1. */
function send(
  file: File,
  query: URLSearchParams,
  onProgress: (done: number) => void
) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", `/api/upload?${query}`)
    xhr.setRequestHeader("content-type", typeOf(file))
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress(event.loaded / event.total)
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}")
      if (xhr.status === 200) resolve(body)
      else reject(new Error(body.error ?? `上傳失敗（${xhr.status}）`))
    }
    xhr.onerror = () => reject(new Error("網路中斷"))
    xhr.send(file)
  })
}

export function UploadForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter()
  const [files, setFiles] = React.useState<File[]>([])
  const [names, setNames] = React.useState<string[]>([])
  const [together, setTogether] = React.useState(true)
  const [progress, setProgress] = React.useState<string | null>(null)

  function change(next: File[]) {
    setFiles(next)
    setNames(
      next.map((file, i) => (files[i] === file ? names[i] : baseName(file)))
    )
  }

  async function upload() {
    const sequenceId =
      together && files.length > 1 ? crypto.randomUUID() : undefined
    const done: string[] = []
    for (const [i, file] of files.entries()) {
      const query = new URLSearchParams({
        name: names[i] || baseName(file),
        sequenceIndex: String(i),
      })
      if (sequenceId) query.set("sequenceId", sequenceId)
      try {
        const { id } = await send(file, query, (part) =>
          setProgress(
            `${i + 1}/${files.length}，${Math.round(part * 100)}%${part >= 1 ? "，處理中" : ""}`
          )
        )
        done.push(id)
      } catch (error) {
        toast.error(
          `${file.name}：${error instanceof Error ? error.message : "上傳失敗"}`
        )
      }
    }
    setProgress(null)
    if (done.length === 0) return
    toast.success(`已上傳 ${done.length} 個`)
    onDone?.()
    router.push(done.length === 1 || sequenceId ? `/photos/${done[0]}` : "/")
  }

  const busy = progress !== null
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <FileUpload
        value={files}
        onValueChange={change}
        accept="image/*,video/*,.heic,.heif,.mov"
        acceptLabel="照片、影片（60 秒內）"
        maxSize={100 * MB}
        multiple
        paste
        disabled={busy}
        className="w-full"
      />
      {files.length > 0 && (
        <ul className="flex w-full flex-col">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-4 border-b border-border py-2"
            >
              <span className="w-40 shrink-0 truncate text-muted-foreground">
                {file.name}
              </span>
              <Input
                aria-label={`${file.name} 的名稱`}
                value={names[i] ?? ""}
                maxLength={200}
                disabled={busy}
                onChange={(event) =>
                  setNames((list) =>
                    list.map((name, j) => (j === i ? event.target.value : name))
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      {files.length > 1 && (
        <Label className="flex items-center gap-3">
          <Switch
            checked={together}
            onCheckedChange={setTogether}
            disabled={busy}
          />
          在照片牆上合成一張卡
        </Label>
      )}
      <div className="flex flex-col items-center gap-2">
        {progress && (
          <span className="text-muted-foreground tabular-nums">{progress}</span>
        )}
        <Button onClick={upload} disabled={busy || files.length === 0}>
          {busy ? "上傳中…" : `上傳 ${files.length || ""}`.trim()}
        </Button>
      </div>
    </div>
  )
}
