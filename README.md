# NeYiyorum — statik bilgilendirme sitesi

NeYiyorum mobil uygulamasının **metodoloji** ve **KVKK aydınlatma metni**
sayfaları. Düz HTML/CSS; build adımı, bağımlılık ve Jekyll yok
(`.nojekyll` dosyası GitHub Pages'in Jekyll işlemesini kapatır).

## Dosyalar

| Dosya            | İçerik                                   |
| ---------------- | ---------------------------------------- |
| `index.html`     | Kısa giriş + iki sayfaya link            |
| `metodoloji.html`| Puanlama ve uyarı metodolojisi           |
| `kvkk.html`      | KVKK aydınlatma metni (**TASLAK**)       |
| `style.css`      | Üç sayfanın ortak stil dosyası           |
| `favicon.svg`    | Site ikonu                               |
| `.nojekyll`      | GitHub Pages'te Jekyll'i devre dışı bırakır |

## Yerel önizleme

`index.html` dosyasına çift tıklamak yeterli. Dosya yolu üzerinden de tüm
linkler ve stil çalışır.

## Yayın öncesi kontrol listesi

- [ ] `kvkk.html` bir hukukçu tarafından incelendi
- [ ] Veri sorumlusu unvanı ve adresi dolduruldu (sayfada sarı işaretli alanlar)
- [ ] Yurt dışına aktarım mekanizması (KVKK md. 9) seçildi
- [ ] Sitenin yayın adresi, uygulamadaki `LEGAL_SITE_BASE_URL` ile aynı
      (`src/features/legal/legalLinks.ts`; şu an `https://egemenkulatu.github.io/neyiyorum-site/`).
      Farklıysa uygulamadaki KVKK ve Metodoloji linkleri 404 verir.
- [ ] Üyelik/abonelik devreye girdiğinde KVKK metni güncellendi

### `metodoloji.html`'deki sarı işaretli taahhütler

Sarı (`.fill`) cümleler henüz DOĞRU DEĞİL ya da senin onayını bekliyor. Her biri
gerçekleşince `<span class="fill">` sarmalayıcısını kaldır; gerçekleşmeyecekse
cümleyi sil. Sarı cümleyle yayınlamak, yapılmayan bir şeyi vaat etmek olur.

- [ ] **Reklam kategorileri engellendi** (Tarafsızlık bölümü). AdMob > uygulama >
      Blocking controls: *Sensitive categories* altında "Weight loss" ve
      "Drugs & supplements" engelli ("Alcohol" varsayılan olarak zaten engelli);
      *General categories* altında yiyecek-içecek kategorisi engelli.
- [ ] **OFF kayıtları en geç 30 günde bir tazeleniyor** (Verinin güncelliği).
      `scripts/refresh-off-products.ts` düzenli çalışacak şekilde zamanlandı
      (uygulama deposunda CLAUDE.md, "Hukuki savunma" bölümü). Sıklık farklıysa
      cümledeki gün sayısı düzeltildi.
- [ ] **Yanıt süresi 7 gün, düzeltme süresi 30 gün** (itiraz süreci) karşılanabilir
      süreler; değilse değiştirildi.

## Sürüm geçmişi

Klasör git deposu. Metodolojinin her yayınlanan sürümü ayrı bir commit olmalı;
yayından sonra her sürüm ayrıca Wayback Machine'e kaydedilmeli
(https://web.archive.org/save/ + sayfa adresi). Kendi sunucumuzdaki sayfa, bir
anlaşmazlıkta hangi tarihte ne yazdığını tek başına kanıtlamaz.
