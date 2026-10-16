import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ELO, expectedScore, PERFORMANCE_WEIGHTS, type PerformanceKey } from "@/lib/domain/elo";
import { ELO_EXAMPLES, type EloExample } from "@/lib/domain/elo-examples";
import { signed } from "@/lib/format";
import type { Locale } from "@/lib/i18n/core";
import { getLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await getLocale()) === "th" ? "Elo คิดยังไง" : "How Elo works" };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number, d = 2) => x.toFixed(d);

type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  intro: string;
  steps: Array<{ title: string; body: ReactNode; formula?: string }>;
  gapTitle: string;
  gapCols: [string, string];
  weightsTitle: string;
  weightNames: Record<PerformanceKey, string>;
  examplesTitle: string;
  exampleTitle: Record<EloExample["id"], string>;
  exampleCols: { rating: string; score: string; expected: string; perf: string; s: string; change: string };
  exampleNote: Record<EloExample["id"], string>;
  rulesTitle: string;
  rules: string[];
};

const TH: Copy = {
  back: "กลับหน้าหลัก",
  eyebrow: "โน้ตความรู้",
  title: "ระบบ Elo คิดคะแนนยังไง",
  intro:
    "Elo เป็นคะแนนบอกระดับฝีมือ แบบที่ใช้ในหมากรุกและเกมจัดอันดับ ทุกคนเริ่มที่ 1000 ชนะได้คะแนน แพ้เสียคะแนน แต่ได้หรือเสียเท่าไหร่ขึ้นกับว่าเจอใคร ชนะคนเก่งได้เยอะ ชนะคนที่อ่อนกว่าได้น้อย เล่นเยอะจึงไม่ได้เปรียบ คะแนนสะท้อนฝีมือ ไม่ใช่จำนวนนัด",
  steps: [
    {
      title: "1. คาดผลก่อนแข่ง",
      body: "ดูจากส่วนต่างคะแนนของสองคนว่าใครน่าจะชนะ ส่วนต่างยิ่งมาก คนที่คะแนนสูงกว่ายิ่งถูกคาดว่าจะชนะ",
      formula: "โอกาสชนะที่คาดไว้ (E) = 1 ÷ (1 + 10^((คะแนนคู่แข่ง − คะแนนเรา) ÷ 400))",
    },
    {
      title: "2. ให้คะแนนผลที่เกิดขึ้นจริง",
      body: (
        <>
          ผลการแข่งคิดเป็น <strong>75%</strong> (ชนะ = 1, เสมอ = 0.5, แพ้ = 0) และ <strong>ฟอร์มในเกม</strong> คิดเป็น <strong>25%</strong>{" "}
          ฟอร์มในเกมคือสัดส่วนสถิติของเราเทียบกับคู่แข่ง (ดูตารางด้านล่าง) ถ้าแพ้แต่สู้สูสี ยิงเข้ากรอบพอ ๆ กัน ก็เสียคะแนนน้อยกว่าแพ้ขาด
          ผลการแข่งยังสำคัญที่สุด: คนชนะได้อย่างน้อย 0.75 คนแพ้ได้ไม่เกิน 0.25
        </>
      ),
      formula: "คะแนนแมตช์ (S) = 0.75 × ผล + 0.25 × ฟอร์มในเกม",
    },
    {
      title: "3. ปรับคะแนน",
      body: `เอาผลจริงลบผลที่คาด แล้วคูณ ${ELO.k} ถ้าทำได้ดีกว่าที่คาดคะแนนขึ้น แย่กว่าที่คาดคะแนนลง คนหนึ่งได้เท่าไหร่ อีกคนเสียเท่านั้น คนชนะจะได้อย่างน้อย +${ELO.minWinnerGain} เสมอ`,
      formula: `คะแนนที่เปลี่ยน (Δ) = ${ELO.k} × (S − E)`,
    },
  ],
  gapTitle: "ส่วนต่างคะแนนกับโอกาสชนะที่คาดไว้",
  gapCols: ["คะแนนเรามากกว่า", "โอกาสชนะที่คาดไว้"],
  weightsTitle: "ฟอร์มในเกมดูจากอะไรบ้าง",
  weightNames: {
    goals: "ประตู",
    shots_on_target: "ยิงเข้ากรอบ",
    possession: "ครองบอล",
    pass_accuracy: "ความแม่นยำการจ่ายบอล",
    shots: "ยิงทั้งหมด",
  },
  examplesTitle: "ตัวอย่าง (คิดจากสูตรจริงของระบบ)",
  exampleTitle: {
    even: "ฝีมือเท่ากัน ชนะ 2–1",
    favourite: "เต็งชนะตามคาด 3–0",
    upset: "พลิกล็อก คนคะแนนน้อยชนะ 1–0",
    closeLoss: "แพ้แบบสู้สุดใจ 2–3",
    thrashing: "แพ้ขาด 0–5",
  },
  exampleCols: { rating: "คะแนนก่อนแข่ง", score: "สกอร์", expected: "E (คาดไว้)", perf: "ฟอร์มในเกม", s: "S (จริง)", change: "คะแนนเปลี่ยน" },
  exampleNote: {
    even: "เริ่มเท่ากัน คาดไว้ 50/50 ชนะแบบเหนือกว่าเล็กน้อยเลยได้ราว 40% ของ K",
    favourite: "ชนะคนที่อ่อนกว่า 200 แต้ม ได้คะแนนไม่มาก เพราะทุกคนคาดไว้แล้วว่าจะชนะ",
    upset: "คนที่ถูกคาดว่าจะแพ้กลับชนะ ได้คะแนนก้อนใหญ่",
    closeLoss: "แพ้แต่ฟอร์มดี เสียคะแนนนิดเดียว",
    thrashing: "แพ้ขาดและสถิติแย่ เสียคะแนนเกือบสองเท่าของแพ้แบบสูสี",
  },
  rulesTitle: "กติกาเพิ่มเติม",
  rules: [
    `ทุกคนเริ่มที่ ${ELO.start} ใหม่ทุกซีซัน (ซีซันละไตรมาส: ม.ค.–มี.ค., เม.ย.–มิ.ย., ก.ค.–ก.ย., ต.ค.–ธ.ค.)`,
    `ใครเล่นยังไม่ครบ ${ELO.provisionalGames} นัดในซีซันนั้น (หรือทั้งหมด ในมุมมองรวมทุกซีซัน) จะขึ้นว่า "รอประมวลผล" เพราะคะแนนยังไม่นิ่ง`,
    "แมตช์ก่อนเปิดระบบซีซันอยู่ใน “พรีซีซัน” ไม่ได้ลบทิ้ง เปิดดูย้อนหลังได้",
    "มุมมอง “รวมทุกซีซัน” คิด Elo ต่อเนื่องตั้งแต่แมตช์แรก",
    "นับเฉพาะแมตช์ที่ยืนยันแล้ว แมตช์ที่ถูกโต้แย้งหรือยกเลิกไม่นับ ถ้าแก้ผลหรือย้ายลำดับแมตช์ คะแนนจะคิดใหม่ทั้งหมดอัตโนมัติ",
    "ถ้าแมตช์ไหนไม่มีสถิติบางตัว (เช่นกรอกผลเองแค่สกอร์) ระบบข้ามตัวนั้นแล้วเฉลี่ยจากตัวที่มี อย่างน้อยจะมีประตูเสมอ",
    "คำนวณด้วยสูตรตายตัวในระบบ ไม่ได้ให้ AI คิด ผลจึงเหมือนเดิมทุกครั้งและตรวจย้อนหลังได้",
  ],
};

const EN: Copy = {
  back: "Back to dashboard",
  eyebrow: "Guide",
  title: "How the Elo rating works",
  intro:
    "Elo is a skill rating, as used in chess and ranked games. Everyone starts at 1000; winning raises it and losing lowers it, but by how much depends on the opponent. Beating a stronger player earns a lot, beating a weaker one earns little — so playing more often doesn't help by itself.",
  steps: [
    {
      title: "1. Predict the result",
      body: "The rating gap says who is expected to win. The bigger the gap, the more the higher-rated player is expected to win.",
      formula: "Expected score (E) = 1 ÷ (1 + 10^((opponent − me) ÷ 400))",
    },
    {
      title: "2. Score what actually happened",
      body: (
        <>
          The result counts <strong>75%</strong> (win 1, draw ½, loss 0) and <strong>in-game performance</strong> counts <strong>25%</strong> — your share of the
          match&apos;s key stats (table below). A close, well-played defeat costs less than a thrashing. The result still dominates: a winner scores at least 0.75, a
          loser at most 0.25.
        </>
      ),
      formula: "Match score (S) = 0.75 × result + 0.25 × performance",
    },
    {
      title: "3. Update the ratings",
      body: `Actual minus expected, times ${ELO.k}. Better than expected goes up, worse goes down. One player gains exactly what the other loses, and a winner always gains at least +${ELO.minWinnerGain}.`,
      formula: `Change (Δ) = ${ELO.k} × (S − E)`,
    },
  ],
  gapTitle: "Rating gap vs expected score",
  gapCols: ["I'm rated higher by", "Expected score"],
  weightsTitle: "What in-game performance looks at",
  weightNames: {
    goals: "Goals",
    shots_on_target: "Shots on target",
    possession: "Possession",
    pass_accuracy: "Pass accuracy",
    shots: "Shots",
  },
  examplesTitle: "Examples (computed with the real formula)",
  exampleTitle: {
    even: "Even players, won 2–1",
    favourite: "Favourite wins 3–0",
    upset: "Upset: lower-rated player wins 1–0",
    closeLoss: "Close defeat 2–3",
    thrashing: "Thrashed 0–5",
  },
  exampleCols: { rating: "Ratings before", score: "Score", expected: "E (expected)", perf: "Performance", s: "S (actual)", change: "Change" },
  exampleNote: {
    even: "Level start, 50/50 expected; a slightly dominant win earns about 40% of K.",
    favourite: "Beating someone 200 points lower earns little — everyone expected it.",
    upset: "The expected loser wins and earns a big jump.",
    closeLoss: "Lost but played well: only a small drop.",
    thrashing: "A heavy, one-sided defeat costs nearly twice as much as the close one.",
  },
  rulesTitle: "Other rules",
  rules: [
    `Everyone restarts at ${ELO.start} each season (one season per quarter: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec).`,
    `Ratings show “Pending” until a player has ${ELO.provisionalGames} games in that season (or in total, in the all-seasons view).`,
    "Matches from before seasons started are in the “Pre-season” — nothing was deleted.",
    "“All seasons” runs Elo continuously from the very first match.",
    "Only confirmed matches count. Correcting or reordering a match recalculates everything automatically.",
    "Stats that weren't recorded (e.g. a score-only manual entry) are skipped; goals are always there.",
    "Computed by a fixed formula in the app, not by AI — the same inputs always give the same ratings.",
  ],
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel space-y-3 p-4 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Formula({ children }: { children: string }) {
  return <p className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[0.8rem] leading-relaxed sm:text-sm">{children}</p>;
}

function ExampleCard({ e, copy, locale }: { e: EloExample; copy: Copy; locale: Locale }) {
  const c = e.change;
  const dA = c.delta.A;
  const rows: Array<[string, string, string]> = [
    [copy.exampleCols.rating, String(e.ratings[0]), String(e.ratings[1])],
    [copy.exampleCols.score, String(e.score[0]), String(e.score[1])],
    [copy.exampleCols.expected, num(c.expected.A), num(c.expected.B)],
    [copy.exampleCols.perf, pct(c.performance.A), pct(c.performance.B)],
    [copy.exampleCols.s, num(c.score.A), num(c.score.B)],
  ];
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-2 font-medium">{copy.exampleTitle[e.id]}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-medium text-seat-1">{locale === "th" ? "ผู้เล่น A" : "Player A"}</th>
            <th className="py-1 text-right font-medium text-seat-2">{locale === "th" ? "ผู้เล่น B" : "Player B"}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map(([label, a, b]) => (
            <tr key={label} className="border-t">
              <td className="py-1.5 text-muted-foreground">{label}</td>
              <td className="py-1.5 text-right">{a}</td>
              <td className="py-1.5 text-right">{b}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1.5">{copy.exampleCols.change}</td>
            <td className={cn("py-1.5 text-right", dA > 0 ? "text-success" : "text-destructive")}>{signed(Math.round(dA))}</td>
            <td className={cn("py-1.5 text-right", dA < 0 ? "text-success" : "text-destructive")}>{signed(-Math.round(dA))}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        A: {ELO.k} × ({num(c.score.A)} − {num(c.expected.A)}) = {signed(Number(dA.toFixed(1)))}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{copy.exampleNote[e.id]}</p>
    </div>
  );
}

export default async function EloGuidePage() {
  const locale = await getLocale();
  const copy = locale === "th" ? TH : EN;
  const gaps = [0, 50, 100, 200, 300, 400];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {copy.back}
      </Link>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.intro} />

      {copy.steps.map((s) => (
        <Card key={s.title} title={s.title}>
          <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          {s.formula && <Formula>{s.formula}</Formula>}
        </Card>
      ))}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title={copy.gapTitle}>
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-medium">{copy.gapCols[0]}</th>
                <th className="py-1 text-right font-medium">{copy.gapCols[1]}</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g} className="border-t">
                  <td className="py-1.5">{g === 0 ? "0" : `+${g}`}</td>
                  <td className="py-1.5 text-right">{pct(expectedScore(ELO.start + g, ELO.start))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={copy.weightsTitle}>
          <table className="w-full text-sm tabular">
            <tbody>
              {(Object.entries(PERFORMANCE_WEIGHTS) as Array<[PerformanceKey, number]>).map(([key, w]) => (
                <tr key={key} className="border-t first:border-t-0">
                  <td className="py-1.5">{copy.weightNames[key]}</td>
                  <td className="py-1.5 text-right">{pct(w)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title={copy.examplesTitle}>
        <div className="grid gap-3 sm:grid-cols-2">
          {ELO_EXAMPLES.map((e) => (
            <ExampleCard key={e.id} e={e} copy={copy} locale={locale} />
          ))}
        </div>
      </Card>

      <Card title={copy.rulesTitle}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {copy.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
