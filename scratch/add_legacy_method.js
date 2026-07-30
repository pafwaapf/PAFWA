const fs = require('fs');
const code = fs.readFileSync('app.js', 'utf8');

if (code.includes('async getLegacyReceipts')) {
  console.log('ALREADY EXISTS');
  process.exit(0);
}

// Find save method position and insert before it
const saveMethodStr = '  async save(table, item) {';
const idx = code.indexOf(saveMethodStr);

if (idx === -1) {
  console.log('FAILED: save method not found');
  process.exit(1);
}

const getLegacyMethod = `  async getLegacyReceipts(limit = 1000) {
    setLoad(30);
    try {
      if (sb) {
        const { data, error } = await sb.from('legacy_receipts').select('*').order('created_at', { ascending: false }).limit(limit);
        if (!error && data && data.length) return data;
      }
      return await db.legacy_receipts.toArray();
    } catch (e) {
      console.warn('Fallback to local legacy receipts:', e);
      try { return await db.legacy_receipts.toArray(); } catch (e2) { return []; }
    } finally { setLoad(100); }
  },
`;

const newCode = code.substring(0, idx) + getLegacyMethod + code.substring(idx);
fs.writeFileSync('app.js', newCode, 'utf8');
console.log('SUCCESS: getLegacyReceipts added at index', idx);
