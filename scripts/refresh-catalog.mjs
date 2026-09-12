import { writeFile, mkdir } from 'node:fs/promises';
// Documented RecallNumber filter keeps each public API request bounded.
const numbers = process.argv.slice(2);
if (
  !numbers.length ||
  numbers.length > 25 ||
  numbers.some((n) => !/^\d{5,6}$/.test(n))
)
  throw Error('Pass 1–25 official CPSC recall numbers, without hyphens.');
const records = [];
for (const number of new Set(numbers)) {
  const source = new URL(
    'https://www.saferproducts.gov/RestWebServices/Recall',
  );
  source.searchParams.set('format', 'json');
  source.searchParams.set('RecallNumber', number);
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`CPSC API returned ${response.status}`);
  const text = await response.text();
  if (text.length > 1000000) throw Error('Unexpectedly large CPSC response');
  const rows = JSON.parse(text);
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0].RecallNumber !== number
  )
    throw Error(`Expected exactly one official record for ${number}`);
  const r = rows[0],
    url = new URL(r.URL);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.cpsc.gov' ||
    !/^\/Recalls\/\d{4}\//.test(url.pathname)
  )
    throw Error('CPSC response did not contain a specific official notice URL');
  const names = (list) =>
    Array.isArray(list)
      ? list.map((v) => v.Name).filter((v) => typeof v === 'string' && v.trim())
      : [];
  records.push({
    id: r.RecallID,
    number: r.RecallNumber,
    title: r.Title,
    date: r.RecallDate.slice(0, 10),
    url: url.href,
    products: names(r.Products),
    description: r.Description,
    hazards: names(r.Hazards),
    remedies: names(r.Remedies),
    contact: r.ConsumerContact,
    apiUrl: source.href,
    retrievedAt: new Date().toISOString(),
  });
}
records.sort((a, b) => b.date.localeCompare(a.date));
const catalog = {
  publisher: 'U.S. Consumer Product Safety Commission',
  sourceUrl:
    'https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information',
  licenseUrl: 'https://catalog.data.gov/dataset/recalls-api',
  scope:
    'Selected US electronics recall notices. This is a dated public-data snapshot, not a complete recall search or an inventory of owned units.',
  records,
};
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../data/official-recalls.json', import.meta.url),
  JSON.stringify(catalog, null, 2) + '\n',
);
console.log(
  `Saved ${records.length} official CPSC notices; no physical inventory was created.`,
);
