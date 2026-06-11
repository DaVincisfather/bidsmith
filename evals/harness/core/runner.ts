import type { EvalConfig, EvalRun, FixtureRunResult } from "./types";

export async function runEval<F extends { id: string }, O, C>(
  config: EvalConfig<F, O, C>,
  fixtures: F[]
): Promise<EvalRun> {
  const fixtureResults: FixtureRunResult[] = [];

  for (const fixture of fixtures) {
    // Progress per fixture — körningar på riktiga underlag tar minuter per
    // fixture och en tyst hängning går annars inte att skilja från arbete.
    console.log(`  → ${fixture.id} (${new Date().toISOString()})`);
    try {
      const { output, context } = await config.runModule(fixture);
      const judgments = await config.judgeOutput(fixture, output, context);
      const metrics = config.computeFixtureMetrics(judgments, fixture, context);
      fixtureResults.push({
        fixtureId: fixture.id,
        actual: output,
        judgments,
        metrics,
      });
    } catch (err) {
      fixtureResults.push({
        fixtureId: fixture.id,
        judgments: [],
        metrics: {},
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const goodMetrics = fixtureResults
    .filter((r) => !r.error)
    .map((r) => r.metrics);
  const aggregate = goodMetrics.length === 0 ? {} : config.computeAggregate(goodMetrics);

  return {
    module: config.module,
    mode: config.mode,
    timestamp: new Date().toISOString(),
    fixtures: fixtureResults,
    aggregate,
  };
}
