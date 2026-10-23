import { GalleryShell } from "@/components/gallery-shell"
import { PageHeader } from "@/components/page-header"
import { requireActor } from "@/lib/auth/session"

import { UploadForm } from "./upload-form"

export default async function UploadPage() {
  await requireActor("/upload")
  return (
    <GalleryShell
      page={{ label: "上傳", href: "/upload", tip: "照片與 60 秒內的影片" }}
    >
      <div className="flex flex-col gap-8">
        <PageHeader title="上傳" />
        <UploadForm />
      </div>
    </GalleryShell>
  )
}
