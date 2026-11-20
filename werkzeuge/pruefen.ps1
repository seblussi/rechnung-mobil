# Echtheit der Bibliotheken pruefen (einmal im Quartal, am PC in PowerShell):
#   1. Jede Datei in lib/ gegen lib/PRUEFSUMMEN.txt (SHA-512)
#   2. Jede Bibliothek gegen das Original: Paket von npm bzw. sheetjs.com laden und Datei fuer Datei vergleichen
# Aufruf im Repo-Ordner:   powershell -ExecutionPolicy Bypass -File werkzeuge\pruefen.ps1
# Es wird nichts veraendert; heruntergeladene Pakete landen in einem temporaeren Ordner und werden danach geloescht.
$ErrorActionPreference = 'Stop'
$wurzel = Split-Path -Parent $PSScriptRoot
Set-Location $wurzel
$fehler = 0
function Hash($datei){ (Get-FileHash -Algorithm SHA512 -LiteralPath $datei).Hash.ToLower() }

Write-Host '== 1. Dateien gegen lib/PRUEFSUMMEN.txt ==' -ForegroundColor Cyan
$soll = @{}
foreach($z in Get-Content 'lib/PRUEFSUMMEN.txt'){
  if($z -match '^\s*#' -or -not $z.Trim()){ continue }
  $t = $z -split '\s+', 2; $soll[$t[1].Trim()] = $t[0].ToLower()
}
foreach($pfad in $soll.Keys | Sort-Object){
  if(-not (Test-Path -LiteralPath $pfad)){ Write-Host "FEHLT     $pfad" -ForegroundColor Red; $fehler++; continue }
  if((Hash $pfad) -eq $soll[$pfad]){ Write-Host "OK        $pfad" } else { Write-Host "ABWEICHUNG $pfad" -ForegroundColor Red; $fehler++ }
}
Get-ChildItem -Recurse -File lib | ForEach-Object {
  $r = 'lib/' + ($_.FullName.Substring((Resolve-Path 'lib').Path.Length + 1) -replace '\\', '/')
  if($r -notin @('lib/PRUEFSUMMEN.txt', 'lib/LIZENZEN.txt') -and -not $soll.ContainsKey($r)){ Write-Host "NICHT ERFASST $r" -ForegroundColor Yellow; $fehler++ }
}

Write-Host '== 2. Gegen die Originalpakete ==' -ForegroundColor Cyan
# Datei in lib/ -> Paket (Version wie in package.json) und Pfad im Paket (Fallback: Suche nach dem Dateinamen);
# sri (falls angegeben): npm-Pruefsumme (integrity) des Pakets, wird vor dem Vergleich geprueft
$pakete = @(
  @{ lib = 'lib/argon2.umd.min.js';          url = 'https://registry.npmjs.org/hash-wasm/-/hash-wasm-4.13.0.tgz';                  im = 'dist/argon2.umd.min.js';
     sri = 'sha512-GrWl7wsV46fKIXQZB5ebskLZLAmKL6d9RS0fspCxDeQyjoNu1AfTJTMLPOJyfzaQm0ldFiwFN21/w+sE/kgEFQ==' },
  @{ lib = 'lib/jszip.min.js';               url = 'https://registry.npmjs.org/jszip/-/jszip-3.10.2.tgz';                          im = 'dist/jszip.min.js';
     sri = 'sha512-3l+rb15IOWtUhU0H5MFqES/T6Kh7abYwjosBey/vD6hDt8zoEffkSC5Ws5SGtgVw3gBx2NEbhTeSW1+kWkpyTQ==' },
  @{ lib = 'lib/maplibre/maplibre-gl.mjs';     url = 'https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.19.0.tgz';               im = 'dist/maplibre-gl.mjs';
     sri = 'sha512-3bOrnfddggUYudLGJFsYFvqulUyvSxy4iQzd/uURI7ZhgYEZifdSrECujRSghaCpc+v/ZsFI0Y6ZsGSilEtE+w==' },
  @{ lib = 'lib/maplibre/maplibre-gl-shared.mjs'; url = 'https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.19.0.tgz';               im = 'dist/maplibre-gl-shared.mjs';
     sri = 'sha512-3bOrnfddggUYudLGJFsYFvqulUyvSxy4iQzd/uURI7ZhgYEZifdSrECujRSghaCpc+v/ZsFI0Y6ZsGSilEtE+w==' },
  @{ lib = 'lib/maplibre/maplibre-gl-worker.mjs'; url = 'https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.19.0.tgz';               im = 'dist/maplibre-gl-worker.mjs';
     sri = 'sha512-3bOrnfddggUYudLGJFsYFvqulUyvSxy4iQzd/uURI7ZhgYEZifdSrECujRSghaCpc+v/ZsFI0Y6ZsGSilEtE+w==' },
  @{ lib = 'lib/maplibre/maplibre-gl.css';     url = 'https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.19.0.tgz';               im = 'dist/maplibre-gl.css';
     sri = 'sha512-3bOrnfddggUYudLGJFsYFvqulUyvSxy4iQzd/uURI7ZhgYEZifdSrECujRSghaCpc+v/ZsFI0Y6ZsGSilEtE+w==' },
  @{ lib = 'lib/msal/msal-browser.min.js';   url = 'https://registry.npmjs.org/@azure/msal-browser/-/msal-browser-5.30.0.tgz';     im = 'lib/msal-browser.min.js';
     sri = 'sha512-o/ADxWxEFcVrE65a7ssOGuxnivq8lcy+2hSGlOOwtn0gGd6iiwl3q8/BMVRorYE81UB/r4B+8WGEUxWnqP7ryA==' },
  @{ lib = 'lib/pdf-lib.min.js';             url = 'https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz';                      im = 'dist/pdf-lib.min.js';
     sri = 'sha512-V/mpyJAoTsN4cnP31vc0wfNA1+p20evqqnap0KLoRUN0Yk/p3wN52DOEsL4oBFcLdb76hlpKPtzJIgo67j/XLw==' },
  @{ lib = 'lib/pdfjs/pdf.min.mjs';          url = 'https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz';               im = 'legacy/build/pdf.min.mjs';
     sri = 'sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==' },
  @{ lib = 'lib/pdfjs/pdf.worker.min.mjs';   url = 'https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz';               im = 'legacy/build/pdf.worker.min.mjs';
     sri = 'sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==' },
  @{ lib = 'lib/pdfjs/standard_fonts/*';     url = 'https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz';               im = 'standard_fonts';
     sri = 'sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==' },
  @{ lib = 'lib/qrcode/qrcode.js';           url = 'https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz';     im = 'qrcode.js' },
  @{ lib = 'lib/xlsx/xlsx.full.min.js';      url = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';                          im = 'dist/xlsx.full.min.js';
     sri = 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==' }   # Stand 2026-11-20 (keine offizielle Pruefsumme von SheetJS)
)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('lib_pruefen_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tmp | Out-Null
$geladen = @{}
try{
  foreach($p in $pakete){
    $muster = $p.lib
    $lokal = if($muster.EndsWith('/*')){ Get-ChildItem -File ($muster.TrimEnd('*').TrimEnd('/')) -ErrorAction SilentlyContinue } else { if(Test-Path $muster){ Get-Item $muster } }
    if(-not $lokal){ continue }   # Bibliothek gibt es in diesem Repo nicht
    if(-not $geladen.ContainsKey($p.url)){
      $ziel = Join-Path $tmp ('p' + $geladen.Count); New-Item -ItemType Directory $ziel | Out-Null
      $tgz = Join-Path $ziel 'paket.tgz'
      try{ Invoke-WebRequest -UseBasicParsing -Uri $p.url -OutFile $tgz }catch{ Write-Host "NICHT LADBAR $($p.url): $($_.Exception.Message)" -ForegroundColor Red; $fehler++; $geladen[$p.url] = $null; continue }
      if($p.sri){   # Paket selbst gegen die npm-Pruefsumme (integrity) abgleichen
        $ist = 'sha512-' + [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($tgz)))
        if($ist -cne $p.sri){ Write-Host "PAKET-PRUEFSUMME FALSCH $($p.url)" -ForegroundColor Red; $fehler++; $geladen[$p.url] = $null; continue } else { Write-Host "OK (npm-Pruefsumme) $($p.url)" }
      }
      tar -xzf $tgz -C $ziel
      $geladen[$p.url] = Join-Path $ziel 'package'
    }
    $paket = $geladen[$p.url]; if(-not $paket){ continue }
    foreach($d in @($lokal)){
      $im = if($muster.EndsWith('/*')){ Join-Path (Join-Path $paket $p.im) $d.Name } else { Join-Path $paket $p.im }
      if(-not (Test-Path -LiteralPath $im)){ $treffer = Get-ChildItem -Recurse -File $paket -Filter $d.Name | Select-Object -First 1; if($treffer){ $im = $treffer.FullName } }
      $name = ($d.FullName.Substring($wurzel.Length + 1) -replace '\\', '/')
      if(-not (Test-Path -LiteralPath $im)){ Write-Host "IM ORIGINAL NICHT GEFUNDEN $name ($($p.url))" -ForegroundColor Yellow; $fehler++; continue }
      if((Hash $d.FullName) -eq (Hash $im)){ Write-Host "OK (Original) $name" } else { Write-Host "WEICHT VOM ORIGINAL AB $name" -ForegroundColor Red; $fehler++ }
    }
  }
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host 'lib/banken.js (Bankleitzahlen der Bundesbank) ist eigene Aufbereitung und hat kein npm-Original.'
if($fehler){ Write-Host "$fehler Auffaelligkeit(en) - bitte melden." -ForegroundColor Red; exit 1 } else { Write-Host 'Alles in Ordnung.' -ForegroundColor Green }
