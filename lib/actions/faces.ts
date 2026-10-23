import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { z } from "zod"

import { requireAdmin } from "@/lib/actions/authz"
import { defineAction } from "@/lib/actions/define"
import { db } from "@/lib/db"
import { faces, faceScans, photos, user } from "@/lib/db/schema"
import { embedEnabled, findFaces } from "@/lib/embed"
import { getPhotoFile } from "@/lib/nextcloud"

// Faces: the embed service finds them in each photo; an admin names a group
// of them; faces close enough to a named one get the same name. Thresholds
// come from a test on the lab's own 274 photos (buffalo_l, cosine
// similarity): with these, every group held one person and no person split.
/** Faces the detector is less sure of are mostly hands, bottles and backs of heads. */
const MIN_SCORE = 0.7
/** Smaller faces (in large.webp pixels) are too blurry to tell apart. */
const MIN_SIDE = 40
/** A face this close to one an admin named gets the same name. */
const MATCH = 0.5
/** Faces this close are grouped for an admin to name... */
const GROUP = 0.45
/** ...when one of them has at least this many such neighbours, itself included. */
const GROUP_CORE = 3
const MAX_GROUPS = 40

const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

/** The closest named face's member, when close enough. */
function nearest(
  vector: Float32Array,
  named: { memberId: string; vector: Float32Array }[]
) {
  let best: string | null = null
  let bestScore = MATCH
  for (const face of named) {
    const score = dot(vector, face.vector)
    if (score >= bestScore) {
      best = face.memberId
      bestScore = score
    }
  }
  return best
}

async function namedFaces() {
  const rows = await db
    .select({ memberId: faces.memberId, vector: faces.vector })
    .from(faces)
    .where(
      and(eq(faces.labeledBy, "admin"), sql`${faces.memberId} is not null`)
    )
  return rows.map((row) => ({
    memberId: row.memberId!,
    vector: Float32Array.from(row.vector),
  }))
}

/** Names faces nobody decided on (or the matcher did) after the faces an
 * admin named; ids limits it to those faces. Returns how many changed. */
async function matchFaces(ids?: string[]) {
  const named = await namedFaces()
  const open = await db
    .select({ id: faces.id, vector: faces.vector, memberId: faces.memberId })
    .from(faces)
    .where(
      and(
        or(isNull(faces.labeledBy), eq(faces.labeledBy, "auto")),
        ids ? inArray(faces.id, ids) : undefined
      )
    )
  const moves = new Map<string | null, string[]>()
  for (const face of open) {
    const member = nearest(Float32Array.from(face.vector), named)
    if (member === face.memberId) continue
    moves.set(member, [...(moves.get(member) ?? []), face.id])
  }
  // Checked again on write: an admin may have decided on a face since it
  // was read, and the matcher never overrides an admin.
  for (const [member, faceIds] of moves)
    await db
      .update(faces)
      .set({
        memberId: member,
        labeledBy: member ? "auto" : null,
        labeledAt: member ? new Date() : null,
      })
      .where(
        and(
          inArray(faces.id, faceIds),
          or(isNull(faces.labeledBy), eq(faces.labeledBy, "auto"))
        )
      )
  return [...moves.values()].reduce((n, list) => n + list.length, 0)
}

/** Groups of faces likely to be one person (DBSCAN on cosine similarity),
 * largest first. Faces in no group are left out. */
function group(vectors: Float32Array[]) {
  const neighbours = vectors.map((_, i) => [i])
  for (let i = 0; i < vectors.length; i++)
    for (let j = i + 1; j < vectors.length; j++)
      if (dot(vectors[i], vectors[j]) >= GROUP) {
        neighbours[i].push(j)
        neighbours[j].push(i)
      }
  const label = new Array<number>(vectors.length).fill(-1)
  const groups: number[][] = []
  for (let i = 0; i < vectors.length; i++) {
    if (label[i] !== -1 || neighbours[i].length < GROUP_CORE) continue
    const members: number[] = []
    const queue = [i]
    label[i] = groups.length
    while (queue.length > 0) {
      const j = queue.pop()!
      members.push(j)
      if (neighbours[j].length < GROUP_CORE) continue
      for (const k of neighbours[j])
        if (label[k] === -1) {
          label[k] = groups.length
          queue.push(k)
        }
    }
    groups.push(members)
  }
  return groups.sort((a, b) => b.length - a.length)
}

export const listPeople = defineAction({
  name: "list_people",
  title: "人物",
  description:
    "Members who appear in photos (their faces named by an admin, or matched to ones an admin named), with how many photos show them, most first. coverFaceId is a face to show for them; filter list_photos by memberId for their photos.",
  kind: "query",
  input: z.object({}),
  run: async () =>
    db
      .select({
        memberId: user.id,
        name: user.name,
        photoCount: sql<number>`count(distinct ${faces.photoId})::int`,
        coverFaceId: sql<string>`(array_agg(${faces.id} order by ${faces.labeledBy} = 'admin' desc, ${faces.score} desc))[1]`,
      })
      .from(faces)
      .innerJoin(user, eq(user.id, faces.memberId))
      .groupBy(user.id, user.name)
      .orderBy(desc(sql`3`), user.name),
})

export const listFaceGroups = defineAction({
  name: "list_face_groups",
  title: "待命名的臉",
  description:
    "Faces nobody has named yet, grouped by likeness (each group is likely one person), largest group first. Gallery admins only; name a group with label_faces.",
  kind: "query",
  input: z.object({}),
  run: async (actor) => {
    await requireAdmin(actor)
    const open = await db
      .select({ id: faces.id, photoId: faces.photoId, vector: faces.vector })
      .from(faces)
      .where(isNull(faces.labeledBy))
    const groups = group(open.map((face) => Float32Array.from(face.vector)))
    return {
      unnamed: open.length,
      groups: groups
        .slice(0, MAX_GROUPS)
        .map((members) =>
          members.map((i) => ({ id: open[i].id, photoId: open[i].photoId }))
        ),
    }
  },
})

export const labelFaces = defineAction({
  name: "label_faces",
  title: "命名人臉",
  description:
    "Names faces as one member (memberId from list_members), or with memberId null marks them as nobody to name (a stranger, or not a face). Faces close to a named one are then named the same. Gallery admins only.",
  kind: "mutation",
  input: z.object({
    faceIds: z.array(z.uuid()).min(1, "請選擇臉").max(1000),
    memberId: z.uuid("請選擇成員").nullable(),
  }),
  run: async (actor, { faceIds, memberId }) => {
    await requireAdmin(actor)
    const changed = await db
      .update(faces)
      .set({ memberId, labeledBy: "admin", labeledAt: new Date() })
      .where(inArray(faces.id, faceIds))
      .returning({ id: faces.id })
    if (changed.length === 0) throw new Error("找不到這些臉")
    const matched = await matchFaces()
    return { named: changed.length, matched }
  },
})

export const getFace = defineAction({
  name: "get_face",
  title: "人臉位置",
  description:
    "Where one face sits in its photo: the photo id and the face box as fractions of the photo's width and height.",
  kind: "query",
  mcpExcludedBecause:
    "only /media needs a face's box, to crop the face from its photo",
  input: z.object({ id: z.uuid() }),
  run: async (_actor, { id }) => {
    const [face] = await db
      .select({ photoId: faces.photoId, box: faces.box })
      .from(faces)
      .where(eq(faces.id, id))
    return face ?? null
  },
})

let running = false
// Photos whose file is missing, or that failed MAX_FAILURES times; skipped
// until the server restarts so they cannot hold up the queue.
const skipped = new Set<string>()
const failures = new Map<string, number>()
const MAX_FAILURES = 3

/** Finds the faces in photos not looked at yet, one photo at a time, and
 * names those close to a named face. Returns how many photos it did. */
async function scanPending(limit: number) {
  const pending = await db
    .select({ id: photos.id })
    .from(photos)
    .leftJoin(faceScans, eq(faceScans.photoId, photos.id))
    .where(isNull(faceScans.photoId))
    .orderBy(desc(photos.createdAt))
    .limit(limit + skipped.size)
  let done = 0
  for (const { id } of pending
    .filter((p) => !skipped.has(p.id))
    .slice(0, limit)) {
    const file = await getPhotoFile(id, "large.webp")
    if (!file) {
      skipped.add(id)
      continue
    }
    let found: Awaited<ReturnType<typeof findFaces>>
    try {
      found = await findFaces(new Uint8Array(await file.arrayBuffer()))
    } catch (error) {
      // One bad photo must not stall the rest; a service that is down
      // fails every photo, so the batch stops here and retries later.
      // Only a failure on this photo counts against it, not the service
      // being unreachable or still loading its models.
      const message = error instanceof Error ? error.message : ""
      if (!/still loading|fetch failed|aborted|timeout/i.test(message)) {
        const count = (failures.get(id) ?? 0) + 1
        failures.set(id, count)
        if (count >= MAX_FAILURES) skipped.add(id)
      }
      throw error
    }
    failures.delete(id)
    const kept = found.faces.filter(
      ({ box: [x1, y1, x2, y2], score }) =>
        score >= MIN_SCORE && Math.min(x2 - x1, y2 - y1) >= MIN_SIDE
    )
    const clamp = (x: number) => Math.min(1, Math.max(0, x))
    const inserted = await db.transaction(async (tx) => {
      // Deleted while the faces were being found.
      const [photo] = await tx
        .select({ id: photos.id })
        .from(photos)
        .where(eq(photos.id, id))
        .for("share")
      if (!photo) return []
      await tx.insert(faceScans).values({ photoId: id, faceCount: kept.length })
      if (kept.length === 0) return []
      return tx
        .insert(faces)
        .values(
          kept.map(({ box: [x1, y1, x2, y2], score, vector }) => ({
            photoId: id,
            box: [
              clamp(x1 / found.width),
              clamp(y1 / found.height),
              clamp(x2 / found.width),
              clamp(y2 / found.height),
            ],
            score,
            vector,
          }))
        )
        .returning({ id: faces.id })
    })
    if (inserted.length > 0) await matchFaces(inserted.map((face) => face.id))
    done++
  }
  return done
}

/** Started once per server process, like the embedder: checks every 30
 * seconds, and right after a batch that found work. */
export function startFaceFinder() {
  if (!embedEnabled() || running) return
  running = true
  const tick = async () => {
    let next = 30_000
    try {
      if ((await scanPending(4)) > 0) next = 0
    } catch (error) {
      console.error("faces:", error instanceof Error ? error.message : error)
    }
    setTimeout(tick, next)
  }
  setTimeout(tick, 10_000)
}
