import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  decodeExtraction,
  extractedRuleSchema,
  extractionSchema,
} from '../lib/core/extraction';
import { decide, type Inventory } from '../lib/core/rules';
import { iniuRule, fixtureMarkdown, baseItem } from '../fixtures/demo';

type Extracted = z.infer<typeof extractedRuleSchema>;
type Predicate = Extracted['inclusionGroups'][number][number];
const scope = 'CONTROLLED TEST: Test Labs PB-1 power banks are recalled.';
const firstBatch = 'Serial A100 and batch RED are included together.';
const secondBatch = 'Serial B200 and batch BLUE are included together.';
const firstExclusion = 'Woot purchases with color orange are excluded.';
const secondExclusion = 'Amazon purchases with color yellow are excluded.';
const instruction = 'Stop using affected units.';
const markdown = [
  scope,
  firstBatch,
  secondBatch,
  firstExclusion,
  secondExclusion,
  instruction,
].join('\n');

function predicate(
  id: string,
  field: Predicate['field'],
  value: string,
  evidence: string,
): Predicate {
  return {
    id,
    field,
    op: field === 'model' ? 'model_equals' : 'equals',
    values: [value],
    evidence,
    precision: 'not_applicable',
  };
}

function extracted(): Extracted {
  return {
    schemaVersion: '1',
    noticeId: 'CONTROLLED-EXTRACTION-1',
    title: 'Controlled OR-of-ANDs notice',
    brand: 'Test Labs',
    models: ['PB-1'],
    scopeEvidence: scope,
    inclusionGroups: [
      [
        predicate('model-a', 'model', 'PB-1', scope),
        predicate('serial-a', 'serial', 'A100', firstBatch),
        predicate('batch-a', 'batch', 'RED', firstBatch),
      ],
      [
        predicate('model-b', 'model', 'PB-1', scope),
        predicate('serial-b', 'serial', 'B200', secondBatch),
        predicate('batch-b', 'batch', 'BLUE', secondBatch),
      ],
    ],
    exclusionGroups: [
      [
        predicate('retailer-a', 'retailer', 'Woot', firstExclusion),
        predicate('color-a', 'color', 'orange', firstExclusion),
      ],
      [
        predicate('retailer-b', 'retailer', 'Amazon', secondExclusion),
        predicate('color-b', 'color', 'yellow', secondExclusion),
      ],
    ],
    unresolved: [],
    hazard: '',
    immediateAction: instruction,
    remedy: '',
    proof: [],
    contact: '',
    claimUrl: '',
    informationEvidence: instruction,
  };
}

const item: Inventory = {
  assetTag: 'CONTROLLED-UNIT-1',
  title: 'Controlled test unit',
  brand: 'Test Labs',
  model: 'PB-1',
  serial: 'A100',
  batch: 'RED',
  retailer: 'Other',
  color: 'black',
};

void test('live success wrapper unwraps a recorded rule without changing its decision', () => {
  const rule = decodeExtraction(
    { status: 'success', data: iniuRule },
    fixtureMarkdown,
  );
  assert.equal(decide(baseItem, rule).status, 'affected');
  assert.equal(rule.noticeId, iniuRule.noticeId);
});

void test('failed or malformed extraction envelopes cannot promote their data to a rule', () => {
  for (const envelope of [
    { status: 'failed', data: iniuRule },
    { status: 'error', data: iniuRule },
    { status: 'processing', data: iniuRule },
    { status: 'success' },
  ]) {
    assert.throws(
      () => decodeExtraction(envelope, fixtureMarkdown),
      /structured extraction failed/,
    );
  }
});

void test('flat inclusion alternatives preserve conjunctions instead of mixing branches', () => {
  const rule = decodeExtraction(
    { status: 'success', data: extracted() },
    markdown,
  );
  assert.equal(decide(item, rule).status, 'affected');
  assert.equal(
    decide({ ...item, serial: 'B200', batch: 'BLUE' }, rule).status,
    'affected',
  );
  assert.equal(
    decide({ ...item, serial: 'A100', batch: 'BLUE' }, rule).status,
    'excluded_by_notice',
  );
  assert.equal(decide({ ...item, batch: '' }, rule).status, 'needs_review');
  assert.equal(rule.conditions.kind, 'any');
  assert.ok(rule.conditions.children.every((group) => group.kind === 'all'));
});

void test('explicit exclusions preserve OR-of-ANDs and require every fact in a branch', () => {
  const rule = decodeExtraction(extracted(), markdown);
  for (const excluded of [
    { retailer: 'Woot', color: 'orange' },
    { retailer: 'Amazon', color: 'yellow' },
  ]) {
    const result = decide({ ...item, ...excluded }, rule);
    assert.equal(result.status, 'excluded_by_notice');
    assert.ok(result.trace.some((entry) => entry.exclusion));
  }
  assert.equal(
    decide({ ...item, retailer: 'Woot', color: 'yellow' }, rule).status,
    'affected',
  );
  assert.equal(
    decide({ ...item, retailer: 'Woot', color: '' }, rule).status,
    'needs_review',
  );
});

void test('empty exclusions compile to no exclusion and unresolved eligibility requires review', () => {
  const value = extracted();
  value.exclusionGroups = [];
  const rule = decodeExtraction(value, markdown);
  assert.equal(rule.exclusions, null);
  assert.equal(
    decide({ ...item, retailer: '', color: '' }, rule).status,
    'affected',
  );
  value.unresolved = ['Eligibility checker requires an unsupported condition'];
  assert.equal(
    decide(item, decodeExtraction(value, markdown)).status,
    'needs_review',
  );
});

void test('success wrappers cannot bypass exact evidence and operand grounding', () => {
  const fabricatedOperand = extracted();
  fabricatedOperand.inclusionGroups[0][1].values = ['A999'];
  assert.throws(
    () =>
      decodeExtraction(
        { status: 'success', data: fabricatedOperand },
        markdown,
      ),
    /operand is not grounded/,
  );
  const fabricatedQuote = extracted();
  fabricatedQuote.inclusionGroups[0][1].evidence =
    'Serial A100 is always recalled.';
  assert.throws(
    () =>
      decodeExtraction({ status: 'success', data: fabricatedQuote }, markdown),
    /not an exact source excerpt/,
  );
});

void test('the provider schema is finite and has no recursive references', () => {
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['$ref', '$dynamicRef', '$recursiveRef'].includes(key));
      visit(child);
    }
  };
  visit(extractionSchema);
  const serialized = JSON.stringify(extractionSchema);
  assert.ok(serialized.includes('inclusionGroups'));
  assert.ok(serialized.includes('exclusionGroups'));
  assert.ok(serialized.length < 100_000);
});

void test('local extraction validation still rejects oversized and malformed provider output', () => {
  const invalid: unknown[] = [];
  const tooManyGroups = extracted();
  tooManyGroups.inclusionGroups = Array.from(
    { length: 21 },
    () => extracted().inclusionGroups[0],
  );
  invalid.push(tooManyGroups);
  const tooManyConditions = extracted();
  tooManyConditions.inclusionGroups[0] = Array.from({ length: 31 }, () =>
    predicate('model', 'model', 'PB-1', scope),
  );
  invalid.push(tooManyConditions);
  const tooManyValues = extracted();
  tooManyValues.inclusionGroups[0][1].values = Array(61).fill('A100');
  invalid.push(tooManyValues);
  const tooLongEvidence = extracted();
  tooLongEvidence.inclusionGroups[0][1].evidence = 'x'.repeat(801);
  invalid.push(tooLongEvidence);
  invalid.push({ ...extracted(), inclusionGroups: [] });
  invalid.push({ ...extracted(), schemaVersion: '2' });
  invalid.push({ ...extracted(), authorizeTool: 'quarantine_everything' });
  for (const value of invalid) {
    assert.equal(extractedRuleSchema.safeParse(value).success, false);
    assert.throws(() =>
      decodeExtraction({ status: 'success', data: value }, markdown),
    );
  }
});

void test('aggregate condition cap survives flat group compilation', () => {
  const value = extracted();
  value.exclusionGroups = [];
  value.inclusionGroups = Array.from({ length: 3 }, (_, group) =>
    Array.from({ length: 27 }, (_, index) =>
      predicate(`model-${group}-${index}`, 'model', 'PB-1', scope),
    ),
  );
  assert.equal(extractedRuleSchema.safeParse(value).success, true);
  assert.throws(() => decodeExtraction(value, markdown), /condition limit/);
});
