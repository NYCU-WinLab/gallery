"use client"

import { XIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { revoke as revokeAdmin } from "../actions"

export function RevokeButton({
  userId,
  name,
}: {
  userId: string
  name: string
}) {
  async function revoke() {
    const { error } = await revokeAdmin({ userId })
    if (error) {
      toast.error(error)
      throw new Error(error)
    }
    toast.success("已移除")
  }

  return (
    <Tooltip>
      <ConfirmDialog
        trigger={
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" aria-label="移除" />}
          >
            <XIcon />
          </TooltipTrigger>
        }
        title={`移除 ${name} 的管理員權限？`}
        confirmLabel="移除"
        onConfirm={revoke}
      />
      <TooltipContent>移除</TooltipContent>
    </Tooltip>
  )
}
