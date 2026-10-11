# 🔁 Habiloop

Aralıklı alışkanlık takibi. Klasik "her gün streak" yerine her alışkanlığın bir **penceresi** var:
yaptığın günden itibaren ideal gün ve son gün hesaplanır, yapınca pencere sıfırlanır.

**Örnek:** Kedi kumu — her 3 günde bir, 1 gün tolerans. Çarşamba temizlersen:

| Gün | Durum |
| --- | --- |
| Perşembe, Cuma | 🟢 Rahat |
| Cumartesi | 🟡 İdeal gün |
| Pazar | 🔴 Son gün |
| Pazartesi | ⛔ Gecikti |

## Özellikler
- **Yeşil / sarı / kırmızı pencere**: `ne sıklıkla` + `tolerans` ile tanımlanır
- **Zamanında yapma oranı**: streak yerine, döngülerin yüzde kaçını son günden önce yaptığın
- **Geriye dönük işaretleme**: "Başka gün yaptım" ile son 14 gün içinden tarih seç; pencere o tarihten yeniden hesaplanır
- **Aralık önerisi**: 5+ kayıttan sonra gerçek ritmin farklıysa "Genelde 2 günde bir yapıyorsun, aralığı değiştirelim mi?"
- **Push hatırlatma**: seçtiğin saatte ideal gün / son gün / gecikti bildirimi, bildirimden tek dokunuşla "Yaptım"
- PWA: telefona kurulur, e-posta bağlantısıyla giriş, veriler Supabase'de

## Kurulum

1. **Supabase projesi** oluştur ([supabase.com](https://supabase.com)).
   - SQL Editor'de `supabase/migrations/0001_init.sql` dosyasını çalıştır.
   - Authentication → URL Configuration: Site URL'yi uygulama adresin yap, `https://<app>/auth/callback` adresini Redirect URLs'e ekle.
2. **Ortam değişkenleri**: `.env.example` dosyasını `.env.local` olarak kopyala ve doldur.
   - VAPID anahtarları: `npm run vapid`
   - `CRON_SECRET`: rastgele uzun bir değer (`openssl rand -hex 32`)
3. **Yerelde çalıştır**: `npm install && npm run dev`
4. **Yayınla**: Vercel'e import et, aynı ortam değişkenlerini ekle.
5. **Hatırlatmaları etkinleştir**: `supabase/cron.sql` içindeki URL ve secret'ı düzenleyip Supabase SQL Editor'de çalıştır.
   Saatlik çalışır; her kullanıcıya kendi saat diliminde seçtiği saatte bildirim gider.

> iPhone'da bildirim için uygulamayı Safari → Paylaş → **Ana Ekrana Ekle** ile kurman gerekir (iOS 16.4+).

Cron'u elle denemek için:

```sh
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/remind
```

## Geliştirme

```sh
npm test          # pencere, istatistik, öneri ve hatırlatma mantığı testleri
npm run typecheck
npm run lint
npm run build
```

Çekirdek mantık saf fonksiyonlar halinde `src/lib/` altında:
`schedule.ts` (pencere hesaplama), `stats.ts` (zamanında yapma oranı), `suggest.ts` (aralık önerisi), `reminders.ts` (bildirim metni).
