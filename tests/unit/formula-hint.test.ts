import { describe, expect, it } from "vitest";
import { FORMULAS } from "@/components/ui/formula-hint";
import { en } from "@/lib/i18n/en";
import { th } from "@/lib/i18n/th";

describe("formula notes", () => {
  it("every Σ badge has a title and an explanation in Thai and English", () => {
    for (const dict of [en, th] as Array<Record<string, string>>) {
      for (const id of FORMULAS) {
        expect(dict[`formula.${id}.title`], `formula.${id}.title`).toBeTruthy();
        expect(dict[`formula.${id}`], `formula.${id}`).toBeTruthy();
      }
    }
  });
});
