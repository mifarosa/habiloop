# Habiloop bildirim sunucusu

Habiloop kapalıyken de "günü geldi" bildirimi gönderen küçük bir Node servisi. Evdeki sürekli açık bir
cihazda (Raspberry Pi, NAS, eski bir bilgisayar, VPS) çalışır.

```
Telefon (Habiloop) ──abonelik + bildirim listesi──▶ Firestore ◀──okur── bu servis ──Web Push──▶ Apple/Google push servisi ──▶ telefon
```

- Habiloop'taki veriler Firestore'da **uçtan uca şifreli**, bu servis alışkanlıkları okuyamaz. Bunun yerine
  uygulama her cihaz için "şu saatte şu bildirimi gönder" listesini cihazda hazırlayıp o cihazın abonelik kaydına yazar
  (`pushSubs/{cihaz}` belgesindeki `jobs`). Servis yalnızca bu listeyi okuyup zamanı gelenleri gönderir.
- Bildirim metni (alışkanlığın adı, "Bugün ideal gün" gibi) bu listede **düz metin** olarak durur. Yalnızca senin
  hesabının kaydında ve senin sunucunda görünür; kurallar başkasının okumasını engeller.
- Bir şey yapınca ya da düzenleyince uygulama listeyi günceller, yaptığın alışkanlığın bildirimi gelmez.
- Her 30 saniyede bir listeye bakar. Dışarıdan bağlantı **kabul etmez**; yalnızca dışarı bağlanır. Alan adı, HTTPS ya da
  router ayarı gerekmez.
- Sunucu kapalıyken ya da servis durmuşken bildirim gelmez. Servis tekrar açılınca yalnızca son 30 dakikadakileri
  gönderir, eskileri yağdırmaz.

## Windows'ta kurulum

Bilgisayar açık ve oturum açıkken bildirimler gelir (uyku modunda gelmez). Her zaman açık kalacak bir PC ya da mini PC için uygundur.

1. Firebase konsolunda yukarıdaki 1. adımı yap (Firestore kuralları ve servis hesabı anahtarı). İndirilen `.json` dosyasının yolunu not et.
2. Depoyu indir (`git clone https://github.com/mifarosa/habiloop` ya da GitHub'dan ZIP) ve PowerShell'i o klasörde aç:

```powershell
powershell -ExecutionPolicy Bypass -File server\install.ps1
```

Betik Node.js'i kontrol eder (yoksa `winget` ile kurar), bağımlılıkları kurar, anahtarı sorar (JSON dosyasını pencereye sürükleyip bırakabilirsin),
bildirim anahtarlarını üretir, Firestore'a bağlanıp denemesini yapar ve sunucuyu **Görev Zamanlayıcı**'ya `HabiloopNotifier` adıyla ekler.
Windows'a her giriş yaptığında gizli başlar. Günlük `server\data
otifier.log` dosyasındadır:

```powershell
Get-Content server\data
otifier.log -Wait -Tail 20
```

Durdurmak için `Stop-ScheduledTask -TaskName HabiloopNotifier`, kaldırmak için
`Unregister-ScheduledTask -TaskName HabiloopNotifier -Confirm:$false`.

Betik yeni bir **PUBLIC anahtar** üretirse ekrana yazar. Uygulamadaki `js/push-config.js` bu anahtarla aynı olmalı, yoksa
bildirim gelmez. Anahtarı bana gönder ya da dosyaya kendin yaz.

## Linux'ta hızlı kurulum (önerilen)

Cihaz Raspberry Pi OS, Debian ya da Ubuntu olmalı.

**1. Bilgisayarında, Firebase konsolunda (iki şey):**

- **Firestore kuralları:** Firestore Database → Rules sekmesine depodaki `firestore.rules` içeriğini yapıştırıp
  **Publish** et. (Yoksa telefonlar kendi bildirim kaydını yazamaz.)
- **Servis hesabı anahtarı:** Proje ayarları → Hizmet hesapları → **Yeni özel anahtar oluştur**. Bir `.json` dosyası
  iner. Bu dosya projenin tam erişim anahtarıdır: kimseyle paylaşma, depoya koyma.

**2. Anahtarı sunucuya kopyala** (adres ve kullanıcıyı kendine göre değiştir):

```sh
scp ~/Downloads/habiloop-d7493-firebase-adminsdk-*.json KULLANICI@SUNUCU_ADRESI:~/serviceAccount.json
```

**3. Sunucuya bağlan ve şunu çalıştır:**

```sh
curl -fsSL https://raw.githubusercontent.com/mifarosa/habiloop/main/server/install.sh | bash
```

Betik Node.js'i (yoksa ya da eskiyse resmî Node.js 22'yi nodejs.org'dan, sağlama toplamını doğrulayarak), kodu,
bağımlılıkları kurar, bildirim anahtarlarını üretir, `.env`'i yazar, **Firestore'a gerçekten bağlanabildiğini dener**
ve servisi sürekli çalışacak şekilde ayarlar. Yalnızca iki şey sorar: anahtar dosyasının yolu (`~/serviceAccount.json`)
ve bir e-posta adresi. Bağlanamazsa servisi kurmaz, günlüğü gösterip durur.

Bittiğinde ekrana bir **PUBLIC anahtar** yazar. Bu anahtar gizli değildir. Onu uygulamadaki `js/push-config.js`
dosyasındaki `window.HABILOOP_VAPID = "..."` satırına yazmak gerekir (bana gönderirsen ben yazıp yayınlarım).
**Private anahtar** ise yalnızca sunucuda kalır.

Betiği tekrar çalıştırmak güvenlidir: var olan anahtarlar korunur, kod güncellenir.

**4. Telefonda / bilgisayarda:**

1. Habiloop'u aç, Ayarlar'da **Google ile giriş yap**, eşitleme şifreni gir.
2. Ayarlar → Bildirimler bölümünde **Sunucu bildirimleri** anahtarını aç, izni ver.
3. **Sunucudan test bildirimi**'ne bas. Birkaç saniye içinde "Bildirimler çalışıyor ✓" gelmeli.
   Sunucu günlüğünde `test push to …: sent` satırını görürsün.

Android'de Chrome yeterli. iPhone'da (iOS 16.4+) önce Safari'de Paylaş → **Ana Ekrana Ekle** gerekir, bildirim yalnızca
ana ekran simgesinden açılan uygulamada çalışır.

## Elle kurulum

```sh
git clone https://github.com/mifarosa/habiloop /opt/habiloop
cd /opt/habiloop/server
npm install --omit=dev
npm run vapid                 # anahtar çifti üretir
cp .env.example .env && nano .env   # anahtarları, e-postanı ve servis hesabı yolunu yaz
chmod 600 .env serviceAccount.json
npm start                     # "connected to Firestore: … device(s)" satırını görmelisin
```

Sürekli çalıştırmak için `habiloop-notifier.service` dosyasını `/etc/systemd/system/` altına kopyalayıp `User=` ve yolları
düzenle, sonra `sudo systemctl enable --now habiloop-notifier`. Docker için `server/docker-compose.yml`
(`serviceAccount.json` ve `.env` dosyalarını `server/` içine koyup depo kökünden
`docker compose -f server/docker-compose.yml up -d --build`).

**Güncelleme:** `bash /opt/habiloop/server/install.sh` (ya da `git pull && npm install --omit=dev && sudo systemctl restart habiloop-notifier`).

## Gelmiyorsa

| Belirti | Bak |
| --- | --- |
| Test hiç gelmiyor | `journalctl -u habiloop-notifier -f`. `connected to Firestore` yoksa servis hesabı ya da `.env` yanlış. Test satırı `not delivered` diyorsa aboneliği yenile: Habiloop'ta anahtarı kapat, tekrar aç. |
| Anahtar hiç görünmüyor | `js/push-config.js`'te PUBLIC anahtar yazılı mı, Google ile giriş yaptın mı? İkisi de gerekli. |
| "Bildirim izni verilmedi" | iPhone: Ayarlar → Bildirimler → Habiloop. Android: Ayarlar → Uygulamalar → Chrome/Habiloop → Bildirimler. |
| Saatinde değil, geç geliyor | Telefonun Odak / Rahatsız Etme modu ya da pil tasarrufu bildirimleri erteler. Sunucu saatinin doğru olduğundan emin ol (`timedatectl`). |
| Bir alışkanlık için gelmedi | Alışkanlığı yapıp işaretledin mi, arşivde mi? Hatırlatma saati alışkanlığın kendi saati, yoksa Ayarlar'daki varsayılan saattir. |
| Çift bildirim | Normal değil. Sunucu bildirimi açıkken uygulama kendi bildirimini göndermez. |

## Güvenlik ve gizlilik

- Bildirim içeriği sunucudan telefona uçtan uca şifreli gider; Apple/Google push servislerinden geçer ama içini okuyamazlar.
- VAPID private anahtarı sızarsa biri senin abonelerine bildirim gönderebilir. Yeni bir çift üret (`npm run vapid`),
  public anahtarı `js/push-config.js`'e yaz, `.env`'i güncelle, sonra cihazlarda sunucu bildirimlerini kapatıp aç.
- Servis hesabı anahtarı sızarsa Google Cloud Console'dan o anahtarı sil ve yenisini üret.

## Testler

```sh
cd server && npm test
```
