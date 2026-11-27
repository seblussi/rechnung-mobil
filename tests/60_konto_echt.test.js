// Guthabenkonto echt (Weiterleitung 7): die App spricht mit dem echten Server-Kern (azure/funktion/src/kern.js),
// der hier im Testlauf laeuft -- Speicher, LetterXpress und Stripe nachgebildet. Aufladen, Zahlung bestaetigt,
// Brief abgebucht, Guthaben reicht nicht, Storno, Beleg, Einrichtungsschritt.
const path = require('path'), crypto = require('crypto');
const { geraet, oeffnen, appLaeuft } = require('./hilfe');
const { erstelleKern } = require(path.join(__dirname, '..', 'azure', 'funktion', 'src', 'kern.js'));
module.exports = async ({ browser, basis, pr })=>{
  const B = process.env.BILDER;
  const herkunft = new URL(basis).origin;
  // ---- Server-Kern mit nachgebildetem Speicher ----
  const tab = new Map();
  const speicher = {
    async anlegen(e){ const k = e.partitionKey + '|' + e.rowKey; if(tab.has(k)) return false; tab.set(k, { ...e }); return true; },
    async partition(pk){ return [...tab.values()].filter((e)=> e.partitionKey === pk).map((e)=> ({ ...e })); },
    async alle(){ return [...tab.values()].map((e)=> ({ ...e })); },
    async aendern(e){ Object.assign(tab.get(e.partitionKey + '|' + e.rowKey), e); },
    async loeschen(pk, rk){ tab.delete(pk + '|' + rk); }
  };
  const lxpAnfragen = []; let stripeSitzung = null, auftrag = 5000;
  const env = { ERLAUBTE_HERKUNFT: herkunft, ZUGANGSCODES: 'abc', LXP_BENUTZER: 'betreiber', LXP_APIKEY: 'k', STRIPE_GEHEIM: 'sk_test_x', STRIPE_WEBHOOK_GEHEIM: 'whsec_t',
    KONTO_SPEICHER: 'mock', PREIS_BRIEF_CENT: '150', PREIS_SEITE_CENT: '10', AUFLADE_BETRAEGE: '1000,2000,5000', FIRMA_NAME: 'Muster Briefdienst UG (haftungsbeschränkt)', FIRMA_ANSCHRIFT: 'Musterweg 1, 12345 Musterstadt' };
  const kern = erstelleKern({ env, speicher, schlafen: ()=> Promise.resolve(), fetch: async (url, opt)=>{
    if(/stripe\.com/.test(url)){ stripeSitzung = new URLSearchParams(opt.body); return { ok: true, status: 200, json: async ()=> ({ url: 'https://checkout.stripe.com/c/pay/cs_test_42' }) }; }
    lxpAnfragen.push({ url, opt });
    const id = ++auftrag;
    return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), text: async ()=> JSON.stringify({ status: 200, message: 'OK', data: { id } }) };
  } });
  const p = await geraet(browser, basis, { demo: true });
  await p.route(/azurewebsites\.net\/api\/(v3|konto)\//, async (route)=>{
    const rq = route.request(), u = new URL(rq.url());
    const kopf = new Map(Object.entries(rq.headers()));
    const m = /\/api\/(v3|konto)\/(.*)$/.exec(u.pathname);
    const anfrage = { method: rq.method(), headers: kopf, params: m[1] === 'v3' ? { pfad: m[2] } : { aktion: m[2] }, text: async ()=> rq.postData() || '' };
    const r = await (m[1] === 'v3' ? kern.lxp : kern.konto)(anfrage, { log: ()=>{} });
    await route.fulfill({ status: r.status, headers: r.headers || {}, body: r.body || '' });
  });
  let stripeAufgerufen = '';
  await p.route('https://checkout.stripe.com/**', (r)=>{ stripeAufgerufen = r.request().url(); r.fulfill({ status: 204, body: '' }); });
  await p.setViewportSize({ width: 412, height: 915 });
  await oeffnen(p, basis); if(appLaeuft) await appLaeuft(p);
  await p.evaluate(()=>{ const n = [...document.querySelectorAll('button')].find(b=> /Nein, danke/.test(b.textContent)); if(n) n.click(); LS.set('seitenhilfe', false); LS.set('konto_vorschau', true); LS.set('app_zugangscode', 'abc');
    // ohne eigene LetterXpress-Zugangsdaten (sonst laufen Briefe darueber)
    const ini = iniCacheLaden(); if(ini && ini.werte){ delete ini.werte.BRIEF_BENUTZER; delete ini.werte.BRIEF_APIKEY; } });
  const eigen = await p.evaluate(()=> kontoEigenerLxp());
  pr('Ausgangslage: keine eigenen LetterXpress-Zugangsdaten', !eigen, eigen);

  // Konto oeffnen: Server meldet Konto -> echte Ansicht
  await p.evaluate(()=> designNavAktion('konto'));
  await p.waitForFunction(()=> /0,00/.test((document.querySelector('.kt-gross') || {}).textContent || ''), null, { timeout: 8000 }).catch(()=>{});
  let k = await p.evaluate(()=> ({ gross: (document.querySelector('.kt-gross') || {}).textContent, text: app.textContent, briefe: kontoBriefe(), schl: LS.get('konto_schluessel', '') }));
  pr('Konto: echtes Guthaben 0,00 €, Testmodus-Hinweis, Preis je Brief', /0,00/.test(k.gross) && /Testmodus/.test(k.text) && /1,50 €/.test(k.text) && k.briefe, { gross: k.gross, briefe: k.briefe, t: k.text.slice(0, 200) });
  pr('anonymer Kontoschlüssel angelegt, Server kennt nur den Hash', /^[A-Za-z0-9_-]{43}$/.test(k.schl) && ![...tab.keys()].some((x)=> x.includes(k.schl)), k.schl.length);
  if(B) await p.screenshot({ path: B + '/kecht_1.png' });

  // Aufladen
  await p.evaluate(()=> document.getElementById('ktAufladen').click()); await p.waitForTimeout(300);
  await p.evaluate(()=> document.querySelector('[data-b="2000"]').click());
  if(B) await p.screenshot({ path: B + '/kecht_2.png' });
  await p.evaluate(()=> document.getElementById('ktZahlen').click());
  for(let i = 0; i < 30 && !stripeAufgerufen; i++) await p.waitForTimeout(100);
  const offen = await p.evaluate(()=> LS.get('konto_zahlung_offen', null));
  pr('Aufladen öffnet die Stripe-Seite (20 €, Rücksprung zur App)', /checkout\.stripe\.com/.test(stripeAufgerufen) && stripeSitzung && stripeSitzung.get('line_items[0][price_data][unit_amount]') === '2000' && /#konto-bezahlt$/.test(stripeSitzung.get('success_url')) && offen && offen.betrag === 2000, { stripeAufgerufen, offen });

  // Stripe bestaetigt (Webhook), Rueckkehr in die App
  const kid = stripeSitzung.get('metadata[konto]');
  const roh = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_42', amount_total: 2000, payment_status: 'paid', livemode: false, metadata: { konto: kid } } } });
  const t = Math.floor(Date.now() / 1000);
  await kern.stripeWebhook({ method: 'POST', headers: new Map([['stripe-signature', 't=' + t + ',v1=' + crypto.createHmac('sha256', 'whsec_t').update(t + '.' + roh).digest('hex')]]), text: async ()=> roh }, { log: ()=>{} });
  await p.evaluate(()=>{ history.replaceState(null, '', location.pathname + location.search + '#konto-bezahlt'); kontoStartPruefen(); });
  await p.waitForFunction(()=> /20,00/.test((document.querySelector('.kt-gross') || {}).textContent || ''), null, { timeout: 8000 }).catch(()=>{});
  k = await p.evaluate(()=> ({ gross: (document.querySelector('.kt-gross') || {}).textContent, text: app.textContent, hash: location.hash, offen: LS.get('konto_zahlung_offen', null) }));
  pr('nach der Zahlung: 20,00 € Guthaben, Aufladung + Beleg, Adresse wieder ohne #', /20,00/.test(k.gross) && /Aufladung/.test(k.text) && /Beleg Aufladung/.test(k.text) && !k.hash && !k.offen, { gross: k.gross, hash: k.hash });
  if(B) await p.screenshot({ path: B + '/kecht_3.png' });

  // Brief ueber das Guthaben (2 Seiten = 1,60 €)
  const brief = await p.evaluate(async ()=>{
    await libSkriptLaden('lib/pdf-lib.min.js', ()=> !!window.PDFLib);
    const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]); d.addPage([595, 842]);
    const blob = new Blob([await d.save()], { type: 'application/pdf' });
    try{ const j = await lxpBriefSenden(blob, 'Rechnung LS-Test', false); return { ok: true, j }; }catch(e){ return { ok: false, e: e.message }; }
  });
  const an = lxpAnfragen[0] && JSON.parse(lxpAnfragen[0].opt.body);
  pr('Brief: über das Betreiberkonto, 1,60 € abgebucht', brief.ok && brief.j.konto.preis === 160 && brief.j.konto.guthaben === 1840 && an && an.auth.username === 'betreiber' && an.auth.mode === 'live', brief);
  // Storno
  const sto = await p.evaluate(async (id)=>{ try{ const j = await lxpAuftrag('DELETE', String(id), 'live'); return { ok: true, j }; }catch(e){ return { ok: false, e: e.message }; } }, brief.j && brief.j.data.id);
  pr('Storno: 1,60 € wieder gutgeschrieben', sto.ok && sto.j.konto.gutschrift === 160 && sto.j.konto.guthaben === 2000, sto);
  await p.evaluate(()=> ansichtKontoEcht()); await p.waitForTimeout(600);
  k = await p.evaluate(()=> app.textContent);
  pr('Bewegungen zeigen Brief mit Dateiname und Storno', /Brief · Rechnung LS-Test · 2 S\./.test(k) && /Storno · Rechnung LS-Test/.test(k), k.slice(0, 400));
  if(B) await p.screenshot({ path: B + '/kecht_4.png', fullPage: true });

  // Beleg als PDF
  await p.evaluate(()=> document.querySelector('[data-beleg]').click());
  await p.waitForFunction(()=> { const e = document.getElementById('betaPdfAnsicht'); return e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, null, { timeout: 8000 }).catch(()=>{});
  const beleg = await p.evaluate(()=>{ const e = document.getElementById('betaPdfAnsicht'); return !!(e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0) && e.textContent; });
  pr('Beleg der Aufladung öffnet als PDF', !!beleg && /Beleg A-/.test(beleg), String(beleg).slice(0, 120));
  if(B){ await p.waitForTimeout(1200); await p.screenshot({ path: B + '/kecht_5.png' }); }
  await p.evaluate(()=>{ const e = document.getElementById('betaPdfAnsicht'); const z = e && e.querySelector('button'); if(z) z.click(); });

  // anderes (leeres) Konto: Guthaben reicht nicht -> klare Meldung, nichts verschickt
  const vorher = lxpAnfragen.length;
  const leer = await p.evaluate(async ()=>{
    const alt = LS.get('konto_schluessel', ''); LS.set('konto_schluessel', 'Z'.repeat(43));
    const d = await PDFLib.PDFDocument.create(); d.addPage([595, 842]);
    let r; try{ await lxpBriefSenden(new Blob([await d.save()], { type: 'application/pdf' }), 'Leer', false); r = { ok: true }; }catch(e){ r = { ok: false, e: e.message, fehlt: !!e.guthabenFehlt }; }
    LS.set('konto_schluessel', alt); return r;
  });
  pr('Guthaben reicht nicht: Hinweis „aufladen“, nichts verschickt', !leer.ok && leer.fehlt && /aufladen/.test(leer.e) && lxpAnfragen.length === vorher, leer);

  // Einrichtung: Schritt Briefversand ohne LetterXpress-Konto
  await p.evaluate(()=> ansichtEinrichtung('brief')); await p.waitForTimeout(300);
  k = await p.evaluate(()=> ({ t: app.textContent, felder: !!document.getElementById('einrLxpNutzer') }));
  pr('Einrichtung: Briefversand über Guthaben, kein eigenes LetterXpress-Konto nötig', /Guthaben/.test(k.t) && /brauchst du nicht/.test(k.t) && !k.felder, k.t.slice(0, 200));
  if(B) await p.screenshot({ path: B + '/kecht_6.png' });
  await p.evaluate(()=> document.getElementById('einrBriefEigen').click()); await p.waitForTimeout(300);
  pr('„Eigenes LetterXpress-Konto nutzen“ zeigt die Zugangsfelder', await p.evaluate(()=> !!document.getElementById('einrLxpNutzer')));
  pr('keine Seitenfehler', !p.fehler.length && !p.csp.length, { f: p.fehler, csp: p.csp });
  await p.context().close();
};
