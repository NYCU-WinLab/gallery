// The embedding service (embed/, EmbeddingGemma 2): turns a photo or a
// search into a 768-number vector, so a search finds photos by what they
// show. Off when EMBED_URL is empty; search then matches names only.

export const embedEnabled = () => Boolean(process.env.EMBED_URL)

async function embed(
  kind: "query" | "document",
  items: ({ text: string } | { image_b64: string })[],
  timeoutMs: number
): Promise<number[][]> {
  const response = await fetch(`${process.env.EMBED_URL}/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, items }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = (await response.json()) as {
    vectors?: number[][]
    error?: string
  }
  if (!response.ok || !body.vectors)
    throw new Error(`embed: ${body.error ?? response.status}`)
  return body.vectors
}

// A search waits a few seconds at most, then matches text instead; a photo
// may take a minute on a CPU without AVX.
const QUERY_TIMEOUT_MS = 5_000
const PHOTO_TIMEOUT_MS = 180_000

export async function embedQuery(text: string) {
  const [vector] = await embed("query", [{ text }], QUERY_TIMEOUT_MS)
  return vector
}

export async function embedPhoto(image: Uint8Array, name: string) {
  const [imageVector, nameVector] = await embed(
    "document",
    [{ image_b64: Buffer.from(image).toString("base64") }, { text: name }],
    PHOTO_TIMEOUT_MS
  )
  return { image: imageVector, name: nameVector }
}

export async function embedName(name: string) {
  const [vector] = await embed("document", [{ text: name }], QUERY_TIMEOUT_MS)
  return vector
}
