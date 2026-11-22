import { z } from "zod";
import { AWARD_TIERS, isSquadStatKey, minOf, rowFor, TEAM_STAT_KEYS, type SquadStatKey } from "./squad";

const statsSchema = z
  .record(z.string(), z.number().int().nullable())
  .refine((o) => Object.keys(o).every((k) => isSquadStatKey(k)), "Unknown statistic.")
  .refine(
    (o) =>
      Object.entries(o).every(
        ([k, v]) => v === null || (isSquadStatKey(k) && v >= minOf(k as SquadStatKey) && v <= rowFor(k as SquadStatKey).max),
      ),
    "A value is out of range.",
  );

/** Co-op Awards titles of one column. */
export const awardsSchema = z.array(z.object({ title: z.string().trim().min(1).max(40), tier: z.enum(AWARD_TIERS) })).max(6);

const goals = z.number().int().min(0).max(99).nullable();

const teamSideSchema = z
  .record(z.string(), z.number().int().min(0).max(3000).nullable())
  .refine((o) => Object.keys(o).every((k) => (TEAM_STAT_KEYS as readonly string[]).includes(k)), "Unknown team statistic.")
  .refine((o) => o.possession_pct == null || o.possession_pct <= 100, "Possession is a percentage.");

/** Full Time screen: our team and the opponents (1v1 stat keys). */
export const teamStatsSchema = z.object({ us: teamSideSchema, them: teamSideSchema }).nullable();

/** Body of POST /api/squad/matches and PUT /api/squad/matches/[id]. */
export const squadMatchSchema = z.object({
  played_at: z.iso.datetime({ offset: true }).nullable(),
  team_name: z.string().trim().max(60).nullable(),
  opponent_name: z.string().trim().max(60).nullable().default(null),
  team_stats: teamStatsSchema.default(null),
  goals_for: goals,
  goals_against: goals,
  players: z
    .array(
      z.object({
        slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        player_id: z.uuid().nullable(),
        ingame_name: z.string().trim().max(60).nullable(),
        stats: statsSchema,
        awards: awardsSchema.default([]),
      }),
    )
    .min(2)
    .max(3)
    .refine((ps) => new Set(ps.map((p) => p.slot)).size === ps.length, "Each column only once."),
  upload_ids: z.array(z.uuid()).max(12).default([]),
});

export type SquadMatchInput = z.infer<typeof squadMatchSchema>;
