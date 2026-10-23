"use client"

import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { FormDialog, FormField } from "@/components/form-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { removeTag, saveTagName } from "../actions"

function fail(result: { error?: string }) {
  if (result.error) {
    toast.error(result.error)
    throw new Error(result.error)
  }
}

// Rename (to an existing name merges the two) and delete, for admins.
export function TagTools({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex gap-1">
      <FormDialog
        trigger={<Button variant="ghost">改名</Button>}
        title={`#${name} 改名`}
        submitLabel="儲存"
        onSubmit={async (data) => {
          const result = await saveTagName({ id, name: data.get("name") })
          fail(result)
          if (result.data?.merged) toast.success("已併入同名標籤")
        }}
      >
        <FormField label="名稱（和既有標籤同名會合併）" required>
          <Input name="name" defaultValue={name} maxLength={50} />
        </FormField>
      </FormDialog>
      <ConfirmDialog
        trigger={<Button variant="ghost">刪除</Button>}
        title={`刪除 #${name}？照片本身不會刪`}
        confirmLabel="刪除"
        onConfirm={async () => fail(await removeTag({ id }))}
      />
    </span>
  )
}
