// Wie 09_app_ordner, aber Microsoft lehnt das Erneuern mit einem Recht ausserhalb der Anmeldung ab (invalid_grant),
// statt einen gekürzten Schlüssel auszugeben (siehe ms_konto.js).
const test = require('./09_app_ordner.test.js');
module.exports = async (ctx)=>{ process.env.MS_MODUS = 'ablehnen'; try{ return await test(ctx); } finally{ delete process.env.MS_MODUS; } };
