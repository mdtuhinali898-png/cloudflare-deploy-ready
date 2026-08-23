/* UCC reports UI: connected to MongoDB backend via /api/ucc/reports */
const API_BASE = 'http://localhost:5002/api';
let REPORT_DATA = { students: [], transactions: [], materials: [] };
let BW_DATA = { batches: [], students: [] };
let bwActiveState = {};
let bwCurrentBatchId = null;
let bwCharts = {};
let bwEditRoll = null;
let charts = {}, activeTab = 'overview';
const $ = id => document.getElementById(id), money = n => '৳' + Number(n || 0).toLocaleString('en-IN');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
function student(roll) { return REPORT_DATA.students.find(s => s.roll === roll) }
function due(s) { return Math.max(0, (s.fee || 0) - (s.paid || 0)) }
function dates() { return { from: $('fromDate').value, to: $('toDate').value, batch: $('batchFilter').value, method: $('methodFilter').value } }
function updateFilterSummary() {
  const f = dates();
  const range = f.from && f.to ? `${f.from} to ${f.to}` : (f.from ? `From ${f.from}` : (f.to ? `Until ${f.to}` : 'All time'));
  const batch = f.batch === 'all' ? 'All batches' : f.batch;
  const method = f.method === 'all' ? 'All payment methods' : f.method;
  $('activeFilterSummary').textContent = `${range} · ${batch} · ${method}`;
}
function setReportLoadStatus(message, isError = false) {
  const status = $('reportLoadStatus');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#dc2626' : '#64748b';
}
function setTabFilterVisibility(tab) {
  const zone = $('tabFilterZone');
  const filter = $('reportFilter');
  const feedback = $('reportFilterFeedback');
  const note = $('tabContextNote');
  if (!zone || !filter || !feedback || !note) return;
  const noteText = note.querySelector('span');
  const hasFullFilters = tab === 'overview' || tab === 'collection';
  const hasBatchOnly = tab === 'dues';
  zone.classList.toggle('batch-only', hasBatchOnly);
  filter.hidden = !hasFullFilters && !hasBatchOnly;
  feedback.hidden = !hasFullFilters && !hasBatchOnly;
  note.hidden = hasFullFilters || hasBatchOnly;
  if (hasBatchOnly) {
    $('filterHelp').textContent = 'Choose a batch to view its current fee, paid and due position.';
  } else if (hasFullFilters) {
    $('filterHelp').textContent = 'Choose a date range, batch or payment method, then apply filters.';
  }
  if (!noteText) return;
  const notes = {
    batch: 'Batch Performance shows current overall fee, collection and due data. Date and payment filters do not apply here.',
    materials: 'Material Audit shows current catalogue and distribution status. Date and payment filters do not apply here.',
    ledger: 'Search for a student to view their complete fee, payment and material ledger.',
    batchwise: 'Use the Batch-wise Report filters below to refine this report.'
  };
  noteText.textContent = notes[tab] || 'This report shows current overall data.';
}
function selectedStudents() { let f = dates(); return REPORT_DATA.students.filter(s => f.batch === 'all' || s.batch === f.batch) }
function selectedTransactions() {
  let f = dates();
  return REPORT_DATA.transactions.filter(t => {
    const s = student(t.roll) || { batch: t.batch || '' };
    return (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
      (f.batch === 'all' || s.batch === f.batch) && (f.method === 'all' || t.method === f.method);
  });
}
function renderChart(id, type, data, options = {}) {
  if (charts[id]) charts[id].destroy();
  const el = $(id);
  if (!el) return;
  charts[id] = new Chart(el, {
    type, data, options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      ...options
    }
  });
}
function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  const fromStr = from.toISOString().split('T')[0];
  $('toDate').value = today;
  $('fromDate').value = fromStr;
  $('dailyStatementDate').value = today;
  $('todayDate').textContent = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function populateSelects() {
  const batches = [...new Set(REPORT_DATA.students.map(s => s.batch))];
  $('batchFilter').innerHTML = '<option value="all">All batches</option>';
  batches.forEach(b => { $('batchFilter').insertAdjacentHTML('beforeend', `<option value="${esc(b)}">${esc(b)}</option>`) });
}
function renderSummary() {
  let sts = selectedStudents(), tx = selectedTransactions(),
    payable = sts.reduce((a, s) => a + (s.fee || 0), 0),
    paid = sts.reduce((a, s) => a + (s.paid || 0), 0),
    totalDue = sts.reduce((a, s) => a + due(s), 0),
    dueCount = sts.filter(s => due(s) > 0).length;
  $('netCollection').textContent = money(tx.reduce((a, t) => a + t.amount, 0));
  $('netCollectionSub').textContent = `${tx.length} receipts in selected period`;
  $('totalDue').textContent = money(totalDue);
  $('dueStudentSub').textContent = `${dueCount} students require follow-up`;
  $('collectionRate').textContent = (payable ? Math.round(paid / payable * 100) : 0) + '%';
  $('transactionCount').textContent = tx.length;
  const today = new Date().toISOString().split('T')[0];
  let todayTx = tx.filter(t => t.date === today),
    ad = todayTx.filter(t => t.type === 'Admission'),
    p = todayTx.filter(t => t.type === 'Payment');
  $('todayAdmissionCount').textContent = ad.length;
  $('todayPaymentCount').textContent = p.length;
  $('todayTotal').textContent = money(todayTx.reduce((a, t) => a + t.amount, 0));
}
function renderOverview() {
  let tx = selectedTransactions(), byDay = {};
  tx.forEach(t => byDay[t.date] = (byDay[t.date] || 0) + t.amount);
  let labels = Object.keys(byDay).sort();
  renderChart('collectionTrend', 'line', {
    labels,
    datasets: [{
      label: 'Collection',
      data: labels.map(x => byDay[x]),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,.13)',
      fill: true, tension: .35, pointRadius: 3
    }]
  }, { scales: { y: { ticks: { callback: v => '৳' + v / 1000 + 'k' } } } });
  let byMethod = {};
  tx.forEach(t => byMethod[t.method] = (byMethod[t.method] || 0) + t.amount);
  renderChart('paymentMethods', 'doughnut', {
    labels: Object.keys(byMethod),
    datasets: [{ data: Object.values(byMethod), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6'], borderWidth: 0 }]
  });
  let batches = batchSummary();
  $('batchHealth').innerHTML = batches.map(b => {
    let c = b.rate >= 80 ? 'good' : b.rate < 60 ? 'low' : '';
    return `<div class="batch-health-item"><div class="batch-health-top"><span>${esc(b.batch)}</span><span>${b.rate}%</span></div><div class="batch-health-meta"><span>${b.students} students</span><span>${money(b.paid)} / ${money(b.fee)}</span></div><div class="progress ${c}"><span style="width:${b.rate}%"></span></div></div>`;
  }).join('');
  $('attentionList').innerHTML = selectedStudents().filter(s => due(s) > 0).sort((a, b) => due(b) - due(a)).slice(0, 5).map((s, i) =>
    `<div class="attention-item"><span class="attention-rank">${i + 1}</span><div><div class="attention-name">${esc(s.name)}</div><div class="attention-meta">${esc(s.batch)} · Roll ${s.roll}</div></div><span class="attention-amount">${money(due(s))}</span></div>`
  ).join('') || '<p class="attention-meta">No outstanding dues for this filter.</p>';
}
function batchSummary() {
  return [...new Set(selectedStudents().map(s => s.batch))].map(batch => {
    let a = selectedStudents().filter(s => s.batch === batch),
      fee = a.reduce((x, s) => x + (s.fee || 0), 0),
      paid = a.reduce((x, s) => x + (s.paid || 0), 0);
    return { batch, students: a.length, fee, paid, due: fee - paid, rate: fee ? Math.round(paid / fee * 100) : 0 };
  }).sort((a, b) => b.rate - a.rate);
}
function renderCollection() {
  let tx = selectedTransactions(), byBatch = {};
  tx.forEach(t => { let b = (student(t.roll) || {}).batch || t.batch; if (b) byBatch[b] = (byBatch[b] || 0) + t.amount; });
  renderChart('batchCollectionChart', 'bar', {
    labels: Object.keys(byBatch),
    datasets: [{ label: 'Collected', data: Object.values(byBatch), backgroundColor: '#6366f1', borderRadius: 6 }]
  }, { scales: { y: { ticks: { callback: v => '৳' + v / 1000 + 'k' } } } });
  let day = [...new Set(tx.map(t => t.date))].sort(),
    ad = day.map(d => tx.filter(t => t.date === d && t.type === 'Admission').reduce((a, t) => a + t.amount, 0)),
    pay = day.map(d => tx.filter(t => t.date === d && t.type === 'Payment').reduce((a, t) => a + t.amount, 0));
  renderChart('dailyActivityChart', 'bar', {
    labels: day,
    datasets: [
      { label: 'Admissions', data: ad, backgroundColor: '#3b82f6', borderRadius: 5 },
      { label: 'Payments', data: pay, backgroundColor: '#10b981', borderRadius: 5 }
    ]
  }, {
    scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => '৳' + v / 1000 + 'k' } } },
    onClick: (e, els) => {
      if (els && els.length) {
        const d = day[els[0].index];
        if (d) { $('collectionDate').value = d; renderCollection(); }
      }
    }
  });
  const date = $('collectionDate').value;
  const dtx = date ? tx.filter(t => t.date === date) : tx;
  const dateTotal = dtx.reduce((a, t) => a + t.amount, 0);
  $('collectionTableMeta').innerHTML = date
    ? `Showing <b>${dtx.length} entries</b> for <b>${new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b> · Total <b>${money(dateTotal)}</b>`
    : `${tx.length} entries matched your filters`;
  $('collectionRows').innerHTML = dtx.slice().sort((a, b) => b.date.localeCompare(a.date)).map(t => {
    let s = student(t.roll) || { name: t.studentName || 'Unknown', batch: t.batch || t.batchName || '' };
    return `<tr><td>${t.date}</td><td><b>${esc(t.receipt)}</b></td><td>${esc(s.name)}<br><small>Roll ${s.roll || t.roll}</small></td><td>${esc(s.batch || t.batch || '')}</td><td><span class="type-pill type-${(t.type || '').toLowerCase()}">${t.type}</span></td><td>${esc(t.method)}</td><td class="money">${money(t.amount)}</td></tr>`;
  }).join('') || emptyRow(7, date ? 'No collection found for the selected date.' : 'No records matched the selected filters.');
}
function clearCollectionDate() {
  $('collectionDate').value = '';
  renderCollection();
}
function dueClass(amount) { return amount >= 10000 ? 'critical' : amount >= 5000 ? 'high' : 'standard' }
function renderDues() {
  let list = selectedStudents().filter(s => due(s) > 0).sort((a, b) => due(b) - due(a)),
    critical = list.filter(s => due(s) >= 10000),
    total = list.reduce((a, s) => a + due(s), 0);
  $('criticalDue').textContent = money(critical.reduce((a, s) => a + due(s), 0));
  $('criticalStudents').textContent = critical.length;
  $('averageDue').textContent = money(list.length ? Math.round(total / list.length) : 0);
  $('recoverableDue').textContent = money(Math.round(total * .6));
  let groups = [list.filter(s => due(s) < 5000).length, list.filter(s => due(s) >= 5000 && due(s) < 10000).length, critical.length];
  renderChart('dueAgingChart', 'bar', {
    labels: ['Under ৳5k', '৳5k – ৳9,999', '৳10k+'],
    datasets: [{ label: 'Students', data: groups, backgroundColor: ['#3b82f6', '#f59e0b', '#f43f5e'], borderRadius: 8 }]
  }, { scales: { y: { ticks: { stepSize: 1 } } } });
  $('dueRows').innerHTML = list.map(s => {
    let d = due(s), c = dueClass(d);
    return `<tr><td><b>${s.roll}</b></td><td>${esc(s.name)}</td><td>${esc(s.batch)}</td><td>${esc(s.guardian || s.guardianPhone || '')}</td><td class="money">${money(s.fee)}</td><td class="money">${money(s.paid)}</td><td class="money" style="color:#e11d48">${money(d)}</td><td><span class="due-pill due-${c}">${c}</span></td></tr>`;
  }).join('') || emptyRow(8);
}
function renderBatch() {
  let bs = batchSummary();
  renderChart('batchPerformanceChart', 'bar', {
    labels: bs.map(b => b.batch),
    datasets: [
      { label: 'Collected', data: bs.map(b => b.paid), backgroundColor: '#10b981', borderRadius: 5 },
      { label: 'Due', data: bs.map(b => b.due), backgroundColor: '#f43f5e', borderRadius: 5 }
    ]
  }, { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => '৳' + v / 1000 + 'k' } } } });
  $('batchRows').innerHTML = bs.map(b => `<tr><td><b>${esc(b.batch)}</b></td><td>${b.students}</td><td class="money">${money(b.fee)}</td><td class="money" style="color:#059669">${money(b.paid)}</td><td class="money" style="color:#e11d48">${money(b.due)}</td><td>${b.rate}%</td><td><span class="due-pill due-${b.rate >= 80 ? 'standard' : b.rate >= 60 ? 'high' : 'critical'}">${b.rate >= 80 ? 'On track' : b.rate >= 60 ? 'Review' : 'Action needed'}</span></td></tr>`).join('') || emptyRow(7);
}
function getMaterials() { return REPORT_DATA.materials || [] }
function renderMaterials() {
  let ms = getMaterials(),
    issued = ms.reduce((a, m) => a + (m.issued || 0), 0),
    eligible = ms.reduce((a, m) => a + (m.eligible || 0), 0),
    pending = Math.max(0, eligible - issued);
  $('materialTypes').textContent = ms.length;
  $('issuedCopies').textContent = issued;
  $('pendingCopies').textContent = pending;
  $('fulfillmentRate').textContent = (eligible ? Math.round(issued / eligible * 100) : 0) + '%';
  renderChart('materialChart', 'doughnut', {
    labels: ['Issued', 'Pending'],
    datasets: [{ data: [issued, pending], backgroundColor: ['#8b5cf6', '#e2e8f0'], borderWidth: 0 }]
  });
  $('materialRows').innerHTML = ms.map(m => {
    let p = Math.max(0, (m.eligible || 0) - (m.issued || 0)),
      r = (m.eligible || 0) ? Math.round((m.issued || 0) / m.eligible * 100) : 0;
    return `<tr><td><b>${esc(m.title)}</b></td><td>${esc(m.category)}</td><td>${esc(m.batch)}</td><td class="money">${money(m.limit)}</td><td>${m.eligible}</td><td style="color:#059669;font-weight:800">${m.issued}</td><td style="color:#e11d48;font-weight:800">${p}</td><td>${r}%</td></tr>`;
  }).join('') || emptyRow(8, 'No material data available from database.');
}
function renderLedger() {
  const s = ledgerStudentRoll ? student(ledgerStudentRoll) : null;
  if (!s) { $('ledgerContent').innerHTML = REPORT_DATA.students.length ? '<p class="attention-meta">Search for a student by roll, name or phone to view their ledger.</p>' : '<p class="attention-meta">No students are available in the database yet.</p>'; return; }
  let history = REPORT_DATA.transactions.filter(t => t.roll === s.roll).sort((a, b) => b.date.localeCompare(a.date));
  const d = due(s);
  const pct = s.fee ? Math.min(100, Math.round((s.paid || 0) / s.fee * 100)) : 0;
  const now = new Date().toLocaleString('en-GB');
  const materials = s.materials || [];
  const rows = history.map(t => `<tr><td>${esc(t.date)}</td><td><b>${esc(t.receipt)}</b></td><td><span class="type-pill type-${(t.type || '').toLowerCase()}">${esc(t.type)}</span></td><td>${esc(t.method)}</td><td class="money">${money(t.amount)}</td></tr>`).join('')
    || emptyRow(5, 'No payment receipt in current database.');
  $('ledgerContent').innerHTML = `
  <article class="ledger-sheet">
    <div class="ledger-top">
      <div>
        <span class="ledger-eyebrow">UCC PABNA · STUDENT LEDGER</span>
        <h3>${esc(s.name)}</h3>
        <p><b>Roll:</b> ${esc(s.roll)} &nbsp;·&nbsp; <b>Batch:</b> ${esc(s.batch)}</p>
        <p><b>Guardian:</b> ${esc(s.guardian || '—')} ${s.guardianPhone ? '· ' + esc(s.guardianPhone) : ''}</p>
      </div>
      <div class="ledger-balance">
        <span class="ledger-status ${d ? 'due' : 'paid'}">${d ? 'Partial / Due' : 'Paid in full'}</span>
        <small>Current due</small>
        <strong>${money(d)}</strong>
      </div>
    </div>
    <div class="ledger-top-line"></div>
    <div class="ledger-progress">
      <div class="ledger-progress-top"><span>Payment progress</span><strong>${pct}%</strong></div>
      <div class="ledger-progress-track"><span class="ledger-progress-fill ${d ? 'partial' : 'full'}" style="width:${pct}%"></span></div>
    </div>
    <div class="ledger-summary">
      <div class="ledger-sum-box"><small>Course fee</small><strong>${money(s.fee)}</strong></div>
      <div class="ledger-sum-box paid"><small>Total paid</small><strong>${money(s.paid)}</strong></div>
      <div class="ledger-sum-box due"><small>Outstanding due</small><strong>${money(d)}</strong></div>
    </div>
    <div class="ledger-section">
      <h4><i class="fas fa-receipt"></i> Payment history <span class="ledger-sec-count">${history.length} receipts</span></h4>
      <div class="table-responsive">
        <table class="ledger-table">
          <thead><tr><th>Date</th><th>Receipt</th><th>Type</th><th>Method</th><th class="money">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="ledger-section">
      <h4><i class="fas fa-box-open"></i> Distributed materials <span class="ledger-sec-count">${materials.length} items</span></h4>
      <div class="material-tags">${materials.length ? materials.map(x => `<span class="material-tag"><i class="fas fa-book"></i> ${esc(x)}</span>`).join('') : '<span class="attention-meta">No materials delivered yet.</span>'}</div>
    </div>
    <div class="ledger-foot">Computer generated statement · ${now}</div>
  </article>`;
}
function printLedger() {
  const s = ledgerStudentRoll ? student(ledgerStudentRoll) : REPORT_DATA.students[0];
  if (!s) { toast('No student selected.'); return; }
  const history = REPORT_DATA.transactions.filter(t => t.roll === s.roll).sort((a, b) => b.date.localeCompare(a.date));
  const d = due(s);
  const pct = s.fee ? Math.min(100, Math.round((s.paid || 0) / s.fee * 100)) : 0;
  const now = new Date().toLocaleString('en-GB');
  const materials = s.materials || [];
  const rows = history.map((t, i) => `<tr><td><span class="ledger-print-serial">${i + 1}</span>${esc(t.date || '—')}</td><td>${esc(t.receipt || '—')}</td><td>${esc(t.type || 'Payment')}</td><td class="ledger-print-method">${esc(t.method || 'Not recorded')}</td><td class="num amount">${money(Number(t.amount || 0))}</td></tr>`).join('')
    || `<tr><td colspan="5" class="ledger-print-empty">No payment receipts recorded.</td></tr>`;

  const sheet = document.createElement('section');
  sheet.className = 'ledger-print-sheet';
  sheet.id = 'ledgerPrintSheet';
  sheet.innerHTML = `
    <div class="ledger-print-head">
      <div class="ledger-print-brand">
        <div class="ledger-print-logo"><i class="fas fa-graduation-cap"></i></div>
        <div>
          <h1>UCC পাবনা শাখা</h1>
          <p>এডওয়ার্ড কলেজ, রথঘর সংলগ্ন, রাধানগর, পাবনা · 01312-427799</p>
          <p>Student Ledger · Generated: ${now}</p>
        </div>
      </div>
      <div class="ledger-print-meta">
        <span>${esc(s.batch)}</span>
        <span>Roll ${esc(s.roll)}</span>
      </div>
    </div>
    <div class="ledger-print-line"></div>
    <div class="ledger-print-student">
      <div>
        <div class="ledger-print-name">${esc(s.name)}</div>
        <div class="ledger-print-id">Roll: ${esc(s.roll)} &nbsp;·&nbsp; Batch: ${esc(s.batch)} &nbsp;·&nbsp; Guardian: ${esc(s.guardian || '—')} ${s.guardianPhone ? '· ' + esc(s.guardianPhone) : ''}</div>
      </div>
      <div class="ledger-print-status ${d ? 'due' : 'paid'}">${d ? 'Due ' + money(d) : 'Paid in full'}</div>
    </div>
    <div class="ledger-print-summary">
      <div><small>Course Fee</small><b>${money(s.fee)}</b></div>
      <div class="paid"><small>Total Paid</small><b>${money(s.paid)}</b></div>
      <div class="due"><small>Outstanding Due</small><b>${money(d)}</b></div>
      <div><small>Payment Progress</small><b>${pct}%</b></div>
    </div>
    <div class="ledger-print-section">
      <div class="ledger-print-section-title"><span><i class="fas fa-receipt"></i> Payment History</span><span>${history.length} receipts</span></div>
      <table class="ledger-print-table" style="width:100%!important;min-width:100%!important;max-width:100%!important;table-layout:fixed!important;display:table!important">
        <colgroup><col style="width:18%"><col style="width:26%"><col style="width:17%"><col style="width:21%"><col style="width:18%"></colgroup>
        <thead><tr><th>Date</th><th>Receipt No</th><th>Type</th><th>Method</th><th class="num">Amount (৳)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="ledger-print-section">
      <div class="ledger-print-section-title"><span><i class="fas fa-box-open"></i> Distributed Materials</span><span>${materials.length} items</span></div>
      <div class="ledger-print-materials">${materials.length ? materials.map(x => `<span class="ledger-print-mat">${esc(x)}</span>`).join('') : '<span class="ledger-print-empty">No materials delivered yet.</span>'}</div>
    </div>
    <div class="ledger-print-sigs">
      <div>Prepared by</div><div>Checked by</div><div>Branch Head</div>
    </div>
    <p class="ledger-print-footer">UCC Pabna · Student Ledger · ${now}</p>`;
  document.body.appendChild(sheet);
  document.body.classList.add('printing-ledger');

  const cleanup = () => {
    document.body.classList.remove('printing-ledger');
    sheet.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 1500);
}
let ledgerStudentRoll = null;
function ledgerSearch() {
  const input = $('studentLedgerSearch');
  const q = (input.value || '').trim().toLowerCase();
  const box = $('ledgerSearchResults');
  if (!q) { closeLedgerResults(); return; }
  const matches = REPORT_DATA.students.filter(s =>
    String(s.roll || '').toLowerCase().includes(q) ||
    String(s.name || '').toLowerCase().includes(q) ||
    String(s.phone || '').toLowerCase().includes(q) ||
    String(s.guardian || s.guardianPhone || '').toLowerCase().includes(q)
  ).slice(0, 8);
  box.innerHTML = matches.length
    ? matches.map(s => `<div class="ledger-search-item" onmousedown="selectLedgerStudent('${esc(s.roll)}')"><span class="ls-name">${esc(s.name)}</span><span class="ls-meta">${esc(s.roll)} · ${esc(s.batch)} · ${esc(s.phone || '')}</span></div>`).join('')
    : '<div class="ledger-search-empty">No student found with that roll, phone or name.</div>';
  box.classList.add('open');
}
function ledgerSearchKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = document.querySelector('#ledgerSearchResults .ledger-search-item');
    if (first) first.onmousedown();
  } else if (e.key === 'Escape') {
    closeLedgerResults();
  }
}
function selectLedgerStudent(roll) {
  ledgerStudentRoll = roll;
  const s = student(roll);
  if (s) $('studentLedgerSearch').value = `${s.name} · ${s.roll} · ${s.batch}`;
  closeLedgerResults();
  renderLedger();
}
function closeLedgerResults() {
  const box = $('ledgerSearchResults');
  if (box) box.classList.remove('open');
}
function emptyRow(cols, msg = 'No records matched the selected filters.') {
  return `<tr><td colspan="${cols}" style="text-align:center;color:#64748b;padding:25px">${msg}</td></tr>`;
}
function renderAll() {
  renderSummary();
  renderOverview();
  renderCollection();
  renderDues();
  renderBatch();
  renderMaterials();
  renderLedger();
  updateFilterSummary();
  $('printDateRange').textContent = `${$('fromDate').value || 'All time'} to ${$('toDate').value || 'Today'}`;
}
function applyFilters() {
  const f = dates();
  if (f.from && f.to && f.from > f.to) {
    toast('The From date cannot be later than the To date.');
    return;
  }
  $('collectionDate').value = '';
  renderAll();
  toast('Filters applied to the report.');
}
function resetFilters() {
  $('batchFilter').value = 'all';
  $('methodFilter').value = 'all';
  $('collectionDate').value = '';
  setDefaultDates();
  renderAll();
  toast('Default report filters restored.');
}
function openTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.report-tab').forEach(b => {
    const selected = b.dataset.tab === tab;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    const selected = p.id === tab + 'Pane';
    p.classList.toggle('active', selected);
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-hidden', String(!selected));
  });
  setTabFilterVisibility(tab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function exportReport() {
  let rows = [['UCC Pabna Report', activeTab], ['Date range', $('fromDate').value + ' to ' + $('toDate').value], [], ['Date', 'Receipt', 'Student', 'Batch', 'Type', 'Method', 'Amount']]
    .concat(selectedTransactions().map(t => {
      let s = student(t.roll) || { name: t.studentName || '', batch: t.batch || '' };
      return [t.date, t.receipt, s.name, s.batch || t.batch, t.type, t.method, t.amount];
    }));
  let csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n'),
    a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'UCC_Pabna_' + activeTab + '_report.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV report downloaded.');
}
function showReminderNotice() { toast('Reminder workflow is ready for WhatsApp/SMS integration later.'); }
function formatStatementDate(date) { return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); }
function getDailyStatementTransactions() {
  const date = $('dailyStatementDate').value, f = dates();
  return REPORT_DATA.transactions.filter(t => t.date === date && (f.batch === 'all' || (student(t.roll) || {}).batch === f.batch) && (f.method === 'all' || t.method === f.method)).sort((a, b) => a.receipt.localeCompare(b.receipt));
}
function printDailyStatement() {
  const date = $('dailyStatementDate').value;
  if (!date) { toast('Please select a date for the daily statement.'); return; }

  /* Load daily-statement.html inside a hidden iframe (fetches real data from the
     backend itself) and print it directly — no new browser window/tab. */
  const old = document.getElementById('dailyPrintFrame');
  if (old) old.remove();

  const frame = document.createElement('iframe');
  frame.id = 'dailyPrintFrame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;border:0;';
  frame.src = 'daily-statement.html?date=' + encodeURIComponent(date);

  frame.addEventListener('load', () => {
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      let win = null;
      try { win = frame.contentWindow; } catch (e) { win = null; }
      let ready = false;
      if (win && win.document) {
        const gen = win.document.getElementById('dsGenerated');
        ready = win.document.readyState === 'complete' && gen && gen.textContent.indexOf('Report generated') !== -1;
      }
      if (ready || tries > 40) {
        clearInterval(timer);
        setTimeout(() => {
          try {
            if (!win) throw new Error('frame window unavailable');
            const cleanup = () => frame.remove();
            win.addEventListener('afterprint', cleanup, { once: true });
            win.print();
            setTimeout(cleanup, 3000);
          } catch (e) { console.error(e); frame.remove(); }
        }, 300);
      }
    }, 200);
  });

  document.body.appendChild(frame);
}
function printCollectionStatement() {
  const tx = selectedTransactions().slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.receipt || '').localeCompare(String(a.receipt || '')));
  const f = dates();
  const range = f.from && f.to ? `${formatStatementDate(f.from)} – ${formatStatementDate(f.to)}` : (f.from ? `From ${formatStatementDate(f.from)}` : (f.to ? `Until ${formatStatementDate(f.to)}` : 'All time'));
  const byDay = {};
  tx.forEach(t => { byDay[t.date] = byDay[t.date] || { tx: 0, total: 0 }; byDay[t.date].tx++; byDay[t.date].total += Number(t.amount || 0); });
  const payload = {
    title: 'Collection Statement', range, batch: f.batch === 'all' ? 'All batches' : f.batch,
    method: f.method === 'all' ? 'All payment methods' : f.method,
    transactions: tx.map(t => ({ date: t.date, receipt: t.receipt, student: (student(t.roll) || {}).name || t.studentName, batch: (student(t.roll) || {}).batch || t.batch, type: t.type, fee: t.amount, discount: 0, paid: t.amount, method: t.method, status: 'Collected' })),
    summary: Object.keys(byDay).sort().map(date => ({ date, ...byDay[date] }))
  };
  sessionStorage.setItem('uccCollectionPrintData', JSON.stringify(payload));
  const old = document.getElementById('collectionPrintFrame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = 'collectionPrintFrame'; frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;border:0;';
  frame.src = 'daily-statement.html?collectionPrint=1';
  frame.addEventListener('load', () => setTimeout(() => {
    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    const cleanup = () => frame.remove();
    win.addEventListener('afterprint', cleanup, { once: true });
    win.print();
    setTimeout(cleanup, 3000);
  }, 400));
  document.body.appendChild(frame);
}
function printActiveReport() {
  if (activeTab === 'collection') { printCollectionStatement(); return; }
  window.print();
}

/* ── Chart.js print fix ──
   Chart.js resizes hidden/detached canvases to 0x0 during print layout,
   which wipes the chart bitmap and makes charts blank in the print output.
   Re-render every chart at a fixed print size in beforeprint, then rebuild
   them (responsive) again in afterprint. */
function fixChartsForPrint() {
  const all = {};
  Object.assign(all, charts, bwCharts);
  Object.keys(all).forEach(id => {
    const c = all[id], el = $(id);
    if (!c || !el) return;
    const wrap = el.parentElement;
    const w = el.clientWidth || (wrap && wrap.clientWidth) || 400;
    c.options.responsive = false;
    c.options.maintainAspectRatio = false;
    c.resize(w, 210);
  });
}
function restoreChartsAfterPrint() {
  renderAll();
  renderBatchwise();
}
window.addEventListener('beforeprint', fixChartsForPrint);
window.addEventListener('afterprint', restoreChartsAfterPrint);
function printBatchLists() {
  const batch = $('batchFilter').value;
  if (batch === 'all') { toast('Please select one batch from the filter first.'); return; }

  const students = REPORT_DATA.students.filter(s => s.batch === batch);
  const paid = students.filter(s => due(s) === 0);
  const unpaid = students.filter(s => due(s) > 0);
  const fee = students.reduce((a, s) => a + (s.fee || 0), 0);
  const collected = students.reduce((a, s) => a + (s.paid || 0), 0);
  const rate = fee ? Math.round(collected / fee * 100) : 0;
  const now = new Date().toLocaleString('en-GB');

  const pRows = paid.length
    ? paid.map(s => `<tr><td>${s.roll}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.guardian || s.guardianPhone || '')}</td><td>${money(s.paid)}</td><td>${esc((s.materials || []).join(', ') || '—')}</td></tr>`).join('')
    : `<tr><td colspan="5" class="bw-empty">No paid student.</td></tr>`;
  const dRows = unpaid.length
    ? unpaid.map(s => `<tr><td>${s.roll}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.guardian || s.guardianPhone || '')}</td><td>${money(s.paid)}</td><td>${money(due(s))}</td></tr>`).join('')
    : `<tr><td colspan="5" class="bw-empty">No due student.</td></tr>`;

  const sheet = document.createElement('section');
  sheet.className = 'bw-print-sheet';
  sheet.id = 'bwBatchPrintSheet';
  sheet.innerHTML = `
    <div class="bw-print-head">
      <div class="bw-print-brand">
        <div class="bw-print-logo"><i class="fas fa-graduation-cap"></i></div>
        <div>
          <h1>UCC পাবনা শাখা</h1>
          <p>এডওয়ার্ড কলেজ, রথঘর সংলগ্ন, রাধানগর, পাবনা · 01312-427799</p>
          <p>Batch payment status details · Generated: ${now}</p>
          <h2>${esc(batch)}</h2>
        </div>
      </div>
      <div class="bw-print-meta">
        <span>Total students: ${students.length}</span>
        <span>Collection rate: ${rate}%</span>
      </div>
    </div>
    <div class="bw-print-line"></div>
    <div class="bw-print-summary-cards">
      <div><small>Batch</small><b>${esc(batch)}</b></div>
      <div><small>Total Students</small><b>${students.length}</b></div>
      <div><small>Total Fee</small><b>${money(fee)}</b></div>
      <div><small>Collected</small><b>${money(collected)}</b></div>
      <div><small>Due</small><b>${money(fee - collected)}</b></div>
    </div>
    <div class="bw-lists-print">
      <div>
        <div class="bw-print-list-title">✓ Paid Students (${paid.length})</div>
        <table class="bw-print-table">
          <thead><tr><th>Roll</th><th>Name</th><th>Guardian</th><th>Paid</th><th>Materials</th></tr></thead>
          <tbody>${pRows}</tbody>
        </table>
      </div>
      <div>
        <div class="bw-print-list-title due">! Due Students (${unpaid.length})</div>
        <table class="bw-print-table">
          <thead><tr><th>Roll</th><th>Name</th><th>Guardian</th><th>Paid</th><th>Due</th></tr></thead>
          <tbody>${dRows}</tbody>
        </table>
      </div>
    </div>
    <div class="bw-print-sigs">
      <div>Prepared by</div><div>Checked by</div><div>Branch Head</div>
    </div>
    <p class="bw-print-footer">UCC Pabna · Batch Payment Status · ${now}</p>`;
  document.body.appendChild(sheet);
  document.body.classList.add('printing-bw');

  const cleanup = () => {
    document.body.classList.remove('printing-bw');
    sheet.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 1500);
}
function toast(message) {
  let t = $('toast');
  if (!t) return;
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ═══════════ BATCH-WISE REPORT — Backend connected ═══════════ */
const bwMoney = n => '৳' + Number(n || 0).toLocaleString('en-IN');
const bwDue = s => Math.max(0, (s.fee || 0) - (s.paid || 0));
const bwIsActive = s => bwActiveState.hasOwnProperty(s.roll) ? bwActiveState[s.roll] : (s.active !== false);

function bwBatchById(id) { return BW_DATA.batches.find(b => b.id === id || b._id === id); }

function bwFilteredBatches() {
  const cat = document.getElementById('bwCategory')?.value || 'all';
  const status = document.getElementById('bwStatus')?.value || 'all';
  return BW_DATA.batches.filter(b =>
    (cat === 'all' || b.category === cat) &&
    (status === 'all' || b.status === status)
  );
}

function bwBatchStudents(batchId) {
  const b = bwBatchById(batchId);
  const name = b ? (b.batchName || b.name) : batchId;
  return BW_DATA.students.filter(s => s.batch === name);
}

function bwPopulateFilters() {
  const sel = document.getElementById('bwBatch');
  if (!sel) return;
  sel.innerHTML = '<option value="all">All batches</option>';
  BW_DATA.batches.forEach(b => {
    sel.insertAdjacentHTML('beforeend', `<option value="${b.id || b._id}">${b.batchName || b.name}</option>`);
  });

  /* Dynamically populate category options from real batch data */
  const catSel = document.getElementById('bwCategory');
  if (catSel) {
    const cats = [...new Set(BW_DATA.batches.map(b => b.category || b.program).filter(Boolean))];
    if (cats.length) {
      catSel.innerHTML = '<option value="all">All categories</option>' +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
  }
}

function bwRenderKpis(batches) {
  if (!batches.length) {
    document.getElementById('bwTotalStudents').textContent = 0;
    document.getElementById('bwPaidStudents').textContent = 0;
    document.getElementById('bwDueStudents').textContent = 0;
    document.getElementById('bwTotalFee').textContent = bwMoney(0);
    document.getElementById('bwTotalCollected').textContent = bwMoney(0);
    document.getElementById('bwTotalDue').textContent = bwMoney(0);
    document.getElementById('bwCollRate').textContent = '0%';
    document.getElementById('bwCapUtil').textContent = '0%';
    return;
  }
  const names = batches.map(b => b.batchName || b.name);
  const sts = BW_DATA.students.filter(s => names.includes(s.batch));
  const totalFee = sts.reduce((a, s) => a + (s.fee || 0), 0);
  const totalPaid = sts.reduce((a, s) => a + (s.paid || 0), 0);
  const totalDue = sts.reduce((a, s) => a + bwDue(s), 0);
  const paid = sts.filter(s => bwDue(s) === 0).length;
  const due = sts.filter(s => bwDue(s) > 0).length;
  const rate = totalFee ? Math.round(totalPaid / totalFee * 100) : 0;
  const totalCap = batches.reduce((a, b) => a + (b.capacity || 0), 0);
  const capUtil = totalCap ? Math.round(sts.length / totalCap * 100) : 0;

  document.getElementById('bwTotalStudents').textContent = sts.length;
  document.getElementById('bwPaidStudents').textContent = paid;
  document.getElementById('bwDueStudents').textContent = due;
  document.getElementById('bwTotalFee').textContent = bwMoney(totalFee);
  document.getElementById('bwTotalCollected').textContent = bwMoney(totalPaid);
  document.getElementById('bwTotalDue').textContent = bwMoney(totalDue);
  document.getElementById('bwCollRate').textContent = rate + '%';
  document.getElementById('bwCapUtil').textContent = capUtil + '%';
}

function bwChart(id, type, data, options) {
  if (bwCharts[id]) { bwCharts[id].destroy(); }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  bwCharts[id] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      ...options
    }
  });
}

function bwRenderEnrollmentChart(batches) {
  if (!batches.length) return;
  const labels = batches.map(b => (b.batchName || b.name).replace('-2026', ''));
  const enrolled = batches.map(b => {
    const name = b.batchName || b.name;
    return BW_DATA.students.filter(s => s.batch === name).length;
  });
  const capacity = batches.map(b => b.capacity || 0);
  bwChart('bwEnrollmentChart', 'bar', {
    labels,
    datasets: [
      { label: 'Enrolled', data: enrolled, backgroundColor: '#6366f1', borderRadius: 5 },
      { label: 'Capacity', data: capacity, backgroundColor: 'rgba(99,102,241,.18)', borderRadius: 5 }
    ]
  }, { scales: { y: { beginAtZero: true } } });
}

function bwRenderCollectionChart(batches) {
  if (!batches.length) return;
  const names = batches.map(b => b.batchName || b.name);
  const sts = BW_DATA.students.filter(s => names.includes(s.batch));
  const collected = sts.reduce((a, s) => a + (s.paid || 0), 0);
  const due = sts.reduce((a, s) => a + bwDue(s), 0);
  bwChart('bwCollectionChart', 'doughnut', {
    labels: ['Collected', 'Due'],
    datasets: [{ data: [collected, due], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 0 }]
  }, {
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: c => ' ' + bwMoney(c.raw) } }
    }
  });
}

function bwHealthChip(rate) {
  if (rate >= 80) return '<span class="bw-chip bw-chip-good">On track</span>';
  if (rate >= 60) return '<span class="bw-chip bw-chip-warn">Review</span>';
  return '<span class="bw-chip bw-chip-bad">Action needed</span>';
}

function bwStatusChip(status) {
  const map = { Active: 'bw-chip-active', Inactive: 'bw-chip-inactive', Archived: 'bw-chip-archived' };
  return `<span class="bw-chip ${map[status] || ''}">${status || 'Active'}</span>`;
}

function bwMatChip(materials) {
  if (!materials || !materials.length)
    return '<span class="bw-mat-none">None</span>';
  return `<span class="bw-mat-ok" title="${materials.join(', ')}"><i class="fas fa-book"></i> ${materials.length} item${materials.length > 1 ? 's' : ''}</span>`;
}

function bwToggleActive(roll) {
  const s = BW_DATA.students.find(x => x.roll === roll);
  if (!s) return;
  const cur = bwIsActive(s);
  bwActiveState[roll] = !cur;
  fetch(`${API_BASE}/ucc/students/${roll}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !cur })
  }).catch(() => {});
  toast(`${roll} status → ${!cur ? 'Active' : 'Inactive'}`);
  if (bwCurrentBatchId) renderBwModal(bwCurrentBatchId);
}

function bwRenderTable(batches) {
  const meta = document.getElementById('bwTableMeta');
  if (meta) meta.textContent = `${batches.length} batch${batches.length !== 1 ? 'es' : ''} matched`;

  const tbody = document.getElementById('bwTableBody');
  if (!tbody) return;

  if (!batches.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:#64748b;">No batches matched the selected filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = batches.map(b => {
    const name = b.batchName || b.name;
    const sts = BW_DATA.students.filter(s => s.batch === name);
    const fee = sts.reduce((a, s) => a + (s.fee || 0), 0);
    const paid = sts.reduce((a, s) => a + (s.paid || 0), 0);
    const due = Math.max(0, fee - paid);
    const rate = fee ? Math.round(paid / fee * 100) : 0;
    return `<tr class="bw-table-row" onclick="renderBwModal('${b.id || b._id}')" title="Click to view details">
      <td><b>${name}</b></td>
      <td>${b.category || b.program || '—'}</td>
      <td>${b.session || '2026'}</td>
      <td>${sts.length} / ${b.capacity || 0}</td>
      <td class="money">${bwMoney(fee)}</td>
      <td class="money" style="color:#059669;font-weight:700">${bwMoney(paid)}</td>
      <td class="money" style="color:#e11d48;font-weight:700">${bwMoney(due)}</td>
      <td>${rate}%</td>
      <td>${bwStatusChip(b.status)}</td>
      <td><button class="btn btn-secondary btn-sm no-print" onclick="event.stopPropagation();renderBwModal('${b.id || b._id}')">
        <i class="fas fa-eye"></i> View
      </button></td>
    </tr>`;
  }).join('');
}

function renderBatchwise() {
  const sel = document.getElementById('bwBatch').value;
  const batches = bwFilteredBatches().filter(b => sel === 'all' || (b.id === sel || b._id === sel));
  bwRenderKpis(batches);
  bwRenderEnrollmentChart(batches);
  bwRenderCollectionChart(batches);
  bwRenderTable(batches);
}

function renderBwModal(batchId) {
  bwCurrentBatchId = batchId;
  const b = bwBatchById(batchId);
  if (!b) return;
  const name = b.batchName || b.name;
  const sts = BW_DATA.students.filter(s => s.batch === name);
  const fee = sts.reduce((a, s) => a + (s.fee || 0), 0);
  const paid = sts.reduce((a, s) => a + (s.paid || 0), 0);
  const due = Math.max(0, fee - paid);
  const rate = fee ? Math.round(paid / fee * 100) : 0;
  const paidList = sts.filter(s => bwDue(s) === 0);
  const dueList = sts.filter(s => bwDue(s) > 0).sort((a, z) => bwDue(z) - bwDue(a));

  document.getElementById('bwModalTitle').textContent = name;
  document.getElementById('bwModalSub').textContent = `${b.category || b.program || ''} · ${b.session || '2026'} · ${b.status || 'Active'}`;

  document.getElementById('bwDetailMeta').innerHTML = `
    <div class="bw-meta-grid">
      <div><small>Coordinator</small><strong>${b.coordinator || '—'}</strong></div>
      <div><small>Start Date</small><strong>${b.startDate || '—'}</strong></div>
      <div><small>End Date</small><strong>${b.endDate || '—'}</strong></div>
      <div><small>Capacity</small><strong>${sts.length} / ${b.capacity || 0} enrolled</strong></div>
      <div><small>Admission Fee</small><strong>${bwMoney(b.admissionFee || 0)}</strong></div>
      <div><small>Course Fee</small><strong>${bwMoney(b.courseFee || b.baseFee || 0)}</strong></div>
      <div class="bw-meta-notes"><small>Notes</small><strong>${b.notes || '—'}</strong></div>
    </div>`;

  document.getElementById('bwDetailFin').innerHTML = `
    <div class="bw-fin-grid">
      <div class="bw-fin-item bw-fin-blue">
        <small>Total Students</small><strong>${sts.length}</strong>
      </div>
      <div class="bw-fin-item bw-fin-green">
        <small>Total Collected</small><strong>${bwMoney(paid)}</strong>
      </div>
      <div class="bw-fin-item bw-fin-rose">
        <small>Total Due</small><strong>${bwMoney(due)}</strong>
      </div>
      <div class="bw-fin-item bw-fin-indigo">
        <small>Collection Rate</small><strong>${rate}%</strong>
      </div>
      <div class="bw-fin-item bw-fin-emerald">
        <small>Paid Students</small><strong>${paidList.length}</strong>
      </div>
      <div class="bw-fin-item bw-fin-amber">
        <small>Due Students</small><strong>${dueList.length}</strong>
      </div>
    </div>`;

  document.getElementById('bwPaidCount').textContent = paidList.length;
  document.getElementById('bwPaidBody').innerHTML = paidList.length
    ? paidList.map(s => bwStudentRow(s, false)).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:18px;color:#64748b;">No fully paid student yet.</td></tr>`;

  document.getElementById('bwDueCount').textContent = dueList.length;
  document.getElementById('bwDueBody').innerHTML = dueList.length
    ? dueList.map(s => bwStudentRow(s, true)).join('')
    : `<tr><td colspan="8" style="text-align:center;padding:18px;color:#64748b;">No due student in this batch.</td></tr>`;

  const panel = document.getElementById('bwDetailPanel');
  panel.classList.add('open');
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function bwStudentRow(s, showDue) {
  const active = bwIsActive(s);
  const toggleClass = active ? 'bw-toggle-on' : 'bw-toggle-off';
  const toggleLabel = active ? 'Active' : 'Inactive';
  const statusCell = `
    <span class="bw-toggle ${toggleClass}" onclick="bwToggleActive('${s.roll}')" title="Toggle status">
      ${toggleLabel}
    </span>`;
  const actions = `
    <div class="bw-row-actions">
      <button class="bw-action-link bw-edit-btn" onclick="openBwEdit('${s.roll}')" title="Edit Student"><i class="fas fa-pen-to-square"></i></button>
      <a href="payment.html?roll=${s.roll}" class="bw-action-link" title="Payment"><i class="fas fa-money-bill-wave"></i></a>
      <a href="students.html?id=${s.roll}" class="bw-action-link" title="Ledger"><i class="fas fa-file-invoice"></i></a>
      <a href="distribution.html?roll=${s.roll}" class="bw-action-link" title="Distribution"><i class="fas fa-book-open"></i></a>
    </div>`;

  const studentCell = `<td><div class="bw-st-name">${esc(s.name)}</div><small class="bw-st-sub">${esc(s.guardian || s.guardianPhone || '—')}</small></td>`;

  if (showDue) {
    return `<tr>
      <td><b>${esc(s.roll)}</b></td>
      ${studentCell}
      <td class="money">${bwMoney(s.paid)}</td>
      <td class="money" style="color:#e11d48;font-weight:700">${bwMoney(bwDue(s))}</td>
      <td>${bwMatChip(s.materials)}</td>
      <td>${statusCell}</td>
      <td>${actions}</td>
    </tr>`;
  }
  return `<tr>
    <td><b>${esc(s.roll)}</b></td>
    ${studentCell}
    <td class="money" style="color:#059669;font-weight:700">${bwMoney(s.paid)}</td>
    <td>${bwMatChip(s.materials)}</td>
    <td>${statusCell}</td>
    <td>${actions}</td>
  </tr>`;
}

function closeBwModal(e) {
  document.getElementById('bwDetailPanel').classList.remove('open');
  bwCurrentBatchId = null;
}

function bwOpenPrintPreview(batchId) {
  const bid = batchId || document.getElementById('bwBatch').value;
  if (!bid || bid === 'all') {
    toast('Please select one batch before opening the print preview.');
    return;
  }

  const batch = bwBatchById(bid);
  if (!batch) {
    toast('Selected batch not found.');
    return;
  }

  const name = batch.batchName || batch.name;
  const students = BW_DATA.students.filter(s => s.batch === name);
  const paid = students.filter(s => bwDue(s) === 0);
  const due = students.filter(s => bwDue(s) > 0).sort((a, b) => bwDue(b) - bwDue(a));
  const totalFee = students.reduce((a, s) => a + (s.fee || 0), 0);
  const collected = students.reduce((a, s) => a + (s.paid || 0), 0);
  const dueAmount = Math.max(0, totalFee - collected);
  const rate = totalFee ? Math.round(collected / totalFee * 100) : 0;
  const monthLabel = batch.startDate ? new Date(batch.startDate + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '2026';
  const now = new Date().toLocaleString('en-GB');
  const previewId = 'bwReportPreviewSheet';

  document.getElementById(previewId)?.remove();

  const paidRows = paid.length
    ? paid.map(s => `<tr><td>${esc(s.roll)}</td><td>${esc(s.name)}</td><td>${esc(s.guardian || s.guardianPhone || '')}</td><td class="amount-paid">${bwMoney(s.paid)}</td><td>${esc(s.method || '—')}</td></tr>`).join('')
    : `<tr><td colspan="5" class="bw-empty">No paid students found.</td></tr>`;

  const dueRows = due.length
    ? due.map(s => `<tr><td>${esc(s.roll)}</td><td>${esc(s.name)}</td><td>${esc(s.guardian || s.guardianPhone || '')}</td><td class="amount-due">${bwMoney(bwDue(s))}</td></tr>`).join('')
    : `<tr><td colspan="4" class="bw-empty">No unpaid students found.</td></tr>`;

  const sheet = document.createElement('section');
  sheet.className = 'bw-print-sheet';
  sheet.id = previewId;
  sheet.innerHTML = `
    <div class="bw-preview-actions no-print">
      <div class="bw-preview-tag">
        <i class="fas fa-print"></i>
        <span>A4 Report Preview &amp; Export</span>
      </div>
      <div class="bw-preview-btns">
        <button class="btn btn-primary btn-sm" onclick="bwPrintPreview()"><i class="fas fa-print"></i> Print A4</button>
        <button class="btn btn-success btn-sm" onclick="bwExportCSV('${bid}')"><i class="fas fa-file-csv"></i> Export CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="bwCloseReportPreview()"><i class="fas fa-times"></i> Close</button>
      </div>
    </div>
    <div class="bw-report-preview">
      <div class="bw-report-brand">
        <div class="bw-report-brand-main">
          <div class="bw-report-title">UCC পাবনা শাখা</div>
          <div class="bw-report-sub">এডওয়ার্ড কলেজ, রথঘর সংলগ্ন, রাধানগর, পাবনা · 01312-427799</div>
        </div>
        <div class="bw-report-batch">${esc(name)} · ${esc(monthLabel)}</div>
      </div>
      <div class="bw-report-divider"></div>
      <div class="bw-report-cards">
        <div class="bw-report-card bw-card-blue">
          <div class="card-icon"><i class="fas fa-users"></i></div>
          <div>
            <div class="card-value">${students.length}</div>
            <div class="card-label">Total Students</div>
          </div>
        </div>
        <div class="bw-report-card bw-card-green">
          <div class="card-icon"><i class="fas fa-circle-check"></i></div>
          <div>
            <div class="card-value">${paid.length}</div>
            <div class="card-label">Paid Students</div>
          </div>
        </div>
        <div class="bw-report-card bw-card-rose">
          <div class="card-icon"><i class="fas fa-triangle-exclamation"></i></div>
          <div>
            <div class="card-value">${due.length}</div>
            <div class="card-label">Due Students</div>
          </div>
        </div>
        <div class="bw-report-card bw-card-emerald">
          <div class="card-icon"><i class="fas fa-wallet"></i></div>
          <div>
            <div class="card-value">${bwMoney(collected)}</div>
            <div class="card-label">Collected</div>
          </div>
        </div>
        <div class="bw-report-card bw-card-amber">
          <div class="card-icon"><i class="fas fa-hand-holding-dollar"></i></div>
          <div>
            <div class="card-value">${bwMoney(dueAmount)}</div>
            <div class="card-label">Total Due</div>
          </div>
        </div>
        <div class="bw-report-card bw-card-indigo">
          <div class="card-icon"><i class="fas fa-chart-line"></i></div>
          <div>
            <div class="card-value">${rate}%</div>
            <div class="card-label">Collection Rate</div>
          </div>
        </div>
      </div>
      <div class="bw-report-columns">
        <div class="bw-report-col bw-report-col-left">
          <div class="bw-report-col-header">
            <div><span class="dot dot-paid">🟢</span><strong>Paid Students</strong></div>
            <span class="bw-report-pill paid">${paid.length}</span>
          </div>
          <div class="table-responsive">
            <table class="bw-report-table">
              <thead><tr><th>ID</th><th>NAME</th><th>PHONE</th><th>PAID AMOUNT</th><th>METHOD</th></tr></thead>
              <tbody>${paidRows}</tbody>
            </table>
          </div>
        </div>
        <div class="bw-report-vert-divider"></div>
        <div class="bw-report-col bw-report-col-right">
          <div class="bw-report-col-header">
            <div><span class="dot dot-due">🔴</span><strong>Unpaid / Due Students</strong></div>
            <span class="bw-report-pill due">${due.length}</span>
          </div>
          <div class="table-responsive">
            <table class="bw-report-table">
              <thead><tr><th>ID</th><th>NAME</th><th>PHONE</th><th>DUE AMOUNT</th></tr></thead>
              <tbody>${dueRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(sheet);
  setTimeout(() => sheet.scrollIntoView({ behavior: 'smooth', block: 'center' }), 20);
}

function bwPrintPreview() {
  document.body.classList.add('printing-bw');
  const cleanup = () => {
    document.body.classList.remove('printing-bw');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

function bwCloseReportPreview() {
  document.getElementById('bwReportPreviewSheet')?.remove();
}

function bwPrintSummary() {
  bwOpenPrintPreview();
}

function bwPrintPaidDue(batchId) {
  bwOpenPrintPreview(batchId);
}

function bwModalPrintPaidDue() { bwPrintPaidDue(bwCurrentBatchId); }

function bwModalExportCSV() {
  if (bwCurrentBatchId) bwExportCSV(bwCurrentBatchId);
}

function bwExportCSV(batchId) {
  const bid = batchId || document.getElementById('bwBatch').value;
  const bname = bid === 'all' ? 'All' : (bwBatchById(bid) || {}).batchName || (bwBatchById(bid) || {}).name || bid;
  const sts = bid === 'all' ? BW_DATA.students : BW_DATA.students.filter(s => s.batch === (bwBatchById(bid) || {}).batchName);
  const header = ['Roll', 'Name', 'Batch', 'Guardian Phone', 'Course Fee', 'Paid', 'Due', 'Materials', 'Status'];
  const rows = sts.map(s => [
    s.roll, s.name,
    s.batch,
    s.guardian || s.guardianPhone || '',
    s.fee, s.paid, bwDue(s),
    (s.materials || []).join(' | '),
    bwIsActive(s) ? 'Active' : 'Inactive'
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `UCC_BatchReport_${String(bname).replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exported: ' + bname);
}

function initBatchwise() {
  bwPopulateFilters();
  renderBatchwise();
}

/* ── Student Edit Modal (backend connected) ── */
function openBwEdit(roll) {
  const s = BW_DATA.students.find(s => s.roll === roll);
  if (!s) return;
  bwEditRoll = roll;

  const batchSel = document.getElementById('bwEditBatch');
  batchSel.innerHTML = BW_DATA.batches
    .map(b => `<option value="${b.id || b._id}" ${(s.batch === (b.batchName || b.name)) ? 'selected' : ''}>${b.batchName || b.name}</option>`)
    .join('');

  document.getElementById('bwEditModalSub').textContent = `Roll ${s.roll} — ${s.batch}`;
  document.getElementById('bwEditRoll').value = s.roll;
  document.getElementById('bwEditName').value = s.name;
  document.getElementById('bwEditPhone').value = s.phone || '';
  document.getElementById('bwEditGuardian').value = s.guardian || s.guardianPhone || '';
  document.getElementById('bwEditFee').value = s.fee;
  document.getElementById('bwEditMaterials').value = (s.materials || []).join(', ');

  document.getElementById('bwEditModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('bwEditName').focus(), 100);
}

function saveBwEdit() {
  if (!bwEditRoll) return;
  const idx = BW_DATA.students.findIndex(s => s.roll === bwEditRoll);
  if (idx === -1) return;

  const name = document.getElementById('bwEditName').value.trim();
  const phone = document.getElementById('bwEditPhone').value.trim();
  const guardian = document.getElementById('bwEditGuardian').value.trim();
  const fee = parseFloat(document.getElementById('bwEditFee').value) || 0;
  const batchId = document.getElementById('bwEditBatch').value;
  const matRaw = document.getElementById('bwEditMaterials').value;
  const materials = matRaw.split(',').map(m => m.trim()).filter(Boolean);

  if (!name) { toast('নাম দিন।'); document.getElementById('bwEditName').focus(); return; }

  /* Update local data immediately */
  const b = bwBatchById(batchId);
  BW_DATA.students[idx] = {
    ...BW_DATA.students[idx],
    name,
    phone,
    guardian,
    guardianPhone: guardian,
    fee,
    batch: b ? (b.batchName || b.name) : BW_DATA.students[idx].batch,
    batchName: b ? (b.batchName || b.name) : BW_DATA.students[idx].batch,
    materials
  };

  /* Save to backend */
  fetch(`${API_BASE}/ucc/students/${bwEditRoll}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, guardianPhone: guardian, fee, batchId, materials })
  }).then(r => r.json()).then(res => {
    if (!res.success) toast('Server error: ' + res.message);
  }).catch(() => {});

  closeBwEditModal();
  toast(`✅ ${name} — তথ্য আপডেট হয়েছে`);

  renderBatchwise();
  if (bwCurrentBatchId) renderBwModal(bwCurrentBatchId);
  renderAll();
  populateSelects();
}

function closeBwEditModal(e) {
  if (e && e.target !== document.getElementById('bwEditModal')) return;
  document.getElementById('bwEditModal').style.display = 'none';
  if (!bwCurrentBatchId) document.body.style.overflow = '';
  bwEditRoll = null;
}

/* ═══════════ BACKEND DATA LOADING ═══════════ */
async function loadReportData() {
  setReportLoadStatus('Loading live report data…');
  try {
    const res = await fetch(`${API_BASE}/ucc/reports`);
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'API error');

    const d = data.data || {};
    REPORT_DATA.students = d.students || [];
    REPORT_DATA.transactions = d.transactions || [];
    REPORT_DATA.materials = d.materials || [];
    BW_DATA.batches = d.batches || [];
    BW_DATA.students = d.students || [];

    /* Sync REPORT_DATA and BW_DATA student mappings */
    BW_DATA.students = REPORT_DATA.students.map(s => ({
      roll: s.roll,
      name: s.name,
      batch: s.batch,
      batchName: s.batch,
      guardian: s.guardian,
      guardianPhone: s.guardianPhone,
      phone: s.phone,
      fee: s.fee,
      paid: s.paid,
      materials: s.materials || [],
      active: s.active !== false
    }));

    BW_DATA.batches = d.batches.map(b => ({
      id: b._id || b.id,
      _id: b._id || b.id,
      name: b.name || b.batchName,
      batchName: b.batchName || b.name,
      batchCode: b.batchCode,
      category: b.category || b.program,
      program: b.program || b.category,
      session: b.session,
      capacity: b.capacity,
      coordinator: b.coordinator,
      startDate: b.startDate,
      endDate: b.endDate,
      admissionFee: b.admissionFee,
      courseFee: b.courseFee || b.baseFee,
      baseFee: b.baseFee,
      notes: b.notes,
      status: b.status
    }));
    setReportLoadStatus(`Live data ready · ${REPORT_DATA.students.length} students · ${REPORT_DATA.transactions.length} transactions`);

  } catch (e) {
    console.warn('Failed to load from backend, using empty data.', e);
    REPORT_DATA = { students: [], transactions: [], materials: [] };
    BW_DATA = { batches: [], students: [] };
    setReportLoadStatus('Report data could not be loaded. Refresh the page and try again.', true);
  }

  setDefaultDates();
  populateSelects();
  setTabFilterVisibility(activeTab);
  renderAll();
  initBatchwise();
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();

  document.querySelectorAll('.report-tab').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
  document.querySelectorAll('.report-tab').forEach((tab, index, tabs) => tab.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    openTab(tabs[next].dataset.tab);
  }));

  document.addEventListener('click', e => {
    const w = $('ledgerSearchWrap');
    if (w && !w.contains(e.target)) closeLedgerResults();
  });

  let user = JSON.parse(sessionStorage.getItem('uccAdminUser') || '{}');
  if (user.username) $('uccAdminName').textContent = user.username;
  $('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('uccAdminToken');
    sessionStorage.removeItem('uccAdminUser');
  });

  /* Load real data from backend */
  loadReportData();

  /* Patch applyFilters and resetFilters to also re-render batchwise */
  const _origApply = window.applyFilters;
  window.applyFilters = function () { _origApply && _origApply(); renderBatchwise(); };
  const _origReset = window.resetFilters;
  window.resetFilters = function () { _origReset && _origReset(); renderBatchwise(); };
});

/* Keyboard: Escape closes panels */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('bwEditModal').style.display === 'flex') {
      closeBwEditModal();
    } else if (bwCurrentBatchId) {
      closeBwModal();
    }
  }
});
