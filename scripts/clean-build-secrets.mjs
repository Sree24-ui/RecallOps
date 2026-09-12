import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Cloudflare plugin emits local preview secrets into its server output.
// Deployment artifacts must receive secrets from their runtime configuration.
const outputs = ['../dist/', '../.output/', '../.vercel/output/'].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);
let removed = 0;
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await clean(path);
    else if (/^(?:\.dev\.vars|\.env)(?:\..*)?$/.test(entry.name)) {
      await unlink(path);
      removed++;
    }
  }
}
for (const output of outputs) {
  await clean(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
console.log(
  `Build output checked; removed ${removed} local environment file(s).`,
);
