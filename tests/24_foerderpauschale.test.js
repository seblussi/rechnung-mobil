// Foerderpauschale je Profil, Dienst im Plan und einzelnem Dienst (Wunsch 20.11.2026)
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis); await p.waitForTimeout(800);
  const r = await p.evaluate(()=>{
    try{ betaOverlay.schliessen(); }catch(_){} LS.set('seitenhilfe', false);   // keine Einfuehrung dazwischen
    const launch = dwLaunch(), o = {};
    const mo = new Date(2026, 10, 16), sa = new Date(2026, 10, 21), hl = new Date(2026, 11, 24);
    const R = (d, art, ctx)=>{ const x = foerderRegel(d, art, ctx); return [Math.round(x.satz * 100) / 100, Math.round(x.zusatz * 100) / 100]; };
    o.launch = launch;
    o.std = { mo: R(mo, 'Fahrdienst'), sa: R(sa, 'Fahrdienst'), hl: R(hl, 'Fahrdienst'), sitz: R(mo, 'Sitzdienst'), doc: R(mo, 'Telemedizin docdirekt 8-13') };
    // Profil fuer den Fahrdienst anlegen bzw. setzen
    let pf = dwProfile().find(x=> x.dienstart === 'Fahrdienst');
    if(!pf){ dwProfilSpeichern({ id: 'tfd', name: 'Fahrdienst', dienstart: 'Fahrdienst', woche: { mo: [{ name: 'Nacht 1', von: '18:00', bis: '08:00' }] } }); pf = dwProfile().find(x=> x.dienstart === 'Fahrdienst'); }
    pf.foerder = { an: true, werktag: 30, wochenende: 60, feiertag: 70, heilig: 80, zuschlag: 10 }; dwProfilSpeichern(pf);
    o.profil = { mo: R(mo, 'Fahrdienst'), sa: R(sa, 'Fahrdienst'), hl: R(hl, 'Fahrdienst') };
    pf = dwProfile().find(x=> x.id === pf.id); pf.foerder.an = false; dwProfilSpeichern(pf);
    o.aus = R(mo, 'Fahrdienst');
    pf = dwProfile().find(x=> x.id === pf.id); pf.foerder.an = true;
    if(!pf.woche.mo.length) pf.woche.mo.push({ name: 'Nacht 1', von: '18:00', bis: '08:00' });
    const sch = pf.woche.mo[0]; sch.foerder = { modus: 'eigen', satz: 42 }; dwProfilSpeichern(pf);
    o.plan = R(mo, 'Fahrdienst ' + sch.name);
    o.planVon = R(mo, 'Fahrdienst', { von: sch.von });
    const key = foerderSchluessel(mo, sch.von);
    foerderEinzelnSetzen(key, { modus: 'eigen', satz: 55 }); o.einzeln = R(mo, 'Fahrdienst', { von: sch.von });
    foerderEinzelnSetzen(key, { modus: 'keine' }); o.keine = R(mo, 'Fahrdienst', { von: sch.von });
    foerderEinzelnSetzen(key, { modus: 'auto' }); o.zurueck = R(mo, 'Fahrdienst', { von: sch.von });
    o.formel = [foerderFormel(300 / 14), foerderFormel(500 / 24), foerderFormel(42)];
    return o;
  });
  if(r.launch) pr('Launch ohne Angabe: Förderpauschale aus', JSON.stringify(r.std) === JSON.stringify({ mo: [0, 0], sa: [0, 0], hl: [0, 0], sitz: [0, 0], doc: [0, 0] }), r.std);
  else pr('Alpha ohne Angabe: bisherige Sätze (21,43 / 50 / 50+20,83 / Sitz 50 / docdirekt 0)', JSON.stringify(r.std) === JSON.stringify({ mo: [21.43, 0], sa: [50, 0], hl: [50, 20.83], sitz: [50, 0], doc: [0, 0] }), r.std);
  pr('Profil: Werktag, Wochenende, Heiligabend samt Zuschlag', JSON.stringify(r.profil) === JSON.stringify({ mo: [30, 0], sa: [60, 0], hl: [80, 10] }), r.profil);
  pr('Profil aus: keine Pauschale', JSON.stringify(r.aus) === '[0,0]', r.aus);
  pr('Dienst im Plan mit eigenem Satz (über Name und über Beginn)', JSON.stringify(r.plan) === '[42,0]' && JSON.stringify(r.planVon) === '[42,0]', [r.plan, r.planVon]);
  pr('einzelner Dienst: eigener Satz, keine, zurück auf automatisch', JSON.stringify([r.einzeln, r.keine, r.zurueck]) === '[[55,0],[0,0],[42,0]]', [r.einzeln, r.keine, r.zurueck]);
  pr('Excel-Ausdrücke exakt (300/14, 500/24)', JSON.stringify(r.formel) === '["300/14","500/24","42"]', r.formel);
  // Dienste-Editor: Zeile Foerderpauschale und Dialog
  await p.evaluate(()=> ansichtDienste()); await p.waitForTimeout(500);
  const zeile = await p.evaluate(()=> (document.getElementById('dwFoerder') || {}).textContent || '');
  pr('Dienste-Editor zeigt die Förderpauschale des Profils', /Förderpauschale: 30,00 \/ 60,00 €\/h/.test(zeile), zeile);
  await p.click('#dwFoerder'); await p.waitForSelector('#fp_werktag');
  await p.fill('#fp_werktag', '33,5'); await p.click('.beta-overlay .btn-primaer, .beta-overlay button:has-text("Speichern")');
  await p.waitForTimeout(400);
  const nach = await p.evaluate(()=> Math.round(foerderRegel(new Date(2026, 10, 16), 'Fahrdienst').satz * 100) / 100);
  pr('Dialog speichert den Werktagssatz (33,50 €/h)', nach === 33.5, nach);
  // Dienst aendern: Auswahl fuer diesen Dienst vorhanden
  await p.evaluate(()=>{ try{ betaOverlay.schliessen(); }catch(_){} liveDienstDialog({}); }); await p.waitForSelector('.fb-dialog');
  pr('„Dienst ändern“ bietet Automatisch / Eigener Satz / Keine', await p.evaluate(()=> document.querySelectorAll('.beta-overlay [data-fw]').length === 3));
};
