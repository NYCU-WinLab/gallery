"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormDialog, FormField } from "@/components/form-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { arrangeAlbum, newAlbum, removeAlbum, saveAlbum } from "../actions"

function fail(result: { error?: string }) {
  if (result.error) {
    toast.error(result.error)
    throw new Error(result.error)
  }
}

export function CreateAlbum() {
  const router = useRouter()
  return (
    <FormDialog
      trigger={<Button>建立相簿</Button>}
      title="建立相簿"
      submitLabel="建立"
      onSubmit={async (data) => {
        const result = await newAlbum({
          title: data.get("title"),
          description: data.get("description"),
        })
        fail(result)
        if (result.data) router.push(`/albums/${result.data.slug}`)
      }}
    >
      <FormField label="標題" required>
        <Input name="title" maxLength={100} />
      </FormField>
      <FormField label="說明">
        <Textarea name="description" maxLength={1000} />
      </FormField>
    </FormDialog>
  )
}

export function EditAlbum({
  album,
}: {
  album: { id: string; title: string; description: string }
}) {
  const router = useRouter()
  return (
    <>
      <FormDialog
        trigger={<Button variant="outline">編輯</Button>}
        title="編輯相簿"
        submitLabel="儲存"
        onSubmit={async (data) =>
          fail(
            await saveAlbum({
              id: album.id,
              title: data.get("title"),
              description: data.get("description"),
            })
          )
        }
      >
        <FormField label="標題" required>
          <Input name="title" defaultValue={album.title} maxLength={100} />
        </FormField>
        <FormField label="說明">
          <Textarea
            name="description"
            defaultValue={album.description}
            maxLength={1000}
          />
        </FormField>
      </FormDialog>
      <ConfirmDialog
        trigger={<Button variant="destructive">刪除</Button>}
        title={`刪除「${album.title}」？照片會留在照片牆`}
        confirmLabel="刪除"
        onConfirm={async () => {
          fail(await removeAlbum({ id: album.id }))
          router.replace("/albums")
        }}
      />
    </>
  )
}

// Edit mode on an album: each photo gets 設為封面 and 移出.
export function AlbumPhotoTools({
  albumId,
  photoId,
  cover,
}: {
  albumId: string
  photoId: string
  cover: boolean
}) {
  return (
    <span className="flex gap-1">
      <Button
        variant="ghost"
        disabled={cover}
        onClick={async () => {
          const result = await saveAlbum({ id: albumId, coverPhotoId: photoId })
          if (result.error) toast.error(result.error)
        }}
      >
        {cover ? "封面" : "設為封面"}
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          const result = await arrangeAlbum({ id: albumId, remove: [photoId] })
          if (result.error) toast.error(result.error)
        }}
      >
        移出
      </Button>
    </span>
  )
}
