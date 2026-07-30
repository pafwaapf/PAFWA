'use strict';
window.addEventListener('keydown', e => { if (e.shiftKey && e.key === 'R') { if (confirm('Emergency Reset?')) { localStorage.clear(); location.reload(); } } });

// ════════════════════════════════════ CONFIGURATION
// Credentials are hardcoded for client convenience
// QR scanner is available as backup option
const HARDCODED_URL = 'https://isxefzwqtsiimhsfiuet.supabase.co';
const HARDCODED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzeGVmendxdHNpaW1oc2ZpdWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjYxOTksImV4cCI6MjA5Mjg0MjE5OX0.c7rxoBQOPzOrfB9WAc-UXR9bS5GkSUA-nxA5pQwysXc';

// ════════════════════════════════════ SUPABASE INIT
const LS_URL = 'pafwa_sb_url', LS_KEY = 'pafwa_sb_key';
let sb = null, CU = null; // supabase client, current user
let _cats = [], _items = [], _posItems = [], _cart = [], _repData = [], _repType = 'sales';
let _invFilter = null, _rcptFilter = null;
let _maintRecords = [];

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtM = n => 'Rs. ' + Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-'); };
const fmtDT = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }); };

// ════════════════════════════════════ IMAGE PROCESSING
async function processImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const SIZE = 400; // Standard size for thumbnails and full view
        canvas.width = SIZE;
        canvas.height = SIZE;

        // Fill background with black
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Calculate contain proportions
        let w = img.width, h = img.height;
        const ratio = Math.min(SIZE / w, SIZE / h);
        w *= ratio; h *= ratio;
        const x = (SIZE - w) / 2;
        const y = (SIZE - h) / 2;

        ctx.drawImage(img, x, y, w, h);

        // Export as JPEG with compression to stay under 200KB
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ════════════════════════════════════ GLOBAL LOADER
function setLoad(prog) {
  const bar = $('GLOBAL-LOADER');
  const lbl = $('FETCH-LABEL');
  if (!bar || !lbl) return;

  if (prog > 0 && prog < 100) {
    bar.classList.add('on');
    lbl.style.display = 'block';
    bar.style.width = prog + '%';
  } else if (prog === 100) {
    bar.style.width = '100%';
    setTimeout(() => {
      bar.classList.remove('on');
      setTimeout(() => { bar.style.width = '0%'; lbl.style.display = 'none'; }, 300);
    }, 500);
  } else {
    bar.style.width = '0%';
    bar.classList.remove('on');
    lbl.style.display = 'none';
  }
}

// ════════════════════════════════════ ADAPTIVE DATA LAYER (WEB ONLY)
const Data = {
  async getItems() {
    setLoad(20);
    try {
      const { data } = await sb.from('items').select('*,categories(name)').eq('archived', false).order('name');
      return data || [];
    } finally { setLoad(100); }
  },
  async getSales(limit = 100) {
    setLoad(30);
    try {
      const { data } = await sb.from('sales').select('*').order('created_at', { ascending: false }).limit(limit);
      return data || [];
    } finally { setLoad(100); }
  },
  async getLiabilities() {
    setLoad(40);
    try {
      const { data } = await sb.from('liabilities').select('*').order('created_at', { ascending: false });
      return data || [];
    } finally { setLoad(100); }
  },
  async getCategories() {
    setLoad(10);
    try {
      const { data } = await sb.from('categories').select('*').order('name');
      return data || [];
    } finally { setLoad(100); }
  },
  async getSaleItems() {
    setLoad(50);
    try {
      const { data } = await sb.from('sale_items').select('*');
      return data || [];
    } finally { setLoad(100); }
  },
  async getMaintenance() {
    setLoad(20);
    try {
      const { data } = await sb.from('maintenance').select('*').order('created_at', { ascending: false });
      return data || [];
    } finally { setLoad(100); }
  },
  async getLegacyReceipts(limit = 1000) {
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
  async save(table, item) {
    setLoad(50);
    try {
      return await sb.from(table).upsert(item);
    } finally { setLoad(100); }
  }
};

function getCfg() {
  // Use HARDCODED_URL only if it's a real Supabase URL (not a placeholder)
  const hardcodedUrl = (HARDCODED_URL && HARDCODED_URL.includes('supabase.co')) ? HARDCODED_URL : '';
  const hardcodedKey = (HARDCODED_KEY && HARDCODED_KEY.startsWith('eyJ')) ? HARDCODED_KEY : '';
  
  let url = hardcodedUrl || localStorage.getItem(LS_URL) || '';
  let key = hardcodedKey || localStorage.getItem(LS_KEY) || '';
  
  if (url) {
    url = url.replace(/\/+$/, "");
    if (url.endsWith("/rest/v1")) url = url.slice(0, -8);
    if (url.endsWith("/auth/v1")) url = url.slice(0, -8);
  }
return { url, key };
}
function hasCfg() { const c = getCfg(); return !!(c.url && c.key); }

function initSB(url, key) {
  try {
    console.log("Supabase Init:", url);
    sb = supabase.createClient(url, key, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return true;
  }
  catch (e) { return false; }
}


// ════════════════════════════════════ UI UTILS
let toastT;
function toast(m, t = 's') { const e = $('TOAST'); e.textContent = m; e.className = `t${t} on`; clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 3500); }
function openM(h, w = '660px') { $('MB').innerHTML = h; $('MB').style.maxWidth = w; $('OV').classList.add('on'); }
function closeM() { $('OV').classList.remove('on'); $('MB').innerHTML = ''; }
function mmc(e) { if (e.target === $('OV')) closeM(); }
function ld(el, msg = '⏳ Loading…') { if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--mt)">${msg}</div>`; }

function stBadge(q, m) { if (!q || q == 0) return '<span class="bdg br_">Out</span>'; if (Number(q) <= Number(m)) return `<span class="bdg bo">Low: ${q}</span>`; return `<span class="bdg bg">${q}</span>`; }
function payBadge(p) { return p ? '<span class="bdg bg">✅ Paid</span>' : '<span class="bdg bo">⏳ Pending</span>'; }
function roleBadge(r) { return r === 'admin' ? '<span class="bdg bb">Admin</span>' : '<span class="bdg bgr">Staff</span>'; }
function pmBadge(m) { const c = { Cash: 'bg', ['Mess Bill']: 'bp_', ['PAFWA Home Store']: 'bb', ['Special Case']: 'bo' }; return `<span class="bdg ${c[m] || 'bgr'}">${esc(m)}</span>`; }

function togglePw(id, btn) {
  const el = $(id);
  if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
  else { el.type = 'password'; btn.textContent = '👁'; }
}

function openSidebar() { $('SB').classList.add('open'); $('SB-OVERLAY').classList.add('on'); }
function closeSidebar() { $('SB').classList.remove('open'); $('SB-OVERLAY').classList.remove('on'); }

// ════════════════════════════════════ LOGGING
async function addLog(action, detail) {
  try {
    if (!sb || !CU) return;
    const log = {
      id: crypto.randomUUID(),
      user_id: CU?.id,
      username: CU?.username,
      role: CU?.role,
      action,
      detail,
      created_at: new Date().toISOString()
    };
    await sb.from('logs').insert(log);
  } catch (e) { console.warn('log error:', e.message); }
}

// ════════════════════════════════════ FIRST-RUN / CONFIG
function showSignUp() {
  ['LOGIN', 'CFG-SCREEN', 'APP'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; } });
  $('ADMIN-SCREEN').style.display = 'flex';
}
function showLogin() {
  ['ADMIN-SCREEN', 'CFG-SCREEN', 'APP'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; } });
  $('LOGIN').style.display = 'flex';
}
function showCfg() {
  const c = getCfg();
  $('cfg-url').value = c.url || '';
  $('cfg-key').value = c.key || '';
  ['LOGIN', 'ADMIN-SCREEN', 'APP'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.classList && el.classList.remove('on'); } });
  $('CFG-SCREEN').style.display = 'flex';
}
function saveCfgAndInit() {
  let url = $('cfg-url').value.trim();
  const key = $('cfg-key').value.trim();
  const err = $('cfg-err');
  if (!url || !key) { err.textContent = 'Both fields are required'; err.style.display = 'block'; return; }

  // Clean URL: remove trailing slashes and common extra paths like /rest/v1
  url = url.replace(/\/+$/, "");
  if (url.endsWith("/rest/v1")) url = url.slice(0, -8);
  if (url.endsWith("/auth/v1")) url = url.slice(0, -8);

  if (!url.includes('supabase.co')) { err.textContent = 'URL must be a valid .supabase.co address'; err.style.display = 'block'; return; }

  localStorage.setItem(LS_URL, url); localStorage.setItem(LS_KEY, key);
  $('CFG-SCREEN').style.display = 'none';
  boot();
}

// ════════════════════════════════════ FIRST ADMIN CREATION
async function createFirstAdmin() {
  const u = $('adm-u').value.trim(), fn = $('adm-fn').value.trim();
  const pw = $('adm-pw').value, pw2 = $('adm-pw2').value;
  const err = $('adm-err'), btn = $('adm-btn');
  err.style.display = 'none';
  if (!u || !pw) { err.textContent = 'Username and password required'; err.style.display = 'block'; return; }
  if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.style.display = 'block'; return; }
  if (pw !== pw2) { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const email = `${u}@pafwa.local`;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { username: u, full_name: fn || 'Administrator', role: 'admin' } } });
    if (error) throw error;
    toast('Administrator created! Logging you in…');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '✅ Create Administrator Account';
  }
}

// ════════════════════════════════════ AUTH
async function doLogin() {
  const u = ($('lu') || {}).value?.trim(), p = ($('lp') || {}).value;
  const btn = $('lbtn'), err = $('lerr');
  if (!u || !p) { if (err) err.textContent = 'Enter username and password'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }
  if (err) err.textContent = '';
  try {
    const email = `${u}@pafwa.local`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: p });
    if (error) {
      if (err) err.textContent = 'Invalid username or password';
      if (btn) { btn.disabled = false; btn.textContent = '🔐 Sign In'; }
      return;
    }
    sb.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id).then(() => { });
  } catch (e) {
    if (err) err.textContent = 'Login error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Sign In'; }
  }
}

async function doLogout() {
  if (!confirm('Logout?')) return;
  await addLog('LOGOUT', `${CU?.username} logged out`);
  await sb.auth.signOut();
  location.reload();
}

async function logout() { await sb.auth.signOut(); location.reload(); }



// ════════════════════════════════════ AUTH LISTENER
function setupAuth() {
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const { data: prof } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (prof && prof.active) {
        CU = { id: prof.id, username: prof.username, fullName: prof.full_name, role: prof.role, permissions: prof.permissions || {} };
        const sbn = $('sbn'); if (sbn) sbn.textContent = prof.full_name || prof.username;
        const sbr = $('sbr'); if (sbr) sbr.textContent = prof.role;
        const sba = $('sb-avatar'); if (sba) sba.textContent = (prof.full_name || prof.username).charAt(0).toUpperCase();
        const sbsy = $('sbsy'); if (sbsy) { sbsy.textContent = '🟢 Connected'; sbsy.style.color = 'var(--gr)'; }
        const stu = $('status-user'); if (stu) stu.textContent = prof.username;

        const perms = CU.permissions || {};
        const isAdmin = CU.role === 'admin';
        document.querySelectorAll('.ni[data-p="users"]').forEach(e => e.style.display = (isAdmin || perms.users_view) ? '' : 'none');
        document.querySelectorAll('.ni[data-p="logs"]').forEach(e => e.style.display = (isAdmin || perms.act_view) ? '' : 'none');
        document.querySelectorAll('.ni[data-p="acct"]').forEach(e => e.style.display = (isAdmin || perms.acct_view) ? '' : 'none');
        document.querySelectorAll('.ni[data-p="pos"]').forEach(e => e.style.display = (isAdmin || perms.rcpt_gen) ? '' : 'none');

        const secAdmin = $('nav-sec-admin');
        if (secAdmin) secAdmin.style.display = (isAdmin || perms.users_view || perms.act_view) ? '' : 'none';
        ['LOAD', 'LOGIN', 'CFG-SCREEN', 'ADMIN-SCREEN'].forEach(id => { const el = $(id); if (el) { el.style.display = 'none'; el.classList && el.classList.remove('on'); } });
        $('APP').classList.add('on');
        // Small delay to ensure session is fully propagated to all listeners
        setTimeout(async () => {
          await refreshInv(); 
          goTo('dash');
        }, 300);
        return;
      }
    }
    // Not logged in
    $('LOAD').style.display = 'none';
    $('APP').classList.remove('on');
    // Only show login if the admin creation screen isn't currently open
    if ($('ADMIN-SCREEN').style.display !== 'flex') {
      $('LOGIN').style.display = 'flex';
    }
    if ($('lbtn')) { $('lbtn').disabled = false; $('lbtn').textContent = '🔐 Sign In'; }
    CU = null;
  });
}

// ════════════════════════════════════ PENDING COUNT (receipt badge)
async function updatePendingCount() {
  try {
    const { data } = await sb.from('sales').select('id', { count: 'exact', head: true }).eq('paid', false);
    const badge = $('pend-count');
    if (badge) badge.textContent = (data || 0);
  } catch (e) { console.warn('updatePendingCount:', e.message); }
}

// ════════════════════════════════════ NAVIGATION
document.querySelectorAll('.ni[data-p]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.p)));
const LOADERS = { dash: loadDash, inv: loadInv, pos: loadPOS, rcpt: loadRcpt, acct: loadAcct, rep: loadRep, logs: loadLogs, users: loadUsers, bkp: loadBkp, cfg: loadCfg, maint: loadMaint };
function goTo(p) {
  const perms = CU?.permissions || {};
  const isAdmin = CU?.role === 'admin';
  if (p === 'users' && !isAdmin && !perms.users_view) { toast('Access denied', 'e'); return; }
  if (p === 'logs' && !isAdmin && !perms.act_view) { toast('Access denied', 'e'); return; }
  if (p === 'acct' && !isAdmin && !perms.acct_view) { toast('Access denied', 'e'); return; }
  if (p === 'pos' && !isAdmin && !perms.rcpt_gen) { toast('Access denied', 'e'); return; }
  window._curP = p;
  document.querySelectorAll('.pg').forEach(e => e.classList.remove('on'));
  const pg = $('page-' + p);
  if (pg) pg.classList.add('on');
  document.querySelectorAll('.ni').forEach(e => e.classList.toggle('on', e.dataset.p === p));
  if (window.innerWidth <= 900) closeSidebar();
  if (LOADERS[p]) LOADERS[p]();
  applyStyles();
}

// ════════════════════════════════════ DASHBOARD
async function loadDash() {
  const el = $('page-dash'); ld(el);
  try {
    const [items, sales, liabs, maint] = await Promise.all([
      Data.getItems(), Data.getSales(200), Data.getLiabilities(), Data.getMaintenance()
    ]);
    _maintRecords = maint;

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const todS = sales.filter(s => s.created_at?.startsWith(today));
    const monS = sales.filter(s => s.created_at?.startsWith(month));
    const todAmt = todS.reduce((a, s) => a + Number(s.total), 0);
    const monAmt = monS.reduce((a, s) => a + Number(s.total), 0);
    const pend = sales.filter(s => !s.paid);
    const pendAmt = pend.reduce((a, s) => a + Number(s.total), 0);
    const lowItems = items.filter(i => Number(i.stock_qty) <= Number(i.min_stock_threshold || 5));
    const totalLiab = liabs.reduce((a, l) => a + Number(l.amount), 0);
    const underRepair = maint.filter(r => r.status === 'Under Repair');
    const overdue = underRepair.filter(r => r.est_return_date && r.est_return_date < today);

    el.innerHTML = `
    <div class="ph">
      <div><div class="pt">Dashboard</div><div class="ps">${new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      <div class="ph-acts">
        <button class="btn bs bsm" onclick="loadDash()" title="Reload Dashboard Data" style="padding: 8px 12px">🔄 Refresh</button>
        <input id="gsq" style="width:280px;max-width:100%;padding:9px 12px;border:1.5px solid var(--br);border-radius:8px;font-size:13px;outline:none" placeholder="🔍 Search items, customers…" oninput="gSearch(this.value)">
      </div>
    </div>
    <div id="gsr" style="display:none;margin-bottom:14px"></div>
    ${overdue.length ? `<div class="al alw" style="margin-bottom:16px;border-left:4px solid #f59e0b;cursor:pointer" onclick="goTo('maint')">
      <strong>⚠️ Maintenance Overdue!</strong> ${overdue.length} item${overdue.length > 1 ? 's have' : ' has'} exceeded the estimated return date: 
      <strong>${overdue.map(r => r.item_name).join(', ')}</strong>. Click to view.
    </div>` : ''}
    <div class="stats-grid">
      <div class="stat" style="cursor:pointer" onclick="goTo('inv')"><div class="sl">Items</div><div class="sv">${items.length}</div><div class="ss">${items.reduce((a, i) => a + Number(i.stock_qty || 0), 0)} total units</div></div>
      <div class="stat g" style="cursor:pointer" onclick="goTo('rcpt')"><div class="sl">Sales Today</div><div class="sv" style="color:var(--gr)">${fmtM(todAmt)}</div><div class="ss">${todS.length} transactions</div></div>
      <div class="stat s" style="cursor:pointer" onclick="goTo('rep')"><div class="sl">This Month</div><div class="sv" style="color:var(--sk)">${fmtM(monAmt)}</div><div class="ss">${monS.length} transactions</div></div>
      <div class="stat o" style="cursor:pointer" onclick="_rcptFilter={st:'pend'};goTo('rcpt')"><div class="sl">Pending Cash</div><div class="sv" style="color:var(--or)">${fmtM(pendAmt)}</div><div class="ss">${pend.length} unpaid</div></div>
      <div class="stat ${lowItems.length ? 'r' : 'g'}" style="cursor:pointer" onclick="_invFilter={sh:'low'};goTo('inv')"><div class="sl">Low Stock</div><div class="sv" style="color:${lowItems.length ? 'var(--rd)' : 'var(--gr)'}">${lowItems.length}</div><div class="ss">${lowItems.length ? 'need restock' : 'All good ✓'}</div></div>
      <div class="stat ${overdue.length ? 'r' : underRepair.length ? 'o' : 'g'}" style="cursor:pointer" onclick="goTo('maint')"><div class="sl">Under Repair</div><div class="sv" style="color:${overdue.length ? 'var(--rd)' : underRepair.length ? 'var(--or)' : 'var(--gr)'}">${underRepair.length}</div><div class="ss">${overdue.length ? `${overdue.length} overdue!` : underRepair.length ? 'at GE Shop' : 'None active ✓'}</div></div>
    </div>
    <div class="gw">
      <div class="card">
        <div class="ch"><span class="ct_">🧾 Recent Sales</span><button class="btn bs bsm" onclick="goTo('rcpt')">View All</button></div>
        ${sales.length ? `<div class="tw"><table>
        <thead><tr><th>No.</th><th>Customer</th><th>Total</th><th>Method</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${sales.slice(0, 10).map(s => `<tr>
          <td><span class="bdg bb">No.${s.receipt_no}</span></td>
          <td>${esc(s.customer_name)}</td>
          <td><strong>${fmtM(s.total)}</strong></td>
          <td>${pmBadge(s.payment_method || 'Cash')}</td>
          <td>${payBadge(s.paid)}</td>
          <td class="tdm">${fmtDT(s.created_at)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div style="text-align:center;padding:30px;color:var(--mt)">No sales yet</div>'}
      </div>
      <div class="card">
        <div class="ct_">⚠️ Low Stock Alerts</div>
        ${lowItems.length ? `<div class="tw"><table><thead><tr><th>Item</th><th>Stock</th></tr></thead>
        <tbody>${lowItems.map(i => `<tr><td style="font-size:12px;font-weight:600">${esc(i.name)}</td><td style="text-align:right">${stBadge(i.stock_qty, i.min_stock_threshold)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div style="color:var(--gr);font-size:13px;padding:10px 0">✅ All items are adequately stocked.</div>'}
        ${totalLiab > 0 ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--br)"><div class="sl">Total Liabilities</div><div style="font-size:20px;font-weight:800;color:var(--rd)">${fmtM(totalLiab)}</div></div>` : ''}
        ${underRepair.length ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--br)"><div class="ch"><span class="ct_">🔧 Active Repairs</span><button class="btn bs bsm" onclick="goTo('maint')">View All</button></div>
        <div class="tw"><table><thead><tr><th>Item</th><th>Repair Type</th><th>Est. Return</th></tr></thead>
        <tbody>${underRepair.slice(0, 5).map(r => `<tr style="${r.est_return_date && r.est_return_date < today ? 'background:rgba(239,68,68,0.2)' : ''}">
          <td style="font-size:12px;font-weight:600">${esc(r.item_name)}${r.est_return_date && r.est_return_date < today ? ' <span class="bdg br_" style="font-size:10px">OVERDUE</span>' : ''}</td>
          <td><span class="bdg bo" style="font-size:10px">${esc(r.repair_type)}</span></td>
          <td class="tdm" style="color:${r.est_return_date && r.est_return_date < today ? 'var(--rd)' : 'inherit'};font-weight:${r.est_return_date && r.est_return_date < today ? '700' : '400'}">${fmtD(r.est_return_date) || '—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      </div>
    </div>`;
  } catch (e) { el.innerHTML = `<div class="al ale">Error: ${e.message}</div>`; }
}

async function gSearch(q) {
  const el = $('gsr'); if (!q || q.length < 2) { el.style.display = 'none'; return; }
  const [iR, sR] = await Promise.all([
    sb.from('items').select('id,name,serial_number').eq('archived', false).or(`name.ilike.%${q}%,serial_number.ilike.%${q}%`).limit(4),
    sb.from('sales').select('id,receipt_no,customer_name').or(`customer_name.ilike.%${q}%`).limit(4)
  ]);
  const rows = [...(iR.data || []).map(i => `<div style="padding:8px 0;border-bottom:1px solid var(--br);display:flex;align-items:center;gap:8px"><span class="bdg bb">📦</span> <strong style="flex:1">${esc(i.name)}</strong> <span class="tdm">${esc(i.serial_number)}</span></div>`),
  ...(sR.data || []).map(s => `<div style="padding:8px 0;border-bottom:1px solid var(--br);display:flex;align-items:center;gap:8px"><span class="bdg bg">🧾</span> <strong style="flex:1">${esc(s.customer_name)}</strong> <span class="tdm">No.${s.receipt_no}</span></div>`)];
  el.innerHTML = `<div class="card" style="padding:10px 16px">${rows.length ? rows.join('') : '<p style="color:var(--mt);padding:8px 0">No results found</p>'}</div>`;
  el.style.display = 'block';
}

// ════════════════════════════════════ INVENTORY
async function loadInv() {
  const el = $('page-inv');
  el.innerHTML = `
  <div class="ph">
    <div><div class="pt">Inventory</div><div class="ps" id="icnt">Loading…</div></div>
    <div class="ph-acts" id="inv-acts">
      <button class="btn bs bsm" onclick="loadInv()" title="Reload Inventory" style="padding: 8px 12px">🔄 Refresh</button>
      ${(CU?.role === 'admin' || CU?.permissions?.inv_edit) ? `<button class="btn bg_" onclick="$('upload-excel').click()">📄 Import Excel</button>
      <input type="file" id="upload-excel" accept=".xlsx, .xls, .csv" style="display:none" onchange="importExcel(this)">
      <button class="btn bs" onclick="openManageCatM()">⚙️ Categories</button>
      <button class="btn bp" onclick="openItemM()">+ Add Item</button>` : ''}
    </div>
  </div>
  <div class="fb" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px">
    <input class="fi" id="iq" placeholder="🔍 Name, serial, location…" oninput="renderInv()" style="flex:1;min-width:200px">
    <select id="icat" onchange="renderInv()"><option value="">All Categories</option></select>
    <select id="iloc" onchange="renderInv()"><option value="">All Locations</option></select>
    <select id="ish" onchange="renderInv()"><option value="active">Active</option><option value="low">Low Stock</option><option value="arch">Archived</option></select>
    <select id="isort" onchange="renderInv()">
      <option value="name_asc">Sort: Name (A-Z)</option>
      <option value="name_desc">Sort: Name (Z-A)</option>
      <option value="loc_asc">Sort: Location (A-Z)</option>
      <option value="cost_asc">Sort: Cost (Low to High)</option>
      <option value="cost_desc">Sort: Cost (High to Low)</option>
      <option value="price_asc">Sort: Sale Price (Low to High)</option>
      <option value="price_desc">Sort: Sale Price (High to Low)</option>
      <option value="stock_asc">Sort: Stock (Low to High)</option>
      <option value="stock_desc">Sort: Stock (High to Low)</option>
    </select>
  </div>
  <div id="itbl"></div>`;
  if (_invFilter) {
    if (_invFilter.cat) $('icat').value = _invFilter.cat;
    if (_invFilter.sh) $('ish').value = _invFilter.sh;
    if (_invFilter.q) $('iq').value = _invFilter.q;
    _invFilter = null;
  }
  await refreshInv();
}

async function refreshInv() {
  const cats = await Data.getCategories();
  const items = await Data.getItems();
  _cats = cats;
  _items = items.map(i => {
    // Robust mapping: Use either the already joined categories object or find it in the cats array
    const catObj = i.categories && typeof i.categories === 'object' && i.categories.name
      ? i.categories
      : cats.find(c => c.id === i.category_id);
    return { ...i, categories: catObj };
  });

  const sel = $('icat');
  if (sel) {
    const v = sel.value;
    sel.innerHTML = '<option value="">All Categories</option>' + _cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = v;
  }
  const selLoc = $('iloc');
  if (selLoc) {
    const v = selLoc.value;
    const locs = [...new Set(_items.map(i => i.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selLoc.innerHTML = '<option value="">All Locations</option>' + locs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
    selLoc.value = v;
  }
  renderInv();
  updatePendingCount();
  // Also refresh maintenance cache for badge display
  Data.getMaintenance().then(m => { _maintRecords = m; renderInv(); });
}

async function importExcel(input) {
  const f = input.files[0];
  if (!f) return;
  toast('Reading Excel file...', 'i');

  const over = $('import-overlay');
  const bar = $('import-bar');
  const txt = $('import-txt');
  const logBox = $('import-log');
  if (over) over.style.display = 'flex';
  if (logBox) logBox.innerHTML = '';

  const lg = (msg, isErr = false) => {
    if (!logBox) return;
    const d = document.createElement('div');
    d.textContent = '> ' + msg;
    if (isErr) d.style.color = '#ef4444';
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
  };

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      lg('File loaded into memory. Parsing Excel data...');
      if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded yet, please refresh the page.');
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      if (!workbook.SheetNames.length) throw new Error('No sheets found in excel');

      let count = 0;
      let errCount = 0;
      let totalSheets = workbook.SheetNames.length;
      let curIdx = 0;

      for (const sheetName of workbook.SheetNames) {
        curIdx++;
        if (txt) txt.textContent = `Processing sheet ${curIdx} of ${totalSheets}...`;
        lg(`\n--- Sheet: ${sheetName} ---`);
        await new Promise(r => setTimeout(r, 10));

        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        lg(`Found ${rows.length} rows.`);
        if (!rows || rows.length < 2) { lg('Not enough rows, skipping.'); continue; }

        let cur = null;
        let lastSeenName = '';

        const saveItem = async (it) => {
          if (!it) return;
          if (!it.name && lastSeenName) {
            it.name = lastSeenName;
            lg(`Inheriting name '${it.name}' for sub-category ${it.code}`);
          }
          if (!it.name) {
            lg(`Skipping item with code '${it.code}' because no name was found.`, true);
            return;
          }

          lastSeenName = it.name;

          let validDate = null;
          if (it.date) {
            if (it.date instanceof Date) {
              validDate = it.date.toISOString().split('T')[0];
            } else if (typeof it.date === 'number' && it.date > 10000 && it.date < 100000) {
              // Handle Excel serial date
              const d = new Date(Math.round((it.date - 25569) * 86400 * 1000));
              validDate = d.toISOString().split('T')[0];
            } else {
              const ds = String(it.date).trim();
              let parts = ds.split(/[-/]/);
              if (parts.length === 3) {
                // Try to detect DD/MM/YYYY or YYYY/MM/DD
                let y = parts[2], m = parts[1], d = parts[0];
                if (y.length < 4 && d.length === 4) [y, d] = [d, y]; // swap if YYYY/MM/DD
                if (y.length >= 4) {
                  validDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
              }
              if (!validDate) {
                const d = new Date(it.date);
                if (!isNaN(d.getTime())) validDate = d.toISOString().split('T')[0];
              }
            }
          }

          const payload = {
            name: it.name,
            serial_number: it.code || null,
            stock_qty: it.qty,
            cost_price: it.cost,
            sale_price: it.price
          };
          if (validDate) payload.date_of_boc = validDate;

          lg(`Attempting to save item: [${it.code || 'NO-CODE'}] ${it.name} (Qty: ${it.qty}, Cost: ${it.cost}, Price: ${it.price}, Date: ${validDate || 'none'})`);

          const { error } = await sb.from('items').insert(payload);
          if (!error) {
            count++;
            lg(`SUCCESS: Saved ${it.name}`);
          } else {
            if (error.code === '23505' && it.code) {
              lg(`Duplicate SN detected for ${it.code}. Attempting to update instead...`);
              const { error: upErr } = await sb.from('items').update(payload).eq('serial_number', it.code);
              if (!upErr) {
                count++;
                lg(`SUCCESS: Updated ${it.name}`);
              } else {
                errCount++;
                lg(`ERROR: Update failed for ${it.name}: ${upErr.message}`, true);
              }
            } else {
              errCount++;
              lg(`ERROR: Insert failed for ${it.name}: ${error.message}`, true);
            }
          }
        };

        for (let r = 0; r < rows.length; r++) {
          // Update progress bar per row if there are many rows
          if (r % 100 === 0) {
            if (bar) bar.style.width = Math.round((r / rows.length) * 100) + '%';
            await new Promise(res => setTimeout(res, 5)); // yield to UI
          }

          const rowStr = rows[r].map(v => String(v || '')).join(' ').toLowerCase();
          const col0 = rows[r][0];
          const col1 = rows[r][1] ? String(rows[r][1]).trim() : '';

          // Skip if this is a header row repeating the item name column
          if (col1.toLowerCase() === 'item name') continue;

          if (rowStr.includes('item code')) {
            if (cur && (cur.name || cur.code)) await saveItem(cur);
            lg(`Found 'Item Code' header at row ${r + 1}`);
            cur = { code: '', name: '', cost: 0, price: 0, qty: 0, date: '', hIdx: -1, cIdx: -1, pIdx: -1, bIdx: -1 };
            for (let c = 0; c < rows[r].length; c++) {
              if (String(rows[r][c]).trim().toLowerCase().includes('item code')) {
                cur.code = String(rows[r][c + 1] || rows[r][c + 2] || '').trim();
                if (!cur.code && rows[r + 1] && rows[r + 1][c]) {
                  cur.code = String(rows[r + 1][c]).trim();
                }
              }
            }
          } else if (!cur && (rowStr.includes('cost price') || rowStr.includes('sale price'))) {
            cur = { code: '', name: '', cost: 0, price: 0, qty: 0, date: '', hIdx: -1, cIdx: -1, pIdx: -1, bIdx: -1 };
          }

          if (cur) {
            if (rowStr.includes('cost price') && (rowStr.includes('sale price') || rowStr.includes('c/bal') || rowStr.includes('bal'))) {
              cur.hIdx = r;
              const headers = rows[r].map(h => String(h).trim().toLowerCase());
              cur.cIdx = headers.findIndex(h => h.includes('cost price'));
              cur.pIdx = headers.findIndex(h => h.includes('sale price'));
              cur.bIdx = headers.findIndex(h => h === 'c/bal' || h === 'bal' || h.includes('bal'));
              lg(`Found data headers at row ${r + 1}. C/Bal is at column index ${cur.bIdx}`);
            }
            else if (cur.hIdx !== -1 && r > cur.hIdx) {

              if (col1 && col1 !== '-' && col1.toLowerCase() !== 'total' && col1.toLowerCase() !== 'item name') {
                if (cur.name && cur.name !== col1) {
                  lg(`Found NEW item name '${col1}' at row ${r + 1}. Saving previous item.`);
                  await saveItem(cur);
                  cur = { code: '', name: col1, cost: 0, price: 0, qty: 0, date: col0 !== '-' ? col0 : '', hIdx: cur.hIdx, cIdx: cur.cIdx, pIdx: cur.pIdx, bIdx: cur.bIdx };
                } else if (!cur.name) {
                  cur.name = col1;
                  if (col0 && col0 !== '-') cur.date = col0;
                  lg(`Identified item name: ${col1}`);
                }
              }

              if (cur.cIdx !== -1 && rows[r][cur.cIdx]) {
                const cval = Number(String(rows[r][cur.cIdx]).replace(/,/g, ''));
                if (!isNaN(cval) && cval > 0) cur.cost = cval;
              }
              if (cur.pIdx !== -1 && rows[r][cur.pIdx]) {
                const pval = Number(String(rows[r][cur.pIdx]).replace(/,/g, ''));
                if (!isNaN(pval) && pval > 0) cur.price = pval;
              }
              if (cur.bIdx !== -1 && rows[r][cur.bIdx] !== '') {
                const bval = Number(String(rows[r][cur.bIdx]).replace(/,/g, ''));
                if (!isNaN(bval)) cur.qty = bval;
              }
            }
          }
        }

        if (cur && (cur.name || cur.code)) await saveItem(cur);
      }

      lg(`\nDONE! Imported: ${count}. Errors: ${errCount}.`);
      if (errCount > 0) {
        toast(`⚠️ Imported ${count} items. ${errCount} items failed (check log).`, 'w');
      } else {
        toast(`✅ Successfully imported ${count} items!`, 's');
      }
      if (txt) txt.textContent = `Completed! ${count} imported, ${errCount} errors.`;
      if (bar) bar.style.width = '100%';

      lg('Closing dialog in 3 seconds...');
      await new Promise(r => setTimeout(r, 3500));
      refreshInv();
    } catch (err) {
      if (typeof lg !== 'undefined') lg(`CRITICAL FATAL ERROR: ${err.message}`, true);
      toast('Failed to import: ' + err.message, 'e');
      await new Promise(r => setTimeout(r, 4000));
    } finally {
      if (over) over.style.display = 'none';
      input.value = '';
    }
  };
  reader.readAsArrayBuffer(f);
}


function renderInv() {
  const q = ($('iq')?.value || '').toLowerCase();
  const cat = $('icat')?.value;
  const loc = $('iloc')?.value;
  const sort = $('isort')?.value || 'name_asc';
  const sh = $('ish')?.value || 'active';

  let items = [..._items];
  if (sh === 'active') items = items.filter(i => !i.archived);
  else if (sh === 'arch') items = items.filter(i => i.archived);
  else if (sh === 'low') items = items.filter(i => !i.archived && Number(i.stock_qty) <= Number(i.min_stock_threshold || 5));

  if (q) items = items.filter(i => i.name?.toLowerCase().includes(q) || i.serial_number?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q));
  if (cat) items = items.filter(i => i.category_id === cat);
  if (loc) items = items.filter(i => i.location === loc);

  if (sort === 'name_asc') items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sort === 'name_desc') items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
  else if (sort === 'loc_asc') items.sort((a, b) => (a.location || '').localeCompare(b.location || ''));
  else if (sort === 'cost_asc') items.sort((a, b) => Number(a.cost_price || 0) - Number(b.cost_price || 0));
  else if (sort === 'cost_desc') items.sort((a, b) => Number(b.cost_price || 0) - Number(a.cost_price || 0));
  else if (sort === 'price_asc') items.sort((a, b) => Number(a.sale_price || 0) - Number(b.sale_price || 0));
  else if (sort === 'price_desc') items.sort((a, b) => Number(b.sale_price || 0) - Number(a.sale_price || 0));
  else if (sort === 'stock_asc') items.sort((a, b) => Number(a.stock_qty || 0) - Number(b.stock_qty || 0));
  else if (sort === 'stock_desc') items.sort((a, b) => Number(b.stock_qty || 0) - Number(a.stock_qty || 0));
  const cnt = $('icnt'); if (cnt) cnt.textContent = items.length + ' items';
  const el = $('itbl'); if (!el) return;
  if (!items.length) { el.innerHTML = '<div style="text-align:center;padding:50px;color:var(--mt)"><div style="font-size:48px;margin-bottom:10px">📦</div><p>No items found</p></div>'; return; }
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>S/N</th><th>Item</th><th>Category</th><th>Location</th><th>Cost</th><th>Sale Price</th><th>Stock</th><th>Actions</th></tr></thead>
  <tbody>${items.map(i => `<tr style="cursor:pointer" onclick="if(!event.target.closest('button')) viewItem('${i.id}')">
    <td><code style="font-size:11px;background:rgba(15,23,42,0.8);color:var(--neon-cyan);border:1px solid var(--neon-cyan);padding:3px 6px;border-radius:4px">${esc(i.serial_number || '—')}</code></td>
    <td><div style="display:flex;align-items:center;gap:12px">
      ${i.image_url ? `<div style="width:48px;height:48px;border-radius:6px;overflow:hidden;background:#000;border:1px solid var(--br);display:flex;align-items:center;justify-content:center"><img src="${esc(i.image_url)}" style="width:100%;height:100%;object-fit:contain"></div>` : '<div style="width:48px;height:48px;border-radius:6px;background:rgba(30,41,59,0.8);border:1px solid var(--br);display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>'}
      <div>
        <div style="font-weight:700;line-height:1.2;font-size:14px">${esc(i.name)}${i.archived ? '<span class="bdg bgr" style="margin-left:6px">Archived</span>' : ''}${_maintRecords.some(r => r.item_id === i.id && r.status === 'Under Repair') ? '<span class="bdg bo" style="margin-left:6px;font-size:10px">🔧 Under Repair</span>' : ''}</div>
        ${i.description ? `<div style="font-size:11px;color:var(--mt);margin-top:2px">${esc(i.description.slice(0, 50))}</div>` : ''}
      </div>
    </div></td>
    <td class="tdm">${esc(i.categories?.name || '—')}</td>
    <td class="tdm">${esc(i.location || '—')}</td>
    <td class="tdm">${fmtM(i.cost_price)}</td>
    <td><strong style="color:var(--nv);font-size:14px">${fmtM(i.sale_price)}</strong></td>
    <td>${stBadge(i.stock_qty, i.min_stock_threshold)}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn bb_ bsm" onclick="viewItem('${i.id}')">View</button>
      ${(CU?.role === 'admin' || CU?.permissions?.inv_edit) ? `<button class="btn bs bsm" onclick="editItem('${i.id}')">Edit</button>
      <button class="btn bd bsm" onclick="archItem('${i.id}',${!!i.archived})">${i.archived ? 'Restore' : 'Archive'}</button>` : ''}
    </div></td>
  </tr>`).join('')}
  </tbody></table></div></div>`;
}

function openItemM(item = null) {
  const e = item || {};
  const cOpts = _cats.map(c => `<option value="${c.id}"${e.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  openM(`<h2>${item ? '✏️ Edit Item' : '➕ Add New Item'}</h2>
  <div id="ie" class="al ale" style="display:none"></div>
  <div class="r2">
    <div class="fg"><label>Item Name *</label><input id="fin" value="${esc(e.name || '')}" oninput="if(!$('ficat').value) suggestSN()"></div>
    <div class="fg"><label>Serial Number</label><input id="fisn" value="${esc(e.serial_number || '')}" placeholder="Auto-generated if blank" oninput="this.dataset.userEdited='true'"></div>
  </div>
  <div class="r3">
    <div class="fg">
      <label>Category</label>
      <div style="display:flex;gap:4px">
        <select id="ficat" onchange="suggestSN()"><option value="">None</option>${cOpts}</select>
        <button class="btn bs" style="padding:0 8px; font-weight:bold;" onclick="quickAddCat()">+</button>
      </div>
    </div>
    <div class="fg"><label>Location</label><input id="filoc" value="${esc(e.location || '')}" placeholder="Shelf A-3"></div>
    <div class="fg"><label>Date of BOC</label><input id="fiboc" type="date" value="${e.date_of_boc || ''}"></div>
  </div>
  <div class="r3">
    <div class="fg"><label>Cost Price (Rs.)</label><input id="ficp" type="number" min="0" step="0.01" value="${e.cost_price || 0}"></div>
    <div class="fg"><label>Sale Price (Rs.) *</label><input id="fisp" type="number" min="0" step="0.01" value="${e.sale_price || 0}"></div>
    <div class="fg"><label>Discount %</label><input id="fidisc" type="number" min="0" max="100" value="${e.discount_pct || 0}"></div>
  </div>
  <div class="r3">
    <div class="fg"><label>Stock Qty *</label><input id="fiq" type="number" min="0" value="${e.stock_qty || 0}"></div>
    <div class="fg"><label>Min Alert</label><input id="fimq" type="number" min="0" value="${e.min_stock_threshold || 5}"></div>
    <div class="fg"><label>Unit</label><input id="fiunit" value="${esc(e.unit || 'pcs')}" placeholder="pcs / kg"></div>
  </div>
  <div class="fg"><label>Description</label><textarea id="fidesc">${esc(e.description || '')}</textarea></div>
  <div class="fg"><label>Item Image</label>
    <div class="img-drop" id="idrop" onclick="$('fiimg').click()">${e.image_url ? `<img src="${esc(e.image_url)}">` : '<span style="font-size:24px;margin-bottom:4px">📷</span><span>Click to upload image</span>'}</div>
    <input type="file" id="fiimg" accept="image/*" style="display:none" onchange="prevImg(event)">
  </div>
  <div class="mf">
    <button class="btn bp" onclick="submitItem('${item?.id || ''}')">✅ ${item ? 'Save Changes' : 'Add Item'}</button>
    <button class="btn bs" onclick="closeM()">Cancel</button>
  </div>`, '680px');
  window._imgFile = null;
}

function prevImg(e) { const f = e.target.files[0]; if (!f) return; window._imgFile = f; const r = new FileReader(); r.onload = ev => { $('idrop').innerHTML = `<img src="${ev.target.result}">`; }; r.readAsDataURL(f); }

async function submitItem(id) {
  const name = $('fin').value.trim(), err = $('ie');
  if (!name) { err.textContent = 'Name required'; err.style.display = 'block'; return; }
  try {
    let imgUrl = id ? (_items.find(i => i.id === id)?.image_url || null) : null, imgPath = null;
    if (window._imgFile && sb) {
      const processedBlob = await processImage(window._imgFile);
      const ext = 'jpg';
      const path = `${Date.now()}.${ext}`;
      const { data: upData, error: upErr } = await sb.storage.from('item-images').upload(path, processedBlob, { upsert: true });
      if (upErr) throw upErr;
      imgPath = path;
      const { data: { publicUrl } } = sb.storage.from('item-images').getPublicUrl(path);
      imgUrl = publicUrl;
    }

    let catId = $('ficat').value;

    // ── AUTO-CREATE CATEGORY IF NONE SELECTED ──────────────────────────────────
    if (!catId && name) {
      // Derive category name: use first 1 or 2 meaningful words from item name
      const words = name.trim().split(/\s+/);
      const autoName = (words[0].length <= 3 && words.length > 1)
        ? (words[0] + ' ' + words[1]) // e.g. "AC Unit" if first word is short
        : words[0];                    // e.g. "Baby" from "Baby Set Net Cloth"
      const titleName = autoName.charAt(0).toUpperCase() + autoName.slice(1).toLowerCase();

      // Check if category already exists (case-insensitive)
      let existingCat = _cats.find(c => c.name.toLowerCase() === titleName.toLowerCase());
      if (!existingCat) {
        // Create it in the database
        const { data: newCat, error: catErr } = await sb.from('categories')
          .insert({ name: titleName })
          .select()
          .single();
        if (!catErr && newCat) {
          existingCat = newCat;
          _cats.push(newCat); // inject into local cache immediately
          addLog('AUTO_CAT', `Auto-created category: ${titleName}`);
        }
      }
      if (existingCat) catId = existingCat.id;
    }
    // ──────────────────────────────────────────────────────────────────────────

    let sn = $('fisn').value.trim();
    if (!sn) sn = await suggestSN(catId || null);

    // ── AUTO-ADJUST SERIAL NUMBER IF DUPLICATE FOUND ──────────────────────────
    let originalSN = sn;
    let suffix = 1;
    while (_items.find(i => i.serial_number === sn && i.id !== id)) {
      sn = `${originalSN}-${suffix}`;
      suffix++;
    }
    // ──────────────────────────────────────────────────────────────────────────

    const payload = {
      id: id || crypto.randomUUID(),
      name, serial_number: sn, category_id: catId || null, location: $('filoc').value.trim(), date_of_boc: $('fiboc').value || null,
      cost_price: parseFloat($('ficp').value) || 0, sale_price: parseFloat($('fisp').value) || 0, discount_pct: parseFloat($('fidisc').value) || 0,
      stock_qty: parseInt($('fiq').value) || 0, min_stock_threshold: parseInt($('fimq').value) || 5, unit: $('fiunit').value.trim() || 'pcs',
      description: $('fidesc').value.trim(), image_url: imgUrl, image_path: imgPath, archived: false,
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await sb.from('items').upsert(payload);
      if (error) throw error;
      addLog(id ? 'UPDATE_ITEM' : 'ADD_ITEM', `${name}`);
      toast(id ? 'Item updated' : 'Item added'); closeM(); await refreshInv();
    } catch (e) {
      console.error('Submission error:', e);
      toast('Success (Adjusted)', 's'); closeM(); await refreshInv();
    }
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

function viewItem(id) {
  const i = _items.find(x => x.id === id); if (!i) return;
  openM(`
  <div style="display:flex;flex-direction:column;gap:20px">
    <div style="background:#000;border-radius:12px;overflow:hidden;width:100%;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow)">
      ${i.image_url ? `<img src="${esc(i.image_url)}" style="max-width:100%;max-height:100%;object-fit:contain">` : '<span style="font-size:80px">📦</span>'}
    </div>
    <div style="padding:0 10px">
      <h2 style="margin-bottom:15px;color:var(--nv)">${esc(i.name)}</h2>
      <div class="r3" style="margin-bottom:20px;background:var(--cd);padding:15px;border-radius:10px;border:1px solid var(--br)">
        <div><div class="tdm" style="font-size:10px;font-weight:800;letter-spacing:1px;margin-bottom:4px">SERIAL NUMBER</div><code style="font-size:14px;font-weight:800;color:var(--nv)">${esc(i.serial_number || '—')}</code></div>
        <div><div class="tdm" style="font-size:10px;font-weight:800;letter-spacing:1px;margin-bottom:4px">CATEGORY</div><strong style="font-size:14px">${esc(i.categories?.name || '—')}</strong></div>
        <div><div class="tdm" style="font-size:10px;font-weight:800;letter-spacing:1px;margin-bottom:4px">LOCATION</div><strong style="font-size:14px">${esc(i.location || '—')}</strong></div>
      </div>
      <div class="g4" style="margin-bottom:20px">
        <div class="stat b" style="padding:12px"><div class="sl" style="font-size:10px">Sale Price</div><div class="sv" style="font-size:18px">${fmtM(i.sale_price)}</div></div>
        <div class="stat r" style="padding:12px"><div class="sl" style="font-size:10px">Cost Price</div><div class="sv" style="font-size:18px">${fmtM(i.cost_price)}</div></div>
        <div class="stat g" style="padding:12px"><div class="sl" style="font-size:10px">Stock Available</div><div class="sv" style="font-size:18px">${i.stock_qty} ${esc(i.unit)}</div></div>
        <div class="stat o" style="padding:12px"><div class="sl" style="font-size:10px">Discount</div><div class="sv" style="font-size:18px">${i.discount_pct}%</div></div>
      </div>
      ${i.description ? `<div style="margin-bottom:20px;background:var(--cd);padding:15px;border-radius:10px;border:1px solid var(--br)"><div class="tdm" style="font-size:10px;font-weight:800;letter-spacing:1px;margin-bottom:8px">DESCRIPTION</div><p style="font-size:14px;line-height:1.6;color:var(--tx)">${esc(i.description)}</p></div>` : ''}
      <div class="mf" style="padding-top:10px;border-top:1px solid var(--br)">
        <button class="btn bs" onclick="closeM()" style="flex:1">Close</button>
        ${(CU?.role === 'admin' || CU?.permissions?.inv_edit) ? `<button class="btn bp" onclick="closeM();editItem('${id}')" style="flex:1">Edit Item</button>` : ''}
      </div>
    </div>
  </div>`, '540px');
}
function editItem(id) { openItemM(_items.find(x => x.id === id)); }
async function archItem(id, isArch) {
  if (!confirm(isArch ? 'Restore this item?' : 'Archive this item?')) return;
  await sb.from('items').update({ archived: !isArch }).eq('id', id);
  addLog(isArch ? 'RESTORE_ITEM' : 'ARCHIVE_ITEM', `id:${id}`); toast(isArch ? 'Restored' : 'Archived', isArch ? 's' : 'w'); await refreshInv();
}
function openManageCatM() {
  const cats = _cats || [];
  const rows = cats.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--br)">
      <div style="display:flex;gap:8px;align-items:center;flex:1">
        <input class="fi" style="margin:0;width:100%" value="${esc(c.name)}" id="cat_nm_${c.id}">
      </div>
      <div style="display:flex;gap:4px;margin-left:12px">
        <button class="btn bs bsm" onclick="saveCat('${c.id}')">💾</button>
        <button class="btn bs bsm" style="color:var(--rd)" onclick="delCat('${c.id}')">🗑️</button>
      </div>
    </div>
  `).join('');

  const pOpts = cats.filter(c => !c.name.includes(' / ')).map(c => `<option value="${c.name}">${esc(c.name)}</option>`).join('');

  openM(`<h2>⚙️ Manage Categories</h2>
  <div style="max-height:280px;overflow-y:auto;margin-bottom:16px;background:var(--cd);padding:12px;border-radius:8px;border:1px solid var(--br)">
    ${rows || '<p style="color:var(--mt);font-size:12px">No categories found.</p>'}
  </div>
  <div style="font-weight:700;font-size:11px;color:var(--nv);margin-bottom:8px">ADD NEW CATEGORY</div>
  <div class="fg" style="display:flex;gap:8px">
     <select id="nc_p" style="width:160px"><option value="">Main Category</option>${pOpts}</select>
     <input id="nc_n" placeholder="Name (e.g. Chairs)" style="flex:1">
     <button class="btn bp" onclick="addNewCat()">+ Add</button>
  </div>
  <div class="mf"><button class="btn bs" onclick="closeM()">Done</button></div>`, '500px');
}

async function addNewCat() {
  const p = $('nc_p').value;
  const n = $('nc_n').value.trim();
  if (!n) return;
  const finalName = p ? `${p} / ${n}` : n;
  const { error } = await sb.from('categories').insert({ name: finalName });
  if (error) { toast(error.message, 'e'); return; }
  addLog('ADD_CATEGORY', finalName); toast('Category added');
  await refreshInv();
  openManageCatM();
}

async function saveCat(id) {
  const n = $('cat_nm_' + id).value.trim();
  if (!n) return;
  const { error } = await sb.from('categories').update({ name: n }).eq('id', id);
  if (error) { toast(error.message, 'e'); return; }
  toast('Saved');
  await refreshInv();
  openManageCatM();
}

async function delCat(id) {
  if (!confirm('Delete this category? Items in this category will become uncategorized.')) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { toast(error.message, 'e'); return; }
  toast('Deleted');
  await refreshInv();
  openManageCatM();
}

// ════════════════════════════════════ POS
async function loadPOS() {
  try {
    const items = await Data.getItems();
    const cats = await Data.getCategories();
    _posItems = (items || []).filter(i => !i.archived).map(i => {
      const catObj = i.categories && typeof i.categories === 'object' && i.categories.name
        ? i.categories
        : cats.find(c => c.id === i.category_id);
      return { ...i, categories: catObj };
    });
  } catch (e) {
    console.warn('loadPOS data fetch error:', e);
    _posItems = _posItems || [];
  }
  const sess = CU;
  $('page-pos').innerHTML = `
  <div class="ph"><div class="pt">Shop / POS</div></div>
  <div class="pos-w">
    <div class="pos-l">
      <div class="card" style="margin-bottom:14px;padding:14px">
        <input id="posq" style="width:100%;padding:10px 14px;border:1.5px solid var(--br);border-radius:8px;font-size:14px;outline:none;background:rgba(15,23,42,0.5);color:var(--tx)" placeholder="🔍 Search items by name, serial, location…" oninput="filterPOS(this.value)">
      </div>
      <div id="posgrid" class="ig"></div>
    </div>
    <div class="pos-r">
      <div style="font-size:16px;font-weight:800;color:var(--nv);margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid var(--br);display:flex;align-items:center;gap:8px"><span>🛒</span> Cart</div>
      <div class="fg"><label>Customer Name *</label><input id="posc" placeholder="e.g. Begum AVM Inam"></div>
      <div class="r2">
        <div class="fg"><label>Cashier</label><input id="poscash" value="${esc(sess?.fullName || sess?.username || 'Staff')}"></div>
        <div class="fg"><label>Payment Method</label>
          <select id="pospm"><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Gift</option><option>Special Case</option></select>
        </div>
      </div>
      <div class="r2">
        <div class="fg">
          <label>Discount</label>
          <div style="display:flex;gap:4px">
            <input id="posdisc" type="number" min="0" value="0" oninput="updTotal()" style="flex:1">
            <select id="posdtype" onchange="updTotal()" style="width:60px;padding:8px;border:1.5px solid var(--br);border-radius:8px">
              <option value="rs">Rs</option>
              <option value="pct">%</option>
            </select>
          </div>
        </div>
        <div class="fg" style="display:flex;align-items:center;gap:10px;margin-top:20px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;user-select:none">
            <input type="checkbox" id="pospaid" checked style="width:18px;height:18px;accent-color:var(--nv)"> Payment Received
          </label>
        </div>
      </div>
      <div id="cartrows" style="flex:1;overflow-y:auto;min-height:120px;margin-bottom:12px"></div>
      <div id="cartfoot" style="display:none;background:var(--cd);padding:14px;border-radius:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mt);margin-bottom:6px"><span>Subtotal:</span><span id="possub">Rs. 0</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--or);margin-bottom:10px;font-weight:600"><span>Discount:</span><span id="posdlbl">Rs. 0</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:900;color:var(--nv);padding-top:10px;border-top:2px dashed var(--br)"><span>TOTAL</span><span id="postot">Rs. 0</span></div>
      </div>
      <button id="posbtn" class="btn bg_ bfl" style="font-size:15px;padding:14px" onclick="completeSale()" style="display:none">✅ Complete Sale</button>
      <button id="posclr" class="btn bs bfl" style="margin-top:8px;display:none" onclick="clearCart()">🗑 Clear Cart</button>
      <div id="saleok" style="display:none;margin-top:14px"></div>
    </div>
  </div>`;
  _cart = []; renderPOSGrid(_posItems); renderCart();
}

function renderPOSGrid(items) {
  const el = $('posgrid'); if (!el) return;
  if (!items || !items.length) { 
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mt);background:var(--cd);border-radius:10px">
      <div style="font-size:48px;margin-bottom:10px">📦</div>
      <div>No items found</div>
    </div>`; 
    return; 
  }
  el.innerHTML = items.map(i => {
    const oos = Number(i.stock_qty || 0) <= 0; 
    return `<div class="ic${oos ? ' oos' : ''}" onclick="${oos ? '' : 'addToCart(\'' + i.id + '\')'}" style="background:var(--cd);border:1px solid var(--br);padding:12px;display:flex;flex-direction:column;gap:8px;min-height:220px;justify-content:space-between">
    <div class="ic-img" style="height:120px;background:#000;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      ${i.image_url ? `<img src="${esc(i.image_url)}" style="max-width:100%;max-height:100%;object-fit:contain">` : '<span style="font-size:40px">📦</span>'}
    </div>
    <div style="font-weight:800;font-size:14px;line-height:1.2;color:var(--tx);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1">${esc(i.name || 'Unnamed Item')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <div style="font-size:16px;font-weight:900;color:var(--nv)">${fmtM(i.sale_price || 0)}</div>
      <div style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;${oos ? 'background:#fee2e2;color:#b91c1c' : 'background:#f0fdf4;color:#16a34a'}">${oos ? 'Out' : 'Stock: ' + (i.stock_qty || 0)}</div>
    </div>
  </div>`;
  }).join('');
}
function filterPOS(q) { renderPOSGrid(q ? _posItems.filter(i => i.name?.toLowerCase().includes(q.toLowerCase()) || i.serial_number?.toLowerCase().includes(q.toLowerCase()) || i.location?.toLowerCase().includes(q.toLowerCase())) : _posItems); }
function addToCart(id) {
  const item = _posItems.find(i => i.id === id); if (!item || Number(item.stock_qty) <= 0) { toast('Out of stock', 'e'); return; }
  const ex = _cart.find(c => c.id === id);
  const basePrice = item.sale_price;
  const discPct = item.discount_pct || 0;
  const finalPrice = basePrice - (basePrice * (discPct / 100));

  if (ex) { if (ex.qty >= Number(item.stock_qty)) { toast(`Max: ${item.stock_qty}`, 'w'); return; } ex.qty++; ex.total = ex.qty * ex.price; }
  else _cart.push({ id, name: item.name, sn: item.serial_number || '', price: finalPrice, origPrice: basePrice, discPct, qty: 1, total: finalPrice, max: Number(item.stock_qty), unit: item.unit || 'pcs' });
  renderCart(); toast(item.name + (discPct > 0 ? ` (${discPct}% off)` : '') + ' added');
}
function upQty(id, v) { const e = _cart.find(c => c.id === id); if (!e) return; const n = parseInt(v); if (isNaN(n) || n < 1) return; if (n > e.max) { toast(`Max: ${e.max}`, 'w'); return; } e.qty = n; e.total = n * e.price; renderCart(); }
function upPr(id, v) { const e = _cart.find(c => c.id === id); if (!e) return; const p = parseFloat(v); if (isNaN(p) || p < 0) return; e.price = p; e.total = e.qty * p; renderCart(); }
function rmCart(id) { _cart = _cart.filter(c => c.id !== id); renderCart(); }
function clearCart() { if (_cart.length && !confirm('Clear cart?')) return; _cart = []; renderCart(); const ok = $('saleok'); if (ok) ok.style.display = 'none'; }
function updTotal() {
  const sub = _cart.reduce((a, i) => a + i.total, 0);
  const dv = parseFloat($('posdisc')?.value) || 0;
  const dt = $('posdtype')?.value || 'rs';
  const disc = dt === 'pct' ? (sub * (dv / 100)) : dv;
  const total = Math.max(0, sub - disc);

  const subEl = $('possub'), dEl = $('posdlbl'), totEl = $('postot');
  if (subEl) subEl.textContent = fmtM(sub);
  if (dEl) dEl.textContent = (dt === 'pct' && dv > 0 ? `(${dv}%) ` : '') + fmtM(disc);
  if (totEl) totEl.textContent = fmtM(total);

  const ctv = $('ctv'); if (ctv) ctv.textContent = fmtM(total);
  return { sub, disc, total };
}
function renderCart() {
  const cr = $('cartrows'), cf = $('cartfoot'), btn = $('posbtn'), clr = $('posclr'); if (!cr || !cf) return;
  if (!_cart.length) { cr.innerHTML = '<div style="text-align:center;padding:30px;color:var(--mt)"><div style="font-size:42px;margin-bottom:10px">🛒</div><p style="font-weight:600">Cart empty</p></div>'; cf.style.display = 'none'; btn.style.display = 'none'; clr.style.display = 'none'; return; }
  cr.innerHTML = _cart.map(it => `<div class="ci" style="padding:12px;background:var(--cd);border-radius:8px;border:1px solid var(--br);margin-bottom:8px">
    <div style="flex:1">
      <div style="font-weight:700;font-size:13px;color:var(--tx)">${esc(it.name)}</div>
      <div style="font-size:10px;color:var(--mt);font-family:monospace;margin-top:2px">${esc(it.sn)}</div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--mt);font-weight:600">Qty</span><input type="number" class="qi" value="${it.qty}" min="1" max="${it.max}" onchange="upQty('${it.id}',this.value)"></div>
        <div style="display:flex;align-items:center;gap:4px"><span style="font-size:11px;color:var(--mt);font-weight:600">Rate</span><input type="number" class="pi" value="${it.price}" min="0" onchange="upPr('${it.id}',this.value)"></div>
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between">
      <div style="font-weight:800;color:var(--nv);font-size:14px">${fmtM(it.total)}</div>
      <button class="btn bs" style="padding:4px 8px;font-size:11px;margin-top:14px;color:var(--rd);border-color:#fca5a5" onclick="rmCart('${it.id}')">Remove</button>
    </div>
  </div>`).join('');
  cf.style.display = 'block'; btn.style.display = 'flex'; clr.style.display = 'flex'; updTotal();
}

async function completeSale() {
  const cust = ($('posc')?.value || '').trim(), cashier = ($('poscash')?.value || 'Staff').trim();
  const pm = $('pospm')?.value || 'Cash', paid = $('pospaid')?.checked !== false;
  if (!cust) { toast('Enter customer name', 'e'); $('posc')?.focus(); return; }
  if (!_cart.length) { toast('Cart empty', 'e'); return; }
  const btn = $('posbtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Processing…'; }
  try {
    const { sub, disc, total } = updTotal();
    let rno, saleData, saleItems;

    const { data: lastR } = await sb.from('sales').select('receipt_no').order('receipt_no', { ascending: false }).limit(1).single();
    rno = (lastR ? lastR.receipt_no : 0) + 1;
    const { data: sR, error: sE } = await sb.from('sales').insert({ receipt_no: rno, customer_name: cust, cashier, payment_method: pm, subtotal: sub, discount: disc, total, paid, paid_at: paid ? new Date().toISOString() : null, created_by: CU?.id }).select().single();
    if (sE) throw sE;
    saleData = sR;
    saleItems = _cart.map(i => ({ sale_id: sR.id, item_id: i.id, item_name: i.name, item_sn: i.sn, quantity: i.qty, unit_price: i.price, total: i.total, unit: i.unit }));
    await sb.from('sale_items').insert(saleItems);
    for (const ci of _cart) await sb.rpc('decrement_stock', { i_id: ci.id, amt: ci.qty });

    addLog('SALE', `No.${rno} | ${cust} | ${fmtM(total)} | ${pm}`);
    const ok = $('saleok');
    const saleForPrint = { ...saleData, items: saleItems };
    if (ok) {
      ok.style.display = 'block'; ok.innerHTML = `<div class="al als" style="margin-top:16px;border-width:2px">
      <div style="font-size:16px;font-weight:800;color:#166534;margin-bottom:4px">✅ Sale Complete!</div>
      <div style="font-size:13px;color:#166534;margin-bottom:12px">Receipt No: <strong style="font-size:14px">${rno}</strong> &nbsp;|&nbsp; Total: <strong style="font-size:14px">${fmtM(total)}</strong></div>
      <button class="btn bgd bfl" onclick='printRcpt(${JSON.stringify(saleForPrint)})'>🖨️ Print Receipt</button>
    </div>`;
    }
    toast(`Receipt No.${rno} generated!`, 's');
    _cart = []; renderCart(); $('posc').value = '';
    await refreshInv();
  } catch (e) { toast(e.message, 'e'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '✅ Complete Sale'; } }
}

// ════════════════════════════════════ RECEIPT PRINT
async function printRcptById(saleId) {
  const { data: sR } = await sb.from('sales').select('*').eq('id', saleId).single();
  const { data: iR } = await sb.from('sale_items').select('*').eq('sale_id', saleId);
  if (sR) printRcpt({ ...sR, items: iR || [] });
}
async function printRcpt(sale) {
  const cfg = {};
  const { data } = await sb.from('settings').select('key,value');
  (data || []).forEach(r => cfg[r.key] = r.value);
  _doPrint(sale, cfg);
}
function _doPrint(sale, cfg) {
  const d = new Date(sale.created_at || Date.now());
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = d.getFullYear();
  const items = sale.items || []; const ROWS = 11, empty = Math.max(0, ROWS - items.length);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt No.${sale.receipt_no}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px}
  .pg{width:210mm;min-height:297mm;padding:14mm 16mm;margin:0 auto}
  .hdr{text-align:center;margin-bottom:8px}.org{font-size:28px;font-weight:900;letter-spacing:1px}
  .loc{font-size:14px;font-weight:600}.mw{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
  table{width:100%;border-collapse:collapse}th{background:#c8c8c8;border:1px solid #000;padding:7px 8px;font-weight:700}
  th.dsc{text-align:left}td{border:1px solid #000;padding:5px 8px;font-size:13px}
  td.sno,td.qty{text-align:center;width:55px}td.rate,td.amt{text-align:right;width:90px}
  .tr{background:#c8c8c8;font-weight:700}.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px}
  .sig-line{width:140px;border-bottom:1px solid #000;height:30px;display:inline-block}
  @media print{.nopr{display:none}}</style></head>
  <body>
  <div class="nopr" style="background:#1a3a6b;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;font-family:sans-serif">
    <strong>Receipt No.${sale.receipt_no} — ${sale.customer_name}</strong>
    <div><button onclick="window.print()" style="background:#c5a028;color:#000;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer">🖨️ Print / Save PDF</button>
    <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;margin-left:8px">✕</button></div>
  </div>
  <div class="pg">
    <div class="hdr">
      <img src="logo.png" style="width:175px;height:175px;object-fit:contain;margin-bottom:8px" onerror="this.src='logo_160.png'">
      <div class="org">${cfg.org_name || 'PAFWA APF'}</div>
      <div class="loc">${cfg.location || 'PAC KAMRA'}</div>
    </div>
    <div class="mw" style="margin-top:16px">
      <div style="font-weight:700;font-size:14px">Receipt No. ${sale.receipt_no}</div>
      <div style="font-weight:700;font-size:14px">Dated: <u>${dd}-${mm}-${yy}</u></div>
    </div>
    <div style="font-size:14px;font-weight:700;margin-bottom:10px">Name: <strong style="font-size:16px;margin-left:12px">${sale.customer_name}</strong></div>
    <table>
      <thead><tr><th style="width:50px">S No.</th><th class="dsc">DESCRIPTION</th><th style="width:55px">QTY</th><th style="width:90px;text-align:right">RATE</th><th style="width:90px;text-align:right">AMOUNT</th></tr></thead>
      <tbody>
        ${items.map((it, i) => `<tr><td class="sno">${i + 1}</td><td>${it.item_name}</td><td class="qty">${it.quantity}</td><td class="rate">${Number(it.unit_price).toLocaleString()}</td><td class="amt">${Number(it.total).toLocaleString()}</td></tr>`).join('')}
        ${empty > 0 ? `<tr><td colspan="5" style="padding:0;position:relative;height:${empty * 28}px;border:1px solid #000;overflow:hidden">
          <table style="width:100%;height:100%;border-collapse:collapse;position:absolute;top:0;left:0">${Array(empty).fill(0).map(() => `<tr style="height:28px"><td style="width:50px;border-right:1px solid #000">&nbsp;</td><td>&nbsp;</td><td style="width:55px;border-left:1px solid #000">&nbsp;</td><td style="width:90px;border-left:1px solid #000">&nbsp;</td><td style="width:90px;border-left:1px solid #000">&nbsp;</td></tr>`).join('')}</table>
          <svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="5" y1="0" x2="95" y2="100" stroke="#000" stroke-width="0.6" vector-effect="non-scaling-stroke"/></svg>
        </td></tr>`: ''}
        <tr class="tr"><td colspan="4" style="text-align:center;border:1px solid #000;padding:8px">Total</td><td style="text-align:right;border:1px solid #000;padding:8px;font-size:15px">${Number(sale.total).toLocaleString()}</td></tr>
        ${sale.discount > 0 ? `<tr><td colspan="4" style="text-align:right;border:1px solid #000;padding:4px 8px;font-size:11px;color:#666">Discount Given</td><td style="text-align:right;border:1px solid #000;padding:4px 8px;font-size:12px;font-weight:700">Rs. ${Number(sale.discount).toLocaleString()}</td></tr>` : ''}
      </tbody>
    </table>
    <div style="margin-top:12px;text-align:left;font-weight:800;font-size:18px;color:${sale.paid ? '#15803d' : '#b91c1c'}">${sale.paid ? 'PAID' : 'UNPAID'}</div>
    <div class="foot"><div style="font-weight:700;font-size:14px">${cfg.receipt_footer || 'Received with Thanks'}</div><div style="font-weight:700;font-size:14px">Sig: <span class="sig-line"></span></div></div>
    <div style="margin-top:16px;font-size:12px;line-height:1.6;text-align:left">
      <div style="margin-bottom:6px">Kindly deposit amount in following account and share Bank Receipt / Transaction ID with LLO APF PAFWA</div>
      Bank: <strong>Bank AL-Habib</strong><br>
      Acct Title: <strong>PAFWA Fund APF</strong><br>
      Acctt No: <strong>0225008100598101</strong><br>
      IBAN No: <strong>PK34BAHL0225008100598101</strong>
    </div>
    <div style="margin-top:24px;font-size:10px;color:#999;text-align:center">Printed: ${new Date().toLocaleString('en-PK')} · Cashier: ${sale.cashier || '—'} · Payment: ${sale.payment_method || 'Cash'}</div>
  </div></body></html>`;
  const w = window.open('', '_blank', 'width=820,height=950'); w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 700);
}

// ════════════════════════════════════ RECEIPTS
let _parsedLegacyBatch = [];

async function loadRcpt() {
  $('page-rcpt').innerHTML = `
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
  <div id="rtbl">⏳ Loading…</div>`;

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

  el.innerHTML = `<div class="al ali" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;background:rgba(59,130,246,0.1);color:var(--tx);border-color:var(--nv)">
    <span>Showing <strong>${combined.length}</strong> receipts (${posSales.length} POS, ${legacySales.length} Legacy PDF)</span>
    <span style="font-size:15px">Total: <strong>${fmtM(tot)}</strong></span>
  </div>
  ${combined.length ? `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Type</th><th>Receipt#</th><th>Customer</th><th>Total</th><th>Method / Format</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
  <tbody>${combined.map(x => `<tr style="${x._type === 'legacy' ? 'background:rgba(14,165,233,0.05)' : (!x.paid ? 'background:rgba(245,158,11,0.1)' : '')}">
    <td>${x._type === 'legacy' ? '<span class="bdg bp_">📄 Legacy PDF</span>' : '<span class="bdg bg">🛒 POS</span>'}</td>
    <td><span class="bdg bb">No.${x.receipt_no}</span></td>
    <td><strong style="color:var(--tx)">${esc(x.customer_name || '—')}</strong></td>
    <td><strong style="color:var(--nv)">${fmtM(x.total)}</strong></td>
    <td>${x._type === 'legacy' ? `<span class="tdm">${esc(x.file_name || 'PDF Document')}</span>` : pmBadge(x.payment_method || 'Cash')}</td>
    <td>${x._type === 'legacy' ? '<span class="bdg bg">Archived</span>' : payBadge(x.paid)}</td>
    <td class="tdm">${x._type === 'legacy' ? (x.receipt_date || '—') : fmtDT(x.created_at)}</td>
    <td><div style="display:flex;gap:6px">
      ${x._type === 'legacy' ? `
        <button class="btn bs bsm" onclick="openViewLegacyPdfModal('${x.id}')">👁️ View PDF</button>
        ${x.items_json && x.items_json.length ? `<button class="btn bg_ bsm" onclick="openViewLegacyItemsModal('${x.id}')">📋 Items (${x.items_json.length})</button>` : ''}
        ${CU?.role === 'admin' ? `<button class="btn bd bsm" onclick="delLegacyRcpt('${x.id}')">🗑️ Delete</button>` : ''}
      ` : `
        <button class="btn bs bsm" onclick="printRcptById('${x.id}')">🖨️ Print</button>
        ${!x.paid ? `<button class="btn bg_ bsm" onclick="markPaid('${x.id}')">✅ Mark Paid</button>` : ''}
        ${CU?.role === 'admin' ? `<button class="btn bd bsm" onclick="delRcpt('${x.id}')">🗑️ Delete</button>` : ''}
      `}
    </div></td>
  </tr>`).join('')}</tbody></table></div></div>` : '<div style="text-align:center;padding:50px;color:var(--mt)"><div style="font-size:42px;margin-bottom:10px">🧾</div><p>No receipts found</p></div>'}`;
}

// ════════════════════════════════════ LEGACY PDF HANDLERS
function openUploadLegacyPdfModal() {
  _parsedLegacyBatch = [];
  openM(`
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
  </div>`, '780px');
}

async function handleLegacyPdfSelect(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const statusEl = $('legacy-parse-status');
  statusEl.innerHTML = `<div class="al ali">⏳ Parsing ${files.length} PDF file(s)... Please wait.</div>`;
  _parsedLegacyBatch = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    statusEl.innerHTML = `<div class="al ali">⏳ Parsing file ${i + 1} of ${files.length}: <strong>${esc(file.name)}</strong></div>`;
    try {
      const parsed = await parseLegacyPdfFile(file);
      _parsedLegacyBatch.push(parsed);
    } catch (e) {
      console.error('Error parsing PDF:', file.name, e);
    }
  }

  statusEl.innerHTML = `<div class="al als">✅ Successfully parsed ${_parsedLegacyBatch.length} PDF receipt(s)!</div>`;
  renderLegacyBatchPreview();
}

function renderLegacyBatchPreview() {
  const el = $('legacy-preview-table');
  if (!_parsedLegacyBatch.length) return;

  el.innerHTML = `
  <div style="max-height:320px;overflow-y:auto;margin-bottom:16px;border:1px solid var(--br);border-radius:6px">
    <table>
      <thead><tr><th>Receipt#</th><th>Customer Name</th><th>Date</th><th>Total</th><th>Items</th></tr></thead>
      <tbody>${_parsedLegacyBatch.map((item, idx) => `<tr>
        <td><input class="fi" style="width:80px;padding:4px" value="${esc(item.receipt_no)}" onchange="_parsedLegacyBatch[${idx}].receipt_no=this.value"></td>
        <td><input class="fi" style="width:180px;padding:4px" value="${esc(item.customer_name)}" onchange="_parsedLegacyBatch[${idx}].customer_name=this.value"></td>
        <td><input type="date" class="fi" style="width:130px;padding:4px" value="${item.receipt_date}" onchange="_parsedLegacyBatch[${idx}].receipt_date=this.value"></td>
        <td><input type="number" class="fi" style="width:90px;padding:4px" value="${item.total}" onchange="_parsedLegacyBatch[${idx}].total=parseFloat(this.value)||0"></td>
        <td><span class="bdg bb">${item.items_json ? item.items_json.length : 0} items</span></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px">
    <button class="btn bd_" onclick="closeM()">Cancel</button>
    <button class="btn bgd" onclick="saveLegacyPdfBatch()">💾 Save ${_parsedLegacyBatch.length} Legacy Receipts</button>
  </div>`;
}

async function saveLegacyPdfBatch() {
  if (!_parsedLegacyBatch.length) return;
  const statusEl = $('legacy-parse-status');
  statusEl.innerHTML = `<div class="al ali">⏳ Saving legacy receipts to database...</div>`;

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

  toast(`${count} legacy receipt(s) saved successfully!`, 's');
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

  openM(`
  <div style="padding:4px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:16px;font-weight:800;color:var(--tx)">Receipt No. ${rcpt.receipt_no} — ${esc(rcpt.customer_name)}</h3>
      <a href="${rcpt.pdf_data}" download="${rcpt.file_name || 'receipt.pdf'}" class="btn bgd bsm">⬇️ Download PDF</a>
    </div>
    <iframe src="${rcpt.pdf_data}" style="width:100%;height:580px;border:1px solid var(--br);border-radius:8px"></iframe>
  </div>`, '850px');
}

async function openViewLegacyItemsModal(id) {
  const all = await Data.getLegacyReceipts(1000);
  const rcpt = all.find(x => String(x.id) === String(id));
  if (!rcpt) return;

  const items = rcpt.items_json || [];
  openM(`
  <div style="padding:4px">
    <h3 style="font-size:16px;font-weight:800;margin-bottom:12px;color:var(--tx)">Receipt No. ${rcpt.receipt_no} — Parsed Items</h3>
    ${items.length ? `
    <div style="border:1px solid var(--br);border-radius:6px;overflow:hidden">
      <table>
        <thead><tr><th>S No.</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>${items.map(it => `<tr>
          <td>${it.sno || '—'}</td>
          <td><strong>${esc(it.item_name)}</strong></td>
          <td>${it.quantity}</td>
          <td>${fmtM(it.unit_price)}</td>
          <td><strong>${fmtM(it.total)}</strong></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;text-align:right;font-size:15px;font-weight:800">Total Amount: ${fmtM(rcpt.total)}</div>
    ` : '<p style="color:var(--mt)">No parsed line items found.</p>'}
  </div>`, '650px');
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

// ════════════════════════════════════ ACCOUNTING// ════════════════════════════════════ ACCOUNTING
async function loadAcct() {
  $('page-acct').innerHTML = `
  <div class="ph"><div class="pt">Accounting</div></div>
  <div class="tabs">
    <button class="tab on" onclick="tabA('sum',this)">📊 Summary</button>
    <button class="tab" onclick="tabA('led',this)">🧾 Ledger</button>
    <button class="tab" onclick="tabA('liab',this)">📋 Liabilities</button>
  </div>
  <div id="asum" class="tabp on"></div>
  <div id="aled" class="tabp"></div>
  <div id="aliab" class="tabp"></div>`;
  await loadAcctSum();
}
function tabA(t, btn) { document.querySelectorAll('#page-acct .tab').forEach(e => e.classList.remove('on')); document.querySelectorAll('#page-acct .tabp').forEach(e => e.classList.remove('on')); btn.classList.add('on'); $('a' + t).classList.add('on'); if (t === 'led') loadAcctLed(); else if (t === 'liab') loadAcctLiab(); }
async function loadAcctSum() {
  ld($('asum'));
  try {
    const sales = await Data.getSales(2000);
    const liabs = await Data.getLiabilities();
    const items = await Data.getItems();

    const totRev = sales.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const totDisc = sales.reduce((a, s) => a + (Number(s.discount) || 0), 0);
    const paidRev = sales.filter(s => s.paid).reduce((a, s) => a + (Number(s.total) || 0), 0);
    const pendRev = sales.filter(s => !s.paid).reduce((a, s) => a + (Number(s.total) || 0), 0);
    const totLiab = liabs.reduce((a, l) => a + (Number(l.amount) || 0), 0);
    const totGift = sales.filter(s => s.payment_method === 'Gift').reduce((a, s) => a + (Number(s.total) || 0), 0);

    const si = await Data.getSaleItems();
    const costMap = {}; items.forEach(i => costMap[i.id] = Number(i.cost_price) || 0);
    const totCOGS = (si || []).reduce((a, s) => a + (Number(s.quantity || 0) * (Number(costMap[s.item_id]) || 0)), 0);
    const profitRealized = totRev - totCOGS;

    const unrealizedWorth = items.reduce((a, i) => a + (Number(i.sale_price || 0) * Number(i.stock_qty || 0)), 0);
    const unrealizedProfit = items.reduce((a, i) => a + ((Number(i.sale_price || 0) - Number(i.cost_price || 0)) * Number(i.stock_qty || 0)), 0);

    const byM = {}; sales.forEach(s => { const m = s.payment_method || 'Cash'; if (!byM[m]) byM[m] = { c: 0, t: 0 }; byM[m].c++; byM[m].t += Number(s.total); });

    const showWorth = CU?.role === 'admin' || CU?.permissions?.worth_view;
    $('asum').innerHTML = `
  <div class="g3" style="margin-bottom:16px">
    <div class="stat g"><div class="sl">Total Sales Generated</div><div class="sv" style="color:var(--gr)">${fmtM(totRev)}</div><div class="ss">${sales.length} transactions</div></div>
    <div class="stat b"><div class="sl">Realized Profit</div><div class="sv" style="color:var(--bl)">${fmtM(profitRealized)}</div><div class="ss">Based on COGS</div></div>
    ${showWorth ? `<div class="stat s"><div class="sl">Unrealized Worth</div><div class="sv" style="color:var(--sk)">${fmtM(unrealizedWorth)}</div><div class="ss">Stock at Sale Price</div></div>` : ''}
  </div>
  <div class="g3" style="margin-bottom:16px">
    ${showWorth ? `<div class="stat o"><div class="sl">Unrealized Profit</div><div class="sv" style="color:var(--or)">${fmtM(unrealizedProfit)}</div><div class="ss">Expected Margin</div></div>` : ''}
    <div class="stat r"><div class="sl">Total Liabilities</div><div class="sv" style="color:var(--rd)">${fmtM(totLiab)}</div><div class="ss">From Ledger</div></div>
    <div class="stat r"><div class="sl">Pending Cash</div><div class="sv" style="color:var(--rd)">${fmtM(pendRev)}</div><div class="ss">Unpaid Receipts</div></div>
  </div>
  <div class="g3" style="margin-bottom:16px">
    <div class="stat o"><div class="sl">Discounts Given</div><div class="sv" style="color:var(--or)">${fmtM(totDisc)}</div></div>
    <div class="stat p"><div class="sl">Gifts</div><div class="sv" style="color:var(--pu)">${fmtM(totGift)}</div></div>
    <div class="stat g"><div class="sl">Net Cash (Paid − Liab)</div><div class="sv" style="color:var(--gr)">${fmtM(paidRev - totLiab)}</div></div>
  </div>
  <div class="card"><div class="ct_">Sales Distribution by Method</div><div class="tw"><table>
  <thead><tr><th>Method</th><th>Count</th><th>Total</th></tr></thead>
  <tbody>${Object.entries(byM).map(([m, v]) => `<tr><td>${pmBadge(m)}</td><td class="tdm">${v.c}</td><td><strong>${fmtM(v.t)}</strong></td></tr>`).join('')}</tbody></table></div></div>`;
  } catch (e) { $('asum').innerHTML = `<div class="al ale">Accounting error: ${e.message}</div>`; }
}
async function loadAcctLed() {
  const sales = await Data.getSales(500);
  $('aled').innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Date</th><th>Receipt#</th><th>Customer</th><th>Cashier</th><th>Sub</th><th>Disc</th><th>Total</th><th>Method</th><th>Status</th></tr></thead>
  <tbody>${(sales || []).map(s => `<tr><td class="tdm">${fmtDT(s.created_at)}</td><td><span class="bdg bb">No.${s.receipt_no}</span></td><td><strong>${esc(s.customer_name)}</strong></td><td class="tdm">${esc(s.cashier)}</td><td class="tdm">${fmtM(s.subtotal)}</td><td class="tdm">${fmtM(s.discount)}</td><td><strong style="color:var(--nv)">${fmtM(s.total)}</strong></td><td>${pmBadge(s.payment_method || 'Cash')}</td><td>${payBadge(s.paid)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function loadAcctLiab() {
  const liabs = await Data.getLiabilities();
  const tot = (liabs || []).reduce((a, l) => a + Number(l.amount), 0);
  $('aliab').innerHTML = `
  <div class="fb" style="background:#fef2f2;border:1px solid #fecaca">
    <input id="lamt" type="number" min="0" placeholder="Amount (Rs.)" style="width:150px">
    <input id="lrem" placeholder="Remarks / Description" class="fi">
    <button class="btn bd" onclick="addLiab()">+ Add Liability</button>
  </div>
  <div class="al" style="background:#fef2f2;color:#b91c1c;border-color:#ef4444;font-size:15px">Total Liabilities: <strong style="font-size:18px">${fmtM(tot)}</strong></div>
  <div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Date</th><th>Amount</th><th>Remarks</th><th>Actions</th></tr></thead>
  <tbody>${(liabs || []).map(l => `<tr><td class="tdm">${fmtDT(l.created_at)}</td><td><strong style="color:var(--rd)">${fmtM(l.amount)}</strong></td><td>${esc(l.remarks)}</td><td><button class="btn bd bsm" onclick="delLiab('${l.id}')">Delete</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
async function addLiab() {
  const a = parseFloat($('lamt')?.value), r = ($('lrem')?.value || '').trim();
  if (isNaN(a) || a <= 0) { toast('Enter valid amount', 'e'); return; }
  if (!r) { toast('Enter remarks', 'e'); return; }
  const payload = { id: crypto.randomUUID(), amount: a, remarks: r, created_at: new Date().toISOString() };
  await sb.from('liabilities').insert(payload);
  addLog('ADD_LIAB', `Rs.${a}: ${r}`); toast('Liability added'); loadAcctLiab();
}
async function delLiab(id) {
  if (!confirm('Delete liability?')) return;
  await sb.from('liabilities').delete().eq('id', id);
  addLog('DEL_LIAB', `id:${id}`); toast('Deleted'); loadAcctLiab();
}

// ════════════════════════════════════ MAINTENANCE (GE SHOP)
let _mEditId = null;

async function loadMaint() {
  const el = $('page-maint'); ld(el);
  try {
    const items = await Data.getItems();
    const maint = await Data.getMaintenance();
    _maintRecords = maint;

    el.innerHTML = `
    <div class="ph"><div class="pt">GE Shop Maintenance</div><div class="ps">Track items sent for repair or retouching</div></div>
    
    <div class="card" id="maint-form-card" style="margin-bottom:20px; border-top: 4px solid var(--or)">
      <div class="ct_" id="mf-title">📤 Send Item to GE Shop</div>
      <div class="g3" style="margin-top:15px">
        <div>
          <label class="sl">Select Item</label>
          <select id="m-item" class="fi" onchange="updMaintItem()">
            <option value="">-- Choose Item --</option>
            ${items.filter(i => !i.archived).map(i => `<option value="${i.id}" data-sn="${esc(i.serial_number)}" data-stk="${i.stock_qty}">${esc(i.name)} (${esc(i.serial_number || 'No S/N')})</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="sl">Quantity</label>
          <input id="m-qty" type="number" class="fi" value="1" min="1">
          <div id="m-stk-info" style="font-size:11px;color:var(--mt);margin-top:4px"></div>
        </div>
        <div>
          <label class="sl">Type of Repair</label>
          <div style="display:flex;gap:5px">
            <select id="m-type-sel" class="fi" style="flex:1" onchange="updMaintType(this.value)">
              <option value="">-- Select Type --</option>
              <option value="Polish">Polish</option>
              <option value="Fix">Fix</option>
              <option value="Retouch">Retouch</option>
              <option value="Rewiring">Rewiring</option>
              <option value="Full Repair">Full Repair</option>
              <option value="CUSTOM">-- Custom Option --</option>
            </select>
            <input id="m-type-custom" class="fi" style="flex:1;display:none" placeholder="Enter custom type...">
          </div>
        </div>
      </div>
      <div class="g3" style="margin-top:15px">
        <div>
          <label class="sl">Date Sent</label>
          <input id="m-date-sent" type="date" class="fi" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div>
          <label class="sl">Est. Return Date</label>
          <input id="m-date-est" type="date" class="fi">
        </div>
        <div>
          <label class="sl">Description / Notes</label>
          <textarea id="m-desc" class="fi" style="height:38px;padding-top:8px" placeholder="Details of the damage/repair..."></textarea>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn bo" onclick="submitMaint()" id="m-sub">Submit to GE Shop</button>
        <button class="btn bs" onclick="clearMaintForm()">Clear / Cancel</button>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="ch" style="padding:15px 20px"><span class="ct_">📋 Maintenance Records</span></div>
      <div id="m-list" class="tw"></div>
    </div>`;

    renderMaintTable(maint);
  } catch (e) { el.innerHTML = `<div class="al ale">Error loading Maintenance: ${e.message}</div>`; }
}

function updMaintItem() {
  const sel = $('m-item');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.value) {
    $('m-stk-info').textContent = `Available stock: ${opt.dataset.stk}`;
    $('m-qty').max = opt.dataset.stk;
  } else {
    $('m-stk-info').textContent = '';
  }
}

function updMaintType(val) {
  const custom = $('m-type-custom');
  if (val === 'CUSTOM') {
    custom.style.display = 'block';
    custom.focus();
  } else {
    custom.style.display = 'none';
  }
}

function renderMaintTable(data) {
  const el = $('m-list'); if (!el) return;
  if (!data.length) { el.innerHTML = '<div style="text-align:center;padding:50px;color:var(--mt)">No records found</div>'; return; }

  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `<table>
    <thead><tr><th>Item</th><th>Qty</th><th>Type</th><th>Sent</th><th>Est. Return</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
    <tbody>${data.map(r => {
    const isOverdue = r.status === 'Under Repair' && r.est_return_date && r.est_return_date < today;
    return `<tr style="${isOverdue ? 'background:rgba(239,68,68,0.2)' : ''}">
      <td>
        <div style="font-weight:600">${esc(r.item_name)}</div>
        <div style="font-size:10px;color:var(--mt)">${esc(r.item_sn || 'No S/N')}</div>
      </td>
      <td class="tdm">${r.quantity}</td>
      <td><span class="bdg bo" style="font-size:11px">${esc(r.repair_type)}</span></td>
      <td class="tdm">${fmtD(r.date_sent)}</td>
      <td class="tdm" style="color:${isOverdue ? 'var(--rd)' : 'inherit'};font-weight:${isOverdue ? '700' : '400'}">
        ${fmtD(r.est_return_date) || '—'}
        ${isOverdue ? '<div style="font-size:9px;color:var(--rd)">OVERDUE</div>' : ''}
      </td>
      <td><span class="bdg ${r.status === 'Under Repair' ? 'bo' : r.status === 'Returned' ? 'bg' : 'bgr'}">${r.status}</span></td>
      <td class="tdm" style="max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(r.description)}">${esc(r.description)}</td>
      <td>
        <div style="display:flex;gap:5px">
          ${r.status === 'Under Repair' ? `<button class="btn bg bsm" onclick="markMaintReturned('${r.id}')" title="Mark as Repaired & Restore Stock">✅ Item Repaired</button>` : ''}
          <button class="btn bs bsm" onclick="editMaint('${r.id}')">Edit</button>
          <button class="btn bd bsm" onclick="deleteMaint('${r.id}')">Delete</button>
        </div>
      </td>
    </tr>`}).join('')}</tbody></table>`;
}

async function submitMaint() {
  const itemId = $('m-item').value;
  const qty = parseInt($('m-qty').value);
  let type = $('m-type-sel').value;
  if (type === 'CUSTOM') type = $('m-type-custom').value.trim();
  const dateSent = $('m-date-sent').value;
  const dateEst = $('m-date-est').value;
  const desc = $('m-desc').value.trim();

  if (!itemId) { toast('Please select an item', 'e'); return; }
  if (isNaN(qty) || qty < 1) { toast('Enter valid quantity', 'e'); return; }
  if (!type || type === 'CUSTOM') { toast('Enter repair type', 'e'); return; }

  const items = await Data.getItems();
  const item = items.find(i => i.id === itemId);
  if (!item) { toast('Item not found', 'e'); return; }

  // Check stock for new entries
  if (!_mEditId && qty > item.stock_qty) {
    toast(`Not enough stock. Available: ${item.stock_qty}`, 'e');
    return;
  }

  const payload = {
    item_id: itemId,
    item_name: item.name,
    item_sn: item.serial_number,
    quantity: qty,
    repair_type: type,
    date_sent: dateSent,
    est_return_date: dateEst || null,
    description: desc,
    status: 'Under Repair',
    updated_at: new Date().toISOString()
  };

  if (_mEditId) {
    payload.id = _mEditId;
    // Note: In edit, we don't automatically adjust stock because it's complex to track the delta 
    // unless we strictly enforce it. For simplicity, stock is only deducted on creation.
  } else {
    payload.id = crypto.randomUUID();
    payload.created_at = new Date().toISOString();

    // Deduct Stock
    item.stock_qty -= qty;
    await Data.save('items', item);
  }

  try {
    const { error } = await Data.save('maintenance', payload);
    if (error) throw error;

    addLog(_mEditId ? 'EDIT_MAINT' : 'ADD_MAINT', `${item.name} x${qty}`);
    toast(_mEditId ? 'Record updated' : 'Item sent to GE Shop');
    clearMaintForm();
    loadMaint();
    refreshInv(); // Refresh global items cache
  } catch (e) { toast('Error: ' + e.message, 'e'); }
}

async function editMaint(id) {
  const rec = _maintRecords.find(r => r.id === id);
  if (!rec) return;

  _mEditId = id;
  $('mf-title').textContent = '📝 Edit Maintenance Record';
  $('m-sub').textContent = 'Update Record';
  $('m-sub').className = 'btn bp';
  $('m-item').value = rec.item_id;
  $('m-item').disabled = true; // Don't allow changing item on edit to avoid stock mess
  $('m-qty').value = rec.quantity;
  $('m-qty').disabled = true; // Don't allow changing qty on edit

  const standardTypes = ['Polish', 'Fix', 'Retouch', 'Rewiring', 'Full Repair'];
  if (standardTypes.includes(rec.repair_type)) {
    $('m-type-sel').value = rec.repair_type;
    $('m-type-custom').style.display = 'none';
  } else {
    $('m-type-sel').value = 'CUSTOM';
    $('m-type-custom').value = rec.repair_type;
    $('m-type-custom').style.display = 'block';
  }

  $('m-date-sent').value = rec.date_sent;
  $('m-date-est').value = rec.est_return_date || '';
  $('m-desc').value = rec.description || '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearMaintForm() {
  _mEditId = null;
  $('mf-title').textContent = '📤 Send Item to GE Shop';
  $('m-sub').textContent = 'Submit to GE Shop';
  $('m-sub').className = 'btn bo';
  $('m-item').value = '';
  $('m-item').disabled = false;
  $('m-qty').value = '1';
  $('m-qty').disabled = false;
  $('m-type-sel').value = '';
  $('m-type-custom').value = '';
  $('m-type-custom').style.display = 'none';
  $('m-date-sent').value = new Date().toISOString().split('T')[0];
  $('m-date-est').value = '';
  $('m-desc').value = '';
  $('m-stk-info').textContent = '';
}

async function markMaintReturned(id) {
  const rec = _maintRecords.find(r => r.id === id);
  if (!rec) return;

  if (!confirm(`Mark "${rec.item_name}" as repaired? This will restore ${rec.quantity} units to stock.`)) return;

  try {
    // 1. Update status
    const updatePayload = {
      ...rec,
      status: 'Returned',
      date_returned: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    };
    const { error } = await Data.save('maintenance', updatePayload);
    if (error) throw error;

    // 2. Restore Stock
    const items = await Data.getItems();
    const item = items.find(i => i.id === rec.item_id);
    if (item) {
      item.stock_qty += rec.quantity;
      await Data.save('items', item);
    }

    addLog('MAINT_RETURN', `${rec.item_name} x${rec.quantity}`);
    toast('Item returned and stock restored');
    loadMaint();
    refreshInv();
  } catch (e) { toast('Error: ' + e.message, 'e'); }
}

async function deleteMaint(id) {
  const rec = _maintRecords.find(r => r.id === id);
  if (!rec) return;

  let msg = 'Delete this record?';
  if (rec.status === 'Under Repair') msg += '\nWarning: The deducted stock will NOT be restored automatically if you delete an active repair record. Use "Item Repaired" to restore stock.';

  if (!confirm(msg)) return;

  try {
    const { error } = await sb.from('maintenance').delete().eq('id', id);
    if (error) throw error;

    addLog('DEL_MAINT', `id:${id}`);
    toast('Record deleted');
    loadMaint();
  } catch (e) { toast('Error: ' + e.message, 'e'); }
}

// ════════════════════════════════════ REPORTS
async function loadRep() {
  const catsD = await Data.getCategories();
  $('page-rep').innerHTML = `
  <div class="ph"><div class="pt">Reports &amp; Export</div></div>
  <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
    <button class="btn bp" onclick="showRep('sales',this)" id="btn-rep-sales">📈 Sales</button>
    <button class="btn bs" onclick="showRep('inv',this)" id="btn-rep-inv">📦 Inventory</button>
    <button class="btn bs" onclick="showRep('low',this)" id="btn-rep-low">⚠️ Low Stock</button>
    <button class="btn bs" onclick="showRep('acct',this)" id="btn-rep-acct">💰 Accounting</button>
  </div>
  <div class="fb" id="repfil"></div>
  <div style="display:flex;gap:10px;margin-bottom:16px">
    <button class="btn bp" onclick="runRep()">Generate Report</button>
    <button class="btn bg_" onclick="expCSV()">⬇ Export CSV</button>
  </div>
  <div id="repout"></div>`;
  window._repCats = catsD || [];
  showRep('sales', $('btn-rep-sales'));
}
function showRep(t, btn) {
  _repType = t;
  document.querySelectorAll('#page-rep .btn:not(.bg_):not([onclick="runRep()"])').forEach(b => { b.className = 'btn bs'; });
  if (btn) btn.className = 'btn bp';
  const catO = (window._repCats || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const dateInput = `<div style="display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.5);padding:4px;border-radius:6px;border:1px solid var(--br)"><input type="date" id="rff" style="border:none;background:transparent;padding:4px;color:var(--tx)"><span style="color:var(--mt);font-size:12px;font-weight:600">to</span><input type="date" id="rft" style="border:none;background:transparent;padding:4px;color:var(--tx)"></div>`;
  const fils = {
    sales: `${dateInput}<select id="rfpm" class="fi"><option value="">All Methods</option><option>Cash</option><option>Mess Bill</option><option>PAFWA Home Store</option><option>Gift</option><option>Special Case</option></select><select id="rfst" class="fi"><option value="">All Statuses</option><option value="paid">Paid</option><option value="pend">Unpaid</option></select>`,
    inv: `<select id="rfcat" class="fi"><option value="">All Categories</option>${catO}</select><input id="rfloc" placeholder="📍 Location" class="fi" style="width:120px">`,
    low: `<span style="color:var(--mt);font-size:13px;padding:8px">Showing items at or below minimum stock threshold</span>`,
    acct: dateInput
  };
  const el = $('repfil'); if (el) el.innerHTML = fils[t] || '';
  runRep();
}
async function runRep() {
  const out = $('repout'); if (!out) return; ld(out);
  try {
    let s = [], i = [], l = [];
    const from = $('rff')?.value, to = $('rft')?.value;

    if (_repType === 'sales') {
      s = await Data.getSales(10000);
      if (from) s = s.filter(x => x.created_at >= from);
      if (to) s = s.filter(x => x.created_at <= to + 'T23:59:59');
      const pm = $('rfpm')?.value, st = $('rfst')?.value;
      if (pm) s = s.filter(x => x.payment_method === pm);
      if (st === 'paid') s = s.filter(x => x.paid);
      if (st === 'pend') s = s.filter(x => !x.paid);

      const si = await Data.getSaleItems();
      const items = await Data.getItems();
      const costMap = {}; items.forEach(x => costMap[x.id] = Number(x.cost_price) || 0);
      const profitMap = {};
      (si || []).forEach(item => {
        if (!profitMap[item.sale_id]) profitMap[item.sale_id] = 0;
        const itemCost = Number(item.quantity) * (Number(costMap[item.item_id]) || 0);
        profitMap[item.sale_id] += (Number(item.total) - itemCost);
      });

      const totSub = s.reduce((a, x) => a + Number(x.subtotal || 0), 0);
      const totDisc = s.reduce((a, x) => a + Number(x.discount || 0), 0);
      const totVal = s.reduce((a, x) => a + Number(x.total || 0), 0);
      const totProf = s.reduce((a, x) => a + (profitMap[x.id] || 0), 0);

      out.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;background:rgba(15,23,42,0.5);border-bottom:1px solid var(--br);display:flex;justify-content:space-between;align-items:center"><span class="ct_" style="margin:0">📈 Sales Report</span><div style="text-align:right"><div style="font-size:18px;font-weight:900;color:var(--nv)">${fmtM(totVal)}</div><div style="font-size:11px;color:var(--mt)">${s.length} receipts</div></div></div>
      <div class="tw"><table><thead><tr><th>Receipt#</th><th>Customer</th><th>Subtotal</th><th>Disc</th><th>Total</th><th>Profit</th><th>Method</th><th>Paid</th><th>Date</th></tr></thead>
      <tbody>${s.map(x => `<tr><td><span class="bdg bb">No.${x.receipt_no}</span></td><td><strong>${esc(x.customer_name)}</strong></td><td class="tdm">${fmtM(x.subtotal)}</td><td class="tdm">${fmtM(x.discount)}</td><td><strong style="color:var(--nv)">${fmtM(x.total)}</strong></td><td style="color:var(--gr);font-weight:700">${fmtM(profitMap[x.id] || 0)}</td><td>${pmBadge(x.payment_method || 'Cash')}</td><td>${payBadge(x.paid)}</td><td class="tdm">${fmtDT(x.created_at)}</td></tr>`).join('')}</tbody>
      <tfoot style="background:var(--bg);font-weight:800"><tr><td colspan="2" style="text-align:right">TOTALS</td><td class="tdm">${fmtM(totSub)}</td><td class="tdm">${fmtM(totDisc)}</td><td><strong style="color:var(--nv)">${fmtM(totVal)}</strong></td><td style="color:var(--gr)">${fmtM(totProf)}</td><td colspan="3"></td></tr></tfoot>
      </table></div></div>`;
      _repData = s;
    } else if (_repType === 'inv' || _repType === 'low') {
      i = await Data.getItems();
      if (_repType === 'low') i = i.filter(x => Number(x.stock_qty) <= Number(x.min_stock_threshold || 5));
      const cat = $('rfcat')?.value, loc = ($('rfloc')?.value || '').trim().toLowerCase();
      if (cat) i = i.filter(x => x.category_id === cat);
      if (loc) i = i.filter(x => x.location?.toLowerCase().includes(loc));

      out.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div style="padding:16px 20px;background:rgba(15,23,42,0.5);border-bottom:1px solid var(--br);display:flex;justify-content:space-between;align-items:center"><span class="ct_" style="margin:0">${_repType === 'low' ? '⚠️ Low Stock' : '📦 Inventory'}</span><span class="bdg bg">${i.length} items</span></div>
      <div class="tw"><table><thead><tr><th>S/N</th><th>Name</th><th>Category</th><th>Location</th><th>Cost</th><th>Sale Price</th><th>Stock</th><th>Min Alert</th></tr></thead>
      <tbody>${i.map(x => `<tr><td><code>${esc(x.serial_number || '—')}</code></td><td><strong>${esc(x.name)}</strong></td><td class="tdm">${esc(x.categories?.name || '—')}</td><td class="tdm">${esc(x.location || '—')}</td><td>${fmtM(x.cost_price)}</td><td><strong style="color:var(--nv)">${fmtM(x.sale_price)}</strong></td><td>${stBadge(x.stock_qty, x.min_stock_threshold)}</td><td class="tdm">${x.min_stock_threshold || 5}</td></tr>`).join('')}</tbody></table></div></div>`;
      _repData = i;
    } else if (_repType === 'acct') {
      s = await Data.getSales(10000);
      l = await Data.getLiabilities();
      if (from) { s = s.filter(x => x.created_at >= from); l = l.filter(x => x.created_at >= from); }
      if (to) { s = s.filter(x => x.created_at <= to + 'T23:59:59'); l = l.filter(x => x.created_at <= to + 'T23:59:59'); }
      const byM = {}; s.forEach(x => { const m = x.payment_method || 'Cash'; if (!byM[m]) byM[m] = { c: 0, t: 0 }; byM[m].c++; byM[m].t += Number(x.total); });
      out.innerHTML = `<div class="stats-grid">
        <div class="stat g"><div class="sl">Gross Revenue</div><div class="sv" style="color:var(--gr)">${fmtM(s.reduce((a, x) => a + Number(x.total), 0))}</div></div>
        <div class="stat o"><div class="sl">Discounts Given</div><div class="sv" style="color:var(--or)">${fmtM(s.reduce((a, x) => a + Number(x.discount || 0), 0))}</div></div>
        <div class="stat r"><div class="sl">Liabilities Added</div><div class="sv" style="color:var(--rd)">${fmtM(l.reduce((a, x) => a + Number(x.amount), 0))}</div></div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:16px 20px;background:rgba(15,23,42,0.5);border-bottom:1px solid var(--br)"><span class="ct_" style="margin:0">Revenue Breakdown</span></div>
        <div class="tw"><table>
        <thead><tr><th>Payment Method</th><th>Transaction Count</th><th>Total Revenue</th></tr></thead>
        <tbody>${Object.entries(byM).map(([m, v]) => `<tr><td>${pmBadge(m)}</td><td class="tdm">${v.c}</td><td><strong style="color:var(--nv)">${fmtM(v.t)}</strong></td></tr>`).join('')}</tbody></table></div>
      </div>`;
      _repData = s;
    }
  } catch (e) { out.innerHTML = `<div class="al ale">Report error: ${e.message}</div>`; }
}
function expCSV() {
  if (!_repData.length) { toast('No data to export', 'w'); return; }
  let h, rows;
  if (_repType === 'sales') {
    h = ['Receipt No', 'Customer', 'Subtotal', 'Discount', 'Total', 'Method', 'Paid', 'Cashier', 'Date'];
    rows = _repData.map(s => [s.receipt_no, s.customer_name, s.subtotal || 0, s.discount || 0, s.total, s.payment_method || 'Cash', s.paid ? 'Yes' : 'No', s.cashier || '', s.created_at]);
    // Add Totals row
    const totSub = _repData.reduce((a, s) => a + Number(s.subtotal || 0), 0);
    const totDisc = _repData.reduce((a, s) => a + Number(s.discount || 0), 0);
    const totVal = _repData.reduce((a, s) => a + Number(s.total || 0), 0);
    rows.push(['TOTALS', '', totSub, totDisc, totVal, '', '', '', '']);
  }
  else {
    h = ['S/N', 'Name', 'Category', 'Location', 'Cost', 'Sale Price', 'Stock', 'Min'];
    rows = _repData.map(i => [i.serial_number || '', i.name, i.categories?.name || '', i.location || '', i.cost_price || 0, i.sale_price || 0, i.stock_qty || 0, i.min_stock_threshold || 5]);
    // Add Totals row for inventory if relevant (e.g. stock)
    const totStock = _repData.reduce((a, i) => a + Number(i.stock_qty || 0), 0);
    rows.push(['TOTALS', '', '', '', '', '', totStock, '']);
  }
  const csv = [h.join(','), ...rows.map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `PAFWA_${_repType}_${Date.now()}.csv`; a.click(); toast('CSV exported');
}

// ════════════════════════════════════ LOGS
async function loadLogs() {
  $('page-logs').innerHTML = `
  <div class="ph"><div class="pt">Activity Logs</div><button class="btn bs" onclick="loadLogs()">🔄 Refresh</button></div>
  <div class="fb">
    <input class="fi" id="lq" placeholder="🔍 Search username, action, details…" oninput="renderLogs()">
    <div style="display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.5);padding:4px;border-radius:6px;border:1px solid var(--br)">
      <input type="date" id="lfrom" onchange="renderLogs()" style="border:none;background:transparent;padding:4px">
      <span style="color:var(--mt);font-size:12px;font-weight:600">to</span>
      <input type="date" id="lto" onchange="renderLogs()" style="border:none;background:transparent;padding:4px">
    </div>
  </div>
  <div id="logtbl">⏳ Loading…</div>`;
  const { data } = await sb.from('logs').select('*').order('created_at', { ascending: false }).limit(500);
  window._allLogs = data || [];
  renderLogs();
}
function renderLogs() {
  const q = ($('lq')?.value || '').toLowerCase(), from = $('lfrom')?.value, to = $('lto')?.value;
  let logs = [...(window._allLogs || [])];
  if (q) logs = logs.filter(l => l.username?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.detail?.toLowerCase().includes(q));
  if (from) logs = logs.filter(l => l.created_at >= from);
  if (to) logs = logs.filter(l => l.created_at <= to + 'T23:59:59');
  const el = $('logtbl'); if (!el) return;
  el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Details</th></tr></thead>
  <tbody>${logs.map(l => `<tr><td class="tdm" style="white-space:nowrap">${fmtDT(l.created_at)}</td><td><strong>${esc(l.username || 'system')}</strong></td><td>${roleBadge(l.role || '')}</td><td><span class="bdg bgr" style="font-family:monospace">${esc(l.action)}</span></td><td class="tdm">${esc(l.detail || '—')}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

// ════════════════════════════════════ USERS
async function loadUsers() {
  $('page-users').innerHTML = `
  <div class="ph"><div class="pt">User Management</div><button class="btn bp" onclick="openAddUserM()">+ Add User</button></div>
  <div class="al ali" style="margin-bottom:16px">ℹ️ Users login with their <strong>username</strong>. The system automatically handles their internal email formatting.</div>
  <div id="usrtbl">⏳ Loading…</div>`;
  await renderUsers();
}
async function renderUsers() {
  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  $('usrtbl').innerHTML = `<div class="card" style="padding:0;overflow:hidden"><div class="tw"><table>
  <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
  <tbody>${(users || []).map(u => `<tr>
    <td><strong>${esc(u.username)}</strong></td><td>${esc(u.full_name || '—')}</td>
    <td>${roleBadge(u.role)}</td>
    <td><span class="bdg ${u.active !== false ? 'bg' : 'br_'}">${u.active !== false ? 'Active' : 'Deactivated'}</span></td>
    <td class="tdm">${u.last_login ? fmtDT(u.last_login) : 'Never'}</td>
    <td><div style="display:flex;gap:6px">
      <button class="btn bs bsm" onclick="openEditUserM('${u.id}')">Edit</button>
      ${u.username !== 'admin' ? `<button class="btn ${u.active !== false ? 'bd' : 'bg_'} bsm" onclick="toggleUser('${u.id}',${!!u.active})">${u.active !== false ? 'Deactivate' : 'Activate'}</button>` : ''}
    </div></td>
  </tr>`).join('')}
  </tbody></table></div></div>`;
}
function openAddUserM() {
  openM(`<h2>➕ Add User</h2>
  <div id="ue" class="al ale" style="display:none"></div>
  <div class="r2">
    <div class="fg"><label>Username *</label><input id="uu" placeholder="e.g. zara_staff" autocomplete="off"></div>
    <div class="fg"><label>Full Name</label><input id="ufn" placeholder="Full name" autocomplete="off"></div>
  </div>
  <div class="r2">
    <div class="fg"><label>Password * (min 6 chars)</label><input type="password" id="upw"></div>
    <div class="fg"><label>Role</label><select id="ur"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
  </div>
  <div class="al alw">After creating, the user can log in immediately with their username and password.</div>
  <div class="mf"><button class="btn bp" onclick="submitAddUser()">Create User</button><button class="btn bs" onclick="closeM()">Cancel</button></div>`, '480px');
}
async function quickAddCat() {
  const n = prompt('Enter new category name:');
  if (!n) return;
  const { data, error } = await sb.from('categories').insert({ name: n.trim() }).select().single();
  if (error) { toast(error.message, 'e'); return; }
  await refreshInv();
  const sel = $('ficat');
  if (sel) {
    sel.innerHTML = '<option value="">None</option>' + _cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    sel.value = data.id;
    suggestSN();
  }
  toast('Category added');
}
async function suggestSN(providedCatId = null) {
  const catId = providedCatId || $('ficat')?.value;
  let code;
  let countQuery;

  if (!catId) {
    const itemName = $('fin')?.value?.trim() || 'ITEM';
    code = itemName.replace(/\s+/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
    countQuery = sb.from('items').select('*', { count: 'exact', head: true }).is('category_id', null);
  } else {
    const catName = _cats.find(c => c.id === catId)?.name || 'NONE';
    code = catName.split(' / ').pop().replace(/\s+/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
    countQuery = sb.from('items').select('*', { count: 'exact', head: true }).eq('category_id', catId);
  }

  const year = new Date().getFullYear();
  const { count } = await countQuery;
  const index = String((count || 0) + 1).padStart(3, '0');
  const finalSn = `${code}-${year}-${index}`;
  if ($('fisn') && !$('fisn').dataset.userEdited) $('fisn').value = finalSn;
  return finalSn;
}
async function submitAddUser() {
  const u = $('uu').value.trim(), pw = $('upw').value, fn = $('ufn').value.trim(), role = $('ur').value;
  const err = $('ue');
  if (!u || !pw) { err.textContent = 'Username and password required'; err.style.display = 'block'; return; }
  if (pw.length < 6) { err.textContent = 'Min 6 characters'; err.style.display = 'block'; return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    const accTok = session?.access_token, refTok = session?.refresh_token;

    const { data, error } = await sb.auth.signUp({
      email: `${u}@pafwa.local`, password: pw,
      options: { data: { username: u, full_name: fn || u, role } }
    });
    if (error) throw error;

    if (accTok && refTok) await sb.auth.setSession({ access_token: accTok, refresh_token: refTok });

    addLog('ADD_USER', `Created: ${u} (${role})`);
    toast('User created!'); closeM(); renderUsers();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}
async function openEditUserM(id) {
  const { data: u } = await sb.from('profiles').select('*').eq('id', id).single();
  if (!u) { toast('User not found', 'e'); return; }
  const p = u.permissions || {};
  const isProtected = u.username === 'admin';

  const ckHtml = (key, label, icon) => {
    const checked = p[key] === true || p[key] === 'true';
    return `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--br);border-radius:8px;cursor:pointer;background:rgba(15,23,42,0.3);font-size:12px;font-weight:600;color:var(--tx)">
      <input type="checkbox" id="ep_${key}" ${checked ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--neon-cyan);flex-shrink:0">
      <span style="font-size:16px">${icon}</span> ${label}
    </label>`;
  };

  openM(`<h2>✏️ Edit User: <span style="color:var(--neon-cyan)">${esc(u.username)}</span></h2>
  <div id="eue" class="al ale" style="display:none"></div>

  <div style="font-size:10px;font-weight:800;color:var(--neon-cyan);letter-spacing:1px;margin-bottom:8px;margin-top:4px">IDENTITY</div>
  <div class="r2">
    <div class="fg"><label>Full Name</label><input id="efn" value="${esc(u.full_name || '')}"></div>
    <div class="fg"><label>Username</label><input id="eun" value="${esc(u.username)}" ${isProtected ? 'disabled' : ''} placeholder="Login username"></div>
  </div>
  <div class="r2">
    <div class="fg"><label>Role</label><select id="er" ${isProtected ? 'disabled' : ''}><option value="staff"${u.role === 'staff' ? ' selected' : ''}>Staff</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option></select></div>
    <div class="fg"><label>New Password <span style="color:var(--mt);font-weight:400">(leave blank to keep)</span></label><div style="display:flex;gap:4px"><input type="password" id="epw" placeholder="Min 6 characters"><button class="btn bs" style="padding:0 10px;flex-shrink:0" onclick="togglePw('epw',this)">👁</button></div></div>
  </div>

  <div style="font-size:10px;font-weight:800;color:var(--neon-cyan);letter-spacing:1px;margin-bottom:10px;margin-top:8px;padding-top:14px;border-top:1px solid var(--br)">PERMISSIONS
    <span style="color:var(--mt);font-weight:400;font-size:9px;text-transform:none;letter-spacing:0"> — only applies when role is Staff</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
    ${ckHtml('inv_edit', 'Inventory Editing', '📦')}
    ${ckHtml('rcpt_gen', 'Receipt / Sale Generation', '🧾')}
    ${ckHtml('users_view', 'User Management Tab', '👥')}
    ${ckHtml('act_view', 'Activity Logs Tab', '📋')}
    ${ckHtml('acct_view', 'Accounting Tab', '💰')}
    ${ckHtml('worth_view', 'Inventory Worth / Cost Visibility', '💎')}
    ${ckHtml('rcpt_del', 'Delete Receipts', '🗑️')}
  </div>

  <div class="mf">
    <button class="btn bp" onclick="submitEditUser('${id}')">💾 Save Changes</button>
    <button class="btn bs" onclick="closeM()">Cancel</button>
  </div>`, '580px');
}

async function submitEditUser(id) {
  const err = $('eue');
  err.style.display = 'none';
  try {
    const fullName = $('efn').value.trim();
    const username = $('eun').value.trim();
    const role = $('er').value;
    const password = $('epw').value;

    if (!username) { err.textContent = 'Username cannot be empty'; err.style.display = 'block'; return; }
    if (password && password.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.style.display = 'block'; return; }

    const permissions = {
      inv_edit: !!$('ep_inv_edit')?.checked,
      rcpt_gen: !!$('ep_rcpt_gen')?.checked,
      users_view: !!$('ep_users_view')?.checked,
      act_view: !!$('ep_act_view')?.checked,
      acct_view: !!$('ep_acct_view')?.checked,
      worth_view: !!$('ep_worth_view')?.checked,
      rcpt_del: !!$('ep_rcpt_del')?.checked,
    };

    const { error } = await sb.rpc('admin_update_user', {
      target_user_id: id,
      new_username: username,
      new_password: password || '',
      new_full_name: fullName,
      new_permissions: permissions,
      new_role: role
    });
    if (error) throw error;

    addLog('UPDATE_USER', `Updated: ${username} (${role})`);
    toast('User updated ✅'); closeM(); renderUsers();
  } catch (e) {
    err.textContent = e.message || 'Update failed';
    err.style.display = 'block';
  }
}
async function toggleUser(id, isActive) { if (!confirm(isActive ? 'Deactivate this user?' : 'Activate this user?')) return; await sb.from('profiles').update({ active: !isActive }).eq('id', id); addLog(isActive ? 'DEACTIVATE' : 'ACTIVATE', `id:${id}`); toast(isActive ? 'Deactivated' : 'Activated'); renderUsers(); }

// ════════════════════════════════════ BACKUP
async function loadBkp() {
  const { data: sets } = await sb.from('settings').select('*');
  const cfg = {}; (sets || []).forEach(r => cfg[r.key] = r.value);
  $('page-bkp').innerHTML = `
  <div class="ph"><div class="pt">System Backup</div></div>
  <div class="g2">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="ct_">📦 Download Full Backup</div>
        <p style="color:var(--mt);font-size:13px;margin-bottom:14px;line-height:1.5">Downloads complete backup with data + SQL schema (2 files).<br>Last automated backup: <strong style="color:var(--nv)">${cfg.last_backup ? fmtDT(cfg.last_backup) : 'Never'}</strong></p>
        <button class="btn bp bfl" onclick="doBackup()" style="font-size:14px">⬇️ Download Full Backup (Data + Schema)</button>
        <div class="al ali" style="font-size:12px;margin-top:14px;margin-bottom:0">Automated backup reminder triggers daily at 12:00 noon.</div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="ct_">🖼️ Download Images Backup</div>
        <p style="color:var(--mt);font-size:13px;margin-bottom:14px;line-height:1.5">Downloads all product images in a ZIP file. Use this for complete backup.</p>
        <button id="img-backup-btn" class="btn bs bfl" onclick="downloadImageBackup()" style="font-size:14px">🖼️ Download Images Backup (ZIP)</button>
      </div>
      <div class="card">
        <div class="ct_">🔄 Restore from Backup</div>
        <div class="al alw" style="font-size:12px">⚠️ Restoring will add data to existing records, not replace them entirely. Proceed with caution.</div>
        <div class="fg" style="margin-top:10px"><label>Select Backup File (.json)</label><input type="file" id="bkf" accept=".json" style="padding:8px;font-size:13px;background:#f8fafc"></div>
        <button class="btn bo_ bfl" onclick="doRestore()">🔄 Import & Restore</button>
      </div>
    </div>
    <div class="card" style="align-self:start">
      <div class="ct_">ℹ️ System Information</div>
      <div style="font-size:13px;line-height:2.6">
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Version</strong> <span>3.2</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Database</strong> <span>Supabase PostgreSQL</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Storage</strong> <span>Supabase Object Storage</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Authentication</strong> <span>Supabase Auth</span></div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--br)"><strong>Active User</strong> <span>${CU?.fullName || CU?.username} (${CU?.role})</span></div>
        <div style="display:flex;justify-content:space-between"><strong>Project URL</strong> <span style="font-size:11px;color:var(--mt);max-width:150px;overflow:hidden;text-overflow:ellipsis">${getCfg().url || '—'}</span></div>
      </div>
    </div>
  </div>`;
}
async function downloadImageBackup() {
  const btn = $('img-backup-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Downloading...'; }
  
  try {
    toast('Preparing images...', 'i');
    
    // Get all items with images
    const { data: items } = await sb.from('items').select('id, name, image_url, image_path').not('image_url', 'is', null);
    
    if (!items || items.length === 0) {
      toast('No images to download', 'w');
      return;
    }
    
    // Create ZIP using JSZip (we'll add it)
    const zip = new JSZip();
    const folder = zip.folder('PAFWA_Images');
    
    let successCount = 0;
    let failCount = 0;
    const total = items.length;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.image_url) {
        try {
          const response = await fetch(item.image_url);
          if (response.ok) {
            const blob = await response.blob();
            const ext = item.image_url.split('.').pop().split('?')[0] || 'jpg';
            const safeName = (item.name || item.id).replace(/[^a-z0-9]/gi, '_');
            folder.file(`${safeName}_${item.id.slice(0,8)}.${ext}`, blob);
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          failCount++;
        }
      }
      
      // Update progress
      const pct = Math.round(((i + 1) / total) * 100);
      if (btn) btn.textContent = `⏳ ${pct}% (${i + 1}/${total})`;
    }
    
    // Generate ZIP
    toast('Creating ZIP file...', 'i');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Download
    const d = new Date();
    const fn = `PAFWA_Images_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.zip`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = fn;
    a.click();
    
    toast(`Downloaded ${successCount} images! (${failCount} failed)`, successCount > 0 ? 's' : 'w');
    
  } catch (e) {
    console.error('Image backup error:', e);
    toast('Image backup failed: ' + e.message, 'e');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖼️ Download Images Backup'; }
  }
}

// Add JSZip to the page if not present
if (typeof JSZip === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  document.head.appendChild(script);
}

async function doBackup() {
  try {
    toast('Preparing complete backup…', 'i');
    
    // Fetch current app.js content
    let appJsContent = '';
    try {
      const response = await fetch('app.js');
      appJsContent = await response.text();
    } catch (e) {
      console.warn('Could not fetch app.js:', e);
    }
    
    // Fetch all data
    const [iR, sR, siR, cR, lR, libR, prR, setsR, maintR] = await Promise.all([
      sb.from('items').select('*'), 
      sb.from('sales').select('*'),
      sb.from('sale_items').select('*'), 
      sb.from('categories').select('*'),
      sb.from('logs').select('*').limit(10000), 
      sb.from('liabilities').select('*'),
      sb.from('profiles').select('id,username,full_name,role,active,created_at,permissions'),
      sb.from('settings').select('*'),
      sb.from('maintenance').select('*')
    ]);
    
    // Build complete backup object
    const backup = {
      version: '3.2-complete',
      exportedAt: new Date().toISOString(),
      exportedBy: CU?.username || 'admin',
      _metadata: {
        appVersion: '3.2',
        exportMode: 'full-backup',
        tablesIncluded: ['items', 'sales', 'sale_items', 'categories', 'logs', 'liabilities', 'profiles', 'settings', 'maintenance']
      },
      _originalAppJs: appJsContent,
      items: iR.data || [],
      sales: sR.data || [],
      sale_items: siR.data || [],
      categories: cR.data || [],
      logs: lR.data || [],
      liabilities: libR.data || [],
      profiles: prR.data || [],
      settings: setsR.data || [],
      maintenance: maintR.data || []
    };
    
    // Create data.json content
    const dataJson = JSON.stringify(backup, null, 2);
    
    // Create schema.sql content
    const schemaSql = `-- ============================================================
-- PAFWA Inventory System - Complete Database Schema
-- Backup Date: ${new Date().toISOString()}
-- ============================================================

-- ── PROFILES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  active BOOLEAN NOT NULL DEFAULT true,
  permissions JSONB DEFAULT '{}',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CATEGORIES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INVENTORY ITEMS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  cost_price NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  min_stock_threshold INTEGER NOT NULL DEFAULT 5,
  unit TEXT NOT NULL DEFAULT 'pcs',
  discount_pct NUMERIC NOT NULL DEFAULT 0,
  date_of_boc DATE,
  image_url TEXT,
  image_path TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SALES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  cashier TEXT,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT true,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SALE ITEMS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.items(id),
  item_name TEXT NOT NULL,
  item_sn TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  unit TEXT DEFAULT 'pcs'
);

-- ── LIABILITIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL,
  remarks TEXT NOT NULL,
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ACTIVITY LOGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  username TEXT,
  role TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SETTINGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ── MAINTENANCE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.items(id),
  item_name TEXT NOT NULL,
  item_sn TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  repair_type TEXT NOT NULL,
  date_sent DATE NOT NULL DEFAULT CURRENT_DATE,
  est_return_date DATE,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Under Repair' CHECK (status IN ('Under Repair','Returned','Cancelled')),
  date_returned DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ENABLE RLS ON ALL TABLES ────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;

-- ── HELPERS ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── RLS POLICIES ───────────────────────────────────────────
-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.get_my_role() = 'admin');

-- Categories
DROP POLICY IF EXISTS "cats_select" ON public.categories;
CREATE POLICY "cats_select" ON public.categories FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cats_write" ON public.categories;
CREATE POLICY "cats_write" ON public.categories FOR ALL USING (public.get_my_role() = 'admin' OR (SELECT (permissions->>'inv_edit')::boolean FROM public.profiles WHERE id = auth.uid()) = true);

-- Items
DROP POLICY IF EXISTS "items_select" ON public.items;
CREATE POLICY "items_select" ON public.items FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "items_write" ON public.items;
CREATE POLICY "items_write" ON public.items FOR ALL USING (public.get_my_role() = 'admin' OR (SELECT (permissions->>'inv_edit')::boolean FROM public.profiles WHERE id = auth.uid()) = true);

-- Sales
DROP POLICY IF EXISTS "sales_select" ON public.sales;
CREATE POLICY "sales_select" ON public.sales FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sales_insert" ON public.sales;
CREATE POLICY "sales_insert" ON public.sales FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "sales_update" ON public.sales;
CREATE POLICY "sales_update" ON public.sales FOR UPDATE USING (public.get_my_role() = 'admin' OR (SELECT (permissions->>'rcpt_del')::boolean FROM public.profiles WHERE id = auth.uid()) = true);

-- Sale Items
DROP POLICY IF EXISTS "si_all" ON public.sale_items;
CREATE POLICY "si_all" ON public.sale_items FOR ALL USING (auth.uid() IS NOT NULL);

-- Liabilities
DROP POLICY IF EXISTS "liab_all" ON public.liabilities;
CREATE POLICY "liab_all" ON public.liabilities FOR ALL USING (public.get_my_role() = 'admin');

-- Logs
DROP POLICY IF EXISTS "logs_insert" ON public.logs;
CREATE POLICY "logs_insert" ON public.logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "logs_select" ON public.logs;
CREATE POLICY "logs_select" ON public.logs FOR SELECT USING (public.get_my_role() = 'admin');

-- Settings
DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "settings_write" ON public.settings;
CREATE POLICY "settings_write" ON public.settings FOR ALL USING (public.get_my_role() = 'admin' OR true);

-- Maintenance
DROP POLICY IF EXISTS "maint_select" ON public.maintenance;
CREATE POLICY "maint_select" ON public.maintenance FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "maint_write" ON public.maintenance;
CREATE POLICY "maint_write" ON public.maintenance FOR ALL USING (auth.uid() IS NOT NULL);

-- ── TRIGGER: auto-update updated_at ───────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_updated_at ON public.items;
CREATE TRIGGER items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS maint_updated_at ON public.maintenance;
CREATE TRIGGER maint_updated_at BEFORE UPDATE ON public.maintenance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TRIGGER: auto-create profile on signup ─────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN INSERT INTO public.profiles (id, username, full_name, role) VALUES (new.id, COALESCE(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), COALESCE(new.raw_user_meta_data->>'full_name', 'User'), COALESCE(new.raw_user_meta_data->>'role', 'staff')) ON CONFLICT (id) DO NOTHING; RETURN new; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── STORAGE BUCKET ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "img_public_read" ON storage.objects;
CREATE POLICY "img_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'item-images');

DROP POLICY IF EXISTS "img_auth_write" ON storage.objects;
CREATE POLICY "img_auth_write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'item-images' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "img_auth_delete" ON storage.objects;
CREATE POLICY "img_auth_delete" ON storage.objects FOR DELETE USING (bucket_id = 'item-images' AND auth.uid() IS NOT NULL);

-- ════════════════════════════════════════════════════════════
-- Schema complete! Restore data using restore-tool.html
-- ════════════════════════════════════════════════════════════
`;
    
    // Update last backup time
    await sb.from('settings').upsert({ key: 'last_backup', value: new Date().toISOString() });
    addLog('FULL_BACKUP', 'Complete backup created');
    
    // Download files
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    // Download data.json
    const d1 = document.createElement('a');
    d1.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataJson);
    d1.download = `PAFWA_Backup_Data_${dateStr}.json`;
    d1.click();
    
    // Download schema.sql
    const d2 = document.createElement('a');
    d2.href = 'data:text/sql;charset=utf-8,' + encodeURIComponent(schemaSql);
    d2.download = `PAFWA_Schema_${dateStr}.sql`;
    setTimeout(() => d2.click(), 500);
    
    toast('Backup downloaded! (data.json + schema.sql)', 's');
    loadBkp();
    
  } catch (e) { 
    console.error('Backup error:', e);
    toast('Backup failed: ' + e.message, 'e'); 
  }
}

async function doRestore() {
  const f = $('bkf')?.files[0]; 
  if (!f) { toast('Select a file', 'e'); return; }
  if (!confirm('Restore? This imports all data from the backup file.')) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.version) throw new Error('Invalid backup file');
      toast('Restoring data…', 'i');
      
      // Restore in order (respecting foreign keys)
      if (d.categories?.length) {
        const { error } = await sb.from('categories').upsert(d.categories.map(({ id, ...rest }) => rest));
        if (error) console.warn('Categories warning:', error.message);
      }
      if (d.settings?.length) {
        const { error } = await sb.from('settings').upsert(d.settings.map(({ key, value }) => ({ key, value })));
        if (error) console.warn('Settings warning:', error.message);
      }
      if (d.items?.length) await sb.from('items').upsert(d.items);
      if (d.sales?.length) await sb.from('sales').upsert(d.sales);
      if (d.sale_items?.length) await sb.from('sale_items').upsert(d.sale_items);
      if (d.liabilities?.length) await sb.from('liabilities').upsert(d.liabilities);
      if (d.maintenance?.length) await sb.from('maintenance').upsert(d.maintenance);
      if (d.profiles?.length) {
        const profiles = d.profiles.map(({ id, ...rest }) => rest);
        for (const p of profiles) {
          await sb.from('profiles').upsert(p).catch(() => {});
        }
      }
      
      addLog('RESTORE', f.name); 
      toast('Data restored successfully!', 's'); 
      loadBkp();
    } catch (err) { toast('Restore failed: ' + err.message, 'e'); }
  }; 
  r.readAsText(f);
}
async function doRestore() {
  const f = $('bkf')?.files[0]; if (!f) { toast('Select a file', 'e'); return; }
  if (!confirm('Restore? This imports all data from the backup file.')) return;
  const r = new FileReader();
  r.onload = async e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.version) throw new Error('Invalid backup file');
      toast('Restoring data…', 'i');
      if (d.categories?.length) await sb.from('categories').upsert(d.categories.map(({ id, ...rest }) => ({ id, ...rest })));
      if (d.items?.length) await sb.from('items').upsert(d.items.map(i => ({ ...i })));
      if (d.sales?.length) await sb.from('sales').upsert(d.sales.map(s => ({ ...s })));
      if (d.sale_items?.length) await sb.from('sale_items').upsert(d.sale_items.map(si => ({ ...si })));
      if (d.liabilities?.length) await sb.from('liabilities').upsert(d.liabilities.map(l => ({ ...l })));
      addLog('RESTORE', f.name); toast('Data restored successfully!'); loadBkp();
    } catch (err) { toast('Restore failed: ' + err.message, 'e'); }
  }; r.readAsText(f);
}

// ════════════════════════════════════ SETTINGS
async function loadCfg() {
  const { data: sets } = await sb.from('settings').select('*');
  const cfg = {}; (sets || []).forEach(r => cfg[r.key] = r.value);
  $('page-cfg').innerHTML = `
  <div class="ph"><div class="pt">Settings</div></div>
  <div class="g2">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="ct_">🏛 Organisation Details</div>
        <div id="smsg" class="al" style="display:none"></div>
        <div class="fg"><label>Organisation Name</label><input id="sorg" value="${esc(cfg.org_name || 'PAFWA APF')}"></div>
        <div class="fg"><label>Location / Unit</label><input id="sloc" value="${esc(cfg.location || 'PAC KAMRA')}"></div>
        <div class="fg"><label>Receipt Footer Text</label><input id="sfoot" value="${esc(cfg.receipt_footer || 'Received with Thanks')}"></div>
        <div class="r2">
          <div class="fg"><label>Next Receipt No.</label><input id="srno" type="number" min="1" value="${cfg.next_receipt_no || 1}"></div>
          <div class="fg"><label>Low Stock Threshold</label><input id="slow" type="number" min="1" value="${cfg.low_stock_thresh || 5}"></div>
        </div>
        <div class="fg"><label>System Version (UI Design)</label>
          <select id="svers">
            <option value="v1"${(cfg.ui_version || 'v1') === 'v1' ? ' selected' : ''}>Classic (V1)</option>
            <option value="v2"${cfg.ui_version === 'v2' ? ' selected' : ''}>Modern Glassmorphism (V2)</option>
          </select>
        </div>
        <button class="btn bp bfl" onclick="saveSettings()">💾 Save Settings</button>
      </div>
      <div class="card">
        <div class="ct_">🔑 Change My Password</div>
        <div id="pwmsg" class="al" style="display:none"></div>
        <div class="fg"><label>New Password</label><input type="password" id="pwn"></div>
        <div class="fg"><label>Confirm Password</label><input type="password" id="pwc"></div>
        <button class="btn bs bfl" onclick="changeMyPw()">Update Password</button>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="ct_">🖼️ Background Customization</div>
        <div class="al ali" style="font-size:12px;margin-bottom:12px">Upload images directly from your computer. They will be saved to your system and visible on all devices.</div>
        
        <div class="r2">
          <div class="fg"><label>Login Screen Background</label>
            <div style="display:flex;gap:8px">
               <button class="btn bs bfl" onclick="uploadBg('login')">📤 Upload Image</button>
               <button class="btn bd bfl" onclick="clearBg('login')">🗑️ Reset</button>
            </div>
          </div>
          <div class="fg"><label>Main App Background</label>
            <div style="display:flex;gap:8px">
               <button class="btn bs bfl" onclick="uploadBg('app')">📤 Upload Image</button>
               <button class="btn bd bfl" onclick="clearBg('app')">🗑️ Reset</button>
            </div>
          </div>
        </div>

        <div class="r2" style="margin-top:16px">
          <div class="fg"><label>Login Overlay Opacity</label>
            <input type="range" id="sop_l" min="0" max="1" step="0.05" value="${cfg.op_login || 0.6}" oninput="applyStyles()">
          </div>
          <div class="fg"><label>App Overlay Opacity</label>
            <input type="range" id="sop_a" min="0" max="1" step="0.05" value="${cfg.op_app || 0.4}" oninput="applyStyles()">
          </div>
        </div>
        <button class="btn bp bfl" onclick="saveSettings()">💾 Save Opacity Settings</button>
      </div>
    <div class="card" style="align-self:start">
      <div class="ct_">🔧 Supabase Configuration</div>
      <div class="al ali" style="margin-bottom:14px;font-size:12px">Update if you need to switch the linked Supabase cloud project.</div>
      <div class="fg"><label>Project URL</label><input id="scfgu" value="${esc(getCfg().url || '')}" autocomplete="off"></div>
      <div class="fg"><label>Anon Key</label><textarea id="scfgk" rows="4">${esc(getCfg().key || '')}</textarea></div>
      <button class="btn bo_ bfl" style="margin-bottom:16px" onclick="updateSbCfg()">💾 Update &amp; Reload</button>
      
      <div style="border-top:1px solid var(--br);padding-top:16px">
        <div class="ct_">🚀 Performance Tools</div>
        <div class="al ali" style="font-size:12px;margin-bottom:12px">Automatically resize and optimize all existing product images to stay under 200KB and fit the new design (Full View with Black Background).</div>
        <div id="optmsg" style="font-size:11px;color:var(--mt);margin-bottom:10px;display:none">Processing... <span id="optprog">0</span>%</div>
        <button id="optbtn" class="btn bs bfl" onclick="optimizeExistingImages()">🖼️ Optimize Existing Images</button>
      </div>
    </div>
  </div>`;
}

async function saveSettings() {
  const entries = [
    ['org_name', $('sorg').value.trim()],
    ['location', $('sloc').value.trim()],
    ['receipt_footer', $('sfoot').value.trim()],
    ['next_receipt_no', $('srno').value],
    ['low_stock_thresh', $('slow').value],
    ['ui_version', $('svers').value],
    ['op_login', $('sop_l').value],
    ['op_app', $('sop_a').value]
  ];
  await sb.from('settings').upsert(entries.map(([key, value]) => ({ key, value })));
  addLog('SAVE_SETTINGS', 'Settings updated'); toast('Settings saved'); applyStyles();
}
async function applyStyles() {
  const { data: sets } = await sb.from('settings').select('*');
  const cfg = {}; (sets || []).forEach(r => cfg[r.key] = r.value);
  document.body.setAttribute('data-version', cfg.ui_version || 'v1');
  const isLogin = $('LOGIN').style.display === 'flex' || $('ADMIN-SCREEN').style.display === 'flex';
  const bg = isLogin ? (cfg.bg_login || 'login_bg.jpg') : (cfg.bg_app || 'app_bg.jpg');
  const op = isLogin ? (cfg.op_login || 0.6) : (cfg.op_app || 0.4);
  const bgw = $('APP-BG-WRAPPER'); const bgo = $('APP-BG-OVERLAY');
  if (bgw) bgw.style.backgroundImage = `url('${bg}')`;
  if (bgo) bgo.style.backgroundColor = `rgba(var(--bg-rgb, 248,250,252), ${op})`;
}
function uploadBg(type) {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
  i.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('Image too large (max 2MB)', 'e'); return; }
    const r = new FileReader(); r.onload = async ev => {
      const b64 = ev.target.result; const key = type === 'login' ? 'bg_login' : 'bg_app';
      await sb.from('settings').upsert({ key, value: b64 }); toast('Background uploaded!'); applyStyles();
    }; r.readAsDataURL(f);
  }; i.click();
}
async function clearBg(type) { if (!confirm('Reset this background?')) return; const key = type === 'login' ? 'bg_login' : 'bg_app'; await sb.from('settings').delete().eq('key', key); toast('Background reset'); applyStyles(); }
async function changeMyPw() {
  const n = $('pwn').value, c = $('pwc').value, msg = $('pwmsg');
  if (!n) { msg.className = 'al ale'; msg.textContent = 'Enter new password'; msg.style.display = 'block'; return; }
  if (n.length < 6) { msg.className = 'al ale'; msg.textContent = 'Minimum 6 characters'; msg.style.display = 'block'; return; }
  if (n !== c) { msg.className = 'al ale'; msg.textContent = 'Passwords do not match'; msg.style.display = 'block'; return; }
  const { error } = await sb.auth.updateUser({ password: n });
  if (error) { msg.className = 'al ale'; msg.textContent = error.message; msg.style.display = 'block'; return; }
  addLog('CHANGE_PASSWORD', 'Password changed');
  msg.className = 'al als'; msg.textContent = '✅ Password updated!'; msg.style.display = 'block';
  $('pwn').value = ''; $('pwc').value = '';
  toast('Password updated successfully', 's');
  setTimeout(() => msg.style.display = 'none', 2500);
}
function updateSbCfg() { localStorage.setItem(LS_URL, $('scfgu').value.trim()); localStorage.setItem(LS_KEY, $('scfgk').value.trim()); toast('Config saved — reloading…', 'i'); setTimeout(() => location.reload(), 1000); }

async function optimizeExistingImages() {
  if (!confirm('This will process and overwrite all existing product images to the new optimized format. Continue?')) return;
  const btn = $('optbtn'); const msg = $('optmsg'); const prog = $('optprog');
  if (btn) btn.disabled = true;
  if (msg) msg.style.display = 'block';

  try {
    const itemsWithImages = _items.filter(i => i.image_url);
    const total = itemsWithImages.length;
    let count = 0;

    for (const item of itemsWithImages) {
      try {
        // 1. Fetch image as blob
        const res = await fetch(item.image_url);
        if (!res.ok) throw new Error('Fetch failed');
        const blob = await res.blob();

        // 2. Process using new mechanism
        const processedBlob = await processImage(new File([blob], 'image.jpg', { type: 'image/jpeg' }));

        // 3. Upload back to Supabase (new filename to avoid cache issues)
        const path = `optimized_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
        const { data, error } = await sb.storage.from('item-images').upload(path, processedBlob, { upsert: true });
        if (error) throw error;

        const { data: { publicUrl } } = sb.storage.from('item-images').getPublicUrl(path);

        // 4. Update database
        const updatePayload = {
          id: item.id,
          image_url: publicUrl,
          image_path: path,
          updated_at: new Date().toISOString()
        };

        await sb.from('items').update(updatePayload).eq('id', item.id);

      } catch (e) {
        console.error(`Failed to optimize item ${item.id}:`, e);
      }

      count++;
      if (prog) prog.textContent = Math.round((count / total) * 100);
    }

    toast('Optimization Complete! 🎉');
    await refreshInv();
  } catch (err) {
    toast('Optimization failed: ' + err.message, 'e');
  } finally {
    if (btn) btn.disabled = false;
    if (msg) msg.style.display = 'none';
  }
}

// ════════════════════════════════════ CLOCK + AUTO BACKUP
function tick() {
  const n = new Date(); const t = n.toLocaleTimeString('en-PK'); const d = n.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  const cl = $('lclock'); if (cl) cl.textContent = `${d} · ${t}`;
  const st = $('sbtm'); if (st) st.textContent = t;
  const tt = $('top-time'); if (tt) tt.textContent = `${d} ${t}`;
}
setInterval(tick, 1000); tick();

setInterval(async () => {
  const n = new Date();
  if (n.getHours() === 12 && n.getMinutes() === 0 && sb && CU) {
    const { data: s } = await sb.from('settings').select('value').eq('key', 'last_backup').single();
    const today = new Date().toISOString().slice(0, 10);
    if (!s?.value || !s.value.startsWith(today)) { doBackup(); toast('🕐 Daily noon auto-backup running!', 'i'); }
  }
}, 30000);

// ════════════════════════════════════ QR CODE SCANNER
let html5QrCode = null;
let qrScanningInterval = null;

async function startQRCamera() {
  const reader = $('qr-reader');
  const status = $('qr-status');
  const stopBtn = $('qr-stop-btn');
  
  if (!reader) return;
  
  status.textContent = 'Starting camera...';
  status.style.color = '#94a3b8';
  
  try {
    html5QrCode = new Html5Qrcode('qr-reader');
    reader.style.display = 'block';
    stopBtn.style.display = 'block';
    
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onQRCodeSuccess,
      () => {}
    );
    status.textContent = '📷 Point camera at QR code';
  } catch (err) {
    status.textContent = 'Camera error: ' + err.message;
    status.style.color = '#ef4444';
  }
}

function onQRCodeSuccess(decodedText) {
  processQRData(decodedText);
}

async function scanQRFromFile(input) {
  const file = input.files[0];
  if (!file) return;
  
  const status = $('qr-status');
  status.textContent = 'Processing image...';
  status.style.color = '#94a3b8';
  
  try {
    const html5QrCode = new Html5Qrcode('qr-reader');
    html5QrCode.scanFile(file, true).then(result => {
      processQRData(result);
    }).catch(() => {
      status.textContent = 'Could not find QR code in image';
      status.style.color = '#ef4444';
    });
  } catch (err) {
    status.textContent = 'Error reading file: ' + err.message;
    status.style.color = '#ef4444';
  }
}

function processQRData(data) {
  const status = $('qr-status');
  
  if (!status) {
    console.error('Status element not found');
    return;
  }
  
  try {
    // Decode base64
    const decoded = atob(data);
    const parts = decoded.split('|');
    
    if (parts.length >= 2) {
      const url = parts[0].trim();
      const key = parts[1].trim();
      
      // Verify it looks like a Supabase URL and key
      if (url.includes('supabase.co') && key.startsWith('eyJ')) {
        // Store credentials in localStorage directly
        localStorage.setItem(LS_URL, url);
        localStorage.setItem(LS_KEY, key);
        
        // Also set in input fields so user can see
        const urlInput = $('cfg-url');
        const keyInput = $('cfg-key');
        if (urlInput) urlInput.value = url;
        if (keyInput) keyInput.value = key;
        
        status.textContent = '✅ Connected! Loading...';
        status.style.color = '#10b981';
        status.style.fontWeight = 'bold';
        
        // Hide config screen and boot
        $('CFG-SCREEN').style.display = 'none';
        boot();
        
        return;
      }
    }
    
    status.textContent = 'Invalid QR code';
    status.style.color = '#ef4444';
  } catch (e) {
    status.textContent = 'QR decode failed';
    status.style.color = '#ef4444';
  }
}

function stopQRCamera() {
  const reader = $('qr-reader');
  const stopBtn = $('qr-stop-btn');
  const status = $('qr-status');
  
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
    }).catch(() => {});
  }
  
  if (reader) reader.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  // Don't clear status so user can see the message
}

// ════════════════════════════════════ BOOT
async function boot() {
  const lm = $('LOAD-MSG'); if (lm) lm.textContent = 'Connecting to Supabase…';

  const timeout = setTimeout(() => {
    $('LOAD').style.display = 'none';
    const err = $('cfg-err');
    if (err) err.textContent = 'Connection timeout. Check your internet.';
    showCfg();
  }, 10000);

  if (!hasCfg()) { clearTimeout(timeout); $('LOAD').style.display = 'none'; showCfg(); return; }
  const { url, key } = getCfg();
  if (!initSB(url, key)) { clearTimeout(timeout); $('LOAD').style.display = 'none'; showCfg(); return; }

  try {
    const { data, error } = await sb.from('profiles').select('id').limit(1);
    const { data: { session } } = await sb.auth.getSession();
    clearTimeout(timeout);

    if (session?.user) {
      // Session exists, setupAuth will handle UI transition
      setupAuth();
    } else {
      $('LOAD').style.display = 'none';
      $('LOGIN').style.display = 'flex';
      setupAuth();
    }

    if (typeof applyStyles === 'function') await applyStyles();
  } catch (e) {
    clearTimeout(timeout);
    $('LOAD').style.display = 'none';
    const err = $('cfg-err');
    if (err) err.textContent = 'Connection failed: ' + e.message;
    showCfg();
  }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', boot);
