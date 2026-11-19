import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execAsync = promisify(exec);
const SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID || '';

function parseReadAllOutput(stdout: string) {
  const parts = stdout.split(/--- (.+?) ---\r?\n/);
  const sheets: Record<string, string[][]> = {};
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim();
    try {
      sheets[name] = JSON.parse(parts[i + 1].trim());
    } catch {
      sheets[name] = [];
    }
  }
  return sheets;
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'gsheets-local-bridge',
      configureServer(server) {
        server.middlewares.use('/api/gsheets', async (req, res) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (!SPREADSHEET_ID) {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: 'Local gsheets bridge not configured' }));
            return;
          }
          try {
            if (req.method === 'GET') {
              const { stdout } = await execAsync(
                `gsheets readonly read-all ${SPREADSHEET_ID} --json`,
                { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
              );
              const sheets = parseReadAllOutput(stdout);
              res.end(JSON.stringify({ ok: true, source: 'gsheets-plugin', sheets }));
              return;
            }

            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const payload = JSON.parse(body);
                  const tmpBatchPath = path.resolve(process.cwd(), 'tmp_batch.json');

                  if (payload.action === 'batchWrite' && Array.isArray(payload.operations)) {
                    // payload.operations is array of { op: 'write' | 'append', range: string, data: any[][] }
                    fs.writeFileSync(tmpBatchPath, JSON.stringify(payload.operations, null, 2), 'utf8');
                    await execAsync(
                      `gsheets mutate batch ${SPREADSHEET_ID} -f "${tmpBatchPath}"`,
                      { encoding: 'utf8' }
                    );
                    if (fs.existsSync(tmpBatchPath)) fs.unlinkSync(tmpBatchPath);
                    res.end(JSON.stringify({ ok: true }));
                    return;
                  }

                  res.statusCode = 400;
                  res.end(JSON.stringify({ ok: false, error: 'Unsupported action' }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
                }
              });
              return;
            }

            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
          }
        });
      },
    },
    {
      name: 'ironpulse-sw-generator',
      apply: 'build',
      closeBundle() {
        const distDir = path.resolve(process.cwd(), 'dist');
        if (!fs.existsSync(distDir)) return;

        const collectFiles = (dir: string, relBase = ''): string[] => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const results: string[] = [];
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'sw.js') continue;
            const full = path.join(dir, entry.name);
            const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              results.push(...collectFiles(full, rel));
            } else {
              results.push(`./${rel}`);
            }
          }
          return results;
        };

        const staticFiles = collectFiles(distDir);
        const precacheUrls = Array.from(new Set(['./', ...staticFiles]));
        const hash = crypto
          .createHash('sha1')
          .update(precacheUrls.join('|') + ':' + Date.now())
          .digest('hex')
          .slice(0, 10);

        const swSource = `// Auto-generated offline Service Worker for IronPulse PWA
const CACHE_NAME = 'ironpulse-cache-${hash}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('ironpulse-cache-') && key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // For navigations (launching PWA offline in gym basement): network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Same-origin static assets: cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
`;
        fs.writeFileSync(path.join(distDir, 'sw.js'), swSource, 'utf8');
      },
    },
  ],
});
