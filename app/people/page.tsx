import Link from "next/link"

import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader, SectionHeader } from "@/components/page-header"
import { listMembers } from "@/lib/actions/admins"
import { isAdmin } from "@/lib/actions/authz"
import { runAction } from "@/lib/actions/define"
import { listFaceGroups, listPeople } from "@/lib/actions/faces"
import { requireActor } from "@/lib/auth/session"

import { FaceGroup } from "./face-group"

export const dynamic = "force-dynamic"

// Everyone the photos show, each opening the wall of their photos. Admins
// also get the faces nobody has named yet, grouped by likeness.
export default async function PeoplePage() {
  const actor = await requireActor("/people")
  const [people, admin] = await Promise.all([
    runAction(listPeople, actor, {}),
    isAdmin(actor),
  ])
  const [unnamed, members] = admin
    ? await Promise.all([
        runAction(listFaceGroups, actor, {}),
        runAction(listMembers, actor, {}),
      ])
    : [null, []]

  return (
    <GalleryShell page={{ label: "人物", href: "/people", tip: "" }}>
      <div className="flex flex-col gap-12">
        <PageHeader title="人物" />
        {people.length === 0 && <EmptyState noun="人物" />}
        <ul className="grid grid-cols-3 gap-6 sm:grid-cols-4">
          {people.map((person) => (
            <li key={person.memberId}>
              <Link
                href={`/?person=${person.memberId}`}
                className="group flex flex-col items-center gap-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by /media behind the session */}
                <img
                  src={`/media/${person.coverFaceId}/face`}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full max-w-24 rounded-full bg-muted object-cover transition-opacity duration-state group-hover:opacity-90"
                />
                <span className="max-w-full truncate">{person.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {person.photoCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {unnamed && unnamed.groups.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title={`待命名 ${unnamed.groups.length}`} />
            <ul className="flex flex-col">
              {unnamed.groups.map((faces) => (
                <FaceGroup key={faces[0].id} faces={faces} members={members} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </GalleryShell>
  )
}
