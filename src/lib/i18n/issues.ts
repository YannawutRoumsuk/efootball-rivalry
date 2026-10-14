import type { ValidationIssue } from "@/lib/domain/validation";
import type { Translate } from "./core";

/** Localised text for a validation issue; `issue.message` stays the English fallback for logs and APIs. */
export function issueText(issue: ValidationIssue, t: Translate): string {
  const side = issue.side === "left" ? t("common.Left") : issue.side === "right" ? t("common.Right") : "";
  const stat = issue.field ? t(`stat.${issue.field}`) : "";
  return t(`issue.${issue.code}`, { side, stat, ...issue.params });
}
