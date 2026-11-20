// Vektorkarte mit MapLibre GL JS 6.x (nur noch ES-Modul, Worker als eigenes Modul, WebGL2 Pflicht):
// Bibliothek lädt als Modul ohne CSP-Verstoß, Protokoll vkofm:// läuft über den Hauptthread, GeoJSON-Ebenen
// werden im Worker verarbeitet und gezeichnet; die große Karte (NFP) öffnet als Vektorkarte. OpenFreeMap ist nachgebildet.
const { geraet, oeffnen } = require('./hilfe');
const OFM = 'https://tiles.openfreemap.org/';
const STIL = { version: 8, name: 'Test', sources: { openmaptiles: { type: 'vector', url: OFM + 'planet' } },
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8e4da' } }] };

module.exports = async ({ browser, basis, pr })=>{
  const p = await geraet(browser, basis, { demo: true });
  const c = p.context();
  const abrufe = [];
  await c.route((u)=> String(u).startsWith(OFM), (r)=>{
    const u = r.request().url(); abrufe.push(u);
    const json = (o)=> r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
    if(/\/styles\//.test(u)) return json(STIL);
    if(/\/planet$/.test(u)) return json({ tilejson: '3.0.0', tiles: [OFM + 'planet/20260101_001001_pt/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [] });
    return r.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
  });
  await oeffnen(p, basis);

  const r1 = await p.evaluate(async ()=>{
    const gl2 = (()=>{ try{ return !!document.createElement('canvas').getContext('webgl2'); }catch(_){ return false; } })();
    try{ const ml = await vkMaplibreHolen(); return { gl2, ok: true, version: ml.getVersion(), global: window.maplibregl === ml, protokoll: typeof ml.addProtocol, css: !!document.querySelector('link[href="lib/maplibre/maplibre-gl.css"]') }; }
    catch(e){ return { gl2, ok: false, fehler: String(e && e.message || e) }; }
  });
  if(!r1.gl2){ pr('WebGL2 im Testbrowser vorhanden (sonst Kartentest nicht möglich)', false, r1); await c.close(); return; }
  pr('MapLibre 6.4.1 lädt als ES-Modul, steht als maplibregl bereit, CSS eingebunden', r1.ok && r1.version === '6.4.1' && r1.global && r1.protokoll === 'function' && r1.css, r1);

  // Karte mit Stil über vkofm:// und eigener GeoJSON-Ebene (Worker-Modul muss laufen)
  const r2 = await p.evaluate(()=> new Promise((ok)=>{
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px;z-index:99999'; document.body.appendChild(box);
    const map = new maplibregl.Map({ container: box, style: 'vkofm://tiles.openfreemap.org/styles/liberty', center: [9.18, 48.78], zoom: 10, attributionControl: false });
    const fehler = []; map.on('error', (e)=> fehler.push(String(e && e.error && e.error.message || e)));
    const ende = setTimeout(()=> ok({ ok: false, fehler, grund: 'Zeitüberschreitung' }), 20000);
    map.on('load', ()=>{
      map.addSource('t', { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Mitte' }, geometry: { type: 'Point', coordinates: [9.18, 48.78] } }] } });
      map.addLayer({ id: 't-k', type: 'circle', source: 't', paint: { 'circle-radius': 12, 'circle-color': '#d00' } });
      map.once('idle', ()=>{
        clearTimeout(ende);
        const treffer = map.queryRenderedFeatures([[140, 140], [160, 160]], { layers: ['t-k'] }).length;
        const px = map.project([9.18, 48.78]);
        ok({ ok: true, treffer, px: [Math.round(px.x), Math.round(px.y)], fehler, worker: maplibregl.getWorkerCount() });
        map.remove(); box.remove();
      });
    });
  }));
  pr('Karte: Stil über vkofm://, GeoJSON im Worker verarbeitet und gezeichnet', r2.ok && r2.treffer === 1 && r2.px[0] === 150 && r2.px[1] === 150, r2);
  pr('Stil und TileJSON über das eigene Protokoll von OpenFreeMap geholt', abrufe.some((u)=> /\/styles\/liberty$/.test(u)) && abrufe.some((u)=> /\/planet$/.test(u)), abrufe.slice(0, 4));

  // große Karte als Vektorkarte (Einstellung „Große Karte als Vektorkarte“ ist vorausgewählt)
  const r3 = await p.evaluate(async ()=>{
    try{ osmKarteOverlay({ pois: [], weg: [] }, '', {}); }catch(e){ return { ok: false, fehler: String(e.message) }; }
    for(let i = 0; i < 60; i++){ await new Promise((r)=> setTimeout(r, 250)); const cv = document.querySelector('.vk-overlay canvas.maplibregl-canvas'); if(cv && cv.width > 0) return { ok: true, breite: cv.width, ctrl: !!document.querySelector('.vk-overlay .maplibregl-ctrl, .vk-overlay .ok-zoom') }; }
    return { ok: false, overlay: !!document.querySelector('.vk-overlay'), text: (document.querySelector('.vk-overlay, .osm-overlay') || document.body).innerText.slice(0, 200) };
  });
  pr('große Karte öffnet als Vektorkarte (MapLibre-Zeichenfläche vorhanden)', r3.ok, r3);
  pr('keine Skriptfehler, keine CSP-Verstöße', p.fehler.length === 0 && p.csp.length === 0, { fehler: p.fehler.slice(0, 3), csp: p.csp.slice(0, 3) });
  await c.close();
};
