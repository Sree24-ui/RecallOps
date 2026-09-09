import { baseItem, iniuRule } from './demo';
import type {
  Inventory,
  Rule,
  AssessmentState,
  Logic,
  Condition,
} from '../lib/core/rules';
export type EvaluationCase = {
  id: string;
  description: string;
  item: Inventory;
  rule: Rule | null;
  expected: AssessmentState;
  conflict?: boolean;
  discoveryComplete?: boolean;
};
const variants: [string, Partial<Inventory>, AssessmentState][] = [
  ['exact G', {}, 'affected'],
  ['exact H', { serial: '000H21' }, 'affected'],
  ['exact I blue', { serial: '000I21', color: 'blue' }, 'affected'],
  ['exact L', { serial: '000L21' }, 'affected'],
  ['near serial', { serial: '000J21' }, 'excluded_by_notice'],
  ['missing serial', { serial: '' }, 'needs_review'],
  ['trim case serial', { serial: ' 000g21 ' }, 'affected'],
  ['lookalike serial', { serial: 'OOOG21' }, 'excluded_by_notice'],
  ['model formatting', { model: ' bi b41 ' }, 'affected'],
  ['unrelated model', { model: 'BI-B4I' }, 'no_relevant_notice_found'],
  ['red', { color: 'red' }, 'excluded_by_notice'],
  ['missing color', { color: '' }, 'needs_review'],
  ['Woot exclusion', { retailer: 'Woot' }, 'excluded_by_notice'],
  ['wrong channel', { channel: 'eBay' }, 'excluded_by_notice'],
  ['wrong market', { purchaseCountry: 'CA' }, 'excluded_by_notice'],
  ['missing market', { purchaseCountry: '' }, 'needs_review'],
  [
    'before period',
    { originalPurchaseDate: '2021-07-31' },
    'excluded_by_notice',
  ],
  [
    'after period',
    { originalPurchaseDate: '2022-05-01' },
    'excluded_by_notice',
  ],
  ['first month', { originalPurchaseDate: '2021-08' }, 'affected'],
  ['last month', { originalPurchaseDate: '2022-04' }, 'affected'],
  ['year ambiguous', { originalPurchaseDate: '2021' }, 'needs_review'],
  ['missing purchase', { originalPurchaseDate: '' }, 'needs_review'],
  [
    'mismatch beats missing',
    { serial: '000J21', originalPurchaseDate: '' },
    'excluded_by_notice',
  ],
  ['unknown seller exclusion', { retailer: '' }, 'needs_review'],
  ['invalid date', { originalPurchaseDate: '2021-02-30' }, 'needs_review'],
  ['serial internal whitespace', { serial: '000 G21' }, 'needs_review'],
  ['missing brand', { brand: '' }, 'needs_review'],
  ['missing channel', { channel: '' }, 'needs_review'],
];
export const evaluationCases: EvaluationCase[] = variants.map(
  ([description, patch, expected], i) => ({
    id: `INIU-${String(i + 1).padStart(2, '0')}`,
    description,
    item: { ...baseItem, ...patch },
    rule: iniuRule,
    expected,
  }),
);
evaluationCases.push(
  {
    id: 'CONFLICT-01',
    description: 'Conflict overrides inclusion',
    item: baseItem,
    rule: iniuRule,
    expected: 'needs_review',
    conflict: true,
  },
  {
    id: 'CONFLICT-02',
    description: 'Conflict overrides exclusion',
    item: { ...baseItem, serial: '000J21' },
    rule: iniuRule,
    expected: 'needs_review',
    conflict: true,
  },
  {
    id: 'DISCOVERY-01',
    description: 'Completed no-notice search',
    item: baseItem,
    rule: null,
    expected: 'no_relevant_notice_found',
  },
  {
    id: 'DISCOVERY-02',
    description: 'Failed investigation',
    item: baseItem,
    rule: null,
    expected: 'needs_review',
    discoveryComplete: false,
  },
);
const c = (
  op: Condition['op'],
  field: Condition['field'],
  values: string[],
): Condition => ({
  kind: 'condition',
  id: field,
  field,
  op,
  values,
  evidence: 'CONTROLLED synthetic test predicate',
});
function synthetic(
  id: string,
  itemPatch: Partial<Inventory>,
  conditions: Logic,
  expected: AssessmentState,
) {
  evaluationCases.push({
    id,
    description: 'CONTROLLED synthetic operator case',
    item: { ...baseItem, ...itemPatch },
    rule: { ...iniuRule, noticeId: 'SYNTHETIC', conditions, exclusions: null },
    expected,
  });
}
synthetic(
  'RANGE-01',
  { serial: 'T1000' },
  c('serial_range', 'serial', ['T1000', 'T1999']),
  'affected',
);
synthetic(
  'RANGE-02',
  { serial: 'T1999' },
  c('serial_range', 'serial', ['T1000', 'T1999']),
  'affected',
);
synthetic(
  'RANGE-03',
  { serial: 'T0999' },
  c('serial_range', 'serial', ['T1000', 'T1999']),
  'excluded_by_notice',
);
synthetic(
  'RANGE-04',
  { serial: 'TA500' },
  c('serial_range', 'serial', ['T1000', 'T1999']),
  'needs_review',
);
synthetic(
  'ALL-01',
  { batch: 'B' },
  {
    kind: 'all',
    children: [c('equals', 'batch', ['A']), c('equals', 'sku', ['X'])],
  },
  'excluded_by_notice',
);
synthetic(
  'ANY-01',
  { batch: 'A' },
  {
    kind: 'any',
    children: [c('equals', 'batch', ['A']), c('equals', 'sku', ['X'])],
  },
  'affected',
);
synthetic(
  'ANY-02',
  { batch: 'B' },
  {
    kind: 'any',
    children: [c('equals', 'batch', ['A']), c('equals', 'sku', ['X'])],
  },
  'needs_review',
);
synthetic(
  'ANY-03',
  { batch: 'B', sku: 'Y' },
  {
    kind: 'any',
    children: [c('equals', 'batch', ['A']), c('equals', 'sku', ['X'])],
  },
  'excluded_by_notice',
);
synthetic(
  'PREFIX-01',
  { serial: 'TEST123' },
  c('prefix', 'serial', ['TEST']),
  'affected',
);
synthetic(
  'SUFFIX-01',
  { serial: 'TEST123' },
  c('suffix', 'serial', ['123']),
  'affected',
);
synthetic(
  'NOTIN-01',
  { serial: '' },
  c('not_in', 'serial', ['TEST123']),
  'needs_review',
);
synthetic(
  'BOOL-01',
  { hasPawPrint: 'true' },
  c('boolean', 'hasPawPrint', ['true']),
  'affected',
);
synthetic(
  'UNSUPPORTED-01',
  {},
  c('unsupported', 'serial', ['foo']),
  'needs_review',
);
