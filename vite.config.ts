import tailwindcss from '@tailwindcss/vite';
import vinext from 'vinext';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({
  // Hosted databases use libSQL over HTTPS; local development keeps file-backed SQLite.
  resolve: {
    alias:
      process.env.NITRO_PRESET === 'vercel' || process.env.VERCEL === '1'
        ? [{ find: /^@libsql\/client$/, replacement: '@libsql/client/web' }]
        : [],
  },
  server:
    process.env.CODEX_SANDBOX === 'seatbelt'
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
  plugins: [
    tailwindcss(),
    vinext(),
    ...(command === 'build'
      ? [nitro({ vercel: { functions: { maxDuration: 300 } } })]
      : []),
  ],
}));
