import { describe, expect, it } from "vitest";
import type { Grey, Region } from "@/lib/ocr/fulltime";
import { readGlyphs, segmentCell } from "@/lib/ocr/glyphs";

const W = 80;
const H = 40;
const cell: Region = { left: 0, top: 0, width: W, height: H };

/** A dark cell with light rectangles [x, y, w, h] drawn on it (or the inverse). */
function draw(rects: Array<[number, number, number, number]>, inverted = false): Grey {
  const [bg, ink] = inverted ? [230, 20] : [20, 230];
  const data = Buffer.alloc(W * H, bg);
  for (const [x, y, w, h] of rects) for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) data[j * W + i] = ink;
  return { data, width: W, height: H };
}

const digit = (x: number): [number, number, number, number] => [x, 10, 8, 20];

describe("cutting a table cell into glyphs", () => {
  it("finds one glyph per character, light-on-dark or dark-on-light", () => {
    expect(segmentCell(draw([digit(20), digit(34)]), cell)).toHaveLength(2);
    expect(segmentCell(draw([digit(20), digit(34)], true), cell)).toHaveLength(2);
  });

  it("returns nothing for an empty or flat cell", () => {
    expect(segmentCell(draw([]), cell)).toEqual([]);
  });

  it("gives up on text clipped by the cell edge instead of reading a shorter number", () => {
    expect(segmentCell(draw([[0, 10, 8, 20], digit(34)]), cell)).toEqual([]);
    expect(segmentCell(draw([[30, 0, 8, 20]]), cell)).toEqual([]);
  });

  it("recognises a leading minus sign by shape, but no other flat mark", () => {
    const negative = segmentCell(draw([[10, 19, 7, 3], digit(22), digit(34)]), cell);
    expect(negative.map((s) => s.char ?? "d")).toEqual(["-", "d", "d"]);
    expect(segmentCell(draw([digit(20), [32, 19, 7, 3], digit(44)]), cell)).toEqual([]);
    expect(segmentCell(draw([[30, 19, 7, 3]]), cell)).toEqual([]);
  });

  it("reads nothing without templates to vouch for the glyphs", () => {
    expect(readGlyphs(segmentCell(draw([digit(20)]), cell), [])).toBeNull();
    expect(readGlyphs([], [])).toBeNull();
  });
});
