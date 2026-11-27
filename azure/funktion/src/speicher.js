// Azure Table Storage fuer das Guthabenkonto (Tabelle "buchungen"; PartitionKey = Konto-Hash).
'use strict';
const { TableClient, odata } = require('@azure/data-tables');

function tabelle(verbindung, name) {
  let client = null, bereit = null;
  async function c() {
    if (!verbindung) throw new Error('Kein Speicher eingerichtet (KONTO_SPEICHER)');
    if (!client) client = TableClient.fromConnectionString(verbindung, name);
    if (!bereit) bereit = client.createTable().catch((e) => { if (e && e.statusCode === 409) return; bereit = null; throw e; });
    await bereit;
    return client;
  }
  async function sammeln(it) { const aus = []; for await (const e of it) aus.push(e); return aus; }
  return {
    // true = angelegt, false = gab es schon (so wird z. B. jede Zahlung nur einmal gutgeschrieben)
    async anlegen(e) {
      const t = await c();
      try { await t.createEntity(e); return true; } catch (err) { if (err && err.statusCode === 409) return false; throw err; }
    },
    async partition(pk) { const t = await c(); return sammeln(t.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${pk}` } })); },
    async alle() { const t = await c(); return sammeln(t.listEntities()); },
    async aendern(e) { const t = await c(); await t.updateEntity(e, 'Merge'); },
    async loeschen(pk, rk) {
      const t = await c();
      try { await t.deleteEntity(pk, rk); } catch (err) { if (!(err && err.statusCode === 404)) throw err; }
    }
  };
}
module.exports = { tabelle };

// Taegliche Sicherung aller Buchungen als JSON in den Blob-Container "sicherung" (90 Tage aufbewahrt).
async function sichern(verbindung, buchungen, jetzt) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const c = BlobServiceClient.fromConnectionString(verbindung).getContainerClient('sicherung');
  await c.createIfNotExists();
  const tag = new Date(jetzt).toISOString().slice(0, 10);
  const inhalt = JSON.stringify({ stand: new Date(jetzt).toISOString(), buchungen });
  await c.getBlockBlobClient('buchungen-' + tag + '.json').upload(inhalt, Buffer.byteLength(inhalt), { blobHTTPHeaders: { blobContentType: 'application/json' } });
  const grenze = 'buchungen-' + new Date(jetzt - 90 * 864e5).toISOString().slice(0, 10);
  for await (const b of c.listBlobsFlat({ prefix: 'buchungen-' })) if (b.name < grenze) await c.deleteBlob(b.name);
}
module.exports.sichern = sichern;
