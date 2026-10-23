// Photo files live in Nextcloud (WebDAV), under one folder of one account:
// <NEXTCLOUD_ROOT>/<photo id>/<file>. The account may hold other apps'
// files, so nothing here ever reaches outside that folder.

function config() {
  const url = process.env.NEXTCLOUD_URL
  const user = process.env.NEXTCLOUD_USER
  const password = process.env.NEXTCLOUD_APP_PASSWORD
  const root = process.env.NEXTCLOUD_ROOT || "gallery"
  if (!url || !user || !password) throw new Error("Nextcloud 沒有設定")
  return {
    base: `${url.replace(/\/$/, "")}/remote.php/dav/files/${encodeURIComponent(user)}/${root}`,
    authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
  }
}

const segment = /^[A-Za-z0-9._-]+$/

/** The folder of one photo, or a file in it. Rejects anything that could
 * climb out of the gallery folder. */
function path(photoId: string, file?: string) {
  if (!segment.test(photoId) || (file !== undefined && !segment.test(file)))
    throw new Error(`Bad Nextcloud path: ${photoId}/${file ?? ""}`)
  const { base } = config()
  return file ? `${base}/${photoId}/${file}` : `${base}/${photoId}/`
}

async function dav(method: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    method,
    headers: { authorization: config().authorization, ...init.headers },
  })
  return response
}

function fail(action: string, response: Response): never {
  throw new Error(`Nextcloud ${action} failed: ${response.status}`)
}

/** Stores the files of one photo, creating its folder first. */
export async function putPhotoFiles(
  photoId: string,
  files: { name: string; body: Uint8Array | ReadableStream; type: string }[]
) {
  const folder = await dav("MKCOL", path(photoId))
  // 405: the folder is already there.
  if (!folder.ok && folder.status !== 405) fail("MKCOL", folder)
  for (const file of files) {
    const response = await dav("PUT", path(photoId, file.name), {
      body: file.body as BodyInit,
      headers: { "content-type": file.type },
      // A stream body needs half duplex in Node's fetch.
      ...(file.body instanceof ReadableStream ? { duplex: "half" } : {}),
    } as RequestInit)
    if (!response.ok) fail("PUT", response)
  }
}

/** Streams one file; passes Range through so videos can seek. */
export async function getPhotoFile(
  photoId: string,
  file: string,
  range?: string | null
) {
  const response = await dav("GET", path(photoId, file), {
    headers: range ? { range } : {},
  })
  if (response.status === 404) return null
  if (!response.ok && response.status !== 206) fail("GET", response)
  return response
}

/** Deletes the photo's folder with every file in it. */
export async function deletePhotoFiles(photoId: string) {
  const response = await dav("DELETE", path(photoId))
  if (!response.ok && response.status !== 404) fail("DELETE", response)
}
