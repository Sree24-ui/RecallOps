import type { Inventory, Rule, Condition } from '../lib/core/rules';
import cpsc from './cpsc-recording.json';
import manufacturer from './manufacturer-excerpts.json';
export const officialUrl = cpsc.url;
export const manufacturerUrl = manufacturer.url;
const description =
  'This recall involves INIU 10,000mAh portable power banks, model BI-B41.';
const color =
  'The recalled power banks have a black or blue case and the INIU logo and a paw-print LED light are on the front.';
const serial =
  'Only portable power banks with serial numbers 000G21, 000H21, 000I21 and 000L21 are included in this recall.';
const channel = manufacturer.markdown.split('\n')[0],
  woot = manufacturer.markdown.split('\n')[1];
const condition = (
  id: string,
  field: Condition['field'],
  op: Condition['op'],
  values: string[],
  evidence: string,
  precision?: 'day' | 'month',
): Condition => ({
  kind: 'condition',
  id,
  field,
  op,
  values,
  evidence,
  ...(precision ? { precision } : {}),
});
export const fixtureMarkdown =
  cpsc.markdown +
  '\n\nManufacturer eligibility excerpts (separate official source):\n' +
  manufacturer.markdown;
export const iniuRule: Rule = {
  schemaVersion: '1',
  noticeId: '26-135',
  title: 'INIU BI-B41 power bank recall',
  brand: 'INIU',
  models: ['BI-B41'],
  scopeEvidence: description,
  conditions: {
    kind: 'all',
    children: [
      condition('model', 'model', 'model_equals', ['BI-B41'], description),
      condition(
        'serial',
        'serial',
        'in',
        ['000G21', '000H21', '000I21', '000L21'],
        serial,
      ),
      condition('color', 'color', 'in', ['black', 'blue'], color),
      condition('channel', 'channel', 'equals', ['Amazon'], channel),
      condition('market', 'purchaseCountry', 'equals', ['US'], channel),
      condition(
        'date',
        'originalPurchaseDate',
        'date_range',
        ['2021-08', '2022-04'],
        channel,
        'month',
      ),
    ],
  },
  exclusions: condition('woot', 'retailer', 'equals', ['Woot'], woot),
  unresolved: [],
  hazard:
    'The lithium-ion battery can overheat and ignite, posing fire and burn hazards.',
  immediateAction:
    'Stop using the recalled power bank immediately. Follow the official recall instructions.',
  remedy: 'Full refund; verify eligibility with INIU.',
  proof: [
    'Product model and serial photo',
    'Original purchase record',
    'Manufacturer eligibility confirmation',
  ],
  contact: 'recall@iniu.shop · 888-886-3606',
  claimUrl: 'https://iniushop.com/pages/recall-b41',
  informationEvidence:
    'Consumers should stop using the recalled power banks immediately',
};
export const baseItem: Inventory = {
  assetTag: 'INIU-001',
  title: 'INIU 10,000mAh power bank',
  brand: 'INIU',
  model: 'BI-B41',
  serial: '000G21',
  color: 'black',
  channel: 'Amazon',
  retailer: 'Amazon',
  purchaseCountry: 'US',
  originalPurchaseDate: '2021-11-12',
};
export const demoInventory: Inventory[] = [
  baseItem,
  { ...baseItem, assetTag: 'INIU-002', serial: '000J21' },
  { ...baseItem, assetTag: 'INIU-003', serial: '' },
  { ...baseItem, assetTag: 'INIU-004', retailer: 'Woot' },
  ...Array.from({ length: 19 }, (_, i) => ({
    assetTag: `ELEC-${String(i + 1).padStart(3, '0')}`,
    title: [
      'USB desktop keyboard',
      '24-inch office monitor',
      'USB-C docking station',
      'Wireless mouse',
      'Ethernet switch',
    ][i % 5],
    brand: 'Sample Electronics',
    model: `DEMO-${i + 1}`,
    serial: `SAMPLE-${i + 1}`,
  })),
  {
    assetTag: 'MON-001',
    title: 'Controlled monitoring demonstration unit',
    brand: 'RecallOps Test',
    model: 'TEST-PB',
    serial: 'MON100',
  },
];
export const monitoringTextA =
  'CONTROLLED DEMONSTRATION ONLY. RecallOps Test TEST-PB units are included only when serial equals MON200. This is not an official recall.';
export const monitoringTextB =
  'CONTROLLED DEMONSTRATION ONLY. RecallOps Test TEST-PB units are included only when serial equals MON100 and batch equals B. This is not an official recall.';
export function monitoringRule(version: 'A' | 'B'): Rule {
  const evidence = version === 'A' ? monitoringTextA : monitoringTextB;
  return {
    ...iniuRule,
    noticeId: 'CONTROLLED-001',
    title: `Controlled notice version ${version}`,
    brand: 'RecallOps Test',
    models: ['TEST-PB'],
    scopeEvidence: evidence,
    conditions: {
      kind: 'all',
      children: [
        condition('model', 'model', 'model_equals', ['TEST-PB'], evidence),
        condition(
          'serial',
          'serial',
          'equals',
          [version === 'A' ? 'MON200' : 'MON100'],
          evidence,
        ),
        ...(version === 'B'
          ? [condition('batch', 'batch', 'equals', ['B'], evidence)]
          : []),
      ],
    },
    exclusions: null,
    unresolved: [],
    hazard: 'Synthetic notice for testing only.',
    immediateAction: 'Review the sample record.',
    remedy: 'No real remedy or claim.',
    proof: [],
    contact: 'Local demo operator',
    claimUrl: '',
    informationEvidence: evidence,
  };
}
