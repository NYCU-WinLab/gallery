import {
  grantAdmin,
  listAdmins,
  listMembers,
  revokeAdmin,
} from "@/lib/actions/admins"
import {
  addComment,
  deleteComment,
  editComment,
  likeComment,
  listComments,
  pinComment,
} from "@/lib/actions/comments"
import type { Action } from "@/lib/actions/define"
import {
  deletePhoto,
  getPhoto,
  getPhotoFile,
  listPhotos,
  listUploaders,
  pinPhoto,
  setFavorite,
  setReaction,
  updatePhoto,
  uploadPhoto,
} from "@/lib/actions/photos"
import {
  deleteTag,
  listTags,
  renameTag,
  setPhotoTags,
} from "@/lib/actions/tags"
import { whoami } from "@/lib/actions/users"

/** Every action, in the order MCP lists them. */
export const actions: Action[] = [
  whoami,
  listPhotos,
  getPhoto,
  getPhotoFile,
  listUploaders,
  uploadPhoto,
  updatePhoto,
  deletePhoto,
  pinPhoto,
  setReaction,
  setFavorite,
  listComments,
  addComment,
  editComment,
  deleteComment,
  pinComment,
  likeComment,
  listTags,
  setPhotoTags,
  renameTag,
  deleteTag,
  listMembers,
  listAdmins,
  grantAdmin,
  revokeAdmin,
]
