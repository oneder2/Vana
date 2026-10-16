import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('preview server confines files, survives malformed paths and preserves SPA routing', async () => {
  const { createPreviewServer } = await import('../scripts/serve-static.mjs');
  const fixture = mkdtempSync(path.join(tmpdir(), 'vana-preview-'));
  const root = path.join(fixture, 'out');
  mkdirSync(root);
  mkdirSync(path.join(fixture, 'out-private'));
  writeFileSync(path.join(root, 'index.html'), '<main>Vana</main>');
  writeFileSync(path.join(fixture, 'out-private', 'secret.txt'), 'PRIVATE');
  if (process.platform !== 'win32') symlinkSync('../out-private', path.join(root, 'escape'));
  const server = createPreviewServer(root);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const request = (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: url }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, body }));
    }).on('error', reject);
  });
  try {
    for (const url of ['/../out-private/secret.txt', '/%2e%2e/out-private/secret.txt', '/%00', '/%5c..%5cout-private/secret.txt', ...(process.platform === 'win32' ? [] : ['/escape/secret.txt'])]) {
      const response = await request(url);
      assert.equal(response.status, 404, url);
      assert.ok(!response.body.includes('PRIVATE'), url);
    }
    assert.equal((await request('/%ZZ')).status, 400);
    assert.deepEqual(await request('/account?from=welcome'), { status: 200, body: '<main>Vana</main>' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(fixture, { recursive: true, force: true });
  }
});
