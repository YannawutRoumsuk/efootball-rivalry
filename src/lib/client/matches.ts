"use client";

import { apiFetch, ApiError } from "@/lib/api/envelope";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";
import type { ExtractionResult } from "@/lib/domain/extraction";
import type { NewRecord } from "@/lib/domain/records";
import type { SideInput } from "@/lib/domain/validation";

export interface SavePayload {
  upload_id: string | null;
  played_on: string | null;
  sides: [SideInput, SideInput];
  insert_at?: number | null;
}

export interface SaveResult {
  matchId: string;
  matchNo: number;
  records: NewRecord[];
}

export async function checkDuplicates(payload: SavePayload): Promise<DuplicateCandidate[]> {
  const res = await apiFetch<{ duplicates: DuplicateCandidate[] }>("/api/matches/check", {
    method: "POST",
    body: JSON.stringify({ upload_id: payload.upload_id, sides: payload.sides, played_on: payload.played_on }),
  });
  return res.duplicates;
}

export type SaveOutcome =
  | { kind: "saved"; result: SaveResult }
  | { kind: "duplicate"; duplicates: DuplicateCandidate[] };

/** Saves a match; returns duplicates instead of throwing when the server flags one. */
export async function saveMatch(payload: SavePayload, acknowledgeDuplicates: boolean): Promise<SaveOutcome> {
  try {
    const result = await apiFetch<SaveResult>("/api/matches", {
      method: "POST",
      body: JSON.stringify({ ...payload, acknowledge_duplicates: acknowledgeDuplicates }),
    });
    return { kind: "saved", result };
  } catch (err) {
    if (err instanceof ApiError && err.code === "POSSIBLE_DUPLICATE") {
      return { kind: "duplicate", duplicates: (err.details as DuplicateCandidate[]) ?? [] };
    }
    throw err;
  }
}

export type ExtractSource = "ocr" | "ai" | "ocr-partial";

export type ExtractResponse = Pick<ExtractionResult, "left" | "right" | "issues"> & {
  source: ExtractSource;
  /** Players recognised from on-screen names seen in earlier matches (still confirmed by the user). */
  suggested: { leftPlayer: string | null; rightPlayer: string | null };
};

export function extractUpload(uploadId: string): Promise<ExtractResponse> {
  return apiFetch<ExtractResponse>(`/api/uploads/${uploadId}/extract`, { method: "POST" });
}
