"use server"

import type { z } from "zod"

import { type Action, errorMessage, runAction } from "@/lib/actions/define"
import { grantAdmin, revokeAdmin } from "@/lib/actions/admins"
import {
  addComment,
  deleteComment,
  editComment,
  likeComment,
  pinComment,
} from "@/lib/actions/comments"
import {
  deletePhoto,
  listPhotos,
  pinPhoto,
  setFavorite,
  setReaction,
  updatePhoto,
} from "@/lib/actions/photos"
import { labelFaces } from "@/lib/actions/faces"
import { deleteTag, renameTag, setPhotoTags } from "@/lib/actions/tags"
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
export const pin = async (input: unknown) => call(pinPhoto, input)
export const react = async (input: unknown) => call(setReaction, input)
export const favorite = async (input: unknown) => call(setFavorite, input)
export const saveTags = async (input: unknown) => call(setPhotoTags, input)

export const comment = async (input: unknown) => call(addComment, input)
export const saveComment = async (input: unknown) => call(editComment, input)
export const removeComment = async (input: unknown) =>
  call(deleteComment, input)
export const pinCommentAction = async (input: unknown) =>
  call(pinComment, input)
export const like = async (input: unknown) => call(likeComment, input)

export const saveTagName = async (input: unknown) => call(renameTag, input)
export const removeTag = async (input: unknown) => call(deleteTag, input)

export const nameFaces = async (input: unknown) => call(labelFaces, input)

export const grant = async (input: unknown) => call(grantAdmin, input)
export const revoke = async (input: unknown) => call(revokeAdmin, input)
