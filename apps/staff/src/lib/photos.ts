/**
 * Photo upload orchestration (plan A.5.2, SRS V-PHOTO-KEY).
 *
 * Flow: pick file -> client-side V-PHOTO-KEY guards (type + <= 5 MiB) ->
 * presign (`POST /staff/photos/upload-url`) -> DIRECT PUT to storage -> the
 * returned key goes into the event payload's `photoKeys`. The key's
 * existence is re-verified server-side (HEAD) when the event syncs.
 */
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "@repo/contracts";
import { postPhotoUploadUrl, putPhotoObject } from "../api/client";

export type PhotoKind = "checklist" | "damage";

/** The picker's `accept` value, derived from the contract's type list. */
export const PHOTO_ACCEPT = PHOTO_CONTENT_TYPES.join(",");

/** The file is not one of the accepted image types. */
export class PhotoUnsupportedTypeError extends Error {
  constructor(contentType: string) {
    super(`Tipe file tidak didukung (${contentType || "tidak dikenal"}) — gunakan JPG, PNG, atau WebP.`);
    this.name = "PhotoUnsupportedTypeError";
  }
}

/** The file is empty or above the 5 MiB V-PHOTO-KEY ceiling. */
export class PhotoTooLargeError extends Error {
  constructor(sizeBytes: number) {
    super(
      sizeBytes > MAX_PHOTO_BYTES
        ? "Ukuran foto melebihi 5 MB."
        : "Foto kosong — pilih foto lain.",
    );
    this.name = "PhotoTooLargeError";
  }
}

/** Presign or the direct PUT failed (network, auth, storage). */
export class PhotoUploadFailedError extends Error {
  constructor(detail: string) {
    super(`Unggahan gagal — periksa koneksi lalu ulangi. (${detail})`);
    this.name = "PhotoUploadFailedError";
  }
}

function isSupportedType(type: string): boolean {
  return (PHOTO_CONTENT_TYPES as readonly string[]).includes(type);
}

/**
 * Upload one photo and return its V-PHOTO-KEY. Guards run BEFORE any
 * network call, so an unacceptable file never leaves the device.
 */
export async function uploadStaffPhoto(file: File, kind: PhotoKind): Promise<string> {
  if (!isSupportedType(file.type)) throw new PhotoUnsupportedTypeError(file.type);
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) throw new PhotoTooLargeError(file.size);
  try {
    const presign = await postPhotoUploadUrl(kind, file.type, file.size);
    await putPhotoObject(presign.uploadUrl, file);
    return presign.key;
  } catch (error) {
    throw new PhotoUploadFailedError(error instanceof Error ? error.message : String(error));
  }
}
