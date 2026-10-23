// Turns an upload into the files the gallery keeps: the original (videos
// re-encoded to 720p H.264, HEIC turned into JPEG so every browser shows
// it), plus thumb.webp for the wall and large.webp for the viewer. Never
// touches the database; actions call it.
import { spawn } from "node:child_process"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import exifr from "exifr"
import sharp from "sharp"

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_VIDEO_SECONDS = 60

/** Where uploads wait while they are processed. */
export const uploadDir = join(tmpdir(), "gallery-uploads")

const imageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heic",
}
const videoTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
])

export function mediaTypeOf(contentType: string) {
  if (contentType in imageTypes) return "image" as const
  if (videoTypes.has(contentType)) return "video" as const
  return null
}

export type Processed = {
  original: { name: string; type: string; body: Uint8Array }
  thumb: Uint8Array
  large: Uint8Array
  width: number
  height: number
  durationSeconds: number | null
  takenAt: Date | null
}

// 480 wide fills a wall column at 2x; 2048 fills a laptop viewer at 2x.
async function variants(input: Buffer) {
  const base = sharp(input, { limitInputPixels: 100_000_000 }).rotate()
  const [thumb, large, meta] = await Promise.all([
    base.clone().resize({ width: 480 }).webp({ quality: 78 }).toBuffer(),
    base
      .clone()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer(),
    base.clone().toBuffer({ resolveWithObject: true }),
  ])
  return { thumb, large, width: meta.info.width, height: meta.info.height }
}

async function takenAtOf(input: Buffer) {
  try {
    const exif = await exifr.parse(input, ["DateTimeOriginal", "CreateDate"])
    const date = exif?.DateTimeOriginal ?? exif?.CreateDate
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

export async function processImage(
  input: Buffer,
  contentType: string
): Promise<Processed> {
  const takenAt = await takenAtOf(input)
  let original = {
    name: `original.${imageTypes[contentType]}`,
    type: contentType,
    body: new Uint8Array(input),
  }
  let source = input
  if (imageTypes[contentType] === "heic") {
    // sharp's prebuilt libvips reads no HEVC, so HEIC goes through libheif.
    const { default: convert } = await import("heic-convert")
    source = Buffer.from(
      await convert({ buffer: input, format: "JPEG", quality: 0.92 })
    )
    original = {
      name: "original.jpg",
      type: "image/jpeg",
      body: new Uint8Array(source),
    }
  }
  const { thumb, large, width, height } = await variants(source)
  return {
    original,
    thumb,
    large,
    width,
    height,
    durationSeconds: null,
    takenAt,
  }
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    child.stdout.on("data", (chunk) => (out += chunk))
    child.stderr.on("data", (chunk) => (err = (err + chunk).slice(-2000)))
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${command}: ${err}`))
    )
  })
}

export async function processVideo(file: string): Promise<Processed> {
  const probe = JSON.parse(
    await run("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      file,
    ]).catch(() => {
      // ffprobe's own message names temp paths; members get a plain one.
      throw new Error("讀不到這個影片")
    })
  ) as { format?: { duration?: string; tags?: { creation_time?: string } } }
  const duration = Number(probe.format?.duration ?? 0)
  if (!(duration > 0)) throw new Error("讀不到影片長度")
  if (duration > MAX_VIDEO_SECONDS + 1)
    throw new Error(`影片最長 ${MAX_VIDEO_SECONDS} 秒`)
  const created = probe.format?.tags?.creation_time
  const takenAt = created ? new Date(created) : null

  const id = crypto.randomUUID()
  const mp4 = join(uploadDir, `${id}.mp4`)
  const poster = join(uploadDir, `${id}.jpg`)
  try {
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      file,
      "-vf",
      "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,fps=30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      mp4,
    ])
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      String(Math.min(0.5, duration / 2)),
      "-i",
      mp4,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      poster,
    ])
    const [video, still] = await Promise.all([readFile(mp4), readFile(poster)])
    const { thumb, large, width, height } = await variants(still)
    return {
      original: {
        name: "original.mp4",
        type: "video/mp4",
        body: new Uint8Array(video),
      },
      thumb,
      large,
      width,
      height,
      durationSeconds: duration,
      takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
    }
  } finally {
    await Promise.all([rm(mp4, { force: true }), rm(poster, { force: true })])
  }
}
