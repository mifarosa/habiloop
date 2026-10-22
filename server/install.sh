#!/usr/bin/env bash
# Habiloop bildirim sunucusu kurulumu (Raspberry Pi OS, Debian, Ubuntu).
#
# Tek komutla kurar: Node.js, kod, bağımlılıklar, anahtarlar, .env ve sürekli çalışan servis.
#   curl -fsSL https://raw.githubusercontent.com/mifarosa/habiloop/main/server/install.sh | bash
# ya da depoyu zaten indirdiysen:  bash server/install.sh
#
# Tekrar çalıştırmak güvenlidir: var olan anahtarlar ve .env korunur, yalnızca güncellenir.
#
# Ortam değişkenleri (hepsi isteğe bağlı; verilmezse sorulur):
#   HABILOOP_DIR          kodun yeri (varsayılan /opt/habiloop; betik depo içinden çalışıyorsa o depo)
#   HABILOOP_BRANCH       hangi dal (varsayılan main)
#   HABILOOP_EMAIL        VAPID için iletişim e-postası
#   HABILOOP_SA_PATH      servis hesabı anahtarı (JSON) dosyasının yolu
#   HABILOOP_NO_SYSTEMD=1 servis kurma, yalnızca hazırla
#   HABILOOP_SKIP_CHECK=1 Firestore bağlantı denemesini atla
#   Testler için: HABILOOP_MEMINFO=<dosya>, HABILOOP_SKIP_NPM=1, HABILOOP_NO_SUDO=1, HABILOOP_UNIT_PATH=<dosya>, HABILOOP_FORCE_NODE_INSTALL=1,
#   HABILOOP_NODE_PREFIX, HABILOOP_NODE_BINDIR (bkz. server/test/install.test.mjs)
set -euo pipefail

REPO_URL=${HABILOOP_REPO:-https://github.com/mifarosa/habiloop}
BRANCH=${HABILOOP_BRANCH:-main}
EXPECTED_PROJECT=habiloop-d7493

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mHata:\033[0m %s\n' "$*" >&2; exit 1; }

# Yönetici yetkisi gereken komutlar: root isek doğrudan, değilsek sudo ile.
as_root() {
  if [ "$(id -u)" -eq 0 ] || [ "${HABILOOP_NO_SUDO:-}" = 1 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else die "Bu adım yönetici yetkisi ister ama sudo yok. Betiği root olarak çalıştır."
  fi
}

# Gerçekten kullanılabilir bir terminal var mı? (/dev/tty dosyası olması yetmez, açılabilmeli.)
have_tty() { { true </dev/tty; } 2>/dev/null; }

# Soru sor. Değişken önceden doluysa (ortamdan) sormaz. Terminalden okur,
# böylece `curl ... | bash` ile çalıştırınca da sorabilir.
ask() {
  local var=$1 prompt=$2 default=${3:-} value=
  [ -n "${!var:-}" ] && return 0
  if ! have_tty; then
    # No terminal (an automated re-run): reuse the earlier answer if there is one.
    [ -n "$default" ] || die "$prompt gerekli ama terminal yok. $var değişkenini ver."
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [ -n "$default" ]; then
    read -r -p "    $prompt [$default]: " value </dev/tty || true
    value=${value:-$default}
  else
    read -r -p "    $prompt: " value </dev/tty || true
  fi
  printf -v "$var" '%s' "$value"
}

# ---------------------------------------------------------------- 1) Node.js
node_ok() {
  command -v node >/dev/null 2>&1 && node -e '
    const [a, b] = process.versions.node.split(".").map(Number);
    process.exit(a > 20 || (a === 20 && b >= 6) ? 0 : 1)' >/dev/null 2>&1
}

# Resmî Node.js 22'yi nodejs.org'dan indirip kurar. apt'ye ve NodeSource'a bağlı değil: onlar
# işletim sistemine göre sessizce eski sürümü bırakabiliyor (Ubuntu 20.04'te Node 10 gibi).
install_node() {
  local arch base sums line want file tmp prefix bindir dir
  [ "$(uname -s)" = Linux ] || die "Bu betik yalnızca Linux içindir."
  case "$(uname -m)" in
    x86_64|amd64)  arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    armv7l)        arch=armv7l ;;
    *) die "Bu cihazın işlemcisi ($(uname -m)) için resmî Node.js 22 yok. Raspberry Pi 2/3/4/5, 64 bit Linux ya da armv7 bir cihaz gerekir." ;;
  esac
  base=https://nodejs.org/dist/latest-v22.x
  sums=$(curl -fsSL "$base/SHASUMS256.txt") || die "nodejs.org'a ulaşılamadı. İnternet bağlantısını kontrol et."
  line=$(printf '%s\n' "$sums" | grep -E " node-v[0-9.]+-linux-$arch\.tar\.gz$" | head -n1 || true)
  [ -n "$line" ] || die "nodejs.org'da $arch için Node.js 22 bulunamadı."
  want=${line%% *}
  file=${line##* }
  tmp=$(mktemp -d)
  curl -fsSL "$base/$file" -o "$tmp/$file" || { rm -rf "$tmp"; die "$file indirilemedi."; }
  [ "$(sha256sum "$tmp/$file" | cut -d' ' -f1)" = "$want" ] \
    || { rm -rf "$tmp"; die "İndirilen Node.js dosyasının sağlama toplamı tutmuyor (bozuk indirme). Tekrar dene."; }
  prefix=${HABILOOP_NODE_PREFIX:-/opt}
  bindir=${HABILOOP_NODE_BINDIR:-/usr/local/bin}
  dir=$prefix/${file%.tar.gz}
  as_root mkdir -p "$prefix" "$bindir"
  as_root tar -xzf "$tmp/$file" -C "$prefix"
  for bin in node npm npx; do as_root ln -sf "$dir/bin/$bin" "$bindir/$bin"; done
  rm -rf "$tmp"
  # Eski bir Node yolun önündeyse bile bu betik yenisini kullansın.
  export PATH="$bindir:$PATH"
  hash -r
}

say "1/6 Node.js"
if [ "${HABILOOP_FORCE_NODE_INSTALL:-}" != 1 ] && node_ok; then
  ok "Node.js $(node --version) var"
else
  if command -v node >/dev/null 2>&1 && node_ok; then
    warn "Node.js zorla yeniden kuruluyor (HABILOOP_FORCE_NODE_INSTALL=1)."
  elif command -v node >/dev/null 2>&1; then
    warn "Mevcut Node.js $(node --version 2>&1 | head -n1) çok eski (gerekli: 20.6 ya da üstü); resmî Node.js 22 kuruluyor."
  else
    warn "Node.js yok; resmî Node.js 22 kuruluyor."
  fi
  install_node
  node_ok || die "Node.js kuruldu ama çalıştırılamadı ya da sürümü yetersiz (bulunan: $(command -v node || echo yok), $(node --version 2>&1 | head -n1)). İşletim sistemin çok eskiyse (glibc 2.28 altı) Node 22 çalışmaz: Ubuntu 20.04+, Debian 10+ ya da Raspberry Pi OS Buster+ gerekir."
  ok "Node.js $(node --version) kuruldu"
fi

# ------------------------------------------------------------------- 2) Kod
say "2/6 Kod"
SELF=${BASH_SOURCE[0]:-}
ROOT=
if [ -n "$SELF" ] && [ -f "$SELF" ]; then
  candidate=$(cd "$(dirname "$SELF")/.." && pwd)
  [ -f "$candidate/js/schedule.js" ] && ROOT=$candidate
fi
if [ -z "$ROOT" ]; then
  ROOT=${HABILOOP_DIR:-/opt/habiloop}
  command -v git >/dev/null 2>&1 || { command -v apt-get >/dev/null 2>&1 && as_root apt-get install -y git; }
  command -v git >/dev/null 2>&1 || die "git gerekli. Kur ve tekrar çalıştır."
  if [ -d "$ROOT/.git" ]; then
    git -C "$ROOT" fetch --quiet origin "$BRANCH"
    git -C "$ROOT" checkout --quiet "$BRANCH"
    git -C "$ROOT" pull --quiet --ff-only origin "$BRANCH"
    ok "$ROOT güncellendi ($BRANCH)"
  else
    as_root mkdir -p "$ROOT" && as_root chown "$(id -un)":"$(id -gn)" "$ROOT"
    git clone --quiet --branch "$BRANCH" "$REPO_URL" "$ROOT" \
      || die "Depo indirilemedi: $REPO_URL. Depo özelse önce kendin 'git clone' ile indirip 'bash server/install.sh' çalıştır."
    ok "$ROOT içine indirildi ($BRANCH)"
  fi
else
  ok "mevcut kod kullanılıyor: $ROOT"
fi
SERVER="$ROOT/server"
[ -f "$SERVER/package.json" ] || die "$SERVER/package.json yok; bu dalda sunucu kodu bulunamadı."

# ---------------------------------------------------------- 3) Bağımlılıklar
say "3/6 Bağımlılıklar"
SWAP_HELP='    sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab'
MEMINFO=${HABILOOP_MEMINFO:-/proc/meminfo}
MEM_KB=$(awk '/^MemTotal:/ {print $2}' "$MEMINFO" 2>/dev/null || true)
SWAP_KB=$(awk '/^SwapTotal:/ {print $2}' "$MEMINFO" 2>/dev/null || true)
if [ -n "${MEM_KB:-}" ] && [ "$MEM_KB" -lt 1500000 ] && [ "${SWAP_KB:-0}" -eq 0 ]; then
  warn "Bellek az ($((MEM_KB / 1024)) MB) ve takas alanı (swap) yok. npm kurulumu bellek yetmezse \"Killed\" diye kesilebilir."
  printf '    Kesilirse şunu çalıştırıp betiği tekrar çalıştır:\n%s\n' "$SWAP_HELP"
fi
if [ "${HABILOOP_SKIP_NPM:-}" = 1 ]; then
  warn "bağımlılık kurulumu atlandı (HABILOOP_SKIP_NPM=1)"
else
  NPM_LOG=$(mktemp)
  if ( cd "$SERVER" && { npm ci --omit=dev --no-audit --no-fund >"$NPM_LOG" 2>&1 || npm install --omit=dev --no-audit --no-fund >>"$NPM_LOG" 2>&1; } ); then
    ok "kuruldu"
  else
    printf '\n--- npm çıktısının sonu ---\n'; tail -n 8 "$NPM_LOG"; printf -- '---------------------------\n'
    rm -f "$NPM_LOG"
    die "npm install başarısız. İnternet bağlantısını kontrol et. Çıktıda 'Killed' varsa bellek yetmemiştir: takas alanı ekleyip tekrar çalıştır:
$SWAP_HELP"
  fi
  rm -f "$NPM_LOG"
fi

# ----------------------------------------------- 4) Firebase servis hesabı
say "4/6 Firebase servis hesabı anahtarı"
ENV_FILE="$SERVER/.env"
DEFAULT_SA="$SERVER/serviceAccount.json"
cat <<'MSG'
    Sunucu Firestore'u bu anahtarla okur. Firebase konsolunda:
    Proje ayarları → Hizmet hesapları → "Yeni özel anahtar oluştur" ile bir JSON indir.
    (En az yetki için: Google Cloud → IAM → Hizmet hesapları → yeni hesap, rolü
    "Cloud Datastore User", sonra Anahtarlar → Anahtar ekle → JSON.)
    Bu dosya projenin anahtarıdır: kimseyle paylaşma, depoya koyma.
MSG
if [ -z "${HABILOOP_SA_PATH:-}" ] && [ -f "$DEFAULT_SA" ]; then HABILOOP_SA_PATH=$DEFAULT_SA; ok "bulundu: $DEFAULT_SA"; fi
ask HABILOOP_SA_PATH "Anahtar JSON dosyasının yolu (dosya yoksa boş bırak, içeriğini yapıştırırsın)" ""
SA_PATH=${HABILOOP_SA_PATH:-}
if [ -z "$SA_PATH" ]; then
  SA_PATH=$DEFAULT_SA
  have_tty || die "Anahtar dosyası verilmedi (HABILOOP_SA_PATH)."
  printf '    JSON dosyasının TÜM içeriğini yapıştır, sonra Enter ve Ctrl+D:\n'
  cat >"$SA_PATH" </dev/tty
fi
SA_PATH=${SA_PATH/#\~/$HOME}
[ -f "$SA_PATH" ] || die "Anahtar dosyası yok: $SA_PATH"
PROJECT_ID=$(node -e '
  try {
    const k = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (!k.private_key || !k.client_email || !k.project_id) throw new Error("eksik alan");
    console.log(k.project_id);
  } catch (e) {
    // Never echo the file: it may hold a secret.
    console.error("geçersiz: " + (e instanceof SyntaxError ? "JSON değil" : e.message));
    process.exit(1);
  }' "$SA_PATH" 2>/dev/null) \
  || die "$SA_PATH geçerli bir servis hesabı anahtarı değil (Firebase'ten indirilen JSON olmalı)."
if [ "$PROJECT_ID" != "$EXPECTED_PROJECT" ]; then
  warn "Anahtar '$PROJECT_ID' projesine ait, Habiloop '$EXPECTED_PROJECT' kullanıyor. Doğru anahtarı indirdiğinden emin ol."
fi
chmod 600 "$SA_PATH"
ok "anahtar geçerli (proje: $PROJECT_ID), dosya izinleri 600"

# ------------------------------------------------ 5) VAPID anahtarları, .env
say "5/6 Bildirim anahtarları ve ayarlar"
env_value() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -n1 || true; }
VAPID_PUBLIC=$(env_value VAPID_PUBLIC_KEY)
VAPID_PRIVATE=$(env_value VAPID_PRIVATE_KEY)
if [ -n "$VAPID_PUBLIC" ] && [ -n "$VAPID_PRIVATE" ]; then
  ok "mevcut anahtarlar korunuyor (.env)"
else
  keys=$(cd "$SERVER" && node --input-type=module -e "
    import webpush from 'web-push';
    console.log(JSON.stringify(webpush.generateVAPIDKeys()));")
  VAPID_PUBLIC=$(printf '%s' "$keys" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).publicKey))')
  VAPID_PRIVATE=$(printf '%s' "$keys" | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).privateKey))')
  ok "yeni anahtar çifti üretildi"
fi
EXISTING_EMAIL=$(env_value VAPID_SUBJECT)
EXISTING_EMAIL=${EXISTING_EMAIL#mailto:}
ask HABILOOP_EMAIL "İletişim e-postan (push servislerine bildirilir)" "$EXISTING_EMAIL"
[ -n "${HABILOOP_EMAIL:-}" ] || die "E-posta gerekli."
umask 077
cat >"$ENV_FILE" <<ENV
# habiloop-notifier ayarları. Gizlidir: depoya koyma. (install.sh tarafından yazıldı)
GOOGLE_APPLICATION_CREDENTIALS=$SA_PATH
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:$HABILOOP_EMAIL
DATA_DIR=$SERVER/data
TICK_SECONDS=30
MAX_LATE_MINUTES=30
ENV
chmod 600 "$ENV_FILE"
ok ".env yazıldı (izinler 600)"

# ------------------------------------------------- 6) Deneme ve servis kurma
say "6/6 Bağlantı denemesi ve servis"
if [ "${HABILOOP_SKIP_CHECK:-}" = 1 ]; then
  warn "bağlantı denemesi atlandı (HABILOOP_SKIP_CHECK=1)"
else
  LOG=$(mktemp)
  set +e
  ( cd "$SERVER" && timeout 25 node --env-file="$ENV_FILE" src/index.js >"$LOG" 2>&1 )
  set -e
  if grep -q "connected to Firestore" "$LOG"; then
    ok "Firestore'a bağlanıldı: $(grep -m1 'connected to Firestore' "$LOG" | sed 's/^[^ ]* //')"
  else
    printf '\n--- günlük ---\n'; tail -n 15 "$LOG"; printf -- '--------------\n'
    rm -f "$LOG"
    die "Firestore'a bağlanılamadı. Anahtar doğru projeden mi, sunucunun interneti var mı? Yukarıdaki günlüğe bak."
  fi
  rm -f "$LOG"
fi

# WSL and containers ship systemctl without a running systemd, so test for the runtime dir too.
if [ "${HABILOOP_NO_SYSTEMD:-}" = 1 ] || ! command -v systemctl >/dev/null 2>&1 \
  || { [ -z "${HABILOOP_UNIT_PATH:-}" ] && [ ! -d /run/systemd/system ]; }; then
  warn "systemd çalışmıyor (WSL olabilir), servis kurulmadı."
  warn "Elle başlat: cd $SERVER && node --env-file=$ENV_FILE src/index.js"
else
  UNIT=${HABILOOP_UNIT_PATH:-/etc/systemd/system/habiloop-notifier.service}
  NODE_BIN=$(command -v node)
  as_root tee "$UNIT" >/dev/null <<UNIT_FILE
[Unit]
Description=Habiloop reminder notifications
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$SERVER
ExecStart=$NODE_BIN --env-file=$ENV_FILE src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT_FILE
  as_root systemctl daemon-reload
  as_root systemctl enable --now habiloop-notifier >/dev/null 2>&1
  sleep 3
  if systemctl is-active --quiet habiloop-notifier; then
    ok "servis çalışıyor ve cihaz açılınca kendiliğinden başlayacak"
  else
    warn "servis başlamadı. Bak: journalctl -u habiloop-notifier -n 30 --no-pager"
  fi
fi

cat <<DONE

$(printf '\033[1m')KURULUM TAMAM$(printf '\033[0m')

  Günlüğü izle:    journalctl -u habiloop-notifier -f
  Durdur / başlat: sudo systemctl stop|start habiloop-notifier
  Güncelle:        bash $SERVER/install.sh

  Şimdi uygulamanın bu sunucuyu tanıması için PUBLIC anahtarı js/push-config.js dosyasındaki
  window.HABILOOP_VAPID = "..." satırına yazmak gerekiyor. Bu anahtar gizli değildir, bana gönderebilirsin:

    $VAPID_PUBLIC

  (Private anahtar yalnızca $ENV_FILE içinde kalır; kimseye gönderme.)
DONE
