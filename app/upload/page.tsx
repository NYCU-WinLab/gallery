import { GalleryShell } from "@/components/gallery-shell"
import { requireActor } from "@/lib/auth/session"

import { UploadForm } from "./upload-form"

export default async function UploadPage() {
  await requireActor("/upload")
  return (
    <GalleryShell
      layout="spotlight"
      page={{ label: "上傳", href: "/upload", tip: "" }}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8">
        <h1 className="text-title font-medium">上傳</h1>
        <UploadForm />
      </div>
    </GalleryShell>
  )
}
