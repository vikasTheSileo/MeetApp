param([switch]$DownloadServer)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localFolder = Join-Path $projectRoot '.local/livekit'
New-Item -ItemType Directory -Force $localFolder | Out-Null
$configPath = Join-Path $projectRoot 'appsettings.Local.json'
if (!(Test-Path -LiteralPath $configPath)) {
    $secretBytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
    $secret = [Convert]::ToHexString($secretBytes).ToLowerInvariant()
    $settings = @{ LiveKit = @{ ServerUrl='http://localhost:7880'; PublicUrl='ws://localhost:7880'; ApiKey='together-local'; ApiSecret=$secret } }
    $settings | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath
} else { $settings = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable }
$apiKey = $settings.LiveKit.ApiKey
$apiSecret = $settings.LiveKit.ApiSecret
if ($apiKey -notmatch '^[a-zA-Z0-9_-]+$' -or $apiSecret -notmatch '^[a-zA-Z0-9_-]{32,}$') { throw 'Local credentials must be alphanumeric, with a secret at least 32 characters long.' }
@"
port: 7880
bind_addresses:
  - 127.0.0.1
rtc:
  node_ip: 127.0.0.1
  use_external_ip: false
  tcp_port: 7881
  udp_port: 7882
room:
  auto_create: false
  max_participants: 20
  empty_timeout: 600
  departure_timeout: 120
keys:
  ${apiKey}: ${apiSecret}
logging:
  level: warn
"@ | Set-Content -LiteralPath (Join-Path $localFolder 'livekit.yaml')
if ($DownloadServer) {
    $version='1.13.7'
    $archive=Join-Path $localFolder 'server.zip'
    $checks=Join-Path $localFolder 'checksums.txt'
    Invoke-WebRequest "https://github.com/livekit/livekit/releases/download/v$version/livekit_${version}_windows_amd64.zip" -OutFile $archive
    Invoke-WebRequest "https://github.com/livekit/livekit/releases/download/v$version/checksums.txt" -OutFile $checks
    $hash=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected=Get-Content -LiteralPath $checks | Where-Object { $_.EndsWith("livekit_${version}_windows_amd64.zip") }
    if (!$expected -or !$expected.StartsWith($hash)) { throw 'LiveKit checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $localFolder 'bin') -Force
}
Write-Output 'Local credentials and loopback-only LiveKit configuration are ready. Secrets were not printed.'
Write-Output 'Start LiveKit: .\.local\livekit\bin\livekit-server.exe --config .\.local\livekit\livekit.yaml'
Write-Output 'Start chat: dotnet run --launch-profile https'
