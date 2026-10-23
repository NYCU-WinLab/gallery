import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import sharp from "sharp"

import { runAction } from "@/lib/actions/define"
import { getFace } from "@/lib/actions/faces"
import { getPhotoFile } from "@/lib/actions/photos"
import { getSession } from "@/lib/auth/session"
import { getPhotoFile as fetchFile } from "@/lib/nextcloud"

// Photos are for members only, so every file passes through here: the
// session is checked, then the file comes from Nextcloud. thumb and large
// never change once written, so they are kept on local disk after the first
// read; the original (videos included) streams through with Range intact.
// /media/<face id>/face is one face cut from its photo's large.webp.
const cacheDir = process.env.MEDIA_CACHE_DIR || join(tmpdir(), "gallery-cache")
const variants = new Set(["thumb", "large", "original", "face"])
const forever = "private, max-age=31536000, immutable"
const FACE_SIDE = 192
/** Room around the face box, as a share of its size. */
const FACE_MARGIN = 0.25

/** thumb or large, from local disk after the first read. */
async function cachedFile(id: string, variant: "thumb" | "large") {
  const cached = join(cacheDir, `${id}-${variant}.webp`)
  const hit = await readFile(cached).catch(() => null)
  if (hit) return hit
  const response = await fetchFile(id, `${variant}.webp`)
  if (!response) return null
  const body = Buffer.from(await response.arrayBuffer())
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cached, body).catch(() => {})
  return body
}

async function faceCrop(faceId: string, actor: { userId: string }) {
  const cached = join(cacheDir, `${faceId}-face.webp`)
  const hit = await readFile(cached).catch(() => null)
  if (hit) return hit
  const face = await runAction(
    getFace,
    { ...actor, via: "web" },
    { id: faceId }
  )
  if (!face) return null
  const large = await cachedFile(face.photoId, "large")
  if (!large) return null
  const { width = 0, height = 0 } = await sharp(large).metadata()
  const [x1, y1, x2, y2] = face.box
  const side =
    Math.max((x2 - x1) * width, (y2 - y1) * height) * (1 + 2 * FACE_MARGIN)
  const cx = ((x1 + x2) / 2) * width
  const cy = ((y1 + y2) / 2) * height
  const left = Math.max(0, Math.round(cx - side / 2))
  const top = Math.max(0, Math.round(cy - side / 2))
  const body = await sharp(large)
    .extract({
      left,
      top,
      width: Math.max(1, Math.min(width - left, Math.round(side))),
      height: Math.max(1, Math.min(height - top, Math.round(side))),
    })
    .resize(FACE_SIDE, FACE_SIDE, { fit: "cover" })
    .webp({ quality: 82 })
    .toBuffer()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(cached, body).catch(() => {})
  return body
}

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
    const body =
      variant === "face"
        ? await faceCrop(id, { userId: session.user.id })
        : await cachedFile(id, variant as "thumb" | "large")
    if (!body) return new Response("Not found", { status: 404 })
    return new Response(new Uint8Array(body), {
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
