"use client"

import { DownloadIcon, EllipsisIcon } from "lucide-react"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { removePhoto, savePhoto } from "../../actions"

type Photo = {
  id: string
  name: string
  takenAt: Date
  canEdit: boolean
  isAdmin: boolean
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

export function PhotoActions({ photo }: { photo: Photo }) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<"edit" | "delete" | null>(null)
  const close = (open: boolean) => !open && setDialog(null)

  return (
    <div className="flex shrink-0 gap-2">
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
      {photo.canEdit && (
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
