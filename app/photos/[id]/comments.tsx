"use client"

import { HeartIcon, PinIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  comment,
  like,
  pinCommentAction,
  removeComment,
  saveComment,
} from "../../actions"

type Comment = {
  id: string
  parentId: string | null
  body: string
  authorName: string | null
  pinnedAt: Date | null
  createdAt: Date
  edited: boolean
  likes: number
  liked: boolean
  canEdit: boolean
  canDelete: boolean
}

const when = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function Composer({
  placeholder,
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  initial?: string
  submitLabel: string
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [body, setBody] = React.useState(initial)
  const [pending, startTransition] = React.useTransition()
  const submit = () =>
    startTransition(async () => {
      if (await onSubmit(body)) setBody("")
    })
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        maxLength={2000}
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            submit()
        }}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
        )}
        <Button onClick={submit} disabled={pending || !body.trim()}>
          {pending ? `${submitLabel}中…` : submitLabel}
        </Button>
      </div>
    </div>
  )
}

function report(result: { error?: string }) {
  if (result.error) toast.error(result.error)
  return !result.error
}

function Item({
  comment: item,
  replies,
  isAdmin,
  photoId,
}: {
  comment: Comment
  replies: Comment[]
  isAdmin: boolean
  photoId: string
}) {
  const [mode, setMode] = React.useState<"reply" | "edit" | null>(null)
  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="font-medium text-foreground">
          {item.authorName ?? "已離開的成員"}
        </span>
        <span>{when.format(item.createdAt)}</span>
        {item.edited && <span>已編輯</span>}
        {item.pinnedAt && <PinIcon className="size-4" aria-label="置頂" />}
      </div>
      {mode === "edit" ? (
        <Composer
          placeholder="留言"
          initial={item.body}
          submitLabel="儲存"
          onCancel={() => setMode(null)}
          onSubmit={async (body) => {
            const ok = report(await saveComment({ id: item.id, body }))
            if (ok) setMode(null)
            return ok
          }}
        />
      ) : (
        <p className="break-words whitespace-pre-wrap">{item.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <Button
          variant="ghost"
          aria-pressed={item.liked}
          onClick={async () =>
            report(await like({ id: item.id, liked: !item.liked }))
          }
          className="tabular-nums"
        >
          <HeartIcon
            className={cn(item.liked && "fill-current text-destructive")}
          />
          {item.likes > 0 && item.likes}
        </Button>
        {!item.parentId && (
          <Button
            variant="ghost"
            onClick={() => setMode(mode === "reply" ? null : "reply")}
          >
            回覆
          </Button>
        )}
        {item.canEdit && (
          <Button variant="ghost" onClick={() => setMode("edit")}>
            編輯
          </Button>
        )}
        {isAdmin && !item.parentId && (
          <Button
            variant="ghost"
            onClick={async () =>
              report(
                await pinCommentAction({ id: item.id, pinned: !item.pinnedAt })
              )
            }
          >
            {item.pinnedAt ? "取消置頂" : "置頂"}
          </Button>
        )}
        {item.canDelete && (
          <ConfirmDialog
            trigger={<Button variant="ghost">刪除</Button>}
            title={
              replies.length ? "刪除這則留言和它的回覆？" : "刪除這則留言？"
            }
            confirmLabel="刪除"
            onConfirm={async () => {
              if (!report(await removeComment({ id: item.id })))
                throw new Error()
            }}
          />
        )}
      </div>
      {mode === "reply" && (
        <Composer
          placeholder={`回覆 ${item.authorName ?? ""}`}
          submitLabel="回覆"
          onCancel={() => setMode(null)}
          onSubmit={async (body) => {
            const ok = report(
              await comment({ photoId, parentId: item.id, body })
            )
            if (ok) setMode(null)
            return ok
          }}
        />
      )}
      {replies.length > 0 && (
        <ul className="flex flex-col border-l border-border pl-4">
          {replies.map((reply) => (
            <Item
              key={reply.id}
              comment={reply}
              replies={[]}
              isAdmin={isAdmin}
              photoId={photoId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// Comments in two levels: a comment and its replies. Pinned ones first.
export function Comments({
  photoId,
  comments,
  isAdmin,
}: {
  photoId: string
  comments: Comment[]
  isAdmin: boolean
}) {
  const top = comments.filter((item) => !item.parentId)
  return (
    <div className="flex flex-col gap-4">
      <Composer
        placeholder="留言，用 @名字 提到人"
        submitLabel="留言"
        onSubmit={async (body) => report(await comment({ photoId, body }))}
      />
      {top.length > 0 && (
        <ul className="flex flex-col">
          {top.map((item) => (
            <Item
              key={item.id}
              comment={item}
              replies={comments.filter((reply) => reply.parentId === item.id)}
              isAdmin={isAdmin}
              photoId={photoId}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
