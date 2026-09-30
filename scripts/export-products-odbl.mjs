#!/usr/bin/env node
/**
 * OFF KAYNAKLI ÜRÜN VERİTABANININ DÖKÜMÜ (ODbL sunumu).
 *
 * Uygulama, Open Food Facts'ten (OFF) aldığı ürünleri kendi veritabanında
 * `products_odbl` tablosunda saklıyor. OFF verisi ODbL 1.0 altında ve share-alike
 * şartı taşıyor: bu tabloyu (ya da OFF'tan uyarlanmış bir kopyasını) kamuya
 * kullandırıyorsak, bir kopyasını ücretsiz ve makine okunur biçimde sunmamız,
 * lisans notunu yanında vermemiz gerekiyor (ODbL 4.2, 4.4, 4.6). Bu betik o
 * kopyayı üretir. GitHub Actions haftada bir çalıştırır (.github/workflows).
 *
 * NE YAPAR: `products_odbl`'yi Supabase'in REST arayüzünden (PostgREST) okur,
 * lisans notuyla birlikte tek bir JSON dosyasına yazar.
 *
 * NE OKUR: yalnızca herkese açık okunabilen tabloyu ve herkese açık (anon)
 * anahtarla. Gizli bir anahtar GEREKMİYOR; service_role anahtarı buraya ASLA
 * konmaz. Kullanıcı ürünlerinin tablosuna (`products_user_verified`) hiç dokunmaz.
 *
 * GÜVENLİK KAPILARI (biri takılırsa dosya YAZILMAZ, betik hata koduyla çıkar):
 *   1. Yalnızca `source = 'off'` satırlar kabul edilir. Başka kaynaktan bir satır
 *      çıkarsa (ör. iki tablonun ayrımı bir gün bozulursa) döküm durur: kullanıcı
 *      verisi ODbL'li bir dosyaya girmemeli.
 *   2. Önceki yayındaki dökümden çok küçük bir döküm (varsayılan: yarısından az)
 *      ya da önceki doluyken boş bir döküm reddedilir; geçici bir okuma sorunu
 *      iyi bir dökümün üzerine yazmasın. Önbellek bilerek temizlendiyse `FORCE=1`.
 *
 * KULLANIM:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   node scripts/export-products-odbl.mjs --out _site/veri/products_odbl.json \
 *        [--previous-url https://.../veri/products_odbl.json] \
 *        [--site-url https://.../]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TABLE = 'products_odbl';
export const PAGE_SIZE = 1000;

/** Yeni döküm, öncekinin bu oranından küçükse reddedilir. */
export const MIN_KEEP_RATIO = 0.5;

/**
 * Dökümün başındaki lisans notu (ODbL 4.2b: lisans ya da URI'si veritabanının
 * KENDİSİNDE ve belgelerinde bulunmalı). İngilizce alan adları, çift dilli metin.
 */
export function buildNotice(siteUrl) {
  const notice = {
    title:
      'Süz — Open Food Facts kaynaklı ürün veritabanı dökümü (products_odbl)',
    license: 'Open Database License (ODbL) 1.0',
    license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    contents_license: 'Database Contents License (DbCL) 1.0',
    contents_license_url: 'https://opendatacommons.org/licenses/dbcl/1-0/',
    attribution:
      'Contains information from Open Food Facts (https://openfoodfacts.org), made available here under the Open Database License (ODbL). © Open Food Facts contributors.',
    share_alike:
      'This database is a derivative of the Open Food Facts database and is made available under the ODbL. If you use it publicly you must do so under the ODbL as well (share-alike), keep this notice and attribute Open Food Facts.',
    images:
      'Product photos are licensed by their authors under CC BY-SA 3.0. This file contains links to them (image_url) only, not the images.',
    tr: 'Bu dosya, Open Food Facts verisinden türetilmiş ürün veritabanımızın dökümüdür ve ODbL 1.0 altında sunulur. Kaynak: Open Food Facts katkıcıları. Kullanıcı katkılı ürünler bu dökümde yer almaz.',
  };
  if (siteUrl) {
    notice.alterations_url = `${siteUrl.replace(/\/+$/, '')}/acik-veri.html`;
    notice.alterations =
      'How this database differs from Open Food Facts (the method of the alterations) is described at alterations_url.';
  }
  return notice;
}

/**
 * `products_odbl` tablosunun tamamını okur. Sayfalama ANAHTAR tabanlı
 * (`barcode > son_barkod`, barkoda göre sıralı): sayfa sayfa okurken araya yeni
 * satır girse de satır atlanmaz ya da tekrarlanmaz. Bir sayfa dolu gelirse
 * sıradaki sayfa istenir; tam dolu son sayfa bir boş sayfa daha ister.
 */
export async function fetchAllRows({
  supabaseUrl,
  anonKey,
  fetchImpl = fetch,
  pageSize = PAGE_SIZE,
}) {
  const base = supabaseUrl.replace(/\/+$/, '');
  const rows = [];
  let lastBarcode = null;

  for (;;) {
    const params = new URLSearchParams({
      select: '*',
      order: 'barcode.asc',
      limit: String(pageSize),
    });
    if (lastBarcode !== null) params.set('barcode', `gt.${lastBarcode}`);

    const res = await fetchImpl(`${base}/rest/v1/${TABLE}?${params}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`${TABLE} okunamadı (HTTP ${res.status}).`);
    }

    const page = await res.json();
    if (!Array.isArray(page)) {
      throw new Error(`${TABLE} yanıtı bir dizi değil.`);
    }

    rows.push(...page);
    if (page.length < pageSize) break;

    const next = page[page.length - 1]?.barcode;
    if (typeof next !== 'string' || next === lastBarcode) {
      // Sayfa ilerlemiyor (ör. sunucu filtreyi yok saydı): sonsuz döngüye girme.
      throw new Error(`${TABLE} sayfalaması ilerlemiyor.`);
    }
    lastBarcode = next;
  }

  return rows;
}

/** Kapı 1: yalnızca OFF satırları. Hata mesajı satırın içeriğini YAZMAZ. */
export function assertOffOnly(rows) {
  const foreign = rows.filter((row) => row?.source !== 'off').length;
  if (foreign > 0) {
    throw new Error(
      `${TABLE} içinde source='off' olmayan ${foreign} satır var; döküm durduruldu ` +
        '(kullanıcı verisi ODbL dökümüne girmemeli).'
    );
  }
  const unnamed = rows.filter((row) => typeof row.barcode !== 'string' || !row.barcode).length;
  if (unnamed > 0) {
    throw new Error(`${TABLE} içinde barkodsuz ${unnamed} satır var; döküm durduruldu.`);
  }
}

/** Aynı barkod bir kez (barkod tekil olmalı; yine de savunma). */
export function dedupeByBarcode(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.barcode)) return false;
    seen.add(row.barcode);
    return true;
  });
}

export function buildDump(rows, now, siteUrl) {
  return {
    notice: buildNotice(siteUrl),
    generated_at: now.toISOString(),
    row_count: rows.length,
    products: rows,
  };
}

/**
 * Kapı 2: yeni dökümü yayındaki öncekiyle karşılaştır. `previous` yoksa
 * (ilk yayın, ya da yayın okunamadı) karşılaştırma yapılmaz.
 */
export function checkAgainstPrevious(dump, previous, { force = false } = {}) {
  if (force || !previous || !(previous.row_count > 0)) return;

  if (dump.row_count === 0) {
    throw new Error(
      `Yeni döküm boş ama yayındaki ${previous.row_count} satırlı. Okuma sorunu olabilir; ` +
        'önbellek bilerek temizlendiyse FORCE=1 ile yeniden çalıştır.'
    );
  }
  if (dump.row_count < previous.row_count * MIN_KEEP_RATIO) {
    throw new Error(
      `Yeni döküm (${dump.row_count} satır), yayındakinin (${previous.row_count}) ` +
        `%${MIN_KEEP_RATIO * 100}'inden küçük. Okuma sorunu olabilir; ` +
        'önbellek bilerek temizlendiyse FORCE=1 ile yeniden çalıştır.'
    );
  }
}

/** Yayındaki önceki döküm; yoksa ya da okunamıyorsa `null` (kapı 2 atlanır). */
export async function fetchPreviousDump(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    return Number.isInteger(json?.row_count) ? { row_count: json.row_count } : null;
  } catch {
    return null;
  }
}

/** Dosyayı önce geçici adla yazar, sonra yerine koyar: yarım dosya kalmaz. */
export function writeAtomically(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, file);
}

function readArg(argv, name) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

export async function main(argv, env, { fetchImpl = fetch, now = () => new Date(), log = console.log } = {}) {
  const out = readArg(argv, 'out');
  if (!out) throw new Error('--out <dosya> gerekli.');

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'SUPABASE_URL ve SUPABASE_ANON_KEY gerekli (GitHub: Settings > Secrets and variables > Actions).'
    );
  }
  const force = env.FORCE === '1' || env.FORCE === 'true';

  const rows = dedupeByBarcode(await fetchAllRows({ supabaseUrl, anonKey, fetchImpl }));
  assertOffOnly(rows);

  const dump = buildDump(rows, now(), readArg(argv, 'site-url'));

  const previousUrl = readArg(argv, 'previous-url');
  const previous = previousUrl ? await fetchPreviousDump(previousUrl, fetchImpl) : null;
  checkAgainstPrevious(dump, previous, { force });

  writeAtomically(out, JSON.stringify(dump));
  log(
    `${dump.row_count} ürün yazıldı: ${out}` +
      (previous ? ` (yayındaki önceki döküm: ${previous.row_count})` : ' (önceki döküm yok)')
  );
}

// Komut satırından çalıştırılırsa. (Test dosyası `main`'i doğrudan çağırıyor.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(`HATA: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
