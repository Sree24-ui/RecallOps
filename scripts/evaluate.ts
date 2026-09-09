import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { evaluationCases } from '../fixtures/evaluation';
import { iniuRule, fixtureMarkdown } from '../fixtures/demo';
import { decide, groundRule } from '../lib/core/rules';
const start = performance.now();
const rows = evaluationCases.map((c) => ({
  id: c.id,
  description: c.description,
  expected: c.expected,
  actual: decide(c.item, c.rule, {
    conflict: c.conflict,
    discoveryComplete: c.discoveryComplete,
  }).status,
}));
const runtime = performance.now() - start,
  tp = rows.filter(
    (r) => r.expected === 'affected' && r.actual === 'affected',
  ).length,
  fp = rows.filter(
    (r) => r.expected !== 'affected' && r.actual === 'affected',
  ).length,
  fn = rows.filter(
    (r) => r.expected === 'affected' && r.actual !== 'affected',
  ).length;
const extractionValid = !!groundRule(iniuRule, fixtureMarkdown);
const report = {
  measuredAt: new Date().toISOString(),
  dataset:
    'Curated official INIU conditions plus synthetic operator cases, CONTROLLED_DEMO_FIXTURE',
  combinations: rows.length,
  correct: rows.filter((r) => r.actual === r.expected).length,
  affectedPrecision: tp / (tp + fp),
  affectedRecall: tp / (tp + fn),
  falsePositiveCount: fp,
  falseNegativeCount: fn,
  needsReviewRate:
    rows.filter((r) => r.actual === 'needs_review').length / rows.length,
  averageMatchingRuntimeMs: runtime / rows.length,
  totalMatchingRuntimeMs: runtime,
  fixtureExtractionSchemaValidity: {
    tested: 1,
    valid: Number(extractionValid),
  },
  liveExtractionValidity: null,
  anakinRequests: 0,
  cacheHitRate: null,
  estimatedCredits: null,
  limitations:
    'Matcher-only controlled evaluation. Not live extraction accuracy, production reliability, recall coverage, or independent user validation.',
  rows,
};
writeFileSync('docs/evaluation.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync(
  'docs/EVALUATION.md',
  `# Measured evaluation\n\nRun: ${report.measuredAt}\n\n${rows.length} controlled combinations; ${report.correct} matched their labels. Affected precision ${report.affectedPrecision}; recall ${report.affectedRecall}; false positives ${fp}; false negatives ${fn}. Needs-review rate ${report.needsReviewRate.toFixed(4)}. Mean deterministic matching runtime ${report.averageMatchingRuntimeMs.toFixed(4)} ms.\n\nOne curated extraction fixture passed schema/evidence checks. Live extraction validity was not measured. Anakin requests: 0. Cache hit rate and credit consumption: unavailable/not applicable.\n\n${report.limitations}\n\nSee evaluation.json for every expected and measured result.\n`,
);
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
if (report.correct !== rows.length) process.exitCode = 1;
