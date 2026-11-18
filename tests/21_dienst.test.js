// Dienst: Zuordnung bei Luecke/Ueberschneidung, Statistik erst bei Dienstende, Startkarte "Übersicht des Bezirks",
// Plus-Menue neben senkrechter Leiste (Wuensche 17./18.11.2026)
const { geraet, oeffnen } = require('./hilfe');
module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  await oeffnen(p, basis);
  const r = await p.evaluate(async ()=>{
    const tag = '2026-03-10';
    appDiensteSpeichern([
      { id: 'a', datum: tag, von: '13:00', bis: '23:00', art: 'Fahrdienst', schicht: 'Abend 1' },
      { id: 'b', datum: tag, von: '23:00', bis: '08:00', art: 'Fahrdienst', schicht: 'Nacht 1' },
      { id: 'c', datum: '2026-03-12', von: '08:00', bis: '16:00', art: 'Sitzdienst' },
      { id: 'd', datum: '2026-03-12', von: '15:00', bis: '22:00', art: 'Fahrdienst' }
    ]);
    const zt = (d, h, m)=>{ const [y, mo, da] = d.split('-').map(Number); return new Date(y, mo - 1, da, h, m); };
    const k = (t)=>{ const x = dienstKandidaten(t); return [x.nah.length, x.exakt.length]; };
    const out = { innen: k(zt(tag, 18, 0)), uebergang: k(zt(tag, 22, 30)), luecke: k(zt(tag, 12, 30)), ueberlapp: k(zt('2026-03-12', 15, 30)), fern: k(zt(tag, 9, 0)) };
    out.ohneFrage = await dienstZuordnungKlaeren(zt(tag, 18, 0), '', 'Test');
    out.gewaehlt = await dienstZuordnungKlaeren(zt(tag, 12, 0), 'x|y|z', 'Test');
    // Luecke: Frage erscheint, Knopf "Keinem Dienst"
    const fr = dienstZuordnungKlaeren(zt(tag, 12, 30), '', 'GKV Muster');
    await new Promise(r=> setTimeout(r, 200));
    const kn = [...document.querySelectorAll('.beta-overlay-knoepfe button')].map(b=> b.textContent);
    out.knoepfe = kn;
    [...document.querySelectorAll('.beta-overlay-knoepfe button')].find(b=> b.textContent === 'Keinem Dienst').click();
    out.kein = await fr;
    const fr2 = dienstZuordnungKlaeren(zt('2026-03-12', 15, 30), '', 'PT Muster');
    await new Promise(r=> setTimeout(r, 200));
    out.knoepfe2 = [...document.querySelectorAll('.beta-overlay-knoepfe button')].map(b=> b.textContent);
    document.querySelectorAll('.beta-overlay-knoepfe button')[1].click();
    out.wahl2 = await fr2;
    out.keinZu = fallGehoertZu(zt(tag, 18, 0), 'kein', liveDienstFenster({ datum: tag, von: '13:00', bis: '23:00' }));
    out.fbKein = await fahrtenbuchEintragen({ kat: 'P', name: 'X, Y', datum: zt(tag, 0, 0), zeit: '18:00', dienst: 'kein' }, null).catch(e=> ({ fehler: String(e) }));
    // Statistik waehrend des Dienstes nur vormerken
    const h = new Date(), vor = new Date(h.getTime() - 2 * 3600000), bis = new Date(h.getTime() + 6 * 3600000), z = (d)=> String(d.getHours()).padStart(2, '0') + ':00';
    LS.set('live_dienst', { datum: liveIso(vor), von: z(vor), bis: z(bis), art: 'Fahrdienst', schicht: 'Nacht 1' });
    out.spaeterMit = fbStatistikSpaeter();
    fbStatistikVormerken('2026'); fbStatistikVormerken('2026');
    out.vorgemerkt = LS.get('fb_statistik_offen', []);
    LS.set('live_dienst', null);
    out.spaeterOhne = fbStatistikSpaeter();
    LS.set('fb_statistik_offen', []);
    // Startkarte: Bezirk <-> alle Faelle
    skAnsichtModus = 'bezirk';
    const o = skBezirkOpt(3); out.modus0 = o.modus();
    miniUebersichtWechseln(o); out.modus1 = o.modus(); miniUebersichtWechseln(o); out.modus2 = o.modus();
    const o0 = skBezirkOpt(0); miniUebersichtWechseln(o0); out.modusOhne = o0.modus();
    return out;
  });
  pr('Uhrzeit mitten im Dienst: eindeutig, keine Frage', JSON.stringify(r.innen) === '[1,1]' && r.ohneFrage === '', r);
  pr('Übergang 22:30 (in A, Spielraum B): eindeutig A', JSON.stringify(r.uebergang) === '[2,1]', r.uebergang);
  pr('Lücke 12:30 vor dem Dienst: Frage mit „Keinem Dienst“', JSON.stringify(r.luecke) === '[1,0]' && r.knoepfe.includes('Keinem Dienst') && r.kein === 'kein', r.knoepfe);
  pr('Überschneidung 15:30: Frage mit beiden Diensten', JSON.stringify(r.ueberlapp) === '[2,2]' && r.knoepfe2.length === 3 && /\|15:00\|22:00\|/.test(r.wahl2 || ''), r);
  pr('weit außerhalb: keine Kandidaten', JSON.stringify(r.fern) === '[0,0]');
  pr('gewählter Dienst bleibt ohne Frage', r.gewaehlt === 'x|y|z');
  pr('„Keinem Dienst“: gehört zu keinem Dienst, LS/PT nicht ins Fahrtenbuch', r.keinZu === false && r.fbKein && r.fbKein.uebersprungen === true, r.fbKein);
  pr('Statistik bei laufendem Dienst nur vorgemerkt (Blatt einmal)', r.spaeterMit === true && JSON.stringify(r.vorgemerkt) === '["2026"]' && r.spaeterOhne === false, r);
  pr('Startkarte: Bezirk → alle Fälle → Bezirk; ohne Fälle immer Bezirk', r.modus0 === 'bezirk' && r.modus1 === 'faelle' && r.modus2 === 'bezirk' && r.modusOhne === 'bezirk', r);
  // Plus-Menue neben der linken senkrechten Leiste
  await p.setViewportSize({ width: 1200, height: 760 });
  await p.evaluate(()=>{ const e = ladeEinstellungen(); e.navQuer = 'links'; e.design = 'einhand'; e.querLayout = true; speichereEinstellungen(e); designAnwenden(); try{ designGlobalNav(); }catch(_){} navQuerAnwenden(); ansichtStart(); });
  await p.waitForTimeout(800);
  const m = await p.evaluate(async ()=>{
    const nav = [...document.querySelectorAll('.ds-nav')].find(n=> n.getClientRects().length); if(!nav) return { fehlt: true };
    const lr = nav.getBoundingClientRect();
    neuStapelUmschalten(); await new Promise(r=> setTimeout(r, 400));
    const st = document.querySelector('#dsWerkzeugStapel .ws-stapel'); const sr = st ? st.getBoundingClientRect() : null;
    werkzeugStapelSchliessen();
    return { senkrecht: lr.height > lr.width, navR: lr.right, stL: sr && sr.left, stUnten: sr && sr.bottom, h: innerHeight };
  });
  pr('Plus-Menü: rechts neben der linken Leiste, im Fenster', m.senkrecht && m.stL > m.navR && m.stUnten <= m.h, m);
  await p.context().close();
};
