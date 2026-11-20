// Wünsche vom 21.11.2026:
// 1. Hell/Dunkel: beim Start wie das Handy; Wahl von Hand (Sonne/Mond) gilt nur bis zum nächsten Start
// 2. Rechnung an Vertretungsärzte: Firmenname (z. B. „MVZ Ullingen“) als Zeile über dem Namen
// 3. Einführung: Rahmen gleitet beim Scrollen nicht über das Ziel hinaus
// 4. Startkarte: Fall unter der Karte anklicken -> Punkt in der Karte; Punkt anklicken -> Fall unter der Karte und in „Fälle in diesem Dienst“
// 5. Zurück aus einem neuen Fall, der über das + auf „Dienste bearbeiten“ geöffnet wurde -> wieder „Dienste“
const { geraet, oeffnen } = require('./hilfe');

module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await p.emulateMedia({ colorScheme: 'dark' });
  await oeffnen(p, basis, { demo: true });
  const dunkel = ()=> p.evaluate(()=> document.body.classList.contains('dunkel'));

  // ---------- 1. Hell/Dunkel ----------
  pr('Start folgt dem Handy (dunkel)', await dunkel());
  await p.evaluate(()=> document.getElementById('btnDunkelToggle').click()); await p.waitForTimeout(300);
  pr('Sonne/Mond schaltet auf hell', !(await dunkel()));
  await p.reload(); await p.waitForFunction(()=> typeof ansichtStart === 'function' && typeof LS !== 'undefined'); await p.waitForTimeout(1500);
  pr('Neu laden in derselben Sitzung (z. B. App-Sperre): Wahl von Hand bleibt', !(await dunkel()));
  await p.evaluate(()=> sessionStorage.removeItem('dunkel_hand'));   // App beendet und neu gestartet
  await p.reload(); await p.waitForFunction(()=> typeof ansichtStart === 'function' && typeof LS !== 'undefined'); await p.waitForTimeout(1500);
  pr('Nächster Start: wieder wie das Handy (dunkel)', await dunkel());
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(300);
  pr('Handy wechselt auf hell: App folgt', !(await dunkel()));
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);

  // ---------- 2. Firmenname auf der Arztrechnung ----------
  const firma = await p.evaluate(async ()=>{
    const e = ladeEinstellungen(); e.rechnungQr = false; speichereEinstellungen(e);
    const w = (t)=> '<w:p><w:r><w:t>' + t + '</w:t></w:r></w:p>';
    const zeile = (t)=> '<w:tr><w:tc><w:p><w:r><w:t>' + t + '</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>';
    const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      w('VNAME') + w('PADRESSE1') + w('PADRESSE2') + '<w:tbl><w:tblGrid><w:gridCol w:w="5000"/><w:gridCol w:w="2000"/></w:tblGrid>' + zeile('DIENSTDAT') + zeile('SUMME') + '</w:tbl>' + w('RENU') + '</w:body></w:document>';
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    z.file('word/document.xml', doc);
    const vorlage = await z.generateAsync({ type: 'arraybuffer' });
    const daten = { arzt: {}, vname: 'Dr. Max Muster', adr1: 'Hauptstr. 1', adr2: '79100 Freiburg', datum: '21.11.2026', renu: 'MM-001', quartalText: '4. Quartals 2026',
      dienste: [{ text: '02.10.2026, 18–23 Uhr', datum: '02.10.2026', zeit: '18–23 Uhr', art: 'Fahrdienst' }], summe: 100 };
    const lies = async (blob)=> (await JSZip.loadAsync(blob)).file('word/document.xml').async('string');
    const mit = await lies(await aerzteDocxErzeugen(vorlage, Object.assign({ firma: 'MVZ Ullingen' }, daten)));
    const ohne = await lies(await aerzteDocxErzeugen(vorlage, Object.assign({ firma: '' }, daten)));
    const text = (x)=> x.replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    // Dialog: Feld vorhanden und aus der gespeicherten Adresse vorbelegt
    const c = LS.get(EIGENE_POS_CACHE, null) || {}; c.aerzteAdressen = [{ arzt: 'Dr. Max Muster', firma: 'OrthoDocs GmbH', vname: 'Dr. Max Muster', adr1: 'Hauptstr. 1', adr2: '79100 Freiburg', kuerzel: 'MM' }]; LS.set(EIGENE_POS_CACHE, c);
    const dlg = aerzteRechnungDialog('Dr. Max Muster', 'Quartal 4 / 2026', []);
    await new Promise(r=> setTimeout(r, 300));
    const feld = document.getElementById('arFirma'), vor = feld ? feld.value : null;
    const lblOben = feld && document.getElementById('arVname') && (feld.compareDocumentPosition(document.getElementById('arVname')) & Node.DOCUMENT_POSITION_FOLLOWING);
    if(feld) feld.value = 'MVZ Ullingen';
    const ok = [...document.querySelectorAll('button')].find(b=> /Rechnung erstellen/.test(b.textContent)); if(ok) ok.click();
    const st = await dlg;
    return { mit: text(mit), ohne: text(ohne), vor, lblOben: !!lblOben, st: st && st.firma };
  });
  pr('Arztrechnung: Firmenname als eigene Zeile über dem Namen', /MVZ Ullingen\nDr\. Max Muster\n/.test(firma.mit), firma.mit.slice(0, 120));
  pr('Ohne Firmenname: keine Leerzeile', /^Dr\. Max Muster\n/.test(firma.ohne), firma.ohne.slice(0, 60));
  pr('Dialog: Feld „Firma / Praxis“ über dem Namen, aus der Adresse vorbelegt, wird übernommen', firma.vor === 'OrthoDocs GmbH' && firma.lblOben && firma.st === 'MVZ Ullingen', firma);

  // ---------- 4. Startkarte <-> Fälle ----------
  await p.evaluate(()=>{ try{ sessionStorage.removeItem('dienst_liste_zu'); }catch(_){} ansichtStart(); });
  await p.waitForSelector('#skKarte .sk-ort .nr', { timeout: 20000 }); await p.waitForTimeout(2500);
  const karte = await p.evaluate(async ()=>{
    const box = document.getElementById('skKarte');
    const zeile = [...box.querySelectorAll('.sk-ort[data-fall]')].find(z=> /\d/.test(z.querySelector('.nr').textContent));
    const i = zeile.dataset.fall;
    const liste = document.querySelector('.ds-dz-liste'); if(liste && liste.hidden) document.querySelector('.ds-dz-auf').click();
    await new Promise(r=> setTimeout(r, 1500));
    const z2 = document.querySelector('#skKarte .sk-ort[data-fall="' + i + '"]');
    z2.click();
    await new Promise(r=> setTimeout(r, 120));
    const punkt = document.querySelectorAll('#skKarte .mini-ebenen [data-fall="' + i + '"].puls').length;
    const dzBlink = document.querySelectorAll('.ds-dz-liste:not([hidden]) .ds-dz-fall.fbx-blink').length;
    const nochStart = aktuelleAnsichtIstHauptbildschirm;
    await new Promise(r=> setTimeout(r, 2600));
    // Punkt in der Karte anklicken (Rueckruf der Karte)
    const m = document.querySelector('#skKarte .mini-ebenen [data-fall="' + i + '"]');
    m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r=> setTimeout(r, 150));
    return { punkt, dzBlink, nochStart, zeileBlink: !!document.querySelector('#skKarte .sk-ort[data-fall="' + i + '"].fbx-blink'), dzBlink2: document.querySelectorAll('.ds-dz-liste:not([hidden]) .ds-dz-fall.fbx-blink').length };
  });
  pr('Fall unter der Karte anklicken: Punkt in der Karte und Fall in „Fälle in diesem Dienst“ hervorgehoben, nichts geöffnet', karte.punkt > 0 && karte.dzBlink === 1 && karte.nochStart, karte);
  pr('Punkt in der Karte anklicken: Fall unter der Karte und in „Fälle in diesem Dienst“ hervorgehoben', karte.zeileBlink && karte.dzBlink2 === 1, karte);

  // ---------- 3. Einführung: kein Überschiessen ----------
  await p.evaluate(()=> window.scrollTo(0, 0)); await p.waitForTimeout(300);
  const tour = await p.evaluate(async ()=>{
    tourStarten(SEITENTOUR.start);
    const liste = tourAktiv.liste, k = liste.findIndex(s=> s.titel === 'Karte');
    if(k < 1) return { fehlt: true };
    tourAktiv.i = k - 2; document.querySelector('#tourBlase .tour-weiter').click();   // auf den Schritt vor der Karte
    await new Promise(r=> setTimeout(r, 900));
    const licht = document.getElementById('tourLicht'), y0 = licht.getBoundingClientRect().top;
    const werte = []; let lauf = true;
    const mess = ()=>{ werte.push(licht.getBoundingClientRect().top); if(lauf) requestAnimationFrame(mess); };
    requestAnimationFrame(mess);
    document.querySelector('#tourBlase .tour-weiter').click();   // zur Karte (mit Scrollen)
    await new Promise(r=> setTimeout(r, 1200)); lauf = false;
    const ziel = document.querySelector('#skKarte .mini-fenster') || document.getElementById('skKarte');
    const zr = ziel.getBoundingClientRect(), yE = licht.getBoundingClientRect().top;
    const ueber = yE >= y0 ? Math.max(...werte) - yE : yE - Math.min(...werte);
    const jetzt = tourAktiv.liste[tourAktiv.i].titel;
    tourBeenden();
    return { y0, yE, zielTop: zr.top, ueber, n: werte.length, jetzt };
  });
  pr('Einführung: Rahmen landet auf der Karte', !tour.fehlt && tour.jetzt === 'Karte' && Math.abs(tour.yE - (tour.zielTop - 6)) < 3, tour);
  pr('Einführung: Rahmen schießt beim Scrollen nicht über das Ziel hinaus', !tour.fehlt && tour.ueber <= 4 && tour.n > 5, tour);

  // ---------- 5. Zurück nach neuem Fall von „Dienste bearbeiten“ ----------
  const zur = await p.evaluate(async ()=>{
    ansichtDienste(()=> ansichtStart());
    await new Promise(r=> setTimeout(r, 300));
    const t0 = document.getElementById('titel').textContent;
    designNavAktion('neu'); await new Promise(r=> setTimeout(r, 400));
    document.querySelector('#dsWerkzeugStapel [data-ws="gkv"]').click(); await new Promise(r=> setTimeout(r, 600));
    const t1 = document.getElementById('titel').textContent;
    document.getElementById('btnZurueck').click(); await new Promise(r=> setTimeout(r, 600));
    const t2 = document.getElementById('titel').textContent;
    // von der Startseite aus bleibt es bei der Startseite
    ansichtStart(); await new Promise(r=> setTimeout(r, 300));
    designNavAktion('neu'); await new Promise(r=> setTimeout(r, 400));
    document.querySelector('#dsWerkzeugStapel [data-ws="gkv"]').click(); await new Promise(r=> setTimeout(r, 600));
    document.getElementById('btnZurueck').click(); await new Promise(r=> setTimeout(r, 600));
    return { t0, t1, t2, start: aktuelleAnsichtIstHauptbildschirm };
  });
  pr('Dienste › + › GKV-Patient › Zurück: wieder bei „Dienste“', zur.t0 === 'Dienste' && zur.t1 === 'GKV-Patient' && zur.t2 === 'Dienste', zur);
  pr('Start › + › GKV-Patient › Zurück: Startseite', zur.start, zur);
  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await p.context().close();
};
