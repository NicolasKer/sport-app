import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execAsync = promisify(exec);
const SPREADSHEET_ID = '1WM517we-EmWXST9vEWghjgElri4ig4CNgOs1ANyC4Ak';

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
          try {
            if (req.method === 'GET') {
              const { stdout } = await execAsync(
                `gsheets readonly read-all ${SPREADSHEET_ID} --json`,
                { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
              );
              const sheets = parseReadAllOutput(stdout);
              // Update local seed snapshot as well
              const seedPath = path.resolve(process.cwd(), 'src/data/initialSheetData.json');
              fs.writeFileSync(seedPath, JSON.stringify(sheets, null, 2), 'utf8');
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
  ],
});
