import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterInventory,
  formatTime,
  sourceHost,
  summarizeInventory,
  type Item,
} from '../lib/ui/workspace';
import type { AssessmentState } from '../lib/core/rules';

function unit(tag: string, status?: AssessmentState, held = false): Item {
  return {
    id: tag,
    assetTag: tag,
    title: 'USB power bank',
    brand: 'Example',
    model: 'PB-10',
    serial: 'AB123',
    retailer: 'Marketplace',
    quarantined: held,
    acknowledged: false,
    assessment: status
      ? {
          id: `assessment-${tag}`,
          itemId: tag,
          createdAt: '2026-09-11T00:00:00Z',
          status,
          versionId: null,
          ruleId: null,
          label: null,
          rule: null,
          sourceUrl: null,
          trace: [],
          verified: 0,
          total: 0,
          reason: 'Test assessment',
        }
      : null,
  };
}

void test('workspace totals keep unassessed units and persisted holds separate from eligibility', () => {
  const counts = summarizeInventory([
    unit('1'),
    unit('2', 'affected'),
    unit('3', 'excluded_by_notice', true),
    unit('4', 'needs_review'),
  ]);
  assert.equal(counts.total, 4);
  assert.equal(counts.assessed, 3);
  assert.equal(counts.holds, 1);
  assert.equal(counts.statuses.affected, 1);
  assert.equal(counts.statuses.unassessed, 1);
  assert.equal(summarizeInventory([]).total, 0);
});
void test('inventory search matches multiple facts across brand, model, serial and retailer', () => {
  const items = [unit('1'), { ...unit('2'), brand: 'Other' }];
  assert.deepEqual(
    filterInventory(items, ' example   AB123 market ', 'all', 'asset').map(
      (x) => x.id,
    ),
    ['1'],
  );
  assert.deepEqual(filterInventory(items, 'missing', 'all', 'asset'), []);
});
void test('unassessed and quarantine filters reflect independent workflow states', () => {
  const items = [
    unit('1'),
    unit('2', 'excluded_by_notice', true),
    unit('3', 'affected'),
  ];
  assert.deepEqual(
    filterInventory(items, '', 'unassessed', 'asset').map((x) => x.id),
    ['1'],
  );
  assert.deepEqual(
    filterInventory(items, '', 'quarantined', 'asset').map((x) => x.id),
    ['2'],
  );
});
void test('priority sorting puts holds and affected units before review without mutating data', () => {
  const items = [
    unit('UNIT-10'),
    unit('UNIT-3', 'needs_review'),
    unit('UNIT-2', 'affected'),
    unit('UNIT-1', 'excluded_by_notice', true),
    unit('UNIT-9', 'no_relevant_notice_found'),
  ];
  const before = items.map((x) => x.id);
  assert.deepEqual(
    filterInventory(items, '', 'all', 'priority').map((x) => x.id),
    ['UNIT-1', 'UNIT-2', 'UNIT-3', 'UNIT-10', 'UNIT-9'],
  );
  assert.deepEqual(
    items.map((x) => x.id),
    before,
  );
  assert.deepEqual(
    filterInventory(items, '', 'all', 'asset').map((x) => x.id),
    ['UNIT-1', 'UNIT-2', 'UNIT-3', 'UNIT-9', 'UNIT-10'],
  );
});
void test('recent sorting and timestamps handle missing and invalid dates', () => {
  const older = unit('A', 'needs_review');
  older.assessment!.createdAt = '2026-01-01T00:00:00Z';
  const invalid = unit('B', 'needs_review');
  invalid.assessment!.createdAt = 'not-a-date';
  assert.deepEqual(
    filterInventory(
      [invalid, older, unit('C', 'needs_review')],
      '',
      'all',
      'recent',
    ).map((x) => x.id),
    ['C', 'A', 'B'],
  );
  assert.equal(formatTime(), 'Not yet');
  assert.equal(formatTime('not-a-date'), 'Not yet');
  assert.equal(sourceHost('https://www.cpsc.gov/example'), 'cpsc.gov');
  assert.equal(sourceHost('invalid'), 'Source unavailable');
});
