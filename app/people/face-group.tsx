"use client"

import * as React from "react"
import { toast } from "sonner"

import { MemberCombobox } from "@/components/member-combobox"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { nameFaces } from "../actions"

const SHOWN = 24

// One group of faces that look alike. Tapping a face leaves it out; the
// rest are named as the chosen member, or skipped as nobody to name.
export function FaceGroup({
  faces,
  members,
}: {
  faces: { id: string; photoId: string }[]
  members: { id: string; name: string; email: string }[]
}) {
  const [left, setLeft] = React.useState<Set<string>>(new Set())
  const [memberId, setMemberId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const chosen = faces.filter((face) => !left.has(face.id))

  async function save(member: string | null) {
    setBusy(true)
    const result = await nameFaces({
      faceIds: chosen.map((face) => face.id),
      memberId: member,
    })
    setBusy(false)
    if (result.error) toast.error(result.error)
    else if (result.data && result.data.matched > 0)
      toast.success(`另外認出 ${result.data.matched} 張臉`)
  }

  const toggle = (id: string) =>
    setLeft((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <li className="flex flex-col gap-4 border-b border-border py-6">
      <div className="flex flex-wrap gap-2">
        {faces.slice(0, SHOWN).map((face) => (
          <button
            key={face.id}
            type="button"
            aria-pressed={!left.has(face.id)}
            aria-label={left.has(face.id) ? "加回這張臉" : "排除這張臉"}
            onClick={() => toggle(face.id)}
            className={cn(
              "size-14 overflow-hidden rounded-full bg-muted transition-opacity duration-state",
              left.has(face.id) && "opacity-30"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
            <img
              src={`/media/${face.id}/face`}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
        {faces.length > SHOWN && (
          <span className="flex size-14 items-center justify-center text-muted-foreground tabular-nums">
            +{faces.length - SHOWN}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <MemberCombobox
          members={members}
          value={memberId}
          onValueChange={setMemberId}
          className="w-full sm:w-64"
        />
        <Button
          disabled={busy || !memberId || chosen.length === 0}
          onClick={() => save(memberId)}
        >
          命名 {chosen.length}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || chosen.length === 0}
          onClick={() => save(null)}
        >
          略過
        </Button>
      </div>
    </li>
  )
}
