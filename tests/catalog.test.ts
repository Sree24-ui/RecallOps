import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/official-recalls.json';
import { filterRecalls, recallNumber } from '../lib/ui/catalog';
import { catalogRecord } from '../scripts/catalog-data.mjs';
void test('catalogue finds both displayed and unformatted recall numbers', () => {
  for (const record of catalog.records) {
    for (const query of [
      record.number,
      recallNumber(record.number),
      `CPSC ${recallNumber(record.number)}`,
    ])
      assert.ok(
        filterRecalls(catalog.records, query).some((r) => r.id === record.id),
      );
  }
  assert.equal(filterRecalls(catalog.records, 'INIU BI-B41').length, 1);
  assert.equal(filterRecalls(catalog.records, 'no such recall').length, 0);
});
const source = catalog.records[0];
const api = {
  RecallID: source.id,
  RecallNumber: source.number,
  Title: source.title,
  RecallDate: source.date + 'T00:00:00',
  URL: source.url,
  Products: source.products.map((Name) => ({ Name })),
  Description: source.description,
  Hazards: source.hazards.map((Name) => ({ Name })),
  ConsumerContact: source.contact,
  Remedies: [
    {
      Name: 'Unrelated product repair instructions from an upstream API error',
    },
  ],
};
void test('refresh never republishes unverified API remedy instructions', () => {
  const result = catalogRecord(
    [api],
    source.number,
    source.apiUrl,
    source.retrievedAt,
  );
  assert.equal(Object.hasOwn(result, 'remedies'), false);
  assert.equal(JSON.stringify(result).includes('Unrelated product'), false);
  for (const record of catalog.records)
    assert.equal(Object.hasOwn(record, 'remedies'), false);
});
void test('refresh rejects incomplete, mismatched or off-domain official records', () => {
  for (const invalid of [
    [],
    [api, api],
    [{ ...api, RecallNumber: '00000' }],
    [{ ...api, Products: [] }],
    [{ ...api, Hazards: [] }],
    [{ ...api, Description: null }],
    [{ ...api, RecallDate: 'not-a-date' }],
    [{ ...api, URL: 'https://unrelated.example/Recalls/2026/notice' }],
    [{ ...api, URL: 'https://www.cpsc.gov/Recalls' }],
  ])
    assert.throws(() =>
      catalogRecord(invalid, source.number, source.apiUrl, source.retrievedAt),
    );
});
