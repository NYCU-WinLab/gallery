"use client"

import Link from "next/link"
import { XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { nameFaces } from "../../actions"

// Who the photo shows, each opening the wall of their photos. An admin can
// take a wrong name off a face.
export function People({
  people,
  isAdmin,
}: {
  people: { memberId: string; name: string; faceIds: string[] }[]
  isAdmin: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((person) => (
        <span key={person.memberId} className="flex items-center">
          <Link
            href={`/?person=${person.memberId}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "gap-2 rounded-full pl-1"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
            <img
              src={`/media/${person.faceIds[0]}/face`}
              alt=""
              className="size-8 rounded-full object-cover"
            />
            {person.name}
          </Link>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`這不是${person.name}`}
              onClick={async () => {
                const { error } = await nameFaces({
                  faceIds: person.faceIds,
                  memberId: null,
                })
                if (error) toast.error(error)
              }}
            >
              <XIcon />
            </Button>
          )}
        </span>
      ))}
    </div>
  )
}
