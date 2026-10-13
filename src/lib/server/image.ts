import "server-only";

import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { ApiError } from "@/lib/api/envelope";
import { dhashFromGrayscale } from "@/lib/domain/duplicates";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Guards against decompression bombs: a tiny PNG can claim a huge canvas. */
const MAX_PIXELS = 40_000_000;
const SHARP_OPTS = { limitInputPixels: MAX_PIXELS, sequentialRead: true } as const;
export type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

const EXT: Record<AllowedMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Detects the real file type from magic bytes — the client's MIME is not trusted. */
export function sniffImageType(buf: Uint8Array): AllowedMime | "image/heic" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.subarray(start, end));
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && ascii(1, 4) === "PNG" && buf[0] === 0x89) return "image/png";
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) {
    return "image/heic";
  }
  return null;
}

export interface ProcessedImage {
  mime: AllowedMime;
  ext: string;
  sha256: string;
  perceptualHash: string;
  width: number;
  height: number;
}

export async function inspectUpload(buf: Buffer): Promise<ProcessedImage> {
  if (buf.length === 0) throw new ApiError("EMPTY_FILE", "The file is empty.", 400);
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new ApiError("FILE_TOO_LARGE", "Screenshots must be 10 MB or smaller.", 413);
  }
  const type = sniffImageType(buf);
  if (type === "image/heic") {
    throw new ApiError(
      "HEIC_NOT_CONVERTED",
      "HEIC images must be converted before upload. Please try again — the app converts them automatically.",
      415,
    );
  }
  if (!type) throw new ApiError("UNSUPPORTED_TYPE", "Only JPG, PNG, WEBP or HEIC screenshots are supported.", 415);

  let meta: Metadata;
  try {
    meta = await sharp(buf, SHARP_OPTS).metadata();
  } catch {
    throw new ApiError("CORRUPT_IMAGE", "This image couldn't be read. Try exporting the screenshot again.", 400);
  }
  // Check the declared size BEFORE decoding any pixels.
  const { width, height } = meta;
  if (!width || !height || width > 10000 || height > 10000 || width * height > MAX_PIXELS) {
    throw new ApiError("BAD_DIMENSIONS", "Image dimensions are not supported.", 400);
  }
  let grey: Buffer;
  try {
    grey = await sharp(buf, SHARP_OPTS).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  } catch {
    throw new ApiError("CORRUPT_IMAGE", "This image couldn't be read. Try exporting the screenshot again.", 400);
  }

  return {
    mime: type,
    ext: EXT[type],
    sha256: createHash("sha256").update(buf).digest("hex"),
    perceptualHash: dhashFromGrayscale(new Uint8Array(grey)),
    width,
    height,
  };
}

/** Downscales for the vision model while keeping small stat digits legible. */
export async function prepareForVision(buf: Buffer): Promise<{ base64: string; mime: "image/jpeg" }> {
  const out = await sharp(buf, SHARP_OPTS)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { base64: out.toString("base64"), mime: "image/jpeg" };
}
