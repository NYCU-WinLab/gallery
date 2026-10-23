import {
  grantAdmin,
  listAdmins,
  listMembers,
  revokeAdmin,
} from "@/lib/actions/admins"
import type { Action } from "@/lib/actions/define"
import {
  getFace,
  labelFaces,
  listFaceGroups,
  listPeople,
} from "@/lib/actions/faces"
import {
  deletePhoto,
  getPhoto,
  getPhotoFile,
  listPhotos,
  listUploaders,
  setReaction,
  updatePhoto,
  uploadPhoto,
} from "@/lib/actions/photos"
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
  setReaction,
  listPeople,
  listFaceGroups,
  labelFaces,
  getFace,
  listMembers,
  listAdmins,
  grantAdmin,
  revokeAdmin,
]
