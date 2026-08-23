/* ==========================================================================
   UCC Batch Management — works with EduSmart batches API
   Falls back to demo data when UCC-specific API is not available
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5002/api' : '/api';
  let batches  = [];
  let students = [];
  let charts   = {};

  /* ── Demo data (shown when API is not yet connected) ── */
  const DEMO_BATCHES = [
    { _id:'b1', batchName:'Medical-2026-A',   batchCode:'MED-2026-A', program:'Medical',     baseFee:15000, capacity:60, status:'Active' },
    { _id:'b2', batchName:'Medical-2026-B',   batchCode:'MED-2026-B', program:'Medical',     baseFee:15000, capacity:60, status:'Active' },
    { _id:'b3', batchName:'Engineering-2026', batchCode:'ENG-2026',   program:'Engineering', baseFee:18000, capacity:50, status:'Active' },
    { _id:'b4', batchName:'Varsity-A-2026',   batchCode:'VA-2026',    program:'Varsity',     baseFee:12000, capacity:55, status:'Active' },
    { _id:'b5', batchName:'Varsity-B-2026',   batchCode:'VB-2026',    program:'Varsity',     baseFee:10000, capacity:45, status:'Active' },
    { _id:'b6', batchName:'HSC-2026-A',       batchCode:'HSC-2026-A', program:'Academic',    baseFee:2000,  capacity:40, status:'Inactive' }
  ];
  const DEMO_STUDENTS = [
    { roll:'101', name:'Rahim Ahmed',      batchName:'Medical-2026-A',   phone:'01712000001', totalPaid:10000, totalDue:5000 },
    { roll:'102', name:'Karim Hossain',    batchName:'Medical-2026-A',   phone:'01712000002', totalPaid:15000, totalDue:0    },
    { roll:'103', name:'Sumon Mia',        batchName:'Medical-2026-A',   phone:'01712000003', totalPaid:7000,  totalDue:8000 },
    { roll:'201', name:'Sadia Islam',      batchName:'Engineering-2026', phone:'01712000004', totalPaid:6000,  totalDue:12000 },
    { roll:'202', name:'Nafis Rahman',     batchName:'Engineering-2026', phone:'01712000005', totalPaid:18000, totalDue:0    },
    { roll:'301', name:'Arif Hossain',     batchName:'Varsity-A-2026',   phone:'01712000006', totalPaid:4000,  totalDue:8000 },
    { roll:'302', name:'Jannatul Ferdous', batchName:'Varsity-A-2026',   phone:'01712000007', totalPaid:12000, totalDue:0    },
    { roll:'401', name:'Rakib Hassan',     batchName:'Varsity-B-2026',   phone:'01712000008', totalPaid:4000,  totalDue:6000 },
    { roll:'501', name:'Shimul Akter',     batchName:'HSC-2026-A',       phone:'01712000009', totalPaid:2000,  totalDue:0    }
  ];

  /* ── Load data: try UCC API first, fallback to EduSmart API, then demo ── */
  async function load() {
    try {
      /* Try UCC-specific endpoints */
      const [bRes, sRes] = await Promise.allSettled([
        fetch(API + '/ucc/batches'),
        fetch(API + '/ucc/students')
      ]);

      if (bRes.status === 'fulfilled' && bRes.value.ok) {
        const d = await bRes.value.json();
        if (d.success && d.batches?.length) {
          batches = d.batches;
        }
      }
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        const d = await sRes.value.json();
        if (d.success && d.students?.length) {
          students = d.students;
        }
      }
    } catch (_) { /* ignore */ }

    /* Fallback: try EduSmart batch API */
    if (!batches.length) {
      try {
        const r = await fetch(API + '/batches');
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.data?.length) {
            batches = d.data.map(b => ({
              _id:       b._id,
              batchName: b.name,
              batchCode: b.name.toUpperCase().replace(/\s+/g, '-'),
              program:   b.description?.includes('Medical') ? 'Medical' :
                         b.description?.includes('Engineering') ? 'Engineering' :
                         b.description?.includes('Varsity') ? 'Varsity' : 'Academic',
              baseFee:   b.fee || 0,
              capacity:  b.capacity || 60,
              status:    b.status || 'Active'
            }));
          }
        }
      } catch (_) { /* ignore */ }
    }

    /* Final fallback: demo data */
    if (!batches.length)  batches  = DEMO_BATCHES;
    if (!students.length) students = DEMO_STUDENTS;

    updateStats();
    renderBatches();
    renderCharts();
  }

  /* ── Stats helper ── */
  function stats(batchName) {
    const bNameLower = (batchName || '').toLowerCase().trim();
    const bs = students.filter(s => 
      (s.batchName || '').toLowerCase().trim() === bNameLower || 
      (s.batch || '').toLowerCase().trim() === bNameLower
    );
    const total     = bs.length;
    const expected  = bs.reduce((a, s) => a + (s.finalFee || s.courseFee || s.netFee || 0), 0);
    const collected = bs.reduce((a, s) => a + (s.totalPaid || 0), 0);
    const due       = bs.reduce((a, s) => a + (s.totalDue  || 0), 0);
    const rate      = expected > 0 ? ((collected / expected) * 100).toFixed(1) : 0;
    return { total, expected, collected, due, rate };
  }

  /* ── KPI Cards ── */
  function updateStats() {
    const totalB = batches.length;
    const totalS = students.length;
    let target = 0, due = 0;
    batches.forEach(b => {
      const s = stats(b.batchName);
      target += s.expected;
      due    += s.due;
    });
    const cap = batches.reduce((a, b) => a + (b.capacity || 0), 0);

    setText('totalBatches',     totalB);
    setText('activeBatches',    batches.filter(b => b.status === 'Active').length + ' active');
    setText('totalStudents',    totalS);
    setText('capacityText',     (cap > 0 ? Math.round(totalS / cap * 100) : 0) + '% capacity used');
    setText('targetCollection', '৳' + target.toLocaleString('en-IN'));
    setText('totalDue',         '৳' + due.toLocaleString('en-IN'));
    setText('lowHealthText',    batches.filter(b => parseFloat(stats(b.batchName).rate) < 50).length + ' batches need attention');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  }

  /* ── Render Table ── */
  window.renderBatches = function () {
    const q   = (document.getElementById('batchSearch')?.value   || '').toLowerCase();
    const cat = (document.getElementById('categoryFilter')?.value || 'all');
    const st  = (document.getElementById('statusFilter')?.value   || 'all');

    const filtered = batches.filter(b => {
      const mQ = !q || b.batchName.toLowerCase().includes(q) ||
                 (b.batchCode || '').toLowerCase().includes(q);
      const mC = cat === 'all' || b.program === cat;
      const mS = st  === 'all' || b.status  === st;
      return mQ && mC && mS;
    });

    const meta  = document.getElementById('batchTableMeta');
    if (meta) meta.innerText = filtered.length + ' batch' + (filtered.length !== 1 ? 'es' : '') + ' found';

    const tbody = document.getElementById('batchRows');
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:#64748b;">
        <div style="font-size:32px;margin-bottom:8px;opacity:.4;">🗂️</div>
        No batches found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(b => {
      const s     = stats(b.batchName);
      const rate  = parseFloat(s.rate);
      const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
      const statusClass = b.status === 'Active' ? 'status-active' :
                          b.status === 'Completed' ? 'status-completed' :
                          b.status === 'Upcoming' ? 'status-upcoming' : 'status-inactive';
      return `<tr>
        <td>
          <div style="font-weight:700;color:#0f172a;">${b.batchName}</div>
          <small style="color:#94a3b8;font-size:11px;">${b.batchCode || ''}</small>
        </td>
        <td>${b.program || 'N/A'}</td>
        <td>${s.total} / ${b.capacity || 0}</td>
        <td>৳${(b.baseFee || 0).toLocaleString('en-IN')}</td>
        <td style="color:#10b981;font-weight:600;">৳${s.collected.toLocaleString('en-IN')}</td>
        <td style="color:#ef4444;font-weight:600;">৳${s.due.toLocaleString('en-IN')}</td>
        <td>
          <span style="font-weight:700;color:${color};">${s.rate}%</span>
          <div style="height:4px;background:#f1f5f9;border-radius:4px;margin-top:3px;">
            <div style="height:100%;border-radius:4px;background:${color};width:${Math.min(100,rate)}%;"></div>
          </div>
        </td>
        <td><span class="status-badge ${statusClass}">${b.status}</span></td>
        <td class="no-print">
          <div style="display:flex;gap:6px;">
            <button class="btn btn-secondary small-btn" onclick="viewDetails('${b._id}')" title="View details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-secondary small-btn" onclick="openEditModal('${b._id}')" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-secondary small-btn" onclick="printBatch('${b._id}')" title="Print batch report" style="background:#eef2ff;color:#4f46e5;">
              <i class="fas fa-print"></i>
            </button>
            <button class="btn btn-secondary small-btn" style="color:#dc2626;" onclick="deleteBatch('${b._id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  };

  /* ── Charts ── */
  function renderCharts() {
    const cleanName = n => n.replace(/-\d{4}$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const names = batches.slice(0, 8).map(b => cleanName(b.batchName));
    const counts = batches.slice(0, 8).map(b => stats(b.batchName).total);
    const cols   = batches.slice(0, 8).map(b => stats(b.batchName).collected);
    const dues   = batches.slice(0, 8).map(b => stats(b.batchName).due);

    const labelFont = { family: "'Inter', sans-serif", weight: '600', size: 11 };
    const tickStyle = { font: { family: "'Inter', sans-serif", size: 10, weight: '500' }, color: '#64748b', padding: 6 };
    const gridStyle = { color: '#f1f5f9' };

    /* Enrollment chart */
    if (charts.e) charts.e.destroy();
    const c1 = document.getElementById('enrollmentChart');
    if (c1) {
      charts.e = new Chart(c1, {
        type: 'bar',
        data: {
          labels: names,
          datasets: [{
            label: 'Students',
            data: counts,
            backgroundColor: 'rgba(99,102,241,.85)',
            hoverBackgroundColor: '#4f46e5',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.65
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#0f172a', titleFont: { ...labelFont, size: 12 }, bodyFont: { size: 11 }, cornerRadius: 8, padding: 10 }
          },
          scales: {
            x: { ticks: { ...tickStyle, maxRotation: 45, minRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { ...tickStyle, stepSize: 1 }, grid: gridStyle, border: { display: false } }
          }
        }
      });
    }

    /* Health chart */
    if (charts.h) charts.h.destroy();
    const c2 = document.getElementById('batchHealthChart');
    if (c2) {
      charts.h = new Chart(c2, {
        type: 'bar',
        data: {
          labels: names,
          datasets: [
            { label: 'Collected (৳)', data: cols, backgroundColor: 'rgba(16,185,129,.85)', hoverBackgroundColor: '#059669', borderRadius: 6, borderSkipped: false, barPercentage: 0.65 },
            { label: 'Due (৳)',       data: dues, backgroundColor: 'rgba(239,68,68,.85)',  hoverBackgroundColor: '#dc2626', borderRadius: 6, borderSkipped: false, barPercentage: 0.65 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: labelFont, color: '#475569', usePointStyle: true, pointStyle: 'rectRounded', padding: 16 } },
            tooltip: { backgroundColor: '#0f172a', titleFont: { ...labelFont, size: 12 }, bodyFont: { size: 11 }, cornerRadius: 8, padding: 10, callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ৳' + ctx.raw.toLocaleString('en-IN') } }
          },
          scales: {
            x: { stacked: true, ticks: { ...tickStyle, maxRotation: 45, minRotation: 0 }, grid: { display: false } },
            y: { stacked: true, ticks: { ...tickStyle, callback: v => '৳' + (v >= 1000 ? (v / 1000) + 'k' : v) }, grid: gridStyle, border: { display: false } }
          }
        }
      });
    }
  }

  /* ── Edit Modal ── */
  window.openEditModal = function (id) {
    const b = batches.find(x => x._id === id);
    if (!b) return;
    document.getElementById('editBatchId').value  = id;
    document.getElementById('modalTitle').innerText = 'Edit batch';
    document.getElementById('batchName').value      = b.batchName || '';
    document.getElementById('batchCategory').value  = b.program || 'Medical';
    document.getElementById('batchSession').value   = b.session || '';
    document.getElementById('batchCapacity').value  = b.capacity || '';
    document.getElementById('batchFee').value       = b.baseFee || '';
    document.getElementById('batchAdmissionFee').value = b.admissionFee || '';
    document.getElementById('batchCoordinator').value  = b.coordinator || '';
    if (document.getElementById('batchNextRoll')) {
      document.getElementById('batchNextRoll').value  = b.nextRollNumber || 1;
    }
    document.getElementById('batchStatus').value    = b.status || 'Active';
    document.getElementById('batchNotes').value     = b.notes || '';
    document.getElementById('batchModal').classList.add('active');
  };

  window.openBatchModal = function () {
    document.getElementById('editBatchId').value = '';
    document.getElementById('modalTitle').innerText = 'Add new batch';
    document.getElementById('batchForm').reset();
    document.getElementById('batchModal').classList.add('active');
  };

  window.closeBatchModal = () => document.getElementById('batchModal').classList.remove('active');
  window.closeDetails    = () => document.getElementById('detailModal').classList.remove('active');

  /* ── View Details ── */
  window.viewDetails = function (id) {
    const b = batches.find(x => x._id === id);
    if (!b) return;
    const s  = stats(b.batchName);
    const bs = students.filter(x => x.batchName === b.batchName || x.batch === b.batchName)
      .sort((a, b) => {
        const rA = parseInt(String(a.roll || a.studentId || '0').replace(/[^0-9]/g, ''), 10) || 0;
        const rB = parseInt(String(b.roll || b.studentId || '0').replace(/[^0-9]/g, ''), 10) || 0;
        return rA - rB;
      });
    const rate  = parseFloat(s.rate);
    const color = rate >= 80 ? '#059669' : rate >= 50 ? '#d97706' : '#dc2626';
    const healthCls = rate >= 80 ? '' : rate >= 50 ? 'mid' : 'low';

    const paidCount = bs.filter(x => (x.totalDue || 0) === 0).length;
    const dueCount  = bs.filter(x => (x.totalDue || 0) > 0).length;

    const rows = bs.length
      ? bs.map((x, i) => `
          <tr>
            <td><strong style="color:#4f46e5;">${x.roll || x.studentId || '—'}</strong></td>
            <td>${x.name || '—'}</td>
            <td style="color:#64748b;">${x.phone || '—'}</td>
            <td style="color:#059669;font-weight:700;">৳${(x.totalPaid || 0).toLocaleString('en-IN')}</td>
            <td style="color:#dc2626;font-weight:700;">৳${(x.totalDue  || 0).toLocaleString('en-IN')}</td>
            <td>
              <span class="status-badge ${(x.totalDue || 0) === 0 ? 'status-active' : 'status-inactive'}">
                ${(x.totalDue || 0) === 0 ? 'Paid' : 'Due'}
              </span>
            </td>
          </tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:24px;color:#64748b;">
           <i class="fas fa-users" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>
           No students in this batch.
         </td></tr>`;

    document.getElementById('batchDetails').innerHTML = `
      <div class="detail-body">

        <!-- Banner -->
        <div class="detail-banner">
          <div>
            <h3>${b.batchName}</h3>
            <p>${b.program || 'N/A'} &nbsp;·&nbsp; ${b.session || ''} &nbsp;·&nbsp;
              <span class="status-badge ${b.status === 'Active' ? 'status-active' : 'status-inactive'}">${b.status}</span>
            </p>
            <p style="margin-top:6px;font-size:12px;color:#475569;">
              ${b.coordinator ? '<i class="fas fa-chalkboard-user" style="color:#7c3aed;margin-right:4px;"></i>' + b.coordinator : ''}
              ${b.notes ? '<br><i class="fas fa-book" style="color:#4f46e5;margin-right:4px;"></i>' + b.notes : ''}
            </p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Outstanding Due</div>
            <strong style="color:#dc2626;font-size:26px;">৳${s.due.toLocaleString('en-IN')}</strong>
          </div>
        </div>

        <!-- KPI Cards -->
        <div class="detail-kpis">
          <div class="kpi-card" style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);">
            <div class="kpi-icon" style="background:#4f46e5;color:#fff;"><i class="fas fa-users"></i></div>
            <div class="kpi-info">
              <small style="color:#4338ca;font-size:10px;">Students</small>
              <b style="color:#312e81;font-size:18px;">${s.total} / ${b.capacity || 0}</b>
            </div>
          </div>
          <div class="kpi-card" style="background:linear-gradient(135deg,#fefce8,#fef9c3);">
            <div class="kpi-icon" style="background:#f59e0b;color:#fff;"><i class="fas fa-coins"></i></div>
            <div class="kpi-info">
              <small style="color:#92400e;font-size:10px;">Course Fee</small>
              <b style="color:#78350f;font-size:18px;">৳${(b.baseFee || 0).toLocaleString('en-IN')}</b>
            </div>
          </div>
          <div class="kpi-card" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);">
            <div class="kpi-icon" style="background:#059669;color:#fff;"><i class="fas fa-hand-holding-dollar"></i></div>
            <div class="kpi-info">
              <small style="color:#065f46;font-size:10px;">Collected</small>
              <b style="color:#047857;font-size:18px;">৳${s.collected.toLocaleString('en-IN')}</b>
            </div>
          </div>
          <div class="kpi-card" style="background:linear-gradient(135deg,${rate>=80?'#ecfdf5,#d1fae5':rate>=50?'#fffbeb,#fef3c7':'#fef2f2,#fecaca'});">
            <div class="kpi-icon" style="background:${color};color:#fff;"><i class="fas fa-chart-line"></i></div>
            <div class="kpi-info" style="width:100%;">
              <small style="color:${rate>=80?'#065f46':rate>=50?'#92400e':'#991b1b'};font-size:10px;">Collection Rate</small>
              <b style="color:${color};font-size:18px;">${s.rate}%</b>
              <div style="margin-top:5px;height:6px;background:${rate>=80?'#a7f3d0':rate>=50?'#fde68a':'#fecaca'};border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(100,rate)}%;background:${color};border-radius:99px;transition:width .6s;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Stats Row -->
        <div class="detail-stats-row">
          <div class="detail-stat-card" style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);">
            <div class="stat-icon" style="background:#059669;color:#fff;"><i class="fas fa-check-circle"></i></div>
            <div class="stat-info">
              <small style="color:#065f46;font-size:10px;">Paid Students</small>
              <b style="color:#047857;font-size:18px;">${paidCount}</b>
            </div>
          </div>
          <div class="detail-stat-card" style="background:linear-gradient(135deg,#fef2f2,#fecaca);">
            <div class="stat-icon" style="background:#dc2626;color:#fff;"><i class="fas fa-exclamation-circle"></i></div>
            <div class="stat-info">
              <small style="color:#991b1b;font-size:10px;">Due Students</small>
              <b style="color:#dc2626;font-size:18px;">${dueCount}</b>
            </div>
          </div>
          ${b.startDate ? `<div class="detail-stat-card" style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);">
            <div class="stat-icon" style="background:#0284c7;color:#fff;"><i class="fas fa-calendar-check"></i></div>
            <div class="stat-info">
              <small style="color:#075985;font-size:10px;">Start Date</small>
              <b style="color:#0c4a6e;font-size:18px;">${new Date(b.startDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</b>
            </div>
          </div>` : ''}
          ${b.admissionFee ? `<div class="detail-stat-card" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);">
            <div class="stat-icon" style="background:#7c3aed;color:#fff;"><i class="fas fa-id-card"></i></div>
            <div class="stat-info">
              <small style="color:#5b21b6;font-size:10px;">Admission Fee</small>
              <b style="color:#6d28d9;font-size:18px;">৳${Number(b.admissionFee).toLocaleString('en-IN')}</b>
            </div>
          </div>` : ''}
        </div>

        <!-- Student Table -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="font-size:13px;font-weight:800;color:#374151;margin:0;">
            <i class="fas fa-users" style="color:#4f46e5;margin-right:6px;"></i>
            Student List (${s.total})
          </h4>
          <div style="display:flex;gap:6px;">
            <a href="payment.html" class="btn btn-secondary small-btn">
              <i class="fas fa-money-bill-wave"></i> Payment
            </a>
            <a href="admission.html" class="btn btn-secondary small-btn">
              <i class="fas fa-user-plus"></i> Admission
            </a>
          </div>
        </div>
        <div style="max-height:300px;overflow-y:auto;border-radius:10px;border:1px solid #e5e7eb;">
          <table class="data-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>Roll</th><th>Name</th><th>Phone</th>
                <th>Paid</th><th>Due</th><th>Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

      </div>`;

    document.getElementById('detailModal').classList.add('active');
    updateDetailHeader(b.batchName);
  };
  function updateDetailHeader(batchName) {
    const head = document.querySelector('#detailModal .modal-head h3');
    const sub  = document.querySelector('#detailModal .modal-head p');
    if (head) head.textContent = batchName;
    if (sub)  sub.textContent  = 'Course, financial and enrollment snapshot.';
  }

  /* ── Delete Batch ── */
  window.deleteBatch = async function (id) {
    console.log('🗑️ Delete batch called with ID:', id);
    
    const b = batches.find(x => x._id === id);
    console.log('📦 Found batch:', b);
    
    if (!b) {
      console.warn('❌ Batch not found');
      toast('❌ Batch not found!', true);
      return;
    }

    const s = stats(b.batchName);
    console.log(`📊 Batch stats for "${b.batchName}":`, s);
    console.log(`   Total students: ${s.total}`);
    
    // Prepare warning message
    let warningMsg = `⚠️ DELETE BATCH: "${b.batchName}"?\n\n`;
    
    if (s.total > 0) {
      warningMsg += `⚠️ CRITICAL WARNING ⚠️\n\n`;
      warningMsg += `This batch has ${s.total} student${s.total > 1 ? 's' : ''}.\n\n`;
      warningMsg += `Deleting this batch will PERMANENTLY DELETE:\n`;
      warningMsg += `• All ${s.total} student${s.total > 1 ? 's' : ''} in this batch\n`;
      warningMsg += `• All payment records\n`;
      warningMsg += `• All distribution records\n`;
      warningMsg += `• All exam results\n`;
      warningMsg += `• Financial data worth ৳${s.collected.toLocaleString('en-IN')}\n\n`;
      warningMsg += `⚠️ THIS CANNOT BE UNDONE!\n\n`;
      warningMsg += `Are you absolutely sure?`;
    } else {
      warningMsg += `This batch has no students.\n\n`;
      warningMsg += `The batch will be permanently deleted.\n`;
      warningMsg += `This action cannot be undone.\n\n`;
      warningMsg += `Continue?`;
    }

    console.log('✅ Showing confirmation dialog...');
    const confirmed = confirm(warningMsg);
    console.log('User confirmed:', confirmed);
    
    if (!confirmed) {
      console.log('❌ User cancelled deletion');
      return;
    }

    // Show loading toast
    toast('⏳ Deleting batch and all related data...', false);

    try {
      const url = API + '/ucc/batches/' + id;
      console.log('🌐 Calling CASCADE DELETE API:', url);
      
      const res = await fetch(url, { method: 'DELETE' });
      console.log('📡 API Response status:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ API Error response:', errorText);
        throw new Error(`HTTP error! status: ${res.status} - ${errorText}`);
      }
      
      const d = await res.json();
      console.log('📦 API Response data:', d);
      
      if (d.success) {
        console.log('✅ Batch and all related data deleted successfully from server');
        
        // Remove batch from local array
        batches = batches.filter(x => x._id !== id);
        
        // Remove students from local array
        students = students.filter(x => 
          x.batchName.toLowerCase().trim() !== b.batchName.toLowerCase().trim()
        );
        
        console.log('📦 Updated batches array length:', batches.length);
        console.log('👥 Updated students array length:', students.length);
        
        updateStats();
        renderBatches();
        renderCharts();
        
        // Show detailed success message
        let successMsg = `✅ Batch "${b.batchName}" deleted successfully!`;
        if (d.deleted) {
          successMsg += `\n\nDeleted:\n`;
          successMsg += `• ${d.deleted.students || 0} students\n`;
          successMsg += `• ${d.deleted.payments || 0} payments\n`;
          successMsg += `• ${d.deleted.distributions || 0} distributions\n`;
          successMsg += `• ${d.deleted.results || 0} results`;
        }
        
        toast(successMsg);
      } else {
        console.error('❌ Server reported failure:', d.message);
        toast('❌ ' + (d.message || 'Delete failed'), true);
      }
    } catch (err) {
      console.error('💥 Delete batch error:', err);
      console.log('🔧 Falling back to demo mode (local deletion)');
      
      // Demo mode — delete locally
      batches = batches.filter(x => x._id !== id);
      students = students.filter(x => 
        x.batchName.toLowerCase().trim() !== b.batchName.toLowerCase().trim()
      );
      
      console.log('📦 Updated batches array length (demo):', batches.length);
      console.log('👥 Updated students array length (demo):', students.length);
      
      updateStats();
      renderBatches();
      renderCharts();
      toast('✅ Batch deleted (offline mode)!');
    }
  };

  /* ── Save Batch (Add / Edit) ── */
  window.saveBatch = async function (e) {
    e.preventDefault();
    const id   = document.getElementById('editBatchId').value;
    const name = document.getElementById('batchName').value.trim();
    const prog = document.getElementById('batchCategory').value;
    const cap  = parseInt(document.getElementById('batchCapacity').value)   || 60;
    const fee  = parseFloat(document.getElementById('batchFee').value)      || 0;
    const adm  = parseFloat(document.getElementById('batchAdmissionFee').value) || 0;
    const coord= document.getElementById('batchCoordinator').value.trim();
    const sess = document.getElementById('batchSession').value.trim();
    const stat = document.getElementById('batchStatus').value;
    const notes= document.getElementById('batchNotes').value.trim();
    const nextRollNum = parseInt(document.getElementById('batchNextRoll')?.value, 10) || 1;

    if (!name) { toast('❌ Batch name is required.', true); return; }

    const payload = {
      batchCode:    name.toUpperCase().replace(/[^A-Z0-9]/g, '-'),
      batchName:    name,
      program:      prog,
      baseFee:      fee,
      admissionFee: adm,
      capacity:     cap,
      coordinator:  coord,
      session:      sess,
      status:       stat,
      notes,
      nextRollNumber: nextRollNum
    };

    try {
      const url = API + '/ucc/batches' + (id ? '/' + id : '');
      const res = await fetch(url, {
        method:  id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      const d = await res.json();
      if (d.success) {
        closeBatchModal();
        await load();
        toast('✅ Batch saved!');
      } else {
        toast('❌ ' + (d.message || 'Save failed'), true);
      }
    } catch (_) {
      /* Demo mode — save locally */
      if (id) {
        const idx = batches.findIndex(x => x._id === id);
        if (idx > -1) batches[idx] = { ...batches[idx], ...payload };
      } else {
        batches.unshift({ _id: 'local-' + Date.now(), ...payload });
      }
      closeBatchModal();
      updateStats(); renderBatches(); renderCharts();
      toast('✅ Batch saved (demo mode)!');
    }
  };

  /* ── Filter Reset ── */
  window.resetBatchFilters = function () {
    document.getElementById('batchSearch').value      = '';
    document.getElementById('categoryFilter').value  = 'all';
    document.getElementById('statusFilter').value    = 'all';
    renderBatches();
  };

  /* ── Print Batch Report (A4) ── */
  window.printBatch = function (id) {
    const b  = batches.find(x => x._id === id);
    if (!b) return;
    const s  = stats(b.batchName);
    const bs = students.filter(x => x.batchName === b.batchName || x.batch === b.batchName)
      .sort((a, b) => {
        const rA = parseInt(String(a.roll || a.studentId || '0').replace(/[^0-9]/g, ''), 10) || 0;
        const rB = parseInt(String(b.roll || b.studentId || '0').replace(/[^0-9]/g, ''), 10) || 0;
        return rA - rB;
      });
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    const rate    = parseFloat(s.rate);
    const rateColor = rate >= 80 ? '#059669' : rate >= 50 ? '#d97706' : '#dc2626';

    const paidList = bs.filter(x => (x.totalDue || 0) === 0);
    const dueList  = bs.filter(x => (x.totalDue || 0) > 0).sort((a,z) => (z.totalDue||0) - (a.totalDue||0));

    const studentRows = bs.length ? bs.map((x, i) => `
      <tr style="background:${i%2===0?'#fff':'#f9fafb'};">
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;color:#4f46e5;text-align:center;">${i+1}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;">${x.roll || x.studentId || '—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${x.name || '—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;color:#64748b;">${x.phone || '—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;color:#059669;font-weight:700;">৳${(x.totalPaid||0).toLocaleString('en-IN')}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;color:#dc2626;font-weight:700;">৳${(x.totalDue||0).toLocaleString('en-IN')}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;">
          <span style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;
            background:${(x.totalDue||0)===0?'#ecfdf5':'#fef2f2'};
            color:${(x.totalDue||0)===0?'#065f46':'#991b1b'};
            border:1px solid ${(x.totalDue||0)===0?'#86efac':'#fca5a5'};">
            ${(x.totalDue||0)===0?'Paid':'Due'}
          </span>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;border:1px solid #e5e7eb;">No students enrolled.</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>Batch Report — ${b.batchName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    @page { size: A4 portrait; margin: 1.5cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* ── Header ── */
    .header { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4f46e5 100%); color: #fff; padding: 20px 24px; border-radius: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-left h1 { font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 3px; }
    .header-left p  { font-size: 9.5px; opacity: .82; margin: 1px 0; }
    .header-right   { text-align: right; }
    .header-right .report-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; opacity: .75; margin-bottom: 4px; }
    .header-right .batch-tag { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3); padding: 5px 12px; border-radius: 8px; font-size: 13px; font-weight: 800; }
    .header-bottom-line { height: 3px; background: linear-gradient(90deg, #f59e0b, #fff8, #f59e0b); margin-bottom: 16px; border-radius: 2px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* ── KPI Cards ── */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .kpi { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 11px 13px; }
    .kpi small { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: 4px; }
    .kpi strong { display: block; font-size: 17px; font-weight: 800; color: #0f172a; }
    .kpi.green  { background: #ecfdf5; border-color: #86efac; } .kpi.green  strong { color: #059669; }
    .kpi.red    { background: #fef2f2; border-color: #fca5a5; } .kpi.red    strong { color: #dc2626; }
    .kpi.indigo { background: #eef2ff; border-color: #c7d2fe; } .kpi.indigo strong { color: #4f46e5; }

    /* ── Progress Bar ── */
    .prog-wrap { margin-top: 5px; }
    .prog-track { height: 5px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .prog-fill  { height: 100%; border-radius: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* ── Info Row ── */
    .info-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .info-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 9px 12px; }
    .info-box .label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .info-box .value { font-size: 12px; font-weight: 700; color: #0f172a; }

    /* ── Section Title ── */
    .section-title { font-size: 13px; font-weight: 800; color: #0f172a; padding-bottom: 7px; margin-bottom: 10px; border-bottom: 2px solid #4f46e5; display: flex; justify-content: space-between; align-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-title span { font-size: 10px; font-weight: 600; color: #64748b; }

    /* ── Table ── */
    .student-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; page-break-inside: auto; }
    .student-table thead { display: table-header-group; }
    .student-table tr { page-break-inside: avoid; }
    .student-table thead tr { background: #4f46e5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .student-table th { padding: 8px 10px; color: #fff !important; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; text-align: left; border: 1px solid #4f46e5; background: #4f46e5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .student-table th:last-child,
    .student-table th:nth-child(5),
    .student-table th:nth-child(6) { text-align: center; }

    /* ── Summary Footer ── */
    .summary-footer { background: #f8fafc; border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .summary-footer .item { text-align: center; }
    .summary-footer .item small { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .summary-footer .item strong { font-size: 15px; font-weight: 800; }

    /* ── Signature ── */
    .sig-row { display: flex; justify-content: space-around; margin-top: 36px; }
    .sig-box { text-align: center; width: 180px; }
    .sig-line { border-top: 1.5px solid #374151; margin-bottom: 5px; padding-top: 6px; }
    .sig-label { font-size: 10px; font-weight: 600; color: #475569; }

    /* ── Print Footer ── */
    .print-footer { text-align: center; margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #94a3b8; }
    .no-print { display: none; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>UCC পাবনা শাখা</h1>
      <p>এডওয়ার্ড কলেজ, রথঘর সংলগ্ন, রাধানগর, পাবনা</p>
      <p>Phone: 01312-427799 / 01775-932188</p>
      <p style="margin-top:6px;font-size:9px;opacity:.7;">Batch Report · Generated: ${dateStr} at ${timeStr}</p>
    </div>
    <div class="header-right">
      <div class="report-label">Batch Report</div>
      <div class="batch-tag">${b.batchName}</div>
    </div>
  </div>
  <div class="header-bottom-line"></div>

  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi indigo">
      <small>Total Students</small>
      <strong>${s.total} / ${b.capacity||0}</strong>
      <div class="prog-wrap">
        <div class="prog-track">
          <div class="prog-fill" style="width:${b.capacity?Math.min(100,Math.round(s.total/(b.capacity)*100)):0}%;background:#4f46e5;"></div>
        </div>
      </div>
    </div>
    <div class="kpi green">
      <small>Total Collected</small>
      <strong>৳${s.collected.toLocaleString('en-IN')}</strong>
    </div>
    <div class="kpi red">
      <small>Total Due</small>
      <strong>৳${s.due.toLocaleString('en-IN')}</strong>
    </div>
    <div class="kpi" style="${rate>=80?'background:#ecfdf5;border-color:#86efac;':rate>=50?'background:#fffbeb;border-color:#fcd34d;':'background:#fef2f2;border-color:#fca5a5;'}">
      <small>Collection Rate</small>
      <strong style="color:${rateColor};">${s.rate}%</strong>
      <div class="prog-wrap">
        <div class="prog-track">
          <div class="prog-fill" style="width:${rate}%;background:${rateColor};"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Info Row -->
  <div class="info-row">
    <div class="info-box">
      <div class="label">Program / Category</div>
      <div class="value">${b.program || 'N/A'}</div>
    </div>
    <div class="info-box">
      <div class="label">Course Fee</div>
      <div class="value">৳${(b.baseFee||0).toLocaleString('en-IN')}</div>
    </div>
    <div class="info-box">
      <div class="label">Status</div>
      <div class="value">${b.status}</div>
    </div>
    ${b.coordinator ? `<div class="info-box"><div class="label">Coordinator</div><div class="value">${b.coordinator}</div></div>` : ''}
    ${b.admissionFee ? `<div class="info-box"><div class="label">Admission Fee</div><div class="value">৳${Number(b.admissionFee).toLocaleString('en-IN')}</div></div>` : ''}
    ${b.notes ? `<div class="info-box"><div class="label">Notes / Materials</div><div class="value">${b.notes}</div></div>` : ''}
  </div>

  <!-- Student Table -->
  <div class="section-title">
    &#9654; Student List
    <span>${bs.length} students &nbsp;·&nbsp; ${paidList.length} paid &nbsp;·&nbsp; ${dueList.length} due</span>
  </div>
  <table class="student-table">
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th style="width:60px;">Roll</th>
        <th>Name</th>
        <th>Phone</th>
        <th style="width:90px;">Paid (৳)</th>
        <th style="width:90px;">Due (৳)</th>
        <th style="width:60px;">Status</th>
      </tr>
    </thead>
    <tbody>${studentRows}</tbody>
  </table>

  <!-- Summary Footer -->
  <div class="summary-footer">
    <div class="item"><small>Total Students</small><strong>${s.total}</strong></div>
    <div class="item"><small>Paid Students</small><strong style="color:#059669;">${paidList.length}</strong></div>
    <div class="item"><small>Due Students</small><strong style="color:#dc2626;">${dueList.length}</strong></div>
    <div class="item"><small>Total Collected</small><strong style="color:#059669;">৳${s.collected.toLocaleString('en-IN')}</strong></div>
    <div class="item"><small>Total Due</small><strong style="color:#dc2626;">৳${s.due.toLocaleString('en-IN')}</strong></div>
    <div class="item"><small>Collection Rate</small><strong style="color:${rateColor};">${s.rate}%</strong></div>
  </div>

  <!-- Signature -->
  <div class="sig-row">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Prepared By</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Checked By</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Branch Head</div></div>
  </div>

  <!-- Print Footer -->
  <div class="print-footer">
    UCC পাবনা শাখা · Batch Report · ${b.batchName} · Generated: ${dateStr} at ${timeStr} · Computer Generated Report
  </div>
</body>
</html>`;

    /* ── Hidden iframe approach — same page, no new window ── */
    /* Remove old iframe if exists */
    const oldIframe = document.getElementById('batchPrintFrame');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'batchPrintFrame';
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    /* Wait for iframe content to load, then print */
    iframe.onload = function () {
      setTimeout(function () {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        iframe.contentWindow.addEventListener('afterprint', function () {
          iframe.remove();
        });
      }, 300);
    };
  };

  /* ── Export CSV ── */
  window.exportBatches = function () {
    let csv = 'Batch Name,Code,Program,Students,Capacity,Fee (৳),Collected (৳),Due (৳),Rate,Status\n';
    batches.forEach(b => {
      const s = stats(b.batchName);
      csv += `"${b.batchName}","${b.batchCode || ''}","${b.program || ''}",` +
             `${s.total},${b.capacity || 0},${b.baseFee || 0},` +
             `${s.collected},${s.due},${s.rate}%,${b.status}\n`;
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'ucc_batches.csv';
    a.click();
  };

  /* ── Toast ── */
  function toast(msg, isError = false) {
    const t = document.getElementById('batchToast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = isError ? '#fef2f2' : '#ecfdf5';
    t.style.color      = isError ? '#dc2626' : '#059669';
    t.style.border     = isError ? '1px solid #fca5a5' : '1px solid #86efac';
    t.classList.add('show');
    clearTimeout(window._batchToast);
    window._batchToast = setTimeout(() => t.classList.remove('show'), 3000);
  }

  /* ── Sidebar keyboard shortcut (Esc closes modals) ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeBatchModal();
      closeDetails();
    }
  });

  /* ── Init ── */
  load();
});
