"use client"

import * as React from "react"
import { toast } from "sonner"

import { FormDialog } from "@/components/form-dialog"
import { type Member, MemberCombobox } from "@/components/member-combobox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

import { grant } from "../actions"

export function GrantDialog({
  members,
}: {
  members: { id: string; name: string; email: string }[]
}) {
  const [userId, setUserId] = React.useState<string | null>(null)

  async function submit() {
    const { error } = await grant({ userId: userId ?? "" })
    if (error) {
      toast.error(error)
      throw new Error(error)
    }
    toast.success("已新增")
    setUserId(null)
  }

  return (
    <FormDialog
      trigger={<Button>新增</Button>}
      title="新增管理員"
      submitLabel="新增"
      onSubmit={submit}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-member">成員</Label>
        <MemberCombobox
          id="admin-member"
          members={members as Member[]}
          value={userId}
          onValueChange={setUserId}
          className="w-full"
        />
      </div>
    </FormDialog>
  )
}
