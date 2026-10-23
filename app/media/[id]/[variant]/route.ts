import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { runAction } from "@/lib/actions/define"
import { getPhotoFile } from "@/lib/actions/photos"
import { getSession } from "@/lib/auth/session"
import { getPhotoFile as fetchFile } from "@/lib/nextcloud"

// Photos are for members only, so every file passes through here: the
// session is checked, then the file comes from Nextcloud. thumb and large
// never change once written, so they are kept on local disk after the first
// read; the original (videos included) streams through with Range intact.
const cacheDir = process.env.MEDIA_CACHE_DIR || join(tmpdir(), "gallery-cache")
const variants = new Set(["thumb", "large", "original"])
const forever = "private, max-age=31536000, immutable"

export async function GET(
  request: Request,
  { params }: RouteContext<"/media/[id]/[variant]">
) {
  const { id, variant } = await params
  if (!variants.has(variant) || !/^[0-9a-f-]{36}$/.test(id))
    return new Response("Not found", { status: 404 })
  const session = await getSession()
  if (!session) return new Response("Sign in first", { status: 401 })

  if (variant !== "original") {
    const cached = join(cacheDir, `${id}-${variant}.webp`)
    const hit = await readFile(cached).catch(() => null)
    if (hit)
      return new Response(hit, {
        headers: { "content-type": "image/webp", "cache-control": forever },
      })
    const response = await fetchFile(id, `${variant}.webp`)
    if (!response) return new Response("Not found", { status: 404 })
    const body = Buffer.from(await response.arrayBuffer())
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cached, body).catch(() => {})
    return new Response(body, {
      headers: { "content-type": "image/webp", "cache-control": forever },
    })
  }

  const photo = await runAction(
    getPhotoFile,
    { userId: session.user.id, via: "web" },
    { id }
  )
  if (!photo) return new Response("Not found", { status: 404 })
  const response = await fetchFile(
    id,
    photo.original,
    request.headers.get("range")
  )
  if (!response) return new Response("Not found", { status: 404 })
  const headers = new Headers({
    "content-type": photo.contentType,
    "cache-control": forever,
    "accept-ranges": "bytes",
  })
  for (const name of ["content-length", "content-range"]) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  if (new URL(request.url).searchParams.has("download"))
    headers.set(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`${photo.name}.${photo.original.split(".").pop()}`)}`
    )
  return new Response(response.body, { status: response.status, headers })
}
