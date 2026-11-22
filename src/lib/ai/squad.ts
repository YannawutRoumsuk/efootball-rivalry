import "server-only";

import { ApiError } from "@/lib/api/envelope";
import { sanitizeAiSquad, type AiSquadRead } from "@/lib/domain/squad-ai";
import type { AiConfig } from "@/lib/env";
import { visionJson } from "./extract";

export const SQUAD_PROMPT = `You read post-match screenshots of the eFootball co-op (3 vs 3) mode. A screenshot is one of:

1. "table": a statistics table for our team. At the top: the team name (e.g. "BVB") and three player names, one per column, left to right. Below, rows with a label on the left ("Total Points", "Offensive Positioning", "Shooting", "Dueling", "Defensive Positioning", "Passing", "Dribbling", "Goals", "Shots (On target)", "Assist", "Key Passes", "Passes (Successful)", "Instrumental Passes", "Dribbles (Successful)", "Instrumental Dribbles", "Receiving", "Good Receives", "Overlaps", "Runs Out Wide", "Forward Runs", "Offensive Receives", "Intercepts", "Tackles", "Impactful Steals", "Frontal Presses", "Presses from Behind", "Good Positioning", "Double-Marks", "Passes Obstructed", "Players Marked") and one value per player column. Only some rows are visible in one screenshot; "Evaluation Graph" and "Details" are headings, not rows.
2. "awards": the "Co-op Awards" screen: three player names, each with up to three title pills ("The Architect", "Goal Hunter", ...). Pill colour: orange/yellow = "gold", blue-grey = "silver", brown = "bronze".
3. "fulltime": the "Full Time" score screen of the two teams.
4. "other": anything else.

Rules:
- Copy every value exactly as printed, as text: "29 (16)" stays "29 (16)", "61%" stays "61%", a minus sign stays ("-23"). Never estimate, calculate or reorder.
- If a value is cut off, blurry or unreadable, use null. Use "0" only when 0 is printed.
- Keep the three columns in screen order, left to right, in "names" and in every row's "values".
- For a table, return each visible row once with its exact label. For awards, return the titles per column (same order as "names") in "awards" and an empty "rows".
- For "fulltime" and "other", return empty "rows" and "awards" and null names.`;

const nullableString = { type: ["string", "null"] };

export const SQUAD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["screen", "team", "names", "rows", "awards"],
  properties: {
    screen: { type: "string", enum: ["table", "awards", "fulltime", "other"] },
    team: nullableString,
    names: { type: "array", items: nullableString },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "values"],
        properties: { label: { type: "string" }, values: { type: "array", items: nullableString } },
      },
    },
    awards: {
      type: "array",
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "tier"],
          properties: { title: { type: "string" }, tier: { type: "string", enum: ["gold", "silver", "bronze"] } },
        },
      },
    },
  },
};

/** Asks the vision model to read one 3v3 screenshot. */
export async function readSquadWithAi(config: AiConfig, image: { base64: string; mime: string }): Promise<{ raw: unknown; read: AiSquadRead }> {
  const raw = await visionJson(config, {
    system: SQUAD_PROMPT,
    instruction: "Read this screenshot.",
    schemaName: "efootball_coop_screen",
    schema: SQUAD_JSON_SCHEMA,
    image,
    maxTokens: 4000,
  });
  const read = sanitizeAiSquad(raw);
  if (!read) throw new ApiError("AI_BAD_SHAPE", "The AI response didn't match the expected format.", 502);
  return { raw, read };
}
