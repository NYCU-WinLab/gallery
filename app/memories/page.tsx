import { EmptyState } from "@/components/empty-state"
import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader, SectionHeader } from "@/components/page-header"
import { PhotoCard, PhotoGrid } from "@/components/photo-grid"
import { runAction } from "@/lib/actions/define"
import { listMemories } from "@/lib/actions/photos"
import { requireActor } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export default async function MemoriesPage() {
  const actor = await requireActor("/memories")
  const { date, years } = await runAction(listMemories, actor, {})
  const [, month, day] = date.split("-").map(Number)
  return (
    <GalleryShell
      layout="wide"
      page={{ label: "回憶", href: "/memories", tip: "往年的今天" }}
    >
      <div className="flex flex-col gap-12">
        <PageHeader title={`往年的 ${month} 月 ${day} 日`} />
        {years.length === 0 && <EmptyState noun="往年今天的照片" />}
        {years.map((group) => (
          <section key={group.year} className="flex flex-col gap-4">
            <SectionHeader title={`${group.yearsAgo} 年前，${group.year}`} />
            <PhotoGrid>
              {group.photos.map((photo) => (
                <PhotoCard key={photo.id} photo={photo} />
              ))}
            </PhotoGrid>
          </section>
        ))}
      </div>
    </GalleryShell>
  )
}
