import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { matchKnownLabel, normalizeLabel, suggestPlayers, trustedLatinLabel } from "@/lib/ocr/labels";
import { ocrWorkersLoaded, readFullTimeScreen } from "@/lib/ocr/fulltime";

const fixture = readFileSync(join(__dirname, "..", "fixtures", "fulltime-kyngian-5-2.webp"));

// Ground truth read by eye from the real screenshot.
const EXPECTED = {
  left: { goals: 5, possession_pct: 54, shots: 6, shots_on_target: 5, fouls: 3, offsides: 1, corners: 0, free_kicks: 1, passes: 212, successful_passes: 184, crosses: 0, interceptions: 30, tackles: 15, saves: 3 },
  right: { goals: 2, possession_pct: 46, shots: 7, shots_on_target: 5, fouls: 1, offsides: 1, corners: 1, free_kicks: 3, passes: 140, successful_passes: 97, crosses: 5, interceptions: 25, tackles: 18, saves: 0 },
};

describe("local OCR of the Full Time screen", () => {
  it("reads every number from a real screenshot without AI", async () => {
    const read = await readFullTimeScreen(fixture);
    expect(read.problems).toEqual([]);
    expect(read.complete).toBe(true);
    expect(read.left).toMatchObject(EXPECTED.left);
    expect(read.right).toMatchObject(EXPECTED.right);
    expect(read.labelCandidates.left.map((c) => c.text)).toContain("KynGian");
  }, 60_000);

  it("works on a different size of the same screen (iPhone 2556×1179)", async () => {
    const scaled = await sharp(fixture).resize({ width: 2556, height: 1181, fit: "fill" }).png().toBuffer();
    const read = await readFullTimeScreen(scaled);
    expect(read.left).toMatchObject(EXPECTED.left);
    expect(read.right).toMatchObject(EXPECTED.right);
  }, 60_000);

  it("scales very large screenshots down before reading (and handles parallel requests)", async () => {
    const big = await sharp(fixture).resize({ width: 4000, height: 1848, fit: "fill" }).png().toBuffer();
    const [a, b] = await Promise.all([readFullTimeScreen(big), readFullTimeScreen(fixture)]);
    expect(a.left).toMatchObject(EXPECTED.left);
    expect(a.right).toMatchObject(EXPECTED.right);
    expect(b.complete).toBe(true);
  }, 90_000);

  it("survives heavy JPEG re-compression and a smaller size (e.g. forwarded through chat apps)", async () => {
    const squashed = await sharp(fixture).resize({ width: 1600 }).jpeg({ quality: 55 }).toBuffer();
    const read = await readFullTimeScreen(squashed);
    expect(read.left).toMatchObject(EXPECTED.left);
    expect(read.right).toMatchObject(EXPECTED.right);
  }, 60_000);

  it("reports incomplete (so the AI fallback runs) for an unrelated image", async () => {
    const blank = await sharp({ create: { width: 1600, height: 740, channels: 3, background: "#1e293b" } }).png().toBuffer();
    const read = await readFullTimeScreen(blank);
    expect(read.complete).toBe(false);
    expect(read.problems.length).toBeGreaterThan(0);
  }, 60_000);
});

const pkFixture = readFileSync(join(__dirname, "..", "fixtures", "fulltime-pk-7-7.webp"));

// The shoot-out variant of the screen: "7 – 7" with a "6 PK 7" strip, which pushes the score up.
const PK_EXPECTED = {
  left: { goals: 7, penalties: 6, possession_pct: 41, shots: 15, shots_on_target: 8, fouls: 6, offsides: 2, corners: 0, free_kicks: 1, passes: 172, successful_passes: 116, crosses: 1, interceptions: 31, tackles: 23, saves: 4 },
  right: { goals: 7, penalties: 7, possession_pct: 59, shots: 16, shots_on_target: 10, fouls: 1, offsides: 1, corners: 2, free_kicks: 6, passes: 242, successful_passes: 196, crosses: 5, interceptions: 45, tackles: 13, saves: 1 },
};

describe("penalty shoot-out screen", () => {
  it("reads the score, the shoot-out and every stat", async () => {
    const read = await readFullTimeScreen(pkFixture);
    expect(read.problems).toEqual([]);
    expect(read.complete).toBe(true);
    expect(read.left).toMatchObject(PK_EXPECTED.left);
    expect(read.right).toMatchObject(PK_EXPECTED.right);
    expect(read.labelCandidates.right.map((c) => c.text).join(" ")).toMatch(/Manchester/);
  }, 60_000);

  it("still works after JPEG re-compression at a smaller size", async () => {
    const squashed = await sharp(pkFixture).resize({ width: 1600 }).jpeg({ quality: 60 }).toBuffer();
    const read = await readFullTimeScreen(squashed);
    expect(read.left).toMatchObject(PK_EXPECTED.left);
    expect(read.right).toMatchObject(PK_EXPECTED.right);
  }, 60_000);

  it("leaves penalties empty on a normal full-time screen", async () => {
    const read = await readFullTimeScreen(fixture);
    expect(read.left.penalties ?? null).toBeNull();
    expect(read.right.penalties ?? null).toBeNull();
  }, 60_000);
});

describe("on-screen name matching", () => {
  const known = [
    { playerId: "p1", label: "KynGian", uses: 12 },
    { playerId: "p2", label: "หีอุ่น", uses: 7 },
  ];

  it("normalises spacing and case", () => {
    expect(normalizeLabel("ห ี อ ุ ่ น")).toBe("หีอุ่น");
    expect(normalizeLabel("“KynGian")).toBe("kyngian");
  });

  it("matches names seen before, tolerating one OCR error", () => {
    expect(matchKnownLabel(["kyngian"], known)).toEqual({ label: "KynGian", playerId: "p1" });
    expect(matchKnownLabel(["Kou", "ห ี อ ุ ่ น"], known)).toEqual({ label: "หีอุ่น", playerId: "p2" });
    expect(matchKnownLabel(["KynGlan"], known)).toEqual({ label: "KynGian", playerId: "p1" });
    expect(matchKnownLabel(["Kou"], known)).toBeNull();
  });

  it("suggests who played on each side from recognised names", () => {
    const k = { label: "KynGian", playerId: "p1" };
    const h = { label: "หีอุ่น", playerId: "p2" };
    expect(suggestPlayers(k, h, ["p1", "p2", "p3"])).toEqual({ leftPlayer: "p1", rightPlayer: "p2" });
    expect(suggestPlayers(k, null, ["p1", "p2", "p3"])).toEqual({ leftPlayer: "p1", rightPlayer: null });
    expect(suggestPlayers(null, h, ["p1", "p2"])).toEqual({ leftPlayer: "p1", rightPlayer: "p2" });
    expect(suggestPlayers(k, k, ["p1", "p2"])).toEqual({ leftPlayer: null, rightPlayer: null });
  });

  it("only trusts confident Latin reads for brand-new names", () => {
    expect(trustedLatinLabel("KynGian", 90)).toBe("KynGian");
    expect(trustedLatinLabel("KynGian", 60)).toBeNull();
    expect(trustedLatinLabel("ห ้ อ น", 95)).toBeNull();
  });
});

describe("OCR worker lifecycle", () => {
  it("unloads the workers after a quiet period and reloads them for the next read", async () => {
    process.env.OCR_IDLE_MS = "300";
    try {
      const first = await readFullTimeScreen(fixture);
      expect(first.complete).toBe(true);
      expect(ocrWorkersLoaded()).toBe(true);
      await new Promise((r) => setTimeout(r, 1200));
      expect(ocrWorkersLoaded()).toBe(false);
      const again = await readFullTimeScreen(fixture);
      expect(again.left).toMatchObject(EXPECTED.left);
    } finally {
      delete process.env.OCR_IDLE_MS;
    }
  }, 90_000);
});
