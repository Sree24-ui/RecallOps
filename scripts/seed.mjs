const base = process.env.RECALLOPS_URL || 'http://127.0.0.1:3000';
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
