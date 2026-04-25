/* =====================================================
   CONFIG
   ===================================================== */
const API_URL = "https://script.google.com/macros/s/AKfycbzaF-jeGL5EEbk0ZahQ91ZJnxTayfsaV-sW9mcC9ouy2U4TIxex_sEwXCJdUqkeoM_y2A/exec";

/* =====================================================
   STATE
   ===================================================== */
let allData      = [];
let filterStatus = 'all';
let deleteTarget = null;
let syncInterval = null;
let selectedYear = new Date().getFullYear() + 543;

/* =====================================================
   HELPER
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
   FETCH DATA
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
   RENDER TABLE — แบ่งกลุ่มตามสถานะ
   ===================================================== */

// ลำดับ section และ label
const STATUS_SECTIONS = [
  { key: 'รับคิวเรียบร้อย',        icon: '📥', label: 'รับคิวเรียบร้อย — ยังไม่ได้เริ่ม',  colorClass: 'section-queue'  },
  { key: 'ออกแบบเสร็จเรียบร้อย',  icon: '🎨', label: 'กำลังดำเนินการ — ออกแบบเสร็จแล้ว', colorClass: 'section-design' },
  { key: 'อัดรูปเสร็จเรียบร้อย',  icon: '🖨️', label: 'กำลังดำเนินการ — อัดรูปเสร็จแล้ว', colorClass: 'section-print'  },
  { key: 'จัดส่งเสร็จเรียบร้อย',  icon: '✅', label: 'เสร็จสิ้น — จัดส่งเรียบร้อยแล้ว',  colorClass: 'section-done'   },
];

function renderTable() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const tbody  = document.getElementById('tableBody');

  let filtered = allData.filter(row => {
    const matchFilter = filterStatus === 'all' || row.status === filterStatus;
    const matchSearch = !search || (row.name || '').toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });

  document.getElementById('tableCount').textContent = filtered.length + ' รายการ';

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <div class="empty-icon">🌸</div>
            <div class="empty-text">ไม่พบข้อมูลลูกค้า</div>
            <div class="empty-subtext">ลองเปลี่ยนตัวกรอง หรือเพิ่มลูกค้าใหม่</div>
          </div>
        </td>
      </tr>`;
    return;
  }

  // ถ้ากรองอยู่ ให้แสดงแบบปกติ (ไม่แบ่ง section)
  if (filterStatus !== 'all' || search) {
    tbody.innerHTML = filtered.map((row, i) => renderRow(row, i + 1)).join('');
    return;
  }

  // แสดงแบบแบ่ง section ตามสถานะ
  let html = '';
  let globalIdx = 1;

  STATUS_SECTIONS.forEach(section => {
    const rows = filtered.filter(r => r.status === section.key);
    if (rows.length === 0) return;

    html += `
      <tr class="section-header-row ${section.colorClass}">
        <td colspan="9">
          <div class="section-header-content">
            <span class="section-header-icon">${section.icon}</span>
            <span class="section-header-label">${section.label}</span>
            <span class="section-header-count">${rows.length} รายการ</span>
          </div>
        </td>
      </tr>`;

    rows.forEach(row => {
      html += renderRow(row, globalIdx++);
    });
  });

  tbody.innerHTML = html;
}

function renderRow(row, idx) {
  // FIX: Normalize dueDate — handles snake_case, lowercase, or camelCase from API
  const dueDateValue = row.dueDate || row.due_date || row.duedate || row.DueDate || '';
  const dueLabel = dueDateValue
    ? `<span class="due-tag">📅 ${esc(dueDateValue)}</span>`
    : '<span style="color:var(--text-muted);font-size:12px">—</span>';

  return `
    <tr>
      <td><span class="queue-number">#${idx}</span></td>
      <td><div class="customer-name">${esc(row.name || '—')}</div></td>
      <td>${renderBadge(row.status)}</td>
      <td><span class="delivery-tag">${deliveryIcon(row.delivery)} ${esc(row.delivery || '—')}</span></td>
      <td style="text-align:center;font-weight:600;color:var(--text-dark)">${row.qty ? Number(row.qty).toLocaleString('th-TH') + ' ชิ้น' : '—'}</td>
      <td style="text-align:right;font-weight:600;color:var(--pink-600)">${row.price ? '฿' + Number(row.price).toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
      <td>${dueLabel}</td>
      <td style="font-size:13px;color:var(--text-medium);max-width:140px;">${esc(row.note || '—')}</td>
      <td>
        <div class="action-group" style="justify-content:center">
          <button class="btn-action btn-edit"   onclick="openEditModal(${row.rowIndex})" title="แก้ไข">✏️</button>
          <button class="btn-action btn-status" onclick="cycleStatus(${row.rowIndex})"   title="เปลี่ยนสถานะ">🔄</button>
          <button class="btn-action btn-delete" onclick="confirmDelete(${row.rowIndex})" title="ลบ">🗑️</button>
        </div>
      </td>
    </tr>`;
}

/* =====================================================
   BADGE & ICONS
   ===================================================== */
function renderBadge(status) {
  const map = {
    'รับคิวเรียบร้อย':           ['badge-queue',  '📥 รับคิวแล้ว'],
    'ออกแบบเสร็จเรียบร้อย':     ['badge-design', '🎨 ออกแบบเสร็จ'],
    'อัดรูปเสร็จเรียบร้อย':     ['badge-print',  '🖨️ อัดรูปเสร็จ'],
    'จัดส่งเสร็จเรียบร้อย':     ['badge-done',   '✅ จัดส่งเสร็จ'],
  };
  const [cls, label] = map[status] || ['badge-queue', status || '—'];
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
   STATS — อัปเดตการ์ดเท่านั้น (ไม่มี breakdown pills)
   ===================================================== */
function updateStats() {
  const queueCount  = allData.filter(r => r.status === 'รับคิวเรียบร้อย').length;
  const designCount = allData.filter(r => r.status === 'ออกแบบเสร็จเรียบร้อย').length;
  const printCount  = allData.filter(r => r.status === 'อัดรูปเสร็จเรียบร้อย').length;
  const doneCount   = allData.filter(r => r.status === 'จัดส่งเสร็จเรียบร้อย').length;
  const inProgress  = designCount + printCount;

  // ✅ รายได้จริง = จัดส่งเสร็จเรียบร้อยเท่านั้น
  const earnedRevenue = allData
    .filter(r => r.status === 'จัดส่งเสร็จเรียบร้อย')
    .reduce((sum, r) => sum + (Number(r.price) || 0), 0);

  // ✅ รายได้ที่คาดว่าจะได้ = ยังไม่จัดส่ง (3 สถานะแรก)
  const expectedRevenue = allData
    .filter(r => r.status !== 'จัดส่งเสร็จเรียบร้อย')
    .reduce((sum, r) => sum + (Number(r.price) || 0), 0);

  document.getElementById('statAll').textContent      = allData.length;
  document.getElementById('statProgress').textContent = inProgress;
  document.getElementById('statQueue').textContent    = queueCount;
  document.getElementById('statDesign').textContent   = designCount;
  document.getElementById('statPrint').textContent    = printCount;
  document.getElementById('statDone').textContent     = doneCount;

  // ✅ อัปเดต stat รายได้ทั้งสอง
  document.getElementById('statEarned').textContent   =
    '฿' + earnedRevenue.toLocaleString('th-TH', {minimumFractionDigits: 0});
  document.getElementById('statExpected').textContent =
    '฿' + expectedRevenue.toLocaleString('th-TH', {minimumFractionDigits: 0});
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
  const buckets = {};
  for (let m = 1; m <= 12; m++) {
    const adYear = selectedYear - 543;
    const key = `${adYear}-${String(m).padStart(2,'0')}`;
    buckets[key] = { items: 0, earned: 0, expected: 0, orders: 0 };
  }

  allData.forEach(row => {
    if (!row.createdAt) return;
    const d = new Date(row.createdAt);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!buckets[key]) return;
    buckets[key].orders++;
    buckets[key].items += Number(row.qty) || 0;

    if (row.status === 'จัดส่งเสร็จเรียบร้อย') {
      buckets[key].earned   += Number(row.price) || 0;
    } else {
      buckets[key].expected += Number(row.price) || 0;
    }
  });

  const cards = Object.entries(buckets).map(([key, data], idx) => {
    const monthName = MONTH_NAMES_TH[idx];
    const hasData   = data.orders > 0;
    return `
      <div class="month-card ${hasData ? 'has-data' : ''}" onclick="openMonthModal('${key}', '${monthName}')">
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
            <span class="month-stat-icon">⏳</span>
            <div>
              <div class="month-stat-num" style="color:var(--text-medium)">฿${data.expected.toLocaleString('th-TH')}</div>
              <div class="month-stat-label">รอรับ</div>
            </div>
          </div>
          <div class="month-stat">
            <span class="month-stat-icon">✅</span>
            <div>
              <div class="month-stat-num revenue">฿${data.earned.toLocaleString('th-TH')}</div>
              <div class="month-stat-label">รายได้จริง</div>
            </div>
          </div>
        </div>
        <div class="month-orders">${data.orders} ออเดอร์</div>
        <div class="month-view-btn">👆 คลิกดูรายละเอียด</div>
      </div>`;
  }).join('');

  const totalEarned   = Object.values(buckets).reduce((s,b) => s + b.earned,   0);
  const totalExpected = Object.values(buckets).reduce((s,b) => s + b.expected, 0);
  const totalItems    = Object.values(buckets).reduce((s,b) => s + b.items,    0);
  const totalOrders   = Object.values(buckets).reduce((s,b) => s + b.orders,   0);

  grid.innerHTML = cards + `
    <div class="month-card yearly-total">
      <div class="month-name">🌸 รวมทั้งปี</div>
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
          <span class="month-stat-icon">⏳</span>
          <div>
            <div class="month-stat-num" style="color:var(--text-medium)">฿${totalExpected.toLocaleString('th-TH')}</div>
            <div class="month-stat-label">รอรับ</div>
          </div>
        </div>
        <div class="month-stat">
          <span class="month-stat-icon">✅</span>
          <div>
            <div class="month-stat-num revenue">฿${totalEarned.toLocaleString('th-TH')}</div>
            <div class="month-stat-label">รายได้จริง</div>
          </div>
        </div>
      </div>
      <div class="month-orders">${totalOrders} ออเดอร์</div>
    </div>`;
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
  document.getElementById('fieldStatus').value        = 'รับคิวเรียบร้อย';
  document.getElementById('fieldDelivery').value      = 'ส่งไปรษณีย์';
  document.getElementById('fieldQty').value           = '';
  document.getElementById('fieldPrice').value         = '';
  document.getElementById('fieldDueDate').value       = '';
  document.getElementById('fieldNote').value          = '';
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fieldName').focus(), 300);
}

/* ===== MODAL — OPEN (แก้ไข) ===== */
function openEditModal(rowIndex) {
  const row = allData.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  // FIX: Same normalization when populating the edit form
  const dueDateValue = row.dueDate || row.due_date || row.duedate || row.DueDate || '';

  document.getElementById('modalIcon').textContent    = '✏️';
  document.getElementById('modalTitle').textContent   = 'แก้ไขข้อมูลลูกค้า';
  document.getElementById('editRowIndex').value       = rowIndex;
  document.getElementById('fieldCreatedAt').value     = row.createdAt || new Date().toISOString();
  document.getElementById('fieldName').value          = row.name     || '';
  document.getElementById('fieldStatus').value        = row.status   || 'รับคิวเรียบร้อย';
  document.getElementById('fieldDelivery').value      = row.delivery || 'ส่งไปรษณีย์';
  document.getElementById('fieldQty').value           = row.qty      || '';
  document.getElementById('fieldPrice').value         = row.price    || '';
  document.getElementById('fieldDueDate').value       = dueDateValue; // ✅ normalized
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
  const dueDate   = document.getElementById('fieldDueDate').value.trim();
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
    rowIndex, name, status, delivery, qty, price, dueDate, note, createdAt
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

  const order = ['รับคิวเรียบร้อย', 'ออกแบบเสร็จเรียบร้อย', 'อัดรูปเสร็จเรียบร้อย', 'จัดส่งเสร็จเรียบร้อย'];
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
    <button class="toast-close" onclick="removeToast('${id}')">✕</button>`;
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
   MONTH DETAIL MODAL
   ===================================================== */
let monthModalFilter = 'all';
let monthModalKey    = '';

function openMonthModal(key, monthName) {
  monthModalKey    = key;
  monthModalFilter = 'all';

  const [year, mon] = key.split('-');
  const thYear = Number(year) + 543;

  document.getElementById('monthModalIcon').textContent  = '📅';
  document.getElementById('monthModalTitle').textContent = `${monthName} ${thYear}`;
  document.getElementById('monthModalOverlay').classList.add('open');
  renderMonthModal();
}

function closeMonthModal() {
  document.getElementById('monthModalOverlay').classList.remove('open');
}

function handleMonthOverlayClick(e) {
  if (e.target === document.getElementById('monthModalOverlay')) closeMonthModal();
}

function getMonthRows() {
  return allData.filter(row => {
    if (!row.createdAt) return false;
    const d = new Date(row.createdAt);
    if (isNaN(d)) return false;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return k === monthModalKey;
  });
}

function renderMonthModal() {
  const rows = getMonthRows();

  // Summary chips
  const totalOrders  = rows.length;
  const totalItems   = rows.reduce((s, r) => s + (Number(r.qty)   || 0), 0);
  const totalEarned  = rows.filter(r => r.status === 'จัดส่งเสร็จเรียบร้อย').reduce((s, r) => s + (Number(r.price) || 0), 0);
  const totalExpect  = rows.filter(r => r.status !== 'จัดส่งเสร็จเรียบร้อย').reduce((s, r) => s + (Number(r.price) || 0), 0);

  document.getElementById('monthModalSummary').innerHTML = `
    <div class="month-summary-chip"><span>🛒</span><span class="chip-val">${totalOrders}</span><span>ออเดอร์</span></div>
    <div class="month-summary-chip"><span>📦</span><span class="chip-val">${totalItems.toLocaleString('th-TH')}</span><span>ชิ้น</span></div>
    <div class="month-summary-chip"><span>⏳</span><span class="chip-val">฿${totalExpect.toLocaleString('th-TH')}</span><span>รอรับ</span></div>
    <div class="month-summary-chip"><span>💰</span><span class="chip-val">฿${totalEarned.toLocaleString('th-TH')}</span><span>รายได้จริง</span></div>
  `;

  // Count per status
  const statusCounts = {};
  STATUS_SECTIONS.forEach(s => {
    statusCounts[s.key] = rows.filter(r => r.status === s.key).length;
  });

  // Tabs
  const tabs = [
    { key: 'all', icon: '📋', label: 'ทั้งหมด', count: rows.length },
    ...STATUS_SECTIONS.map(s => ({ key: s.key, icon: s.icon, label: s.icon + ' ' + s.key.replace('เรียบร้อย','').trim(), count: statusCounts[s.key] }))
  ];

  document.getElementById('monthModalTabs').innerHTML = tabs.map(t => `
    <button class="month-tab-btn ${monthModalFilter === t.key ? 'active' : ''}"
            onclick="setMonthFilter('${t.key}')">
      ${t.label} <span class="tab-count">${t.count}</span>
    </button>`).join('');

  // Filter rows
  const filtered = monthModalFilter === 'all'
    ? rows
    : rows.filter(r => r.status === monthModalFilter);

  document.getElementById('monthModalCount').textContent = filtered.length + ' รายการ';

  // Table body
  const tbody = document.getElementById('monthModalBody');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="month-empty">
        <div class="month-empty-icon">🌸</div>
        <div class="month-empty-text">ไม่มีออเดอร์ในหมวดนี้</div>
      </div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((row, i) => {
    const dueDateValue = row.dueDate || row.due_date || row.duedate || row.DueDate || '';
    const dueLabel = dueDateValue
      ? `<span class="due-tag">📅 ${esc(dueDateValue)}</span>`
      : '<span style="color:var(--text-muted);font-size:12px">—</span>';
    return `
      <tr>
        <td><span class="queue-number">#${i+1}</span></td>
        <td><div class="customer-name">${esc(row.name || '—')}</div></td>
        <td>${renderBadge(row.status)}</td>
        <td><span class="delivery-tag">${deliveryIcon(row.delivery)} ${esc(row.delivery || '—')}</span></td>
        <td style="text-align:center;font-weight:600;color:var(--text-dark)">${row.qty ? Number(row.qty).toLocaleString('th-TH') + ' ชิ้น' : '—'}</td>
        <td style="text-align:right;font-weight:600;color:var(--pink-600)">${row.price ? '฿' + Number(row.price).toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td>${dueLabel}</td>
        <td style="font-size:13px;color:var(--text-medium);max-width:140px;">${esc(row.note || '—')}</td>
        <td>
          <div class="action-group" style="justify-content:center">
            <button class="btn-action btn-edit"   onclick="closeMonthModal(); openEditModal(${row.rowIndex})" title="แก้ไข">✏️</button>
            <button class="btn-action btn-status" onclick="cycleStatusFromMonth(${row.rowIndex})" title="เปลี่ยนสถานะ">🔄</button>
            <button class="btn-action btn-delete" onclick="closeMonthModal(); confirmDelete(${row.rowIndex})" title="ลบ">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function setMonthFilter(key) {
  monthModalFilter = key;
  renderMonthModal();
}

async function cycleStatusFromMonth(rowIndex) {
  const row = allData.find(r => r.rowIndex === rowIndex);
  if (!row) return;
  const order = ['รับคิวเรียบร้อย', 'ออกแบบเสร็จเรียบร้อย', 'อัดรูปเสร็จเรียบร้อย', 'จัดส่งเสร็จเรียบร้อย'];
  const next  = order[(order.indexOf(row.status) + 1) % order.length];
  row.status  = next;
  renderMonthModal();
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
   KEYBOARD SHORTCUTS
   ===================================================== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); closeMonthModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.getElementById('modalOverlay').classList.contains('open')) saveCustomer();
  }
});
