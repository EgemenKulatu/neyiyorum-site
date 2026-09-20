/**
 * export-products-odbl.mjs testleri. Çalıştırma (site klasöründen):
 *
 *   node --test scripts/
 *
 * Gerçek Supabase yok: yerel bir HTTP sunucusu PostgREST'in bu betiğin kullandığı
 * kısmını (order, limit, `barcode=gt.X`) taklit ediyor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  assertOffOnly,
  buildDump,
  buildNotice,
  checkAgainstPrevious,
  dedupeByBarcode,
  fetchAllRows,
  MIN_KEEP_RATIO,
} from './export-products-odbl.mjs';

const SCRIPT = fileURLToPath(new URL('./export-products-odbl.mjs', import.meta.url));

const row = (barcode, extra = {}) => ({
  barcode,
  name: `Ürün ${barcode}`,
  source: 'off',
  review_status: 'verified',
  ...extra,
});

/** 5 barkod, sıralı. */
const ROWS = ['1001', '1002', '1003', '1004', '1005'].map((barcode) => row(barcode));

/**
 * Sahte PostgREST. `state.rows` sıralı satırlar, `state.log` gelen istekler.
 * `/previous.json` önceki yayını taklit eder.
 */
async function startServer(state) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    state.log.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers });

    if (url.pathname === '/previous.json') {
      if (state.previous === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(state.previous));
      return;
    }

    if (url.pathname !== '/rest/v1/products_odbl') {
      res.writeHead(404).end();
      return;
    }
    if (state.status && state.status !== 200) {
      res.writeHead(state.status).end('hata');
      return;
    }

    const limit = Number(url.searchParams.get('limit'));
    const after = url.searchParams.get('barcode')?.replace(/^gt\./, '') ?? null;
    const page = state.rows.filter((r) => after === null || r.barcode > after).slice(0, limit);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(page));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

function newState(overrides = {}) {
  return { rows: ROWS, log: [], ...overrides };
}

// ---------------------------------------------------------------------------
// Okuma ve sayfalama
// ---------------------------------------------------------------------------

test('sayfalar anahtar tabanlı (barcode > son barkod) ve tüm satırları sırayla getirir', async () => {
  const state = newState();
  const { server, url } = await startServer(state);
  try {
    const rows = await fetchAllRows({ supabaseUrl: url, anonKey: 'anon-key', pageSize: 2 });

    assert.deepEqual(rows.map((r) => r.barcode), ['1001', '1002', '1003', '1004', '1005']);
    // 2 + 2 + 1 satır: üç istek.
    assert.equal(state.log.length, 3);
    assert.equal(state.log[0].query.barcode, undefined);
    assert.equal(state.log[1].query.barcode, 'gt.1002');
    assert.equal(state.log[2].query.barcode, 'gt.1004');
    assert.equal(state.log[0].query.order, 'barcode.asc');
  } finally {
    server.close();
  }
});

test('tam dolu son sayfadan sonra bir boş sayfa daha ister (satır kaçmaz)', async () => {
  const state = newState({ rows: ROWS.slice(0, 4) });
  const { server, url } = await startServer(state);
  try {
    const rows = await fetchAllRows({ supabaseUrl: url, anonKey: 'k', pageSize: 2 });

    assert.equal(rows.length, 4);
    assert.equal(state.log.length, 3); // 2 + 2 + (boş)
  } finally {
    server.close();
  }
});

test('yalnızca herkese açık anahtarı gönderir (apikey + Authorization)', async () => {
  const state = newState();
  const { server, url } = await startServer(state);
  try {
    await fetchAllRows({ supabaseUrl: url, anonKey: 'anon-key', pageSize: 100 });

    assert.equal(state.log[0].headers.apikey, 'anon-key');
    assert.equal(state.log[0].headers.authorization, 'Bearer anon-key');
  } finally {
    server.close();
  }
});

test('HTTP hatasında istisna fırlatır (sessizce boş liste dönmez)', async () => {
  const state = newState({ status: 401 });
  const { server, url } = await startServer(state);
  try {
    await assert.rejects(
      fetchAllRows({ supabaseUrl: url, anonKey: 'k' }),
      /HTTP 401/
    );
  } finally {
    server.close();
  }
});

test('sayfalama ilerlemezse sonsuz döngüye girmez', async () => {
  // Sunucu `barcode=gt` filtresini yok sayıp hep aynı dolu sayfayı döndürüyor.
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => [row('1001'), row('1002')],
  });

  await assert.rejects(
    fetchAllRows({ supabaseUrl: 'http://x', anonKey: 'k', fetchImpl, pageSize: 2 }),
    /ilerlemiyor/
  );
});

test('dizi olmayan yanıtı reddeder', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ message: 'hata' }) });

  await assert.rejects(
    fetchAllRows({ supabaseUrl: 'http://x', anonKey: 'k', fetchImpl }),
    /dizi değil/
  );
});

// ---------------------------------------------------------------------------
// Kapı 1: yalnızca OFF satırları
// ---------------------------------------------------------------------------

test('kullanıcı satırı çıkarsa döküm DURUR ve hata satırın içeriğini yazmaz', () => {
  const rows = [row('1001'), row('1002', { source: 'user', name: 'GİZLİ-ÜRÜN-ADI' })];

  assert.throws(
    () => assertOffOnly(rows),
    (error) => /source='off' olmayan 1 satır/.test(error.message) && !/GİZLİ-ÜRÜN-ADI/.test(error.message)
  );
});

test('source alanı olmayan satır da reddedilir (yalnızca "off" geçer)', () => {
  assert.throws(() => assertOffOnly([{ barcode: '1001', name: 'x' }]), /source='off' olmayan/);
});

test('barkodsuz satır reddedilir', () => {
  assert.throws(() => assertOffOnly([row('')]), /barkodsuz/);
});

test('yalnızca OFF satırları geçer', () => {
  assert.doesNotThrow(() => assertOffOnly(ROWS));
});

test('aynı barkod bir kez yazılır (ilki kalır)', () => {
  const rows = dedupeByBarcode([row('1001', { name: 'a' }), row('1001', { name: 'b' }), row('1002')]);

  assert.deepEqual(rows.map((r) => r.name), ['a', 'Ürün 1002']);
});

// ---------------------------------------------------------------------------
// Lisans notu
// ---------------------------------------------------------------------------

test('dökümün başında ODbL notu, atıf ve paylaşım şartı var', () => {
  const dump = buildDump(ROWS, new Date('2026-09-21T03:17:00Z'), 'https://ornek.github.io/site/');

  assert.equal(dump.notice.license_url, 'https://opendatacommons.org/licenses/odbl/1-0/');
  assert.equal(dump.notice.contents_license_url, 'https://opendatacommons.org/licenses/dbcl/1-0/');
  assert.match(dump.notice.attribution, /Open Food Facts/);
  assert.match(dump.notice.share_alike, /share-alike/);
  assert.equal(dump.notice.alterations_url, 'https://ornek.github.io/site/acik-veri.html');
  assert.equal(dump.row_count, 5);
  assert.equal(dump.generated_at, '2026-09-21T03:17:00.000Z');
  assert.deepEqual(Object.keys(dump), ['notice', 'generated_at', 'row_count', 'products']);
});

test('site adresi verilmezse alterations_url yazılmaz (uydurma adres yok)', () => {
  assert.equal(buildNotice(undefined).alterations_url, undefined);
});

// ---------------------------------------------------------------------------
// Kapı 2: önceki yayınla karşılaştırma
// ---------------------------------------------------------------------------

test('önceki yayın yoksa (ilk yayın) boş döküm de geçer', () => {
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 0 }, null));
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 0 }, { row_count: 0 }));
});

test('önceki doluyken boş döküm reddedilir', () => {
  assert.throws(() => checkAgainstPrevious({ row_count: 0 }, { row_count: 120 }), /boş/);
});

test('yayındakinin yarısından küçük döküm reddedilir, tam yarısı geçer', () => {
  assert.throws(() => checkAgainstPrevious({ row_count: 49 }, { row_count: 100 }), /küçük/);
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 100 * MIN_KEEP_RATIO }, { row_count: 100 }));
});

test('büyüyen ya da aynı kalan döküm geçer', () => {
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 100 }, { row_count: 100 }));
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 150 }, { row_count: 100 }));
});

test('force kapıyı kaldırır', () => {
  assert.doesNotThrow(() => checkAgainstPrevious({ row_count: 0 }, { row_count: 120 }, { force: true }));
});

// ---------------------------------------------------------------------------
// Komut satırı (uçtan uca)
// ---------------------------------------------------------------------------

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { PATH: process.env.PATH, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function tempOut() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odbl-'));
  return { dir, file: path.join(dir, 'veri', 'products_odbl.json') };
}

test('CLI: dökümü lisans notuyla yazar', async () => {
  const state = newState();
  const { server, url } = await startServer(state);
  const { dir, file } = tempOut();
  try {
    const result = await runCli(
      ['--out', file, '--site-url', 'https://ornek.github.io/site/'],
      { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k' }
    );

    assert.equal(result.code, 0, result.stderr);
    const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(dump.row_count, 5);
    assert.equal(dump.products.length, 5);
    assert.equal(dump.notice.license, 'Open Database License (ODbL) 1.0');
    assert.equal(fs.existsSync(`${file}.tmp`), false, 'geçici dosya kalmamalı');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: sunucu hata verirse çıkış kodu 1 ve HİÇ dosya yazılmaz', async () => {
  const state = newState({ status: 500 });
  const { server, url } = await startServer(state);
  const { dir, file } = tempOut();
  try {
    const result = await runCli(['--out', file], { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k' });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /HTTP 500/);
    assert.equal(fs.existsSync(file), false);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: kullanıcı satırı varsa çıkış kodu 1 ve HİÇ dosya yazılmaz', async () => {
  const state = newState({ rows: [...ROWS, row('1006', { source: 'user' })] });
  const { server, url } = await startServer(state);
  const { dir, file } = tempOut();
  try {
    const result = await runCli(['--out', file], { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k' });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /source='off' olmayan/);
    assert.equal(fs.existsSync(file), false);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: yayındaki dökümden çok küçükse reddeder, FORCE=1 ile yazar', async () => {
  const state = newState({ previous: { row_count: 100 } });
  const { server, url } = await startServer(state);
  const { dir, file } = tempOut();
  const args = ['--out', file, '--previous-url', `${url}/previous.json`];
  try {
    const refused = await runCli(args, { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k' });
    assert.equal(refused.code, 1);
    assert.equal(fs.existsSync(file), false);

    const forced = await runCli(args, { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k', FORCE: '1' });
    assert.equal(forced.code, 0, forced.stderr);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).row_count, 5);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: yayında önceki döküm yoksa (404) ilk yayın olarak yazar', async () => {
  const state = newState(); // previous tanımsız -> /previous.json 404
  const { server, url } = await startServer(state);
  const { dir, file } = tempOut();
  try {
    const result = await runCli(
      ['--out', file, '--previous-url', `${url}/previous.json`],
      { SUPABASE_URL: url, SUPABASE_ANON_KEY: 'k' }
    );

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /önceki döküm yok/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: anahtarlar girilmemişse anlaşılır hata verir', async () => {
  const { dir, file } = tempOut();
  try {
    const result = await runCli(['--out', file], {});

    assert.equal(result.code, 1);
    assert.match(result.stderr, /SUPABASE_URL ve SUPABASE_ANON_KEY/);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
