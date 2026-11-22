import { z } from "zod";
import { isSquadStatKey, rowFor, type SquadStatKey } from "./squad";

const statsSchema = z
  .record(z.string(), z.number().int().min(0).nullable())
  .refine((o) => Object.keys(o).every((k) => isSquadStatKey(k)), "Unknown statistic.")
  .refine(
    (o) => Object.entries(o).every(([k, v]) => v === null || (isSquadStatKey(k) && v <= rowFor(k as SquadStatKey).max)),
    "A value is out of range.",
  );

const goals = z.number().int().min(0).max(99).nullable();

/** Body of POST /api/squad/matches and PUT /api/squad/matches/[id]. */
export const squadMatchSchema = z.object({
  played_at: z.iso.datetime({ offset: true }).nullable(),
  team_name: z.string().trim().max(60).nullable(),
  goals_for: goals,
  goals_against: goals,
  players: z
    .array(
      z.object({
        slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        player_id: z.uuid().nullable(),
        ingame_name: z.string().trim().max(60).nullable(),
        stats: statsSchema,
      }),
    )
    .min(2)
    .max(3)
    .refine((ps) => new Set(ps.map((p) => p.slot)).size === ps.length, "Each column only once."),
  upload_ids: z.array(z.uuid()).max(12).default([]),
});

export type SquadMatchInput = z.infer<typeof squadMatchSchema>;
