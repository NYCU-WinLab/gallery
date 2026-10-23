"use server"

import type { z } from "zod"

import { type Action, errorMessage, runAction } from "@/lib/actions/define"
import { grantAdmin, revokeAdmin } from "@/lib/actions/admins"
import {
  deletePhoto,
  listPhotos,
  setReaction,
  updatePhoto,
} from "@/lib/actions/photos"
import { labelFaces } from "@/lib/actions/faces"
import { requireActor } from "@/lib/auth/session"

// Every page's writes, one wrapper each. A failure comes back as { error }
// for a toast; success returns the action's result. Open pages refresh
// through LiveRefresh, so nothing here revalidates.
async function call<Input extends z.ZodObject, Output>(
  action: Action<Input, Output>,
  input: unknown
): Promise<
  { data: Output; error?: undefined } | { error: string; data?: undefined }
> {
  const actor = await requireActor()
  try {
    return { data: await runAction(action, actor, input) }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

export const loadPhotos = async (input: unknown) => call(listPhotos, input)
export const savePhoto = async (input: unknown) => call(updatePhoto, input)
export const removePhoto = async (input: unknown) => call(deletePhoto, input)
export const react = async (input: unknown) => call(setReaction, input)

export const nameFaces = async (input: unknown) => call(labelFaces, input)

export const grant = async (input: unknown) => call(grantAdmin, input)
export const revoke = async (input: unknown) => call(revokeAdmin, input)
