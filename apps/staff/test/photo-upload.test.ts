/**
 * A.5.2 photo upload flow — the presign request, the DIRECT PUT to storage,
 * and the client-side V-PHOTO-KEY guards (type + <= 5 MiB) that run before
 * any network call. Server truth (HEAD existence + size) is exercised in the
 * API's c2-route-wiring tests; here the client contract is the subject.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("dexie", () => {
  class DexieStub {
    version() {
      return { stores: () => undefined };
    }
  }
  return { default: DexieStub };
});

import { MAX_PHOTO_BYTES } from "@repo/contracts";
import { postPhotoUploadUrl, putPhotoObject } from "../src/api/client.js";
import {
  PhotoTooLargeError,
  PhotoUnsupportedTypeError,
  PhotoUploadFailedError,
  uploadStaffPhoto,
} from "../src/lib/photos.js";

const KEY = "uploads/checklist/11111111-2222-4333-8444-555555555555.jpg";
const EXPIRES_AT = "2026-11-12T01:52:00Z";
const UPLOAD_URL = `https://storage.jambi.test/${KEY}`;

type FetchMock = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function file(bytes: number, type: string): File {
  return new File([new Uint8Array(bytes)], "photo", { type });
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/staff/photos/upload-url")) {
      if (!init?.method || init.method !== "POST") return jsonResponse({}, 405);
      return jsonResponse({ uploadUrl: UPLOAD_URL, key: KEY, expiresAt: EXPIRES_AT });
    }
    if (url === UPLOAD_URL) {
      if (init?.method !== "PUT") return new Response(null, { status: 405 });
      return new Response(null, { status: 200 });
    }
    return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
  }) as FetchMock;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadStaffPhoto (A.5.2)", () => {
  it("presigns, PUTs the bytes directly to storage, and returns the key", async () => {
    const photo = file(10, "image/jpeg");
    const key = await uploadStaffPhoto(photo, "checklist");

    expect(key).toBe(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [presignInput, presignInit] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    expect(String(presignInput)).toBe("/api/v1/staff/photos/upload-url");
    expect(presignInit.method).toBe("POST");
    expect(JSON.parse(String(presignInit.body))).toEqual({
      kind: "checklist",
      contentType: "image/jpeg",
      sizeBytes: 10,
    });

    const [putInput, putInit] = fetchMock.mock.calls[1] as [RequestInfo, RequestInit];
    expect(String(putInput)).toBe(UPLOAD_URL);
    expect(putInit.method).toBe("PUT");
    expect(putInit.headers).toMatchObject({ "content-type": "application/octet-stream" });
    expect(putInit.body).toBe(photo);
  });

  it("picks the damage kind when asked", async () => {
    await uploadStaffPhoto(file(5, "image/png"), "damage");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ kind: "damage" });
  });

  it("rejects unsupported types before any network call", async () => {
    await expect(uploadStaffPhoto(file(10, "image/gif"), "checklist")).rejects.toBeInstanceOf(
      PhotoUnsupportedTypeError,
    );
    await expect(uploadStaffPhoto(file(10, "application/pdf"), "checklist")).rejects.toBeInstanceOf(
      PhotoUnsupportedTypeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty and oversize files before any network call", async () => {
    await expect(uploadStaffPhoto(file(0, "image/jpeg"), "checklist")).rejects.toBeInstanceOf(
      PhotoTooLargeError,
    );
    await expect(
      uploadStaffPhoto(file(MAX_PHOTO_BYTES + 1, "image/jpeg"), "checklist"),
    ).rejects.toBeInstanceOf(PhotoTooLargeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces presign failures", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({}, 500));
    await expect(uploadStaffPhoto(file(10, "image/jpeg"), "checklist")).rejects.toBeInstanceOf(
      PhotoUploadFailedError,
    );
  });

  it("surfaces direct-PUT failures", async () => {
    fetchMock
      .mockImplementationOnce(async () => jsonResponse({ uploadUrl: UPLOAD_URL, key: KEY, expiresAt: EXPIRES_AT }))
      .mockImplementationOnce(async () => new Response(null, { status: 500 }));
    await expect(uploadStaffPhoto(file(10, "image/jpeg"), "checklist")).rejects.toBeInstanceOf(
      PhotoUploadFailedError,
    );
  });
});

describe("postPhotoUploadUrl / putPhotoObject", () => {
  it("returns the schema-checked presign response", async () => {
    await expect(postPhotoUploadUrl("checklist", "image/jpeg", 10)).resolves.toMatchObject({
      uploadUrl: UPLOAD_URL,
      key: KEY,
      expiresAt: EXPIRES_AT,
    });
  });

  it("rejects a response whose key is not a V-PHOTO-KEY", async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ uploadUrl: UPLOAD_URL, key: "not-a-key.jpg", expiresAt: EXPIRES_AT }),
    );
    await expect(postPhotoUploadUrl("checklist", "image/jpeg", 10)).rejects.toThrow();
  });

  it("PUT throws on a non-2xx storage answer", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 403 }));
    await expect(putPhotoObject(UPLOAD_URL, file(10, "image/jpeg"))).rejects.toThrow(
      /Unggah foto gagal/,
    );
  });
});
