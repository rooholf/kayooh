/**
 * Photo storage seam (SRS V-PHOTO-KEY, FR-RNT-01; plan C.2.3 — issue #41).
 *
 * Third-party object storage sits strictly behind {@link StorageProvider}
 * (AGENTS Backend directives). P1 ships the FIXTURE provider (same pattern as
 * the fixture PaymentGateway): it issues V-PHOTO-KEY keys and a presigned-style
 * upload URL, and tracks issued/PUT objects in-process so the HEAD existence +
 * <= 5 MiB rule is exercisable without S3/MinIO.
 *
 * Event processing (FR-RNT-01 checkout / FR-RNT-03 inspection) calls
 * {@link verifyPhotoKeys}: with `STORAGE_BASE_URL` configured every key is
 * HEAD-checked (must exist, <= 5 MiB); unset (dev/test floor) only the
 * format-level V-PHOTO-KEY check applies.
 */
import { randomUUID } from "node:crypto";

export const MAX_PHOTO_BYTES = 5_242_880; // 5 MiB (SRS V-PHOTO-KEY)

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PhotoUpload {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export interface HeadResult {
  exists: boolean;
  sizeBytes: number;
}

export interface StorageProvider {
  /** Presigned-style upload URL for one photo object. */
  createUploadUrl(kind: "checklist" | "damage", contentType: string): Promise<PhotoUpload>;
  /** S3-style HEAD; null = provider has no remote truth for this key. */
  headObject(key: string): Promise<HeadResult | null>;
  /** PUT sink for the dev upload route (the PWA PUTs the object here). */
  put(key: string, body: Buffer): Promise<void>;
}

/**
 * Fixture provider: keys are real V-PHOTO-KEYs (`uploads/<kind>/<uuid>.<ext>`),
 * upload URLs point at the fixture host. With `STORAGE_BASE_URL` set, URLs use
 * it so the dev API can actually receive the PUT.
 */
class FixtureStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, number>();

  constructor(private readonly baseUrl: string) {}

  async createUploadUrl(kind: "checklist" | "damage", contentType: string): Promise<PhotoUpload> {
    const ext = EXT_BY_CONTENT_TYPE[contentType];
    if (!ext) throw new Error(`unsupported photo content type: ${contentType}`);
    const key = `uploads/${kind}/${randomUUID()}.${ext}`;
    // 15-minute validity is the seeded hold window's scale — generous for a
    // counter photo, tight enough that stale URLs die with the hold.
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return {
      uploadUrl: `${this.baseUrl}/${key}`,
      key,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async headObject(key: string): Promise<HeadResult | null> {
    if (!this.objects.has(key)) return null; // never issued/PUT here
    return { exists: true, sizeBytes: this.objects.get(key) ?? 0 };
  }

  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body.byteLength);
  }
}

let provider: StorageProvider | null = null;

/** The active provider; STORAGE_BASE_URL (env) points PUTs at the dev route. */
export function getStorageProvider(): StorageProvider {
  if (!provider) {
    provider = new FixtureStorageProvider(
      process.env.STORAGE_BASE_URL ?? "https://uploads.fixtures.jambi.test",
    );
  }
  return provider;
}

/** Test/dev seam: reset the fixture registry and force re-configuration. */
export function resetStorageProvider(): void {
  provider = null;
}

/**
 * FR-RNT-01/FR-RNT-03 photoKeys verification. Returns false when any key
 * fails the HEAD rule (must exist, <= 5 MiB) while a storage base is
 * configured; without one (dev/test floor) only format rules (V-PHOTO-KEY,
 * already schema-checked) apply and the verdict is pass.
 */
export async function verifyPhotoKeys(keys: string[]): Promise<boolean> {
  if (!process.env.STORAGE_BASE_URL) return true;
  const storage = getStorageProvider();
  for (const key of keys) {
    const head = await storage.headObject(key);
    if (head === null || !head.exists || head.sizeBytes > MAX_PHOTO_BYTES) return false;
  }
  return true;
}
