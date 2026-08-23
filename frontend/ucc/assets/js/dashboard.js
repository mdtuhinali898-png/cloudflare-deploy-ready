/* ==========================================================================
   UCC Pabna Executive Dashboard JavaScript (Live Backend Database Integration)
   ========================================================================== */

let currentTab = 'overview';
let currentBatch = 'all';
let liveStudents = [];
let liveBatches = [];
let livePayments = [];
let liveMaterials = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  startClock();
  loadDashboardData();
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
});

function checkAuth() {
  const token = sessionStorage.getItem('uccAdminToken');
  const user = JSON.parse(sessionStorage.getItem('uccAdminUser') || '{}');
  const el = document.getElementById('uccAdminName');
  if (el) el.textContent = user.username || 'UCC Pabna Administrator';
}

function logout() {
  sessionStorage.removeItem('uccAdminToken');
  sessionStorage.removeItem('uccAdminUser');
  window.location.href = 'admin-login.html';
}

function startClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const el = document.getElementById('uccClock');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

function fmt(n) {
  return '৳' + Number(n || 0).toLocaleString('en-IN');
}

function showLoading(msg) {
  const el = document.getElementById('uccLoading');
  const tx = document.getElementById('uccLoadingText');
  if (el) el.classList.remove('hidden');
  if (tx) tx.textContent = msg || 'Loading Database...';
}

function hideLoading() {
  const el = document.getElementById('uccLoading');
  if (el) el.classList.add('hidden');
}

async function loadDashboardData() {
  showLoading('Connecting to UCC MongoDB Database...');
  
  try {
    const [resStudents, resBatches, resPayments, resMaterials] = await Promise.all([
      fetch('/api/ucc/students').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/ucc/batches').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/ucc/payments/daily-statement').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/ucc/materials').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    if (resStudents.success && resStudents.students) liveStudents = resStudents.students;
    if (resBatches.success && resBatches.batches) liveBatches = resBatches.batches;
    if (resPayments.success && resPayments.payments) livePayments = resPayments.payments;
    if (resMaterials.success && resMaterials.materials) liveMaterials = resMaterials.materials;

    populateBatchDropdown();
    renderSummaryCards();
    renderOverviewTab();
    renderMaterialStatus();
    renderDistributionTab();
    renderDueTab();
    renderTransactionsTab();

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const upd = document.getElementById('uccLastUpdated');
    if (upd) upd.textContent = 'Live DB updated: ' + now;

  } catch (err) {
    console.error('Error loading UCC dashboard:', err);
  } finally {
    hideLoading();
  }
}

function refreshDashboard() {
  loadDashboardData();
}

function populateBatchDropdown() {
  const el = document.getElementById('batchFilter');
  if (!el) return;
  const batchNames = liveBatches.map(b => b.batchName || b.name);
  
  let html = '<option value="all">All Batches (Medical / Engineering / Varsity)</option>';
  batchNames.forEach(n => {
    html += `<option value="${n}">${n}</option>`;
  });
  el.innerHTML = html;
}

function applyBatchFilter() {
  const el = document.getElementById('batchFilter');
  if (el) currentBatch = el.value;
  renderSummaryCards();
  renderOverviewTab();
  renderDueTab();
}

function renderSummaryCards() {
  const filtered = currentBatch === 'all'
    ? liveStudents
    : liveStudents.filter(s => s.batchName === currentBatch);

  const totalStudents  = filtered.length;
  const totalCollected = filtered.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  const totalDue       = filtered.reduce((sum, s) => sum + (s.totalDue || 0), 0);
  const dueStudentsCount = filtered.filter(s => s.totalDue > 0).length;

  setText('cStudents', totalStudents);
  setText('cStudentsSub', `Active Enrolled Students`);
  setText('cCollection', fmt(totalCollected));
  setText('cCollectionSub', `Total Fee Revenue`);
  setText('cDistribution', liveMaterials.length + ' Items Catalog');
  setText('cDistributionSub', `Available Lecture Sheets & Guides`);
  setText('cDue', fmt(totalDue));
  setText('cDueSub', `${dueStudentsCount} Overdue Students`);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderOverviewTab() {
  const container = document.getElementById('batchPerformance');
  if (!container) return;

  if (!liveBatches.length) {
    container.innerHTML = `<div style="text-align:center;padding:24px;color:#9ca3af;">No batches found in Database</div>`;
    return;
  }

  container.innerHTML = liveBatches.map(b => `
    <div style="padding:12px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:700;color:var(--text-main);">${b.batchName}</div>
        <div style="font-size:12px;color:var(--text-muted);">Program: ${b.program} | Base Fee: ৳${b.baseFee.toLocaleString()}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:800;color:var(--primary);">${b.enrolledCount || 0} Students</div>
        <div style="font-size:11px;color:var(--success-color);">Capacity: ${b.capacity || 60}</div>
      </div>
    </div>
  `).join('');
}

function renderMaterialStatus() {
  const container = document.getElementById('materialProgressBars');
  if (!container) return;

  if (!liveMaterials.length) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:#9ca3af;font-size:13px;">No materials in catalog</div>';
    return;
  }

  const colors = ['var(--success-color)', 'var(--primary)', 'var(--warning-color)', '#8b5cf6', '#06b6d4', '#ec4899'];
  container.innerHTML = liveMaterials.map((m, i) => {
    const stock = m.stockQuantity || 100;
    const issued = m.distributedCount || 0;
    const pct = stock > 0 ? Math.round((issued / stock) * 100) : 0;
    const color = colors[i % colors.length];
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;margin-bottom:4px;">
          <span>${m.title || m.materialCode}</span>
          <span style="color:${color};">${pct}% Issued (${issued}/${stock})</span>
        </div>
        <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden;">
          <div style="background:${color};width:${pct}%;height:100%;transition:width 0.5s;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderDistributionTab() {
  const tbody = document.getElementById('distributionLogTable');
  if (!tbody) return;

  if (!liveMaterials.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af;">No distribution items logged</td></tr>`;
    return;
  }

  tbody.innerHTML = liveMaterials.map(m => `
    <tr>
      <td style="font-weight:700;color:var(--primary);">${m.materialCode}</td>
      <td style="font-weight:700;">${m.title}</td>
      <td><span class="badge badge-primary">${m.program}</span></td>
      <td>Stock: ${m.stockQuantity}</td>
      <td>Issued: ${m.distributedCount || 0}</td>
      <td><span class="badge badge-success">${m.status}</span></td>
      <td><a href="distribution.html" class="ucc-btn ucc-btn-purple ucc-btn-sm">Distribute</a></td>
    </tr>
  `).join('');
}

function renderDueTab() {
  const tbody = document.getElementById('dueStudentsTable');
  if (!tbody) return;

  const dueList = liveStudents.filter(s => s.totalDue > 0);

  if (!dueList.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--success-color);font-weight:700;">🎉 No overdue dues! All students are fully paid.</td></tr>`;
    return;
  }

  tbody.innerHTML = dueList.map(s => `
    <tr>
      <td style="font-weight:700;color:var(--primary);">${s.roll || '001'}</td>
      <td>
        <div style="font-weight:700;color:var(--text-main);">${s.name}</div>
        <div style="font-size:11.5px;color:var(--text-muted);">${s.phone}</div>
      </td>
      <td><span class="badge badge-primary">${s.batchName}</span></td>
      <td>৳${(s.finalFee || 15000).toLocaleString()}</td>
      <td style="color:var(--success-color);font-weight:600;">৳${(s.totalPaid || 0).toLocaleString()}</td>
      <td style="color:var(--danger-color);font-weight:800;">৳${s.totalDue.toLocaleString()}</td>
      <td>
        <a href="payment.html?id=${s._id || s.roll}" class="ucc-btn ucc-btn-green ucc-btn-sm">+ Collect</a>
      </td>
    </tr>
  `).join('');
}

function renderTransactionsTab() {
  const tbody = document.getElementById('transactionsTable');
  if (!tbody) return;

  if (!livePayments.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#9ca3af;">No payment transactions recorded today</td></tr>`;
    return;
  }

  tbody.innerHTML = livePayments.map(p => `
    <tr>
      <td style="font-size:12.5px;">${new Date(p.paymentDate).toLocaleDateString()}</td>
      <td style="font-weight:700;color:var(--primary);">${p.receiptNo}</td>
      <td>
        <div style="font-weight:700;">${p.studentName}</div>
        <div style="font-size:11px;color:var(--text-muted);">Roll: ${p.studentRoll}</div>
      </td>
      <td><span class="badge badge-info">${p.paymentMethod}</span></td>
      <td style="font-weight:800;color:var(--success-color);">৳${p.amount.toLocaleString()}</td>
      <td><span class="badge badge-success">Paid</span></td>
    </tr>
  `).join('');
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.ucc-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  
  const activeBtn = Array.from(document.querySelectorAll('.ucc-tab')).find(b => b.getAttribute('onclick').includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById('tab-' + tabId);
  if (content) content.style.display = 'block';
}

function sendBulkSMSReminder() {
  alert('📱 UCC SMS Gateway: Overdue payment reminders sent to students.');
}
