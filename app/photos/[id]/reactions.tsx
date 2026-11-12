"use client"

import * as React from "react"
import { toast } from "sonner"

import { Toggle } from "@/components/ui/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { reactionEmoji as emoji } from "@/lib/reactions"

import { react } from "../../actions"

type Reaction = keyof typeof emoji

// One reaction per member: each button shows how many picked it and, on
// hover, who. Picking your own again takes it back.
export function Reactions({
  photoId,
  reactions,
  mine,
}: {
  photoId: string
  reactions: { reaction: string; name: string }[]
  mine: string | null
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(mine)
  const [, startTransition] = React.useTransition()

  function pick(reaction: Reaction) {
    const next = optimistic === reaction ? null : reaction
    startTransition(async () => {
      setOptimistic(next)
      const result = await react({ photoId, reaction: next })
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(emoji) as Reaction[]).map((reaction) => {
        const names = reactions
          .filter((row) => row.reaction === reaction)
          .map((row) => row.name)
        // Show the change before the server confirms it.
        const count =
          names.length -
          (mine === reaction ? 1 : 0) +
          (optimistic === reaction ? 1 : 0)
        return (
          <Tooltip key={reaction}>
            <TooltipTrigger
              render={
                <Toggle
                  size="text"
                  pressed={optimistic === reaction}
                  onPressedChange={() => pick(reaction)}
                  className="rounded-full tabular-nums"
                />
              }
            >
              <span aria-hidden>{emoji[reaction]}</span>
              {count > 0 && count}
            </TooltipTrigger>
            <TooltipContent>
              {names.length ? names.join("、") : "還沒有人"}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
