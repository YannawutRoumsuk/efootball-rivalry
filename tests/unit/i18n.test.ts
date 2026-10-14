import { describe, expect, it } from "vitest";
import { emptyDraftSide, validateSides } from "@/lib/domain/validation";
import { createTranslator } from "@/lib/i18n/core";
import { en } from "@/lib/i18n/en";
import { issueText } from "@/lib/i18n/issues";
import { th } from "@/lib/i18n/th";

describe("translations", () => {
  it("has a Thai string for every English key, and no empty ones", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(th)) expect(value, key).not.toBe("");
  });

  it("keeps the same {placeholders} in both languages", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(vars(th[key]), key).toEqual(vars(en[key]));
    }
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    const t = createTranslator("en");
    expect(t("card.match", { n: 7 })).toBe("Match #7");
    expect(t("card.match")).toBe("Match #{n}");
  });

  it("localises validation issues from their codes", () => {
    const left = { ...emptyDraftSide(), goals: 1, shots: 2, shots_on_target: 5 };
    const right = { ...emptyDraftSide(), goals: 0 };
    const issue = validateSides(left, right).find((i) => i.code === "sotGtShots")!;
    expect(issueText(issue, createTranslator("en"))).toBe("Left: shots on target (5) can't exceed total shots (2).");
    expect(issueText(issue, createTranslator("th"))).toContain("5");
  });
});
