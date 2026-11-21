// Wünsche vom 21.11.2026 (Nachmittag): Passwort-Auge, Uhr-Abstände, Kartenquellen unter der Legende,
// Fahrtenbuch: Bearbeiten im Langdruck-Fenster und „noch nicht im Fahrtenbuch“ als eigene Zeile, allgemeine Erkennung
// von Patientendaten aus der Zwischenablage (bundesweit unterschiedliche Alarm-SMS)
const { geraet, oeffnen } = require('./hilfe');
const FAELLE = [
  ['Patient: Mustermann, Max\nGeb: 01.02.1940\nStrasse: Hauptstr. 5\nOrt: 77652 Offenburg', { name: 'Mustermann, Max', geb: '01.02.1940', strasse: 'Hauptstr. 5', ort: '77652 Offenburg' }],
  ['Einsatz: Todesfeststellung\nName: Müller, Erika geb. 3.4.38\nEinsatzort: Lindenweg 12a, 80331 München\nRückruf 0171 1234567', { name: 'Müller, Erika', geb: '03.04.1938', strasse: 'Lindenweg 12a', ort: '80331 München' }],
  ['Hausbesuch 21.11.2026 22:10\nHerr Peter Schmidt\n* 15.06.1952\nAm Markt 3\n10115 Berlin', { name: 'Schmidt, Peter', geb: '15.06.1952', strasse: 'Am Markt 3', ort: '10115 Berlin' }],
  ['Pat.: Anna Weber, geb. am 07/08/1961, Adresse: Kirchgasse 7, 69117 Heidelberg', { name: 'Weber, Anna', geb: '07.08.1961', strasse: 'Kirchgasse 7', ort: '69117 Heidelberg' }],
  ['Nachname: Becker\nVorname: Jonas\nGeburtsdatum: 1.1.1950\nStraße u. Hausnummer: Rosenstraße 4\nPLZ/Ort: 50667 Köln', { name: 'Becker, Jonas', geb: '01.01.1950', strasse: 'Rosenstraße 4', ort: '50667 Köln' }],
  ['Alarm 22:03 ÄBD\nKlaus Fischer 12.12.1944\nBahnhofstraße 22, 79098 Freiburg im Breisgau\nTel 0761 123', { name: 'Fischer, Klaus', geb: '12.12.1944', strasse: 'Bahnhofstraße 22', ort: '79098 Freiburg im Breisgau' }],
  ['Patient: Klein, Herta\nGeb: 02.03.1937\nStrasse: Waldweg 1\nOrt: Offenburg', { name: 'Klein, Herta', geb: '02.03.1937', strasse: 'Waldweg 1', ort: 'Offenburg' }],
  ['Leichenschau Frau Herta Klein-Maier, 87 J., Waldweg 1, 77654 Offenburg', { name: 'Klein-Maier, Herta', strasse: 'Waldweg 1', ort: '77654 Offenburg' }],
  ['Pat: Özdemir, Ayşe\n* 9.11.1980', { name: 'Özdemir, Ayşe', geb: '09.11.1980' }],
];
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis, { demo: true });
  await p.evaluate(()=>{ LS.set('seitenhilfe', false); ansichtStart(); }); await p.waitForTimeout(2500);

  // Passwort-Auge (auch fuer spaeter eingeblendete Felder)
  const auge = await p.evaluate(async ()=>{
    const i = document.createElement('input'); i.type = 'password'; i.id = 'testPw'; i.value = 'geheim'; i.style.height = '48px'; i.style.width = '300px'; document.body.appendChild(i);
    await new Promise(r=> setTimeout(r, 100));
    const b = i.parentElement.querySelector('.pw-auge'); if(!b) return { b: false };
    b.click(); const t1 = i.type; b.click(); const t2 = i.type;
    const ir = i.getBoundingClientRect(), br = b.getBoundingClientRect();
    i.parentElement.remove();
    return { b: true, t1, t2, innen: br.right <= ir.right + 1 && br.left >= ir.left && br.top >= ir.top - 1 && br.bottom <= ir.bottom + 1 };
  });
  pr('Passwortfeld: Auge zeigt und verbirgt das Passwort, sitzt im Feld', auge.b && auge.t1 === 'text' && auge.t2 === 'password' && auge.innen, auge);

  // Uhr: oben mehr, unten weniger Abstand
  const uhr = await p.evaluate(()=>{ const r = document.querySelector('.ds-live .ds-ring-block .ds-ring'); const cs = r && getComputedStyle(r); return cs ? [cs.marginTop, cs.marginBottom] : null; });
  pr('Uhr: Abstand oben 8 px, unten −18 px', uhr && uhr[0] === '8px' && uhr[1] === '-18px', uhr);

  // kleine Karte: Quellenangabe unter der Legende (wie in der grossen Karte)
  const attr = await p.evaluate(()=>{ const a = document.querySelector('#skKarte .mini-attr'); return a ? { vorher: (a.previousElementSibling || {}).className || '', text: a.textContent } : null; });
  pr('Kleine Karte: Quellenangabe unter der Legende', attr && /luft-karte-legende/.test(attr.vorher) && /OpenStreetMap/.test(attr.text), attr);

  // Fahrtenbuch: Langdruck auf einen Fall -> Bearbeiten / Loeschen / Abbrechen
  const lang = await p.evaluate(async ()=>{
    window.__bearb = 0;
    const lauf = fbLoeschen({ tag: new Date(2026, 10, 17), faelle: [] }, { name: 'Muster, Max' }, ()=>{ window.__bearb++; });
    await new Promise(r=> setTimeout(r, 300));
    const knoepfe = [...document.querySelectorAll('.beta-overlay.aktiv .beta-overlay-knoepfe button')].map(b=> b.textContent);
    const b = [...document.querySelectorAll('.beta-overlay.aktiv .beta-overlay-knoepfe button')].find(x=> x.textContent === 'Bearbeiten'); if(b) b.click();
    await lauf; return { knoepfe, bearb: window.__bearb, zu: !document.querySelector('.beta-overlay.aktiv') };
  });
  pr('Fahrtenbuch, langer Druck auf einen Fall: Bearbeiten, Löschen, Abbrechen; Bearbeiten öffnet den Fall', JSON.stringify(lang.knoepfe) === JSON.stringify(['Bearbeiten', 'Löschen', 'Abbrechen']) && lang.bearb === 1 && lang.zu, lang);

  // Fahrtenbuch-Tabelle: „noch nicht im Fahrtenbuch“ als schmale zweite Zeile statt in der Kat-Spalte
  const tab = await p.evaluate(()=>{
    const d = { tag: new Date(2026, 10, 17), zeitLabel: '18–23', gesamt: 266.94, gkv: 266.94, ls: 0, pt: 0, faelle: [
      { zeit: '22:03', name: '', art: 'gkv', offen: 'offen', ziffern: [{ gop: '01212', anz: 1 }, { gop: '01418', anz: 1 }, { gop: '40226', anz: 1 }], betrag: 133.47 },
      { zeit: '22:04', name: 'Muster, Max', art: 'ls', ziffern: [], betrag: 133.47 }] };
    const el = document.createElement('div'); el.id = 'fbxInhalt'; el.style.width = '360px'; document.body.appendChild(el);
    el.innerHTML = fbAnsichtB({ dienste: [d] });
    const z = el.querySelectorAll('.fbx-tr[data-fbfall]');
    const offen = z[0].querySelector('.fbx-tr-offen'), kat = z[0].children[2];
    const r = { zeile2: !!offen && /noch nicht im Fahrtenbuch/.test(offen.textContent), katSauber: !kat.querySelector('.fbx-offen') && kat.textContent === 'GKV',
      hoch: z[0].offsetHeight, hochNormal: z[1].offsetHeight, ohne: !z[1].querySelector('.fbx-tr-offen') };
    el.remove(); return r;
  });
  pr('Tabelle: „noch nicht im Fahrtenbuch“ als eigene schmale Zeile, Kat-Spalte nur „GKV“', tab.zeile2 && tab.katSauber && tab.ohne && tab.hoch < tab.hochNormal * 2.2, tab);

  // Zwischenablage: allgemeine Erkennung
  const erk = await p.evaluate((faelle)=> faelle.map(([t, soll])=>{ const e = patientDatenKombiniert(t); const f = Object.keys(soll).filter((k)=> e[k] !== soll[k]); return f.length ? t.slice(0, 30) + ' → ' + f.map((k)=> k + '=' + e[k]).join(', ') : ''; }).filter(Boolean), FAELLE);
  pr('Zwischenablage: Name, Geburtsdatum, Adresse aus ' + FAELLE.length + ' verschiedenen Meldungsformaten erkannt (auch das bisherige SMS-Format)', !erk.length, erk);
  const leer = await p.evaluate(()=> patientDatenKombiniert('Bitte Rückruf an die Leitstelle').erkannt.length);
  pr('Zwischenablage: Text ohne Patientendaten -> nichts erkannt', leer === 0, leer);

  pr('keine Skriptfehler', !p.fehler.length, p.fehler);
  await p.context().close();
};
