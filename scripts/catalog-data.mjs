import { z } from 'zod';
const text = z.string().trim().min(1);
const named = z.array(z.object({ Name: text })).min(1);
const recall = z.object({
  RecallID: z.number().int().positive(),
  RecallNumber: z.string().regex(/^\d{5,6}$/),
  Title: text,
  RecallDate: text.refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
  ),
  URL: z.url(),
  Products: named,
  Description: text,
  Hazards: named,
  ConsumerContact: text,
});
export function catalogRecord(rows, number, apiUrl, retrievedAt) {
  const parsed = z.array(recall).length(1).safeParse(rows);
  if (!parsed.success || parsed.data[0].RecallNumber !== number)
    throw Error(`Expected one complete official record for ${number}`);
  const r = parsed.data[0];
  const url = new URL(r.URL);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.cpsc.gov' ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/Recalls\/\d{4}\/.+/.test(url.pathname)
  )
    throw Error('CPSC response did not contain a specific official notice URL');
  // The CPSC API has returned an unrelated product's remedy. Do not republish
  // API action instructions: always direct readers to the original notice.
  return {
    id: r.RecallID,
    number: r.RecallNumber,
    title: r.Title,
    date: r.RecallDate.slice(0, 10),
    url: url.href,
    products: r.Products.map((p) => p.Name),
    description: r.Description,
    hazards: r.Hazards.map((p) => p.Name),
    contact: r.ConsumerContact,
    apiUrl,
    retrievedAt,
  };
}
