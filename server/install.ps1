# Habiloop bildirim sunucusu kurulumu (Windows 10/11, PowerShell).
#
# Calistirmak icin PowerShell'de, depo klasorunden:
#   powershell -ExecutionPolicy Bypass -File server\install.ps1
#
# Yaptigi: Node.js'i kontrol eder (yoksa winget ile kurar), bagimliliklari kurar, bildirim anahtarlarini uretir,
# .env'i yazar, Firestore'a baglanabildigini dener ve sunucuyu Gorev Zamanlayici ile her oturum acilisinda
# gizli calisacak sekilde ayarlar. Tekrar calistirmak guvenlidir: mevcut anahtarlar korunur.
#
# Istege bagli parametreler:  -ServiceAccount "C:\yol\anahtar.json"  -Email "sen@ornek.com"  -SkipCheck  -NoTask
param(
  [string]$ServiceAccount = "",
  [string]$Email = "",
  [switch]$SkipCheck,
  [switch]$NoTask
)
$ErrorActionPreference = "Stop"
$ExpectedProject = "habiloop-d7493"
$TaskName = "HabiloopNotifier"

function Say($m)  { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    [!] $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nHata: $m" -ForegroundColor Red; exit 1 }

$Server = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $Server "package.json"))) { Die "$Server\package.json bulunamadi. Betigi depo icindeki server klasorunden calistir." }

# ------------------------------------------------------------------ 1) Node.js
function Test-Node {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return $false }
  $v = (& node -p "process.versions.node") 2>$null
  if (-not $v) { return $false }
  $p = $v.Split(".")
  return ([int]$p[0] -gt 20) -or ([int]$p[0] -eq 20 -and [int]$p[1] -ge 6)
}
Say "1/6 Node.js"
if (Test-Node) {
  Ok "Node.js $(& node --version) var"
} else {
  Warn "Node.js yok ya da cok eski (gerekli: 20.6 veya ustu). winget ile kuruluyor..."
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Die "winget yok. https://nodejs.org adresinden Node.js 22 LTS'i kur, sonra betigi tekrar calistir." }
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  # winget PATH'i bu pencerede guncellemez; makine ve kullanici PATH'ini yeniden oku.
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Test-Node)) { Die "Node.js kuruldu ama bu pencerede gorunmuyor. PowerShell'i kapatip yeniden ac ve betigi tekrar calistir." }
  Ok "Node.js $(& node --version) kuruldu"
}
$NodeExe = (Get-Command node).Source

# ------------------------------------------------------------- 2) Bagimliliklar
Say "2/6 Bagimliliklar"
Push-Location $Server
try {
  & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "npm install basarisiz. Internet baglantini kontrol et." }
} finally { Pop-Location }
Ok "kuruldu"

# ------------------------------------------------------ 3) Firebase servis hesabi
Say "3/6 Firebase servis hesabi anahtari"
Write-Host "    Sunucu Firestore'u bu anahtarla okur. Firebase konsolunda:"
Write-Host "    Proje ayarlari > Hizmet hesaplari > 'Yeni ozel anahtar olustur' ile bir JSON indir."
Write-Host "    Bu dosya projenin anahtaridir: kimseyle paylasma, depoya koyma."
$Default = Join-Path $Server "serviceAccount.json"
if (-not $ServiceAccount -and (Test-Path $Default)) { $ServiceAccount = $Default; Ok "bulundu: $Default" }
if (-not $ServiceAccount) { $ServiceAccount = Read-Host "    Indirdigin JSON dosyasinin yolu (surukleyip birakabilirsin)" }
$ServiceAccount = $ServiceAccount.Trim().Trim('"')
if (-not (Test-Path $ServiceAccount)) { Die "Anahtar dosyasi yok: $ServiceAccount" }
try {
  $key = Get-Content $ServiceAccount -Raw | ConvertFrom-Json
  if (-not $key.private_key -or -not $key.client_email -or -not $key.project_id) { throw "eksik alan" }
} catch { Die "$ServiceAccount gecerli bir servis hesabi anahtari degil (Firebase'ten indirilen JSON olmali)." }
if ($key.project_id -ne $ExpectedProject) { Warn "Anahtar '$($key.project_id)' projesine ait, Habiloop '$ExpectedProject' kullaniyor. Dogru anahtari indirdiginden emin ol." }
if ((Resolve-Path $ServiceAccount).Path -ne $Default) { Copy-Item $ServiceAccount $Default -Force }
# Dosyayi yalnizca bu kullanicinin okuyabilecegi sekilde kisitla.
& icacls $Default /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Ok "anahtar gecerli (proje: $($key.project_id)), erisim yalnizca sende"

# ------------------------------------------------ 4) VAPID anahtarlari ve .env
Say "4/6 Bildirim anahtarlari ve ayarlar"
$EnvFile = Join-Path $Server ".env"
function Get-EnvValue($name) {
  if (-not (Test-Path $EnvFile)) { return "" }
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if ($line) { return $line.Substring($name.Length + 1) } else { return "" }
}
$Pub = Get-EnvValue "VAPID_PUBLIC_KEY"
$Priv = Get-EnvValue "VAPID_PRIVATE_KEY"
if ($Pub -and $Priv) {
  Ok "mevcut anahtarlar korunuyor (.env)"
} else {
  Push-Location $Server
  try {
    $json = & node --input-type=module -e "import w from 'web-push'; console.log(JSON.stringify(w.generateVAPIDKeys()))"
  } finally { Pop-Location }
  $pair = $json | ConvertFrom-Json
  $Pub = $pair.publicKey; $Priv = $pair.privateKey
  Ok "yeni anahtar cifti uretildi"
}
$oldMail = (Get-EnvValue "VAPID_SUBJECT") -replace "^mailto:", ""
if (-not $Email) {
  $hint = if ($oldMail) { " [$oldMail]" } else { "" }
  $Email = Read-Host "    Iletisim e-postan (push servislerine bildirilir)$hint"
  if (-not $Email) { $Email = $oldMail }
}
if (-not $Email) { Die "E-posta gerekli." }
$envText = @"
# habiloop-notifier ayarlari. Gizlidir: depoya koyma. (install.ps1 tarafindan yazildi)
GOOGLE_APPLICATION_CREDENTIALS=$Default
VAPID_PUBLIC_KEY=$Pub
VAPID_PRIVATE_KEY=$Priv
VAPID_SUBJECT=mailto:$Email
DATA_DIR=$Server\data
TICK_SECONDS=30
MAX_LATE_MINUTES=30
"@
[IO.File]::WriteAllText($EnvFile, $envText, (New-Object Text.UTF8Encoding($false)))
& icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Ok ".env yazildi"

# ------------------------------------------------------ 5) Baglanti denemesi
Say "5/6 Firestore baglanti denemesi"
$LogDir = Join-Path $Server "data"
New-Item -ItemType Directory -Force $LogDir | Out-Null
if ($SkipCheck) {
  Warn "deneme atlandi (-SkipCheck)"
} else {
  $out = Join-Path $LogDir "check.log"
  $p = Start-Process -FilePath $NodeExe -ArgumentList @("--env-file=$EnvFile", "src/index.js") -WorkingDirectory $Server `
    -RedirectStandardOutput $out -RedirectStandardError (Join-Path $LogDir "check.err") -PassThru -WindowStyle Hidden
  $connected = $false
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    if ((Test-Path $out) -and (Select-String -Path $out -Pattern "connected to Firestore" -Quiet)) { $connected = $true; break }
    if ($p.HasExited) { break }
  }
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  if (-not $connected) {
    Write-Host "`n--- gunluk ---"
    if (Test-Path $out) { Get-Content $out -Tail 10 }
    $errFile = Join-Path $LogDir "check.err"
    if (Test-Path $errFile) { Get-Content $errFile -Tail 10 }
    Write-Host "--------------"
    Die "Firestore'a baglanilamadi. Anahtar dogru projeden mi, internet var mi? Yukaridaki gunluge bak."
  }
  Ok ((Select-String -Path $out -Pattern "connected to Firestore" | Select-Object -First 1).Line -replace "^\S+ ", "")
}

# ---------------------------------------------------- 6) Gorev Zamanlayici
Say "6/6 Her oturum acilisinda otomatik baslatma"
if ($NoTask) {
  Warn "gorev kurulmadi (-NoTask). Elle baslat: cd `"$Server`"; node --env-file=.env src/index.js"
} else {
  $log = Join-Path $LogDir "notifier.log"
  $cmd = "Set-Location '$Server'; & '$NodeExe' --env-file='$EnvFile' src/index.js *>> '$log'"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`"" -WorkingDirectory $Server
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 4
  if ((Get-ScheduledTask -TaskName $TaskName).State -eq "Running") {
    Ok "calisiyor ve Windows'a her giris yaptiginda kendiliginden baslayacak"
  } else {
    Warn "gorev calismiyor gorunuyor. Gunluge bak: Get-Content `"$log`" -Tail 20"
  }
}

Write-Host ""
Write-Host "KURULUM TAMAM" -ForegroundColor Green
Write-Host ""
Write-Host "  Gunlugu izle:   Get-Content `"$LogDir\notifier.log`" -Wait -Tail 20"
Write-Host "  Durdur:         Stop-ScheduledTask -TaskName $TaskName"
Write-Host "  Baslat:         Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Kaldir:         Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
Write-Host "  Guncelle:       git pull; sonra bu betigi tekrar calistir"
Write-Host ""
Write-Host "  Uygulamadaki PUBLIC anahtar (js/push-config.js) bu sunucununkiyle ayni olmali."
Write-Host "  Yeni anahtar uretildiyse bana gonder, ben yazip yayinlarim. Bu anahtar gizli degildir:"
Write-Host ""
Write-Host "    $Pub" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Not: Bildirimler bilgisayar acik ve oturum acikken gelir. Uyku modunda gelmez."
