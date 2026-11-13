#!/usr/bin/env python3
# Setzt/aktualisiert die Content-Security-Policy (meta) in Rechnungserfassung_Mobil.html:
# berechnet die SHA-256-Hashes aller Inline-Skripte (auch des text/plain-Hauptskripts, das spaeter
# als Inline-Skript eingesetzt wird). Aufruf: csp_aktualisieren.py <html> <variante: mobil|app>
import sys, re, hashlib, base64
pfad, variante = sys.argv[1], sys.argv[2]
s = open(pfad, encoding='utf-8').read()
hashes = []
for m in re.finditer(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', s, re.S):
    body = m.group(2)
    h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode() + "'"
    if h not in hashes: hashes.append(h)
connect = ["'self'", 'blob:', 'data:', 'https://graph.microsoft.com', 'https://login.microsoftonline.com', 'https://login.live.com',
  'https://*.microsoftpersonalcontent.com', 'https://*.1drv.com', 'https://*.livefilestore.com',
  'https://nominatim.openstreetmap.org', 'https://router.project-osrm.org', 'https://routing.openstreetmap.de',
  'https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass.private.coffee',
  'https://tiles.openfreemap.org', 'https://tile.openstreetmap.org', 'https://seblussi.github.io',
  'https://lxp-weiterleitung-19p.azurewebsites.net', 'https://lxp-weiterleitung-sergej-hzckh2ctb3b7ade5.germanywestcentral-01.azurewebsites.net']
richtlinie = '; '.join([
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' " + ' '.join(hashes),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.openfreemap.org",
  "font-src 'self' data:",
  "connect-src " + ' '.join(connect),
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src https://login.microsoftonline.com https://login.live.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
])
meta = '<meta http-equiv="Content-Security-Policy" content="' + richtlinie + '">'
if 'http-equiv="Content-Security-Policy"' in s:
    s = re.sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', lambda m: meta, s, count=1)
else:
    s = s.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n' + meta, 1)
open(pfad, 'w', encoding='utf-8').write(s)
print('CSP:', len(hashes), 'Skript-Hashes')
