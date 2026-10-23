import { createWriteStream } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

import { errorMessage, runAction } from "@/lib/actions/define"
import { uploadPhoto } from "@/lib/actions/photos"
import { getSession } from "@/lib/auth/session"
import { MAX_VIDEO_BYTES, uploadDir } from "@/lib/media"

// One file per request, as the raw body: PUT /api/upload?name=&sequenceId=
// &sequenceIndex= with the file's type as content-type. The body streams to
// a temp file, so a 100 MB video never sits in memory, then upload_photo
// takes it from there.
export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: "請先登入" }, { status: 401 })
  if (!request.body)
    return Response.json({ error: "沒有檔案" }, { status: 400 })
  const params = new URL(request.url).searchParams
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()

  await mkdir(uploadDir, { recursive: true })
  const file = join(uploadDir, crypto.randomUUID())
  let size = 0
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream
      ),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length
          done(size > MAX_VIDEO_BYTES ? new Error("檔案太大") : null, chunk)
        },
      }),
      createWriteStream(file)
    )
    const result = await runAction(
      uploadPhoto,
      { userId: session.user.id, via: "web" },
      {
        file,
        contentType,
        name: params.get("name") ?? "",
        sequenceId: params.get("sequenceId") || undefined,
        sequenceIndex: Number(params.get("sequenceIndex") ?? 0),
      }
    )
    return Response.json(result)
  } catch (error) {
    await rm(file, { force: true })
    return Response.json({ error: errorMessage(error) }, { status: 400 })
  }
}
