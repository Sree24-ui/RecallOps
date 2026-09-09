import { writeFileSync } from 'node:fs';
import { demoInventory } from '../fixtures/demo';
import { toCsv } from '../lib/core/csv';
writeFileSync(
  'public/sample-inventory.csv',
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
