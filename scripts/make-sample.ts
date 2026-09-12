if (process.env.ENABLE_TEST_FIXTURES !== 'true') throw Error('Sample generation is restricted to isolated tests.');
import { writeFileSync } from 'node:fs';
import { demoInventory } from '../fixtures/demo';
import { toCsv } from '../lib/core/csv';
writeFileSync(
  'work/test-inventory.csv',
  toCsv(demoInventory, [
    'assetTag',
    'title',
    'brand',
    'model',
    'serial',
    'color',
    'channel',
    'retailer',
    'purchaseCountry',
    'originalPurchaseDate',
  ]),
);
