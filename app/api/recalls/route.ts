import catalog from '@/data/official-recalls.json';
// Deliberately independent of workspace DB, credentials and paid provider calls.
export function GET() {
  return Response.json(catalog, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
