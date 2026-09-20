# NeYiyorum — statik bilgilendirme sitesi

NeYiyorum mobil uygulamasının **metodoloji**, **KVKK aydınlatma metni**,
**kullanım koşulları** ve **açık veri** sayfaları. Düz HTML/CSS; sayfaları
oluşturmak için build adımı ya da bağımlılık yok. Yayını GitHub Actions yapıyor
(aşağıda "Otomatik yayın"), çünkü OFF veri dökümü de her hafta otomatik yenileniyor.

## Dosyalar

| Dosya                                | İçerik                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| `index.html`                         | Kısa giriş + sayfalara link                                   |
| `metodoloji.html`                    | Puanlama ve uyarı metodolojisi                                |
| `kvkk.html`                          | KVKK aydınlatma metni (**TASLAK**)                            |
| `kullanim-kosullari.html`            | Kullanım Koşulları (**TASLAK**)                               |
| `acik-veri.html`                     | OFF kaynaklı veritabanının dökümü: lisans, atıf, değişiklikler |
| `style.css`, `favicon.svg`           | Ortak stil ve ikon                                            |
| `scripts/export-products-odbl.mjs`   | `products_odbl` tablosunu lisans notuyla JSON'a döker         |
| `scripts/export-products-odbl.test.mjs` | Betiğin testleri                                           |
| `.github/workflows/publish-site.yml` | Siteyi yayınlar + dökümü haftalık yeniler                     |
| `.nojekyll`                          | Eski dal-yayını için; Actions yayınında etkisiz               |

## Yerel önizleme

`index.html` dosyasına çift tıklamak yeterli. Dosya yolu üzerinden de tüm
linkler ve stil çalışır. (`veri/products_odbl.json` yalnızca yayında vardır;
yerelde `acik-veri.html`'deki indirme linki boş kalır.)

## Otomatik yayın (ODbL dökümü dahil)

`publish-site.yml` şu zamanlarda çalışır: **her pazartesi 03:17 UTC**, **main'e
her push'ta**, ve Actions sekmesinden elle. Her çalışmada:

1. Sayfalar toplanır (yalnızca `*.html`, `style.css`, `favicon.svg`; README,
   betikler ve `.github` siteye çıkmaz).
2. `products_odbl` tablosu okunur, `veri/products_odbl.json` üretilir. Dosyanın
   başında ODbL lisans notu, atıf ve paylaşım şartı vardır.
3. Hepsi GitHub Pages'e yayınlanır.

**Döküm üretilemezse** (anahtarlar girilmemiş, Supabase'e ulaşılamıyor, güvenlik
kapısı): site YİNE yayınlanır, yayındaki son döküm korunur ve çalışma en sonda
kırmızı biter; GitHub e-posta atar. Hukuki sayfalar döküm yüzünden yayından
düşmez.

Güvenlik kapıları (betik reddeder, dosya yazılmaz): (a) `source = 'off'` olmayan
satır çıkarsa — kullanıcı verisi ODbL dökümüne girmemeli; (b) yeni döküm yayındakinin
yarısından küçükse ya da öncekiyle doluyken boşsa — geçici bir okuma sorunu iyi
dökümün üzerine yazmasın. Önbellek bilerek temizlendiyse: Actions > Run workflow
> `force` işaretle.

### Tek seferlik kurulum (bir kez, ~10 dakika)

1. GitHub'da `neyiyorum-site` adında **herkese açık (public)** bir depo aç ve bu
   klasörü oraya it. (Ücretsiz planda Pages yalnızca herkese açık depoda çalışır.)
2. Depoda **Settings > Pages > Source: "GitHub Actions"** seç.
3. **Settings > Secrets and variables > Actions > New repository secret** ile iki
   secret ekle (Supabase Dashboard > Project Settings > API):
   - `SUPABASE_URL` — proje adresi
   - `SUPABASE_ANON_KEY` — **anon / public** anahtar. `service_role` anahtarını
     BURAYA KOYMA: betik yalnızca herkese açık okunabilen tabloyu okur, gizli
     anahtar gerekmez.
4. **Actions > "Siteyi yayınla ve OFF veri dökümünü yenile" > Run workflow.**
   Yeşil biterse `https://<kullanıcı>.github.io/neyiyorum-site/veri/products_odbl.json`
   açılır. Bundan sonra kendiliğinden çalışır.

Bilinen küçük risk: GitHub, 60 gün hiç hareket olmayan bir depoda zamanlanmış
çalışmaları kapatabilir. Site metni ya da veri değiştikçe hareket olur; yine de
"Actions" sekmesinde son başarılı çalışmanın tarihine ara sıra bakmak iyi olur.
Döküm çok büyürse (bugün küçük) başka bir depolamaya taşımak gerekebilir.

### Testler

```
node --test
```

(Gerçek Supabase yok: sahte bir sunucu sayfalamayı, güvenlik kapılarını ve komut
satırı davranışını ölçüyor.)

## Yayın öncesi kontrol listesi

- [ ] `kvkk.html` ve `kullanim-kosullari.html` bir hukukçu tarafından incelendi
- [ ] Veri sorumlusu / hizmet sağlayıcı unvanı ve adresi dolduruldu (her iki
      sayfada sarı işaretli alanlar; koşullarda ayrıca yetkili mahkeme yeri)
- [ ] Yurt dışına aktarım mekanizması (KVKK md. 9) seçildi
- [ ] Sitenin yayın adresi, uygulamadaki `LEGAL_SITE_BASE_URL` ile aynı
      (`src/features/legal/legalLinks.ts`; şu an `https://egemenkulatu.github.io/neyiyorum-site/`).
      Farklıysa uygulamadaki Kullanım Koşulları, KVKK, Metodoloji ve Açık Veri
      linklerinin HEPSİ 404 verir.
- [ ] Üyelik/abonelik devreye girdiğinde KVKK metni ve koşulların 4. bölümü
      güncellendi
- [ ] **OFF dökümü kuruldu ve ilk çalışma yeşil** (yukarıdaki "Tek seferlik
      kurulum"). Yeşil olunca `acik-veri.html`'deki ve `kullanim-kosullari.html`
      7. bölümündeki sarı (`.fill`) cümlelerin sarmalayıcısını kaldır. Uygulama
      mağazaya çıkmadan önce bu tamamlanmış olmalı: uygulamadaki Veri Kaynakları
      ekranı dökümün var olduğunu söylüyor.

### `metodoloji.html`'deki sarı işaretli taahhütler

Sarı (`.fill`) cümleler henüz DOĞRU DEĞİL ya da senin onayını bekliyor. Her biri
gerçekleşince `<span class="fill">` sarmalayıcısını kaldır; gerçekleşmeyecekse
cümleyi sil. Sarı cümleyle yayınlamak, yapılmayan bir şeyi vaat etmek olur.

- [ ] **OFF kayıtları en geç 30 günde bir tazeleniyor** (Verinin güncelliği).
      `scripts/refresh-off-products.ts` düzenli çalışacak şekilde zamanlandı
      (uygulama deposunda CLAUDE.md, "Hukuki savunma" bölümü). Sıklık farklıysa
      cümledeki gün sayısı düzeltildi. (Bu betik uygulama deposunda, service_role
      anahtarı ister; yukarıdaki döküm işinden AYRI ve henüz zamanlanmadı.)
- [ ] **Yanıt süresi 7 gün, düzeltme süresi 30 gün** (itiraz süreci) karşılanabilir
      süreler; değilse değiştirildi.

## Sürüm geçmişi

Klasör git deposu. Metodolojinin her yayınlanan sürümü ayrı bir commit olmalı;
yayından sonra her sürüm ayrıca Wayback Machine'e kaydedilmeli
(https://web.archive.org/save/ + sayfa adresi). Kendi sunucumuzdaki sayfa, bir
anlaşmazlıkta hangi tarihte ne yazdığını tek başına kanıtlamaz.
