"use client"

import { DownloadIcon, EllipsisIcon, HeartIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormDialog, FormField } from "@/components/form-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import {
  arrangeAlbum,
  favorite,
  pin,
  removePhoto,
  savePhoto,
  saveTags,
} from "../../actions"

type Photo = {
  id: string
  name: string
  takenAt: Date
  tags: string[]
  favorite: boolean
  canEdit: boolean
  isAdmin: boolean
  pinnedAt: Date | null
  albums: { slug: string }[]
}

/** For datetime-local, in Taipei time. */
function localValue(date: Date) {
  const taipei = new Date(date.getTime() + 8 * 3600 * 1000)
  return taipei.toISOString().slice(0, 16)
}

function fail(result: { error?: string }) {
  if (result.error) {
    toast.error(result.error)
    throw new Error(result.error)
  }
}

export function PhotoActions({
  photo,
  albums,
}: {
  photo: Photo
  albums: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<
    "edit" | "album" | "delete" | null
  >(null)
  const [liked, setLiked] = React.useOptimistic(photo.favorite)
  const [, startTransition] = React.useTransition()
  const close = (open: boolean) => !open && setDialog(null)

  return (
    <div className="flex shrink-0 gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-pressed={liked}
              onClick={() =>
                startTransition(async () => {
                  setLiked(!liked)
                  const result = await favorite({
                    photoId: photo.id,
                    favorite: !liked,
                  })
                  if (result.error) toast.error(result.error)
                })
              }
            />
          }
        >
          <HeartIcon className={cn(liked && "fill-current text-destructive")} />
        </TooltipTrigger>
        <TooltipContent>{liked ? "取消收藏" : "收藏"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={`/media/${photo.id}/original?download`}
              className={buttonVariants({ variant: "outline", size: "icon" })}
            />
          }
        >
          <DownloadIcon />
        </TooltipTrigger>
        <TooltipContent>下載原檔</TooltipContent>
      </Tooltip>
      {(photo.canEdit || albums.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon" aria-label="更多" />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {photo.canEdit && (
              <DropdownMenuItem onClick={() => setDialog("edit")}>
                編輯
              </DropdownMenuItem>
            )}
            {albums.length > 0 && (
              <DropdownMenuItem onClick={() => setDialog("album")}>
                加入相簿
              </DropdownMenuItem>
            )}
            {photo.isAdmin && (
              <DropdownMenuItem
                onClick={async () => {
                  const result = await pin({
                    id: photo.id,
                    pinned: !photo.pinnedAt,
                  })
                  if (result.error) toast.error(result.error)
                }}
              >
                {photo.pinnedAt ? "取消置頂" : "置頂"}
              </DropdownMenuItem>
            )}
            {photo.canEdit && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDialog("delete")}
              >
                刪除
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <FormDialog
        open={dialog === "edit"}
        onOpenChange={close}
        title="編輯照片"
        submitLabel="儲存"
        onSubmit={async (data) => {
          const takenAt = String(data.get("takenAt") ?? "")
          fail(
            await savePhoto({
              id: photo.id,
              name: data.get("name"),
              ...(takenAt && { takenAt: `${takenAt}:00+08:00` }),
            })
          )
          const names = String(data.get("tags") ?? "")
            .split(/[,，、\s]+/)
            .map((name) => name.replace(/^#/, "").trim())
            .filter(Boolean)
          fail(await saveTags({ photoId: photo.id, names }))
          toast.success("已儲存")
        }}
      >
        <FormField label="名稱" required>
          <Input name="name" defaultValue={photo.name} maxLength={200} />
        </FormField>
        <FormField label="拍攝時間">
          <Input
            name="takenAt"
            type="datetime-local"
            defaultValue={localValue(photo.takenAt)}
          />
        </FormField>
        <FormField label="標籤（逗號或空白分隔）">
          <Input name="tags" defaultValue={photo.tags.join(", ")} />
        </FormField>
      </FormDialog>
      <FormDialog
        open={dialog === "album"}
        onOpenChange={close}
        title="加入相簿"
        submitLabel="加入"
        onSubmit={async (data) => {
          fail(await arrangeAlbum({ id: data.get("album"), add: [photo.id] }))
          toast.success("已加入")
        }}
      >
        <FormField label="相簿" required>
          <Select
            name="album"
            required
            items={albums.map((album) => ({
              value: album.id,
              label: album.title,
            }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="選擇相簿" />
            </SelectTrigger>
            <SelectContent>
              {albums.map((album) => (
                <SelectItem key={album.id} value={album.id}>
                  {album.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={`刪除「${photo.name}」？`}
        confirmLabel="刪除"
        onConfirm={async () => {
          fail(await removePhoto({ id: photo.id }))
          router.replace("/")
        }}
      />
    </div>
  )
}
