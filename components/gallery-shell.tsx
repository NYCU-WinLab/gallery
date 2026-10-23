import {
  AppShell,
  BuildVersion,
  CornerLink,
  CornerTip,
} from "@/components/app-shell"
import { GalleryCorners } from "@/components/gallery-corners"
import { LiveRefresh } from "@/components/live-refresh"
import { getSession } from "@/lib/auth/session"

// The gallery's corners: the lab and the page in the breadcrumb, the pages
// then search and upload in the top right (both open over the page), the
// member's account next to the build in the bottom left.
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
        { label: "WinLab", href: "https://portal.winlab.tw", tip: "" },
        { label: "Gallery", href: "/", tip: "" },
        ...(page ? [page] : []),
      ]}
      nav={[
        { label: "照片", href: "/", tip: "" },
        { label: "人物", href: "/people", tip: "" },
      ]}
      actions={<GalleryCorners />}
      corners={{
        bottomLeft: (
          <>
            {session && (
              <CornerTip tip={session.user.email} corner="bottom-left">
                <CornerLink href="/profile" prefetch>
                  {session.user.name}
                </CornerLink>
              </CornerTip>
            )}
            <BuildVersion />
          </>
        ),
      }}
    >
      <LiveRefresh />
      {children}
    </AppShell>
  )
}
