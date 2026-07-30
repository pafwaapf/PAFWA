const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
let code = fs.readFileSync(appPath, 'utf8');

// 1. Add getLegacyReceipts to Data object
const dataTarget = `  async getMaintenance() {
    setLoad(20);
    try {
      const { data } = await sb.from('maintenance').select('*').order('created_at', { ascending: false });
      return data || [];
    } finally { setLoad(100); }
  },`;

const dataReplacement = `  async getMaintenance() {
    setLoad(20);
    try {
      const { data } = await sb.from('maintenance').select('*').order('created_at', { ascending: false });
      return data || [];
    } finally { setLoad(100); }
  },
  async getLegacyReceipts(limit = 1000) {
    setLoad(30);
    try {
      if (typeof isOnline !== 'undefined' && isOnline && sb) {
        const { data, error } = await sb.from('legacy_receipts').select('*').order('created_at', { ascending: false }).limit(limit);
        if (!error && data && data.length) {
          for (const item of data) {
            await db.legacy_receipts.put({ ...item, _sync_status: SYNC_STATUS.SYNCED });
          }
          return data;
        }
      }
      return await db.legacy_receipts.toArray();
    } catch (e) {
      console.warn('Fallback to local legacy receipts:', e);
      return await db.legacy_receipts.toArray();
    } finally { setLoad(100); }
  },`;

if (!code.includes('getLegacyReceipts')) {
  code = code.replace(dataTarget, dataReplacement);
}

// 2. Replace Receipts section
const rcptTargetStart = `// ════════════════════════════════════ RECEIPTS`;
const rcptTargetEnd = `// ════════════════════════════════════ ACCOUNTING`;

const rcptNewCode = `// ════════════════════════════════════ RECEIPTS
let _parsedLegacyBatch = [];

async function loadRcpt() {
  $('page-rcpt').innerHTML = \`
  <div class="ph" style="display:flex;justify-content:space-between;align-items:center">
    <div class="pt">Receipts & Archives</div>
    <button class="btn bgd" onclick="openUploadLegacyPdfModal()">📥 Upload Legacy PDFs</button>
  </div>
  <div class="fb">
    <input class="fi" id="rq" placeholder="🔍 Receipt no., customer, or item..." oninput="renderRcpt()">
    <div style="display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.5);padding:4px;border-radius:6px;border:1px solid var(--br)">
      <input type="date" id="rfrom" onchange="renderRcpt()" style="border:none;background:transparent;padding:4px">
      <span style="color:var(--mt);font-size:12px;font-weight:600">to</span>
      <input type="date" id="rto" onchange="renderRcpt()" style="border:none;background:transparent;padding:4px">
    </div>
    <select id="rtype" onchange="renderRcpt()">
      <option value="">All Types (POS & Legacy)</option>
      <option value="pos">POS Receipts</option>
      <option value="legacy">Legacy PDF Receipts</option>
    </select>
    <select id="rpm" onchange="renderRcpt()"><option value="">All Methods</option><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Special Case</option></select>
    <select id="rst" onchange="renderRcpt()"><option value="">All Statuses</option><option value="paid">Paid</option><option value="pend">Pending</option></select>
  </div>
  <div id="rtbl">⏳ Loading…</div>\`;

  if (_rcptFilter) {
    if (_rcptFilter.st) $('rst').value = _rcptFilter.st;
    if (_rcptFilter.q) $('rq').value = _rcptFilter.q;
    _rcptFilter = null;
  }
  await renderRcpt();
}

async function renderRcpt() {
  const from = $('rfrom')?.value, to = $('rto')?.value, rtype = $('rtype')?.value, pm = $('rpm')?.value, st = $('rst')?.value, sq = $('rq')?.value;
  
  let posSales = [];
  let legacySales = [];

  if (!rtype || rtype === 'pos') {
    posSales = (await Data.getSales(1000)).map(x => ({ ...x, _type: 'pos' }));
  }
  if (!rtype || rtype === 'legacy') {
    legacySales = (await Data.getLegacyReceipts(1000)).map(x => ({ ...x, _type: 'legacy' }));
  }

  let combined = [...posSales, ...legacySales];

  // Sorting by date descending
  combined.sort((a, b) => new Date(b.created_at || b.receipt_date) - new Date(a.created_at || a.receipt_date));

  // Filters
  if (from) combined = combined.filter(x => (x.created_at || x.receipt_date) >= from);
  if (to) combined = combined.filter(x => (x.created_at || x.receipt_date) <= to + 'T23:59:59');
  if (pm) combined = combined.filter(x => x._type === 'pos' ? x.payment_method === pm : true);
  if (st === 'paid') combined = combined.filter(x => x._type === 'pos' ? x.paid : true);
  if (st === 'pend') combined = combined.filter(x => x._type === 'pos' ? !x.paid : false);
  
  if (sq) { 
    const ql = sq.toLowerCase(); 
    combined = combined.filter(x => {
      const matchNo = String(x.receipt_no || '').toLowerCase().includes(ql);
      const matchCust = (x.customer_name || '').toLowerCase().includes(ql);
      const matchFile = (x.file_name || '').toLowerCase().includes(ql);
      
      let matchItems = false;
      if (x.items_json && Array.isArray(x.items_json)) {
        matchItems = x.items_json.some(it => (it.item_name || '').toLowerCase().includes(ql));
      }
      return matchNo || matchCust || matchFile || matchItems;
    });
  }

  const tot = combined.reduce((a, x) => a + Number(x.total || 0), 0);
  const el = $('rtbl'); if (!el) return;

  el.innerHTML = \`<div class="al ali" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;background:rgba(59,130,246,0.1);color:var(--tx);border-color:var(--nv)">
    <span>Showing <strong>\${combined.length}</strong> receipts (\${posSales.length} POS, \${legacySales.length} Legacy PDF)</span>
    <span style="font-size:15px">Total: <strong>\${fmtM(tot)}</strong></span>
  </div>
  \${combined.length ? \`<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Type</th><th>Receipt#</th><th>Customer</th><th>Total</th><th>Method / Format</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
  <tbody>\${combined.map(x => \`<tr style="\${x._type === 'legacy' ? 'background:rgba(14,165,233,0.05)' : (!x.paid ? 'background:rgba(245,158,11,0.1)' : '')}">
    <td>\${x._type === 'legacy' ? '<span class="bdg bp_">📄 Legacy PDF</span>' : '<span class="bdg bg">🛒 POS</span>'}</td>
    <td><span class="bdg bb">No.\${x.receipt_no}</span></td>
    <td><strong style="color:var(--tx)">\${esc(x.customer_name || '—')}</strong></td>
    <td><strong style="color:var(--nv)">\${fmtM(x.total)}</strong></td>
    <td>\${x._type === 'legacy' ? \`<span class="tdm">\${esc(x.file_name || 'PDF Document')}</span>\` : pmBadge(x.payment_method || 'Cash')}</td>
    <td>\${x._type === 'legacy' ? '<span class="bdg bg">Archived</span>' : payBadge(x.paid)}</td>
    <td class="tdm">\${x._type === 'legacy' ? (x.receipt_date || '—') : fmtDT(x.created_at)}</td>
    <td><div style="display:flex;gap:6px">
      \${x._type === 'legacy' ? \`
        <button class="btn bs bsm" onclick="openViewLegacyPdfModal('\${x.id}')">👁️ View PDF</button>
        \${x.items_json && x.items_json.length ? \`<button class="btn bg_ bsm" onclick="openViewLegacyItemsModal('\${x.id}')">📋 Items (\${x.items_json.length})</button>\` : ''}
        \${CU?.role === 'admin' ? \`<button class="btn bd bsm" onclick="delLegacyRcpt('\${x.id}')">🗑️ Delete</button>\` : ''}
      \` : \`
        <button class="btn bs bsm" onclick="printRcptById('\${x.id}')">🖨️ Print</button>
        \${!x.paid ? \`<button class="btn bg_ bsm" onclick="markPaid('\${x.id}')">✅ Mark Paid</button>\` : ''}
        \${CU?.role === 'admin' ? \`<button class="btn bd bsm" onclick="delRcpt('\${x.id}')">🗑️ Delete</button>\` : ''}
      \`}
    </div></td>
  </tr>\`).join('')}</tbody></table></div></div>\` : '<div style="text-align:center;padding:50px;color:var(--mt)"><div style="font-size:42px;margin-bottom:10px">🧾</div><p>No receipts found</p></div>'}\`;
}

// ════════════════════════════════════ LEGACY PDF HANDLERS
function openUploadLegacyPdfModal() {
  _parsedLegacyBatch = [];
  openM(\`
  <div style="padding:4px">
    <h3 style="font-size:18px;font-weight:800;margin-bottom:12px;color:var(--tx)">📥 Upload Legacy PDF Receipts</h3>
    <p style="font-size:13px;color:var(--mt);margin-bottom:16px">Select one or multiple legacy PDF receipts to parse, index, and store in your archive.</p>
    <div style="border:2px dashed var(--br);padding:24px;text-align:center;border-radius:10px;background:rgba(15,23,42,0.3);margin-bottom:16px">
      <input type="file" id="legacy-pdf-files" multiple accept=".pdf" style="display:none" onchange="handleLegacyPdfSelect(event)">
      <button class="btn bgd" onclick="$('legacy-pdf-files').click()">📁 Select PDF Files</button>
      <div style="margin-top:8px;font-size:11px;color:var(--mt)">You can select multiple files at once</div>
    </div>
    <div id="legacy-parse-status" style="margin-bottom:16px"></div>
    <div id="legacy-preview-table"></div>
  </div>\`, '780px');
}

async function handleLegacyPdfSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const statusEl = $('legacy-parse-status');
  statusEl.innerHTML = \`<div class="al ali">⏳ Parsing \${files.length} PDF file(s)... Please wait.</div>\`;
  _parsedLegacyBatch = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    statusEl.innerHTML = \`<div class="al ali">⏳ Parsing file \${i + 1} of \${files.length}: <strong>\${esc(file.name)}</strong></div>\`;
    try {
      const parsed = await parseLegacyPdfFile(file);
      _parsedLegacyBatch.push(parsed);
    } catch (e) {
      console.error('Error parsing PDF:', file.name, e);
    }
  }

  statusEl.innerHTML = \`<div class="al als">✅ Successfully parsed \${_parsedLegacyBatch.length} PDF receipt(s)!</div>\`;
  renderLegacyBatchPreview();
}

function renderLegacyBatchPreview() {
  const el = $('legacy-preview-table');
  if (!_parsedLegacyBatch.length) return;

  el.innerHTML = \`
  <div style="max-height:320px;overflow-y:auto;margin-bottom:16px;border:1px solid var(--br);border-radius:6px">
    <table>
      <thead><tr><th>Receipt#</th><th>Customer Name</th><th>Date</th><th>Total</th><th>Items</th></tr></thead>
      <tbody>\${_parsedLegacyBatch.map((item, idx) => \`<tr>
        <td><input class="fi" style="width:80px;padding:4px" value="\${esc(item.receipt_no)}" onchange="_parsedLegacyBatch[\${idx}].receipt_no=this.value"></td>
        <td><input class="fi" style="width:180px;padding:4px" value="\${esc(item.customer_name)}" onchange="_parsedLegacyBatch[\${idx}].customer_name=this.value"></td>
        <td><input type="date" class="fi" style="width:130px;padding:4px" value="\${item.receipt_date}" onchange="_parsedLegacyBatch[\${idx}].receipt_date=this.value"></td>
        <td><input type="number" class="fi" style="width:90px;padding:4px" value="\${item.total}" onchange="_parsedLegacyBatch[\${idx}].total=parseFloat(this.value)||0"></td>
        <td><span class="bdg bb">\${item.items_json ? item.items_json.length : 0} items</span></td>
      </tr>\`).join('')}</tbody>
    </table>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px">
    <button class="btn bd_" onclick="closeM()">Cancel</button>
    <button class="btn bgd" onclick="saveLegacyPdfBatch()">💾 Save \${_parsedLegacyBatch.length} Legacy Receipts</button>
  </div>\`;
}

async function saveLegacyPdfBatch() {
  if (!_parsedLegacyBatch.length) return;
  const statusEl = $('legacy-parse-status');
  statusEl.innerHTML = \`<div class="al ali">⏳ Saving legacy receipts to database...</div>\`;

  let count = 0;
  for (const rcpt of _parsedLegacyBatch) {
    const record = {
      id: crypto.randomUUID(),
      receipt_no: rcpt.receipt_no,
      customer_name: rcpt.customer_name,
      receipt_date: rcpt.receipt_date,
      total: rcpt.total,
      items_json: rcpt.items_json || [],
      file_name: rcpt.file_name,
      pdf_data: rcpt.pdf_data,
      created_at: new Date().toISOString()
    };

    await db.legacy_receipts.put({ ...record, _sync_status: SYNC_STATUS.PENDING });

    if (typeof isOnline !== 'undefined' && isOnline && sb) {
      try {
        await sb.from('legacy_receipts').insert(record);
        await db.legacy_receipts.update(record.id, { _sync_status: SYNC_STATUS.SYNCED });
      } catch (e) {
        console.warn('Supabase save legacy error:', e);
      }
    }
    count++;
  }

  toast(\`\${count} legacy receipt(s) saved successfully!\`, 's');
  closeM();
  loadRcpt();
}

async function openViewLegacyPdfModal(id) {
  const all = await Data.getLegacyReceipts(1000);
  const rcpt = all.find(x => String(x.id) === String(id));
  if (!rcpt || !rcpt.pdf_data) {
    toast('PDF document data not found', 'e');
    return;
  }

  openM(\`
  <div style="padding:4px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:16px;font-weight:800;color:var(--tx)">Receipt No. \${rcpt.receipt_no} — \${esc(rcpt.customer_name)}</h3>
      <a href="\${rcpt.pdf_data}" download="\${rcpt.file_name || 'receipt.pdf'}" class="btn bgd bsm">⬇️ Download PDF</a>
    </div>
    <iframe src="\${rcpt.pdf_data}" style="width:100%;height:580px;border:1px solid var(--br);border-radius:8px"></iframe>
  </div>\`, '850px');
}

async function openViewLegacyItemsModal(id) {
  const all = await Data.getLegacyReceipts(1000);
  const rcpt = all.find(x => String(x.id) === String(id));
  if (!rcpt) return;

  const items = rcpt.items_json || [];
  openM(\`
  <div style="padding:4px">
    <h3 style="font-size:16px;font-weight:800;margin-bottom:12px;color:var(--tx)">Receipt No. \${rcpt.receipt_no} — Parsed Items</h3>
    \${items.length ? \`
    <div style="border:1px solid var(--br);border-radius:6px;overflow:hidden">
      <table>
        <thead><tr><th>S No.</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>\${items.map(it => \`<tr>
          <td>\${it.sno || '—'}</td>
          <td><strong>\${esc(it.item_name)}</strong></td>
          <td>\${it.quantity}</td>
          <td>\${fmtM(it.unit_price)}</td>
          <td><strong>\${fmtM(it.total)}</strong></td>
        </tr>\`).join('')}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;text-align:right;font-size:15px;font-weight:800">Total Amount: \${fmtM(rcpt.total)}</div>
    \` : '<p style="color:var(--mt)">No parsed line items found.</p>'}
  </div>\`, '650px');
}

async function delLegacyRcpt(id) {
  if (!confirm('Permanently delete this legacy PDF receipt?')) return;
  try {
    await db.legacy_receipts.delete(id);
    if (typeof isOnline !== 'undefined' && isOnline && sb) {
      await sb.from('legacy_receipts').delete().eq('id', id);
    }
    toast('Legacy receipt deleted');
    renderRcpt();
  } catch (e) { toast(e.message, 'e'); }
}

// ════════════════════════════════════ ACCOUNTING`;

const startIndex = code.indexOf(rcptTargetStart);
const endIndex = code.indexOf(rcptTargetEnd);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + rcptNewCode + code.substring(endIndex);
  fs.writeFileSync(appPath, code, 'utf8');
  console.log('Successfully patched app.js!');
} else {
  console.error('Could not locate replacement markers in app.js');
}
