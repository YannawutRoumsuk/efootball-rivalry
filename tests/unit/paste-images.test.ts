import { describe, expect, it } from "vitest";
import { imagesFromClipboard } from "@/hooks/use-paste-images";

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });
const item = (f: File | null, kind = "file") => ({ kind, type: f?.type ?? "text/plain", getAsFile: () => f });

describe("pasting screenshots", () => {
  it("takes image files copied from the file explorer, skipping other files", () => {
    const shot = file("a.png", "image/png");
    expect(imagesFromClipboard({ files: [shot, file("notes.txt", "text/plain")], items: [] })).toEqual([shot]);
  });

  it("takes a copied screenshot from the clipboard items", () => {
    const shot = file("image.png", "image/png");
    expect(imagesFromClipboard({ files: [], items: [item(shot), item(null, "string")] })).toEqual([shot]);
  });

  it("ignores plain text and an empty clipboard", () => {
    expect(imagesFromClipboard({ files: [], items: [item(null, "string")] })).toEqual([]);
    expect(imagesFromClipboard(null)).toEqual([]);
  });
});
