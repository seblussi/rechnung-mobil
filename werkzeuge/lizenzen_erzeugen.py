#!/usr/bin/env python3
# Erzeugt lib/LIZENZEN.txt (Open-Source-Lizenzen und Datenquellen) fuer rechnung-mobil bzw. rechnung-app.
import sys, os
repo = sys.argv[1]; launch = repo.rstrip('/').endswith('rechnung-app')
lib = os.path.join(repo, 'lib')
APACHE = open('/usr/share/common-licenses/Apache-2.0', encoding='utf-8').read()
def lesen(p): return open(os.path.join(lib, p), encoding='utf-8', errors='replace').read().strip()
MIT = '''Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.'''
BSD3 = '''Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.'''
teile = []  # (Titel, Lizenz, Copyright, Volltext oder None fuer Apache)
teile.append(('MapLibre GL JS 4.7.1 (lib/maplibre/)', 'BSD-3-Clause', 'Copyright (c) 2023, MapLibre contributors\nCopyright (c) 2014-2020, Mapbox', BSD3))
teile.append(('pdf.js / pdfjs-dist 6.2.108 (lib/pdfjs/)', 'Apache-2.0', 'Copyright (c) Mozilla Foundation and pdf.js contributors', None))
teile.append(('pdf-lib 1.17.1 (lib/pdf-lib.min.js)', 'MIT', 'Copyright (c) 2019 Andrew Dillon', MIT))
teile.append(('SheetJS Community Edition xlsx 0.18.5 (lib/xlsx/)', 'Apache-2.0', '(C) 2013-present SheetJS LLC', None))
teile.append(('JSZip 3.10.1 (lib/jszip.min.js), genutzt unter der MIT-Lizenz (JSZip ist MIT oder GPLv3)', 'MIT', 'Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso', MIT))
teile.append(('QR Code Generator for JavaScript (lib/qrcode/)', 'MIT', '', lesen('qrcode/LICENSE')))
if launch:
    teile.append(('hash-wasm 4.12.0 (lib/argon2.umd.min.js)', 'MIT', 'Copyright (c) Dani Biro', MIT))
else:
    teile.append(('Microsoft Authentication Library for JavaScript, msal-browser 3.30.0 (lib/msal/)', 'MIT', 'Copyright (c) Microsoft Corporation. All rights reserved.', MIT))
teile.append(('Bankleitzahlen-Daten (lib/banken.js), aufbereitet aus dem Projekt "schwifty"', 'MIT', 'Copyright (c) 2021 Martin Domke\nDaten: Deutsche Bundesbank, Oesterreichische Nationalbank, SIX Group', MIT))
teile.append(('Schriften Foxit (lib/pdfjs/standard_fonts/Foxit*)', 'BSD-3-Clause (PDFium Authors)', '', lesen('pdfjs/standard_fonts/LICENSE_FOXIT')))
teile.append(('Schriften Liberation (lib/pdfjs/standard_fonts/Liberation*)', 'SIL Open Font License 1.1', '', lesen('pdfjs/standard_fonts/LICENSE_LIBERATION')))

out = []
out.append('OPEN-SOURCE-LIZENZEN UND DATENQUELLEN')
out.append('=' * 37)
out.append('')
out.append('Diese App verwendet die folgenden Open-Source-Komponenten. Alle Komponenten liegen als feste')
out.append('Kopie in der App (Ordner lib/) und werden nicht von fremden Servern nachgeladen.')
out.append('Die vollständigen Lizenztexte folgen unten.')
out.append('')
for t, l, c, _ in teile: out.append('- ' + t + ' — ' + l)
out.append('')
out.append('KARTEN- UND GEODATEN (werden zur Laufzeit abgerufen)')
out.append('- Kartendaten: © OpenStreetMap-Mitwirkende, Open Database License (ODbL) 1.0 — https://www.openstreetmap.org/copyright')
out.append('- Vektorkacheln: OpenFreeMap — https://openfreemap.org ; Schema/Stil: © OpenMapTiles — https://openmaptiles.org (CC-BY 4.0)')
out.append('- Adresssuche: Nominatim (OpenStreetMap), Routen: OSRM / routing.openstreetmap.de, POI-Abfragen: Overpass API — jeweils Daten © OpenStreetMap-Mitwirkende (ODbL)')
out.append('')
apache_drin = False
for t, l, c, txt in teile:
    out.append('')
    out.append('-' * 78)
    out.append(t)
    out.append('Lizenz: ' + l)
    if c: out.append(c)
    out.append('-' * 78)
    if txt is None:
        out.append('Lizenztext: Apache License 2.0, siehe unten (einmal vollständig abgedruckt).')
    else:
        out.append(txt)
out.append('')
out.append('=' * 78)
out.append('APACHE LICENSE, VERSION 2.0 (für pdf.js und SheetJS)')
out.append('=' * 78)
out.append(APACHE)
open(os.path.join(lib, 'LIZENZEN.txt'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(repo, len(out), 'Zeilen')
