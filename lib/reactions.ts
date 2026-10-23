// What each reaction looks like, in the order they are offered. Shared by
// the photo page's buttons and the wall's cards.
export const reactionEmoji = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
  point: "👉👈",
  cheers: "🍻",
} as const
export type ReactionName = keyof typeof reactionEmoji
