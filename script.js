/* =====================================================
   CONFIG — แทนที่ URL ด้านล่างด้วย Google Apps Script Web App URL ของคุณ
   ===================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbwUqPk0-tdH3zZJFxtAmaCFPp8pOOrLWBA3j3XvYq9vBEZOwHkgYAepFqosFUlWIOdaAw/exec";

/* =====================================================
   STATE
   ===================================================== */
let allData      = [];
let filterStatus = 'all';
let deleteTarget = null;
let syncInterval = null;
let selectedYear = new Date().getFullYear() + 543; // พ.ศ.

/* =====================================================
   HELPER — แปลง object → query string
   ===================================================== */
function toQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

/* =====================================================
   INIT
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('selectedYear').textContent = selectedYear;
  fetchData();
  syncInterval = setInterval(fetchData, 10000);
});

/* =====================================================
   FETCH DATA (GET)
   ===================================================== */
async function fetchData() {
  setSyncStatus('loading');
  try {
    const res  = await fetch(`${API_URL}?action=getAll`, { cache: 'no-store' });
    const json = await res.json();

    if (json.status === 'success') {
      allData = json.data || [];
      renderTable();
      updateStats();
      renderMonthly();
      setSyncStatus('connected');
      document.getElementById('lastUpdated').textContent =
        'อัปเดตล่าสุด: ' + new Date().toLocaleTimeString('th-TH');
    } else {
      throw new Error(json.message || 'API Error');
    }
  } catch (err) {
    setSyncStatus('error');
    console.error('fetchData error:', err);
    showToast('error', '❌ เชื่อมต่อล้มเหลว', err.message || 'ไม่สามารถดึงข้อมูลจาก API ได้');
  }
}

/* =====================================================
   RENDER TABLE
   ===================================================== */
function renderTable() {
  const search  = document.getElementById('searchInput').value.toLowerCase().trim();
  const tbody   = document.getElementById('tableBody');

  let filtered = allData.filter(row => {
    const matchFilter = filterStatus === 'all' || row.status === filterStatus;
    const matchSearch = !search ||
      (row.name  || '').toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });

  document.getElementById('tableCount').textContent = filtered.length + ' รายการ';

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">🌸</div>
            <div class="empty-text">ไม่พบข้อมูลลูกค้า</div>
            <div class="empty-subtext">ลองเปลี่ยนตัวกรอง หรือเพิ่มลูกค้าใหม่</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((row, i) => `
    <tr>
      <td><span class="queue-number">#${i + 1}</span></td>
      <td><div class="customer-name">${esc(row.name || '—')}</div></td>
      <td>${renderBadge(row.status)}</td>
      <td><span class="delivery-tag">${deliveryIcon(row.delivery)} ${esc(row.delivery || '—')}</span></td>
      <td style="text-align:center;font-weight:600;color:var(--text-dark)">${row.qty ? Number(row.qty).toLocaleString('th-TH') + ' ชิ้น' : '—'}</td>
      <td style="text-align:right;font-weight:600;color:var(--pink-600)">${row.price ? '฿' + Number(row.price).toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
      <td style="font-size:13px;color:var(--text-medium);max-width:160px;">${esc(row.note || '—')}</td>
      <td>
        <div class="action-group" style="justify-content:center">
          <button class="btn-action btn-edit"   onclick="openEditModal(${row.rowIndex})" title="แก้ไข">✏️</button>
          <button class="btn-action btn-status" onclick="cycleStatus(${row.rowIndex})"   title="เปลี่ยนสถานะ">🔄</button>
          <button class="btn-action btn-delete" onclick="confirmDelete(${row.rowIndex})" title="ลบ">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* =====================================================
   BADGE & ICONS
   ===================================================== */
function renderBadge(status) {
  const map = {
    'ออกแบบเสร็จเรียบร้อย': ['badge-design',  '🎨 ออกแบบเสร็จ'],
    'อัดรูปเสร็จเรียบร้อย':  ['badge-print',   '🖨️ อัดรูปเสร็จ'],
    'จัดส่งเสร็จเรียบร้อย':  ['badge-done',    '✅ จัดส่งเสร็จ'],
  };
  const [cls, label] = map[status] || ['badge-design', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function deliveryIcon(type) {
  const map = { 'มารับที่บ้าน': '🏠', 'ส่งไรเดอร์': '🛵', 'ส่งไปรษณีย์': '📮' };
  return map[type] || '📦';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =====================================================
   STATS
   ===================================================== */
function updateStats() {
  document.getElementById('statAll').textContent    = allData.length;
  document.getElementById('statDesign').textContent =
    allData.filter(r => r.status === 'ออกแบบเสร็จเรียบร้อย').length;
  document.getElementById('statDone').textContent   =
    allData.filter(r => r.status === 'จัดส่งเสร็จเรียบร้อย').length;
  const totalItems = allData.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  document.getElementById('statItems').textContent  = totalItems.toLocaleString('th-TH');
}

/* =====================================================
   MONTHLY SUMMARY
   ===================================================== */
const MONTH_NAMES_TH = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
  'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
  'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];

function changeYear(delta) {
  selectedYear += delta;
  document.getElementById('selectedYear').textContent = selectedYear;
  renderMonthly();
}

function renderMonthly() {
  const grid = document.getElementById('monthlyGrid');

  // group by year/month using createdAt field (ISO string) or fallback
  // key: "YYYY-MM" in AD
  const buckets = {};
  for (let m = 1; m <= 12; m++) {
    const adYear = selectedYear - 543;
    const key = `${adYear}-${String(m).padStart(2,'0')}`;
    buckets[key] = { items: 0, revenue: 0, orders: 0 };
  }

  allData.forEach(row => {
    if (!row.createdAt) return;
    const d = new Date(row.createdAt);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (buckets[key]) {
      buckets[key].orders++;
      buckets[key].items   += Number(row.qty)   || 0;
      buckets[key].revenue += Number(row.price) || 0;
    }
  });

  const adYear = selectedYear - 543;
  const cards = Object.entries(buckets).map(([key, data], idx) => {
    const monthName = MONTH_NAMES_TH[idx];
    const hasData = data.orders > 0;
    return `
      <div class="month-card ${hasData ? 'has-data' : ''}">
        <div class="month-name">${monthName}</div>
        <div class="month-year">${selectedYear}</div>
        <div class="month-stats">
          <div class="month-stat">
            <span class="month-stat-icon">📦</span>
            <div>
              <div class="month-stat-num">${data.items.toLocaleString('th-TH')}</div>
              <div class="month-stat-label">ชิ้น</div>
            </div>
          </div>
          <div class="month-stat">
            <span class="month-stat-icon">💰</span>
            <div>
              <div class="month-stat-num revenue">฿${data.revenue.toLocaleString('th-TH', {minimumFractionDigits:0})}</div>
              <div class="month-stat-label">รายได้</div>
            </div>
          </div>
        </div>
        <div class="month-orders">${data.orders} ออเดอร์</div>
      </div>
    `;
  }).join('');

  // Yearly total
  const totalItems   = Object.values(buckets).reduce((s,b) => s+b.items, 0);
  const totalRevenue = Object.values(buckets).reduce((s,b) => s+b.revenue, 0);
  const totalOrders  = Object.values(buckets).reduce((s,b) => s+b.orders, 0);

  grid.innerHTML = cards + `
    <div class="month-card yearly-total">
      <div class="month-name">รวมทั้งปี</div>
      <div class="month-year">${selectedYear}</div>
      <div class="month-stats">
        <div class="month-stat">
          <span class="month-stat-icon">📦</span>
          <div>
            <div class="month-stat-num">${totalItems.toLocaleString('th-TH')}</div>
            <div class="month-stat-label">ชิ้น</div>
          </div>
        </div>
        <div class="month-stat">
          <span class="month-stat-icon">💰</span>
          <div>
            <div class="month-stat-num revenue">฿${totalRevenue.toLocaleString('th-TH', {minimumFractionDigits:0})}</div>
            <div class="month-stat-label">รายได้</div>
          </div>
        </div>
      </div>
      <div class="month-orders">${totalOrders} ออเดอร์</div>
    </div>
  `;
}

/* =====================================================
   FILTER & SEARCH
   ===================================================== */
function setFilter(status, btn) {
  filterStatus = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTable();
}

function applyFilter() {
  renderTable();
}

/* =====================================================
   REFRESH
   ===================================================== */
function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  setTimeout(() => btn.classList.remove('spinning'), 600);
  fetchData();
}

/* =====================================================
   MODAL — OPEN (เพิ่ม)
   ===================================================== */
function openModal() {
  document.getElementById('modalIcon').textContent    = '🌸';
  document.getElementById('modalTitle').textContent   = 'เพิ่มลูกค้าใหม่';
  document.getElementById('editRowIndex').value       = '';
  document.getElementById('fieldCreatedAt').value     = new Date().toISOString();
  document.getElementById('fieldName').value          = '';
  document.getElementById('fieldStatus').value        = 'ออกแบบเสร็จเรียบร้อย';
  document.getElementById('fieldDelivery').value      = 'ส่งไปรษณีย์';
  document.getElementById('fieldQty').value           = '';
  document.getElementById('fieldPrice').value         = '';
  document.getElementById('fieldNote').value          = '';
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fieldName').focus(), 300);
}

/* ===== MODAL — OPEN (แก้ไข) ===== */
function openEditModal(rowIndex) {
  const row = allData.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  document.getElementById('modalIcon').textContent    = '✏️';
  document.getElementById('modalTitle').textContent   = 'แก้ไขข้อมูลลูกค้า';
  document.getElementById('editRowIndex').value       = rowIndex;
  document.getElementById('fieldCreatedAt').value     = row.createdAt || new Date().toISOString();
  document.getElementById('fieldName').value          = row.name     || '';
  document.getElementById('fieldStatus').value        = row.status   || 'ออกแบบเสร็จเรียบร้อย';
  document.getElementById('fieldDelivery').value      = row.delivery || 'ส่งไปรษณีย์';
  document.getElementById('fieldQty').value           = row.qty      || '';
  document.getElementById('fieldPrice').value         = row.price    || '';
  document.getElementById('fieldNote').value          = row.note     || '';
  document.getElementById('modalOverlay').classList.add('open');
}

/* ===== MODAL — CLOSE ===== */
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

/* =====================================================
   SAVE
   ===================================================== */
async function saveCustomer() {
  const name      = document.getElementById('fieldName').value.trim();
  const status    = document.getElementById('fieldStatus').value;
  const delivery  = document.getElementById('fieldDelivery').value;
  const qty       = document.getElementById('fieldQty').value.trim();
  const price     = document.getElementById('fieldPrice').value.trim();
  const note      = document.getElementById('fieldNote').value.trim();
  const rowIndex  = document.getElementById('editRowIndex').value;
  const createdAt = document.getElementById('fieldCreatedAt').value || new Date().toISOString();

  if (!name) {
    showToast('error', '⚠️ กรุณากรอกข้อมูล', 'ชื่อ / iG ลูกค้าจำเป็นต้องกรอก');
    document.getElementById('fieldName').focus();
    return;
  }

  const btnSave = document.getElementById('btnSave');
  btnSave.disabled = true;
  btnSave.innerHTML = '<span>⏳</span> กำลังบันทึก...';

  const params = {
    action: rowIndex ? 'update' : 'add',
    rowIndex, name, status, delivery, qty, price, note, createdAt
  };

  try {
    const res  = await fetch(`${API_URL}?${toQuery(params)}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message);

    closeModal();
    showToast('success', '✅ บันทึกสำเร็จ', rowIndex ? 'อัปเดตข้อมูลลูกค้าเรียบร้อย' : 'เพิ่มลูกค้าใหม่เรียบร้อย');
    fetchData();

  } catch (err) {
    showToast('error', '❌ เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    console.error(err);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span>💾</span> บันทึก';
  }
}

/* =====================================================
   CYCLE STATUS
   ===================================================== */
async function cycleStatus(rowIndex) {
  const row = allData.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  const order = ['ออกแบบเสร็จเรียบร้อย', 'อัดรูปเสร็จเรียบร้อย', 'จัดส่งเสร็จเรียบร้อย'];
  const next  = order[(order.indexOf(row.status) + 1) % order.length];
  row.status  = next;
  renderTable();
  updateStats();

  try {
    const params = { action: 'update', rowIndex, ...row };
    await fetch(`${API_URL}?${toQuery(params)}`, { cache: 'no-store' });
    showToast('success', '🔄 อัปเดตสถานะ', `เปลี่ยนเป็น "${next}" เรียบร้อย`);
  } catch (err) {
    showToast('error', '❌ อัปเดตล้มเหลว', err.message);
  }
}

/* =====================================================
   DELETE
   ===================================================== */
function confirmDelete(rowIndex) {
  deleteTarget = rowIndex;
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  deleteTarget = null;
  document.getElementById('confirmOverlay').classList.remove('open');
}

async function executeDelete() {
  if (!deleteTarget) return;
  const rowIndex = deleteTarget;
  closeConfirm();

  try {
    const res  = await fetch(`${API_URL}?${toQuery({ action: 'delete', rowIndex })}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message);
    showToast('success', '🗑️ ลบแล้ว', 'ลบข้อมูลลูกค้าออกจากระบบเรียบร้อย');
    fetchData();
  } catch (err) {
    showToast('error', '❌ ลบไม่สำเร็จ', err.message);
  }
}

/* =====================================================
   SYNC STATUS
   ===================================================== */
function setSyncStatus(state) {
  const dot  = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  dot.className = 'sync-dot';

  if (state === 'connected') {
    dot.classList.add('connected');
    text.textContent = 'เชื่อมต่อแล้ว';
  } else if (state === 'error') {
    dot.classList.add('error');
    text.textContent = 'เชื่อมต่อล้มเหลว';
  } else {
    text.textContent = 'กำลังซิงค์...';
  }
}

/* =====================================================
   TOAST
   ===================================================== */
function showToast(type, title, msg) {
  const container = document.getElementById('toastContainer');
  const id    = 'toast-' + Date.now();
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.id = id;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button class="toast-close" onclick="removeToast('${id}')">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => removeToast(id), 4000);
}

function removeToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'toast-out 0.3s ease forwards';
  setTimeout(() => el.remove(), 300);
}

/* =====================================================
   KEYBOARD SHORTCUTS
   ===================================================== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.getElementById('modalOverlay').classList.contains('open')) {
      saveCustomer();
    }
  }
});
