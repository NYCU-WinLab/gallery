import { eq, isNull, ne, or, sql, type SQLWrapper } from "drizzle-orm"

import { db } from "@/lib/db"
import { photos, photoVectors } from "@/lib/db/schema"
import { embedEnabled, embedName, embedPhoto, embedQuery } from "@/lib/embed"
import { getPhotoFile } from "@/lib/nextcloud"

// Search by meaning. Each photo has an image vector (what it shows) and a
// name vector; a search scores (q dot image) + 0.3 (q dot name), which on the lab's own
// photos beat either alone (top hit right for 16 of 20 test queries). Only
// photos well above that search's own average come back, so a query with
// nothing in the gallery returns little instead of everything.
const NAME_WEIGHT = 0.3
const KEEP_ABOVE_SD = 1.5
const MAX_RESULTS = 96

/** Cards that match query by meaning, best first: the id each wall card
 * shows (a sequence's first photo) with its best photo's score. Null when
 * the embedder is off or no photo has a vector yet, so callers fall back to
 * matching names. */
export async function searchByMeaning(query: string) {
  if (!embedEnabled()) return null
  let vector: number[]
  try {
    vector = await embedQuery(query)
  } catch {
    return null
  }
  const q = sql`${`{${vector.join(",")}}`}::real[]`
  const dot = (column: SQLWrapper) =>
    sql`(select sum(a * b) from unnest(${column}, ${q}) as t(a, b))`
  const rows = await db
    .select({
      id: photos.id,
      sequenceId: photos.sequenceId,
      sequenceIndex: photos.sequenceIndex,
      score: sql<number>`${dot(photoVectors.image)} + ${NAME_WEIGHT} * ${dot(photoVectors.name)}`,
    })
    .from(photoVectors)
    .innerJoin(photos, eq(photos.id, photoVectors.photoId))
  if (rows.length < 2) return null

  const scores = rows.map((row) => Number(row.score))
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const sd = Math.sqrt(
    scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
  )
  const cutoff = mean + KEEP_ABOVE_SD * sd
  // A sequence scores as its best photo and shows as its first.
  const cards = new Map<string, number>()
  for (const [i, row] of rows.entries()) {
    if (scores[i] < cutoff) continue
    const card = row.sequenceId ?? row.id
    cards.set(card, Math.max(cards.get(card) ?? -Infinity, scores[i]))
  }
  return [...cards]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RESULTS)
    .map(([card]) => card)
}

let running = false
// Photos whose file is missing; skipped until the server restarts so they
// cannot hold up the queue.
const missing = new Set<string>()

/** Embeds photos that have no vectors yet, or whose name changed since.
 * One photo at a time; returns how many it did. */
async function embedPending(limit: number) {
  const pending = await db
    .select({
      id: photos.id,
      name: photos.name,
      hasVector: sql<boolean>`${photoVectors.photoId} is not null`,
    })
    .from(photos)
    .leftJoin(photoVectors, eq(photoVectors.photoId, photos.id))
    .where(
      or(isNull(photoVectors.photoId), ne(photoVectors.nameText, photos.name))
    )
    .orderBy(sql`${photos.createdAt} desc`)
    .limit(limit + missing.size)
  let done = 0
  for (const photo of pending
    .filter((p) => !missing.has(p.id))
    .slice(0, limit)) {
    if (photo.hasVector) {
      const name = await embedName(photo.name)
      await db
        .update(photoVectors)
        .set({ name, nameText: photo.name, updatedAt: new Date() })
        .where(eq(photoVectors.photoId, photo.id))
      done++
      continue
    }
    const file = await getPhotoFile(photo.id, "large.webp")
    if (!file) {
      missing.add(photo.id)
      continue
    }
    const vectors = await embedPhoto(
      new Uint8Array(await file.arrayBuffer()),
      photo.name
    )
    await db
      .insert(photoVectors)
      .values({ photoId: photo.id, ...vectors, nameText: photo.name })
      .onConflictDoUpdate({
        target: photoVectors.photoId,
        set: { ...vectors, nameText: photo.name, updatedAt: new Date() },
      })
    done++
  }
  return done
}

/** Started once per server process: keeps vectors in step with photos,
 * checking every 30 seconds and right after a batch that found work. */
export function startEmbedder() {
  if (!embedEnabled() || running) return
  running = true
  const tick = async () => {
    let next = 30_000
    try {
      if ((await embedPending(4)) > 0) next = 0
    } catch (error) {
      console.error("embedder:", error instanceof Error ? error.message : error)
    }
    setTimeout(tick, next)
  }
  setTimeout(tick, 5_000)
}
