import test from "node:test";
import assert from "node:assert/strict";
import {
  assessJudgeItems,
  createJudgeItems,
  exportJudgeCsv,
  exportJudgeJson,
  judgeEvidence,
  restoreJudgeItems,
} from "../lib/judge/workspace";
import { flatten, groundRule } from "../lib/core/rules";

// Deliberately synthetic regression inputs; these are never loaded by the public app.
const unit = {
  assetTag: "TEST-ONLY",
  title: "Regression unit",
  brand: "INIU",
  model: "BI-B41",
  serial: "000G21",
  color: "Black",
  retailer: "Amazon",
  purchaseCountry: "USA",
  originalPurchaseDate: "2021-09",
};
void test("public evidence has genuine dated provenance and grounds every published criterion", () => {
  for (const source of judgeEvidence) {
    const excerpts = [
      source.excerpt,
      source.rule.informationEvidence,
      ...flatten(source.rule.conditions).map((c) => c.evidence),
      ...flatten(source.rule.exclusions!).map((c) => c.evidence),
    ].join("\n");
    assert.equal(groundRule(source.rule, excerpts).unresolved.length, 0);
    assert.match(source.url, /^https:\/\/iniushop.com\//);
    assert.match(source.supportingUrl, /^https:\/\/www.cpsc.gov\/Recalls\//);
    assert.match(source.contentHash, /^[a-f0-9]{64}$/);
    assert.ok(Number.isFinite(Date.parse(source.retrievedAt)));
  }
});
void test("judge input validation is atomic and prevents duplicate physical units", () => {
  const rows = createJudgeItems([unit]);
  assert.throws(
    () => createJudgeItems([{ ...unit, assetTag: " test-only " }], rows),
    /already exists/,
  );
  assert.throws(() => createJudgeItems([{ ...unit, title: "" }], rows));
  assert.throws(() => createJudgeItems(Array(1001).fill(unit)), /1,000/);
  assert.equal(rows.length, 1);
});
void test("judge comparisons use actual matcher outcomes and preserve prior local holds", () => {
  const [row] = assessJudgeItems(createJudgeItems([unit]), judgeEvidence[0].id);
  assert.equal(row.decision?.status, "affected");
  assert.equal(row.held, true);
  const [missing] = assessJudgeItems(
    createJudgeItems([{ ...unit, serial: "" }]),
    judgeEvidence[0].id,
  );
  assert.equal(missing.decision?.status, "needs_review");
  assert.equal(missing.held, false);
  const [recheck] = assessJudgeItems(
    [{ ...row, item: { ...unit, serial: "" } }],
    judgeEvidence[0].id,
  );
  assert.equal(recheck.decision?.status, "needs_review");
  assert.equal(recheck.held, true);
});
void test("session restore validates inputs and recomputes untrusted decisions", () => {
  const rows = createJudgeItems([unit]);
  const raw = JSON.stringify({
    version: 1,
    items: rows.map((row) => ({
      ...row,
      evidenceId: judgeEvidence[0].id,
      decision: { status: "excluded_by_notice" },
    })),
  });
  assert.equal(restoreJudgeItems(raw)[0].decision?.status, "affected");
  assert.throws(() => restoreJudgeItems("{"));
  assert.throws(() =>
    restoreJudgeItems(JSON.stringify({ version: 2, items: [] })),
  );
  assert.throws(() =>
    restoreJudgeItems(
      JSON.stringify({ version: 1, items: [{ item: { title: "no asset" } }] }),
    ),
  );
});
void test("judge exports work empty and retain scope, traces, source date and CSV formula protection", () => {
  const empty = JSON.parse(exportJudgeJson([]));
  assert.equal(empty.inventory.length, 0);
  assert.equal(empty.evidence.length, judgeEvidence.length);
  assert.equal(empty.mode, "PUBLIC_JUDGE_SAVED_EVIDENCE");
  assert.equal(exportJudgeCsv([]).split("\r\n").length, 1);
  const rows = assessJudgeItems(
    createJudgeItems([{ ...unit, title: "=DANGEROUS()" }]),
    judgeEvidence[0].id,
  );
  assert.ok(
    JSON.parse(exportJudgeJson(rows)).inventory[0].decision.trace.length > 0,
  );
  assert.match(exportJudgeCsv(rows), /'=DANGEROUS/);
  assert.match(exportJudgeCsv(rows, true), /PUBLIC_JUDGE_SAVED_EVIDENCE/);
});
