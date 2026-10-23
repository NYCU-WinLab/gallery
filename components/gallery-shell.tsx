import { AppShell } from "@/components/app-shell"
import { LiveRefresh } from "@/components/live-refresh"
import { getSession } from "@/lib/auth/session"

const nav = [
  { label: "照片牆", href: "/", tip: "所有照片，新拍的在前" },
  { label: "相簿", href: "/albums", tip: "整理好的一組組照片" },
  { label: "回憶", href: "/memories", tip: "往年的今天" },
  { label: "上傳", href: "/upload", tip: "照片與 60 秒內的影片" },
]

// The gallery's corners: the lab and the page in the breadcrumb, the
// gallery's pages and the member's account in the top right.
export async function GalleryShell({
  page,
  layout,
  children,
}: {
  page?: { label: string; href: string; tip: string }
  layout?: "column" | "spotlight" | "wide"
  children: React.ReactNode
}) {
  const session = await getSession()
  return (
    <AppShell
      layout={layout}
      breadcrumb={[
        {
          label: "WinLab",
          href: "https://portal.winlab.tw",
          tip: "實驗室所有服務",
        },
        { label: "Gallery", href: "/", tip: "實驗室相簿" },
        ...(page ? [page] : []),
      ]}
      nav={nav}
      account={
        session
          ? {
              label: session.user.name,
              href: "/profile",
              tip: session.user.email,
            }
          : { label: "登入", href: "/sign-in", tip: "auth.winlab.tw" }
      }
    >
      <LiveRefresh />
      {children}
    </AppShell>
  )
}
