"use client";

import { ApiError, type ApiResult } from "@/lib/api/envelope";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const HEIC = ["image/heic", "image/heif"];

export function isHeic(file: File): boolean {
  return HEIC.includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Validates a picked file and converts HEIC (iPhone) photos to JPEG in the
 * browser, so the server only ever handles JPG / PNG / WEBP.
 */
export async function prepareImageFile(file: File): Promise<File> {
  if (isHeic(file)) {
    const { default: heic2any } = await import("heic2any");
    let converted: Blob | Blob[];
    try {
      converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    } catch {
      throw new ApiError("HEIC_FAILED", "This HEIC photo couldn't be converted. Take a screenshot (PNG) instead.", 0);
    }
    const blob = Array.isArray(converted) ? converted[0] : converted;
    file = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  }
  if (!ACCEPTED.includes(file.type)) {
    throw new ApiError("UNSUPPORTED_TYPE", "Use a JPG, PNG, WEBP or HEIC image.", 0);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError("FILE_TOO_LARGE", "Screenshots must be 10 MB or smaller.", 0);
  }
  return file;
}

export interface UploadResponse {
  uploadId: string;
  imageUrl: string | null;
  width: number;
  height: number;
  duplicates: DuplicateCandidate[];
}

/** XHR upload so we can show real progress on slow mobile connections. */
export function uploadScreenshot(file: File, onProgress: (pct: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("NETWORK", "Upload failed — check your connection.", 0));
    xhr.onload = () => {
      const body = xhr.response as ApiResult<UploadResponse> | null;
      if (body?.ok) resolve(body.data);
      else reject(new ApiError(body?.error.code ?? "UPLOAD_FAILED", body?.error.message ?? `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.send(form);
  });
}
