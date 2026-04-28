// Shared types for the eval harness. Domain-agnostic.

export type JudgeName = "exact" | "haiku-equiv" | "haiku-rubric" | "sonnet-mhc" | "bid-coverage" | "bid-hallucination";

export interface FieldJudgment {
  field: string;              // "title" | "requirements[0]" | "mhc.anna_svensson.krav_2"
  judge: JudgeName;
  match: boolean;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
  golden: unknown;
  actual: unknown;
  error?: string;             // set if judge itself failed (unparseable response etc.)
}

export interface FixtureRunResult {
  fixtureId: string;
  actual?: unknown;                   // module output; undefined if module errored
  judgments: FieldJudgment[];
  metrics: Record<string, number>;    // flat metric map, e.g. { "requirements.f1": 0.87 }
  error?: string;                     // set if module call failed
}

export interface EvalRun {
  module: string;                     // "analyzer" | "matcher"
  mode?: string;                      // e.g. matcher "isolated" | "end_to_end"
  timestamp: string;                  // ISO-8601
  fixtures: FixtureRunResult[];
  aggregate: Record<string, number>;
}

export interface EvalConfig<Fixture, Output, Context = undefined> {
  module: string;
  mode?: string;
  fixtureDir: string;                                         // "evals/fixtures/analyzer"
  loadFixture: (path: string) => Promise<Fixture>;
  runModule: (fixture: Fixture) => Promise<{ output: Output; context: Context }>;
  judgeOutput: (fixture: Fixture, actual: Output, context: Context) => Promise<FieldJudgment[]>;
  computeFixtureMetrics: (judgments: FieldJudgment[], fixture: Fixture) => Record<string, number>;
  computeAggregate: (fixtureMetrics: Array<Record<string, number>>) => Record<string, number>;
}
