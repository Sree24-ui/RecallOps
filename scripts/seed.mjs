if (process.env.ENABLE_TEST_FIXTURES !== 'true') throw Error('Seeding is available only for an explicitly isolated test workspace.');
const base = process.env.RECALLOPS_URL || 'http://localhost:3002';
const res = await fetch(base + '/api/workspace', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(process.env.OPERATOR_TOKEN
      ? { Authorization: `Bearer ${process.env.OPERATOR_TOKEN}` }
      : {}),
  },
  body: JSON.stringify({ action: 'judge' }),
});
const result = await res.json();
console.log(JSON.stringify(result, null, 2));
if (!res.ok) process.exitCode = 1;
