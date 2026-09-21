/* ==========================================================================
   UCC পাবনা — Merit List JS (Backend Connected)
   ========================================================================== */

const API_BASE_ML = 'http://localhost:5002/api';

/* $ is provided by exams.js (loaded before this file) */

/* ── Grade CSS class ── */
function mlGradeClass(g) {
  const m = {'A+':'ml-grade-aplus','A':'ml-grade-a','B':'ml-grade-b','C':'ml-grade-c','D':'ml-grade-d','F':'ml-grade-f','ABS':'ml-grade-abs'};
  return m[g] || 'ml-grade-abs';
}

/* ── Populate exam dropdown ── */
async function populateExamDropdown() {
  const exams = (window.EXAM_DEMO||{}).exams||[];
  const sel   = $('mlExamSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Exam বেছে নিন --</option>';
  exams.forEach(e => {
    sel.insertAdjacentHTML('beforeend',
      `<option value="${e.id}">${e.name} — ${e.batch} (${e.date})</option>`
    );
  });

  /* quick-access chips (Published exams only) */
  const chips = $('mlSelectorChips');
  if (chips) {
    chips.innerHTML = exams.filter(e => e.status==='Published').map(e =>
      `<span class="ml-exam-chip" data-id="${e.id}" onclick="quickSelect('${e.id}')">${e.name} · ${e.batch}</span>`
    ).join('');
  }

  /* auto-load from URL param */
  const urlExam = new URLSearchParams(window.location.search).get('exam');
  if (urlExam) { sel.value = urlExam; loadMeritList(); }
}

/* ── Quick chip select ── */
function quickSelect(id) {
  $('mlExamSelect').value = id;
  document.querySelectorAll('.ml-exam-chip').forEach(c => c.classList.toggle('active', c.dataset.id===id));
  loadMeritList();
}

/* ── Main: Load Merit List ── */
async function loadMeritList() {
  const examId = $('mlExamSelect').value;
  if (!examId) {
    $('mlContent').style.display    = 'none';
    $('mlActionBar').style.display  = 'none';
    $('mlEmpty').style.display      = 'none';
    return;
  }

  const exam = ((window.EXAM_DEMO||{}).exams||[]).find(e => e.id===examId);
  if (!exam) return;

  /* Fix 2: সবসময় backend থেকে fresh data আনো — local cache depend করো না */
  let results = [];
  try {
    const res = await fetch(`${API_BASE_ML}/ucc/results/merit-list/${examId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.meritList) {
        results = data.meritList.map(r => ({
          examId,
          roll:          r.studentRoll,
          name:          r.studentName,
          obtained:      r.totalObtained || 0,
          correct:       r.correctAnswer != null ? r.correctAnswer : null,
          wrong:         r.wrongAnswer   != null ? r.wrongAnswer   : null,
          subjectMarks:  r.subjectMarks || [],
          studentPhone:  (r.studentId && r.studentId.phone) ? r.studentId.phone : '',
          guardianPhone: (r.studentId && r.studentId.guardianPhone) ? r.studentId.guardianPhone : '',
          isAbsent:      r.status === 'Absent',
          percentage:    r.percentage || 0,
          /* Fix 3: backend এর meritPosition ব্যবহার করো, frontend recalculate নয় */
          position:      r.meritPosition || null,
          grade:         window.getGrade ? window.getGrade(r.percentage || 0) : 'F'
        }));
      }
    }
  } catch (e) { /* ignore */ }

  if (!results.length) {
    $('mlContent').style.display    = 'none';
    $('mlActionBar').style.display  = 'none';
    $('mlEmpty').style.display      = '';
    return;
  }

  /* sort: present first by position, absent last */
  const sorted = [...results].sort((a, b) => {
    if (a.isAbsent && !b.isAbsent) return 1;
    if (!a.isAbsent && b.isAbsent) return -1;
    return (a.position || 999) - (b.position || 999);
  });

  renderExamInfo(exam);
  renderSummary(results, exam);
  renderTable(sorted, exam);
  renderFooter(exam);

  $('mlExamLabel').textContent    = `${exam.name} — ${exam.batch}`;
  $('mlContent').style.display    = '';
  $('mlActionBar').style.display  = '';
  $('mlEmpty').style.display      = 'none';

  /* sync chip active state */
  document.querySelectorAll('.ml-exam-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.id === examId)
  );
}

/* ── Exam Info Card ── */
function renderExamInfo(e) {
  const subCount = (e.subjects && e.subjects.length) ? e.subjects.length : 1;
  const subNames = (e.subjects && e.subjects.length)
    ? e.subjects.map(s => `${s.subjectName} (${s.fullMarks})`).join(' + ')
    : (e.subject || '—');

  $('mlExamInfo').innerHTML = `
    <div>
      <h2>${e.name}</h2>
      <p>${e.batch} · Subjects: ${subNames} · ${e.date}</p>
    </div>
    <div class="ml-info-chips">
      <span class="ml-info-chip"><i class="fas fa-tag"></i> ${e.type}</span>
      <span class="ml-info-chip"><i class="fas fa-layer-group"></i> ${subCount} Subjects</span>
      <span class="ml-info-chip"><i class="fas fa-star"></i> Total: ${e.total}</span>
      ${e.pass ? `<span class="ml-info-chip"><i class="fas fa-check"></i> Pass: ${e.pass}</span>` : ''}
      ${e.duration ? `<span class="ml-info-chip"><i class="fas fa-clock"></i> ${e.duration} min</span>` : ''}
      <span class="ml-info-chip ex-badge ${e.status==='Published'?'ex-badge-published':'ex-badge-draft'}">${e.status}</span>
    </div>`;
}

/* ── Summary Cards ── */
function renderSummary(results, exam) {
  const active  = results.filter(r => !r.isAbsent);
  const absent  = results.filter(r =>  r.isAbsent).length;
  const avg     = active.length ? (active.reduce((s,r)=>s+r.obtained,0)/active.length).toFixed(1) : '—';
  const highest = active.length ? Math.max(...active.map(r=>r.obtained)) : '—';
  const lowest  = active.length ? Math.min(...active.map(r=>r.obtained)) : '—';
  const passed  = exam.pass ? active.filter(r=>r.obtained>=exam.pass).length : '—';
  const rate    = active.length ? Math.round(active.reduce((s,r)=>s+r.obtained,0)/(active.length*exam.total)*100) : 0;

  $('mlSummaryGrid').innerHTML = `
    <div class="ml-sum-card"><small>Total Appeared</small><strong>${active.length}</strong></div>
    <div class="ml-sum-card ml-sum-avg"><small>Class Average</small><strong>${avg}%</strong></div>
    <div class="ml-sum-card ml-sum-high"><small>Highest</small><strong>${highest}</strong></div>
    <div class="ml-sum-card ml-sum-low"><small>Lowest</small><strong>${lowest}</strong></div>
    <div class="ml-sum-card ml-sum-pass"><small>${exam.pass?'Passed':'—'}</small><strong style="color:#059669;">${passed}</strong></div>
    <div class="ml-sum-card"><small>Collection Rate</small><strong style="color:#4f46e5;">${rate}%</strong></div>
    <div class="ml-sum-card ml-sum-absent"><small>Absent</small><strong style="color:#f59e0b;">${absent}</strong></div>
    <div class="ml-sum-card"><small>A+ Students</small><strong style="color:#065f46;">${active.filter(r=>r.grade==='A+').length}</strong></div>
    <div class="ml-sum-card"><small>Failed</small><strong style="color:#dc2626;">${exam.pass?active.filter(r=>r.obtained<exam.pass).length:'—'}</strong></div>
    <div class="ml-sum-card"><small>Pass Rate</small><strong>${exam.pass&&active.length?Math.round(active.filter(r=>r.obtained>=exam.pass).length/active.length*100)+'%':'—'}</strong></div>`;
}

/* ── Merit Table ── */
function mlPctClass(pct) {
  if (pct >= 80) return 'excellent';
  if (pct >= 60) return 'good';
  if (pct >= 40) return 'average';
  return 'poor';
}

function renderTable(sorted, exam) {
  const active = sorted.filter(r => !r.isAbsent);
  const highest = active.length ? Math.max(...active.map(r => r.obtained)) : 0;
  const subjects = exam.subjects || [];
  const hasMultiSubs = subjects.length > 1;

  // Render Table Header
  const thead = $('mlTableHead');
  if (thead) {
    let headerHtml = `
      <tr>
        <th class="ml-th-pos">Rank</th>
        <th>Student</th>`;

    if (hasMultiSubs) {
      subjects.forEach(s => {
        headerHtml += `<th class="tc" style="background:#f5f3ff;color:#6d28d9;font-size:11px;">${s.subjectName} <small>(${s.fullMarks})</small></th>`;
      });
    }

    headerHtml += `
        <th class="ml-th-marks">Total Marks</th>
        <th class="ml-th-correct">Correct</th>
        <th class="ml-th-wrong">Wrong</th>
        <th class="ml-th-pct">Percentage</th>
        <th class="ml-th-grade">Grade</th>
        <th class="ml-th-status">Status</th>
      </tr>`;
    thead.innerHTML = headerHtml;
  }

  $('mlTableBody').innerHTML = sorted.map((r, i) => {
    const rowCls = r.isAbsent ? 'ml-row-absent' : r.position===1?'ml-row-top1':r.position===2?'ml-row-top2':r.position===3?'ml-row-top3':'';
    const pct = r.isAbsent ? 0 : (r.percentage || 0);
    const pctBarCls = mlPctClass(pct);
    const marksCls = !r.isAbsent && r.obtained === highest && highest > 0 ? 'ml-marks-val top-mark' : 'ml-marks-val';

    const rankCls = r.isAbsent ? 'ml-rank-abs' : r.position===1?'ml-rank-1':r.position===2?'ml-rank-2':r.position===3?'ml-rank-3':'ml-rank-n';
    const rankLabel = r.isAbsent ? 'ABS' : r.position;

    const statusHtml = r.isAbsent
      ? '<span class="ml-status ml-status-abs"><i class="fas fa-minus-circle"></i> Absent</span>'
      : exam.pass
        ? (r.obtained >= exam.pass
            ? '<span class="ml-status ml-status-pass"><i class="fas fa-check-circle"></i> Pass</span>'
            : '<span class="ml-status ml-status-fail"><i class="fas fa-times-circle"></i> Fail</span>')
        : '—';

    const correctVal = r.isAbsent ? '—' : (r.correct != null && r.correct !== '' ? r.correct : '—');
    const wrongVal   = r.isAbsent ? '—' : (r.wrong   != null && r.wrong   !== '' ? r.wrong   : '—');

    let subMarksCells = '';
    if (hasMultiSubs) {
      subjects.forEach((sub, sIdx) => {
        if (r.isAbsent) {
          subMarksCells += `<td class="tc" style="color:#94a3b8;font-size:12px;">ABS</td>`;
        } else {
          const sm = (r.subjectMarks && r.subjectMarks.length)
            ? r.subjectMarks.find(item => item.subjectName === sub.subjectName || (sIdx === 0 && !item.subjectName))
            : null;
          const score = (sm && sm.marksObtained != null) ? sm.marksObtained : '—';
          subMarksCells += `<td class="tc" style="font-weight:700;color:#1e1b4b;">${score}</td>`;
        }
      });
    }

    return `<tr class="${rowCls}">
      <td class="tc"><span class="ml-rank ${rankCls}">${rankLabel}</span></td>
      <td>
        <div class="ml-student-cell">
          <span class="ml-student-name">${r.name}</span>
          <span class="ml-student-roll">Roll ${r.roll}</span>
        </div>
      </td>
      ${subMarksCells}
      <td class="tc">
        <span class="${marksCls}">${r.isAbsent ? '—' : r.obtained}</span>
        <span class="ml-marks-total"> / ${exam.total}</span>
      </td>
      <td class="tc" style="font-weight:700;color:#059669;">${correctVal}</td>
      <td class="tc" style="font-weight:700;color:#ef4444;">${wrongVal}</td>
      <td class="tc">
        <div class="ml-pct-cell">
          <span class="ml-pct-text">${r.isAbsent ? '—' : pct+'%'}</span>
          <div class="ml-pct-bar"><div class="ml-pct-fill ${pctBarCls}" style="width:${pct}%;"></div></div>
        </div>
      </td>
      <td class="tc"><span class="ml-grade ${mlGradeClass(r.grade)}">${r.grade}</span></td>
      <td class="tc">${statusHtml}</td>
    </tr>`;
  }).join('');

  /* tfoot */
  const avg = active.length ? (active.reduce((s,r)=>s+r.obtained,0)/active.length).toFixed(1) : '—';
  const avgPct = active.length && exam.total ? Math.round(Number(avg)/exam.total*100) : 0;
  const subColsSpan = hasMultiSubs ? subjects.length : 0;

  $('mlTableFoot').innerHTML = `
    <tr>
      <td colspan="${2 + subColsSpan}" style="text-align:right;color:#374151;font-size:12px;">
        <i class="fas fa-chart-line" style="color:#4f46e5;margin-right:4px;"></i> Class Average
      </td>
      <td class="tc" style="color:#4f46e5;font-size:15px;font-weight:800;">${avg}</td>
      <td></td>
      <td></td>
      <td class="tc">
        <div class="ml-pct-cell">
          <span class="ml-pct-text" style="color:#4f46e5;">${avgPct}%</span>
          <div class="ml-pct-bar"><div class="ml-pct-fill good" style="width:${avgPct}%;"></div></div>
        </div>
      </td>
      <td></td>
      <td></td>
    </tr>`;
}

/* ── Print Footer ── */
function renderFooter(exam) {
  const now = new Date().toLocaleString('en-GB');
  $('mlGeneratedLine').textContent =
    `Generated: ${now} · UCC পাবনা শাখা · ${exam.name} — ${exam.batch}`;
}

/* ── Export CSV ── */
async function exportMeritCSV() {
  const examId = $('mlExamSelect').value;
  if (!examId) return;
  const exam = ((window.EXAM_DEMO||{}).exams||[]).find(e => e.id===examId);
  if (!exam) return;
  let results = [];

  try {
    const res = await fetch(`${API_BASE_ML}/ucc/results/merit-list/${examId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.meritList) {
        results = data.meritList.map(r => ({
          roll:          r.studentRoll,
          name:          r.studentName,
          studentPhone:  (r.studentId && r.studentId.phone) ? r.studentId.phone : '',
          guardianPhone: (r.studentId && r.studentId.guardianPhone) ? r.studentId.guardianPhone : '',
          obtained:      r.totalObtained || 0,
          correct:       r.correctAnswer != null ? r.correctAnswer : '',
          wrong:         r.wrongAnswer   != null ? r.wrongAnswer   : '',
          subjectMarks:  r.subjectMarks || [],
          isAbsent:      r.status === 'Absent',
          percentage:    r.percentage || 0,
          position:      r.meritPosition || null,
          grade:         window.getGrade ? window.getGrade(r.percentage || 0) : 'F',
          status:        r.status || (r.status === 'Absent' ? 'Absent' : 'Pass')
        }));
      }
    }
  } catch (e) { /* ignore */ }

  if (!results.length) return;

  const sorted = [...results].sort((a, b) => {
    if (a.isAbsent && !b.isAbsent) return 1;
    if (!a.isAbsent && b.isAbsent) return -1;
    return (a.position || 999) - (b.position || 999);
  });

  const hasMultiSubjects = exam.subjects && exam.subjects.length > 1;
  const subHeaders = hasMultiSubjects ? exam.subjects.map(s => `${s.subjectName} (${s.fullMarks})`) : [];

  const header = [
    'Roll',
    'Name',
    'Student Phone',
    'Guardian Phone',
    ...subHeaders,
    'Total Marks',
    'Correct',
    'Wrong',
    'Rank',
    'Percentage',
    'Grade',
    'Status'
  ];

  const rows = sorted.map(r => {
    const subMarks = hasMultiSubjects
      ? exam.subjects.map((sub, sIdx) => {
          if (r.isAbsent) return 'ABS';
          const sm = (r.subjectMarks && r.subjectMarks.length)
            ? r.subjectMarks.find(item => item.subjectName === sub.subjectName || (sIdx === 0 && !item.subjectName))
            : null;
          return sm && sm.marksObtained != null ? sm.marksObtained : '—';
        })
      : [];

    return [
      r.roll,
      r.name,
      r.studentPhone,
      r.guardianPhone,
      ...subMarks,
      r.isAbsent ? 'ABS' : r.obtained,
      r.isAbsent ? '—' : (r.correct !== '' ? r.correct : '—'),
      r.isAbsent ? '—' : (r.wrong   !== '' ? r.wrong   : '—'),
      r.isAbsent ? '—' : (r.position || '—'),
      r.isAbsent ? '0%' : r.percentage + '%',
      r.grade,
      r.status
    ];
  });

  const csv = [header, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `MeritList_${exam.name.replace(/\s+/g,'_')}_${exam.batch.replace(/\s+/g,'_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);

  const t = $('exToast');
  if (t) { t.textContent = 'CSV downloaded!'; t.className = 'ex-toast'; setTimeout(() => t.className = 'ex-toast hidden', 3000); }
}

/* ── WhatsApp Share ── */
async function shareWhatsApp() {
  const examId = $('mlExamSelect').value;
  if (!examId) return;
  const exam    = ((window.EXAM_DEMO||{}).exams||[]).find(e=>e.id===examId);
  let results = ((window.EXAM_DEMO||{}).results||[]).filter(r=>r.examId===examId&&!r.isAbsent);

  if (!results.length) {
    try {
      const res = await fetch(`${API_BASE_ML}/ucc/results/merit-list/${examId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.meritList) {
          results = data.meritList.filter(r => r.status !== 'Absent').map(r => ({
            roll: r.studentRoll,
            name: r.studentName,
            obtained: r.totalObtained || 0,
            percentage: r.percentage || 0,
            position: r.meritPosition || null,
            grade: window.getGrade ? window.getGrade(r.percentage || 0) : 'F'
          }));
        }
      }
    } catch (e) { /* ignore */ }
  }

  window.calcPositions(results, exam.total);

  const top3 = [...results].sort((a,b)=>(a.position||999)-(b.position||999)).slice(0,3);
  const avg  = results.length?(results.reduce((s,r)=>s+r.obtained,0)/results.length).toFixed(1):0;

  const msg = `🏆 *${exam.name} — Merit List*\n` +
    `📚 Batch: ${exam.batch}\n📅 Date: ${exam.date}\n\n` +
    top3.map(r=>`${r.position}. ${r.name} (Roll ${r.roll}) — ${r.obtained}/${exam.total} (${r.percentage}%) — ${r.grade}`).join('\n') +
    `\n\n📊 Class Average: ${avg}%\n👥 Appeared: ${results.length}\n` +
    `— UCC পাবনা শাখা`;

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── Sidebar ── */
async function initMeritList() {
  const user = JSON.parse(sessionStorage.getItem('uccAdminUser')||'{}');
  if (user.username) $('uccAdminName').textContent = user.username;
  document.getElementById('logoutBtn')?.addEventListener('click', ()=>{
    sessionStorage.removeItem('uccAdminToken');
    window.location.href='admin-login.html';
  });

  /* Wait for exams data to load from backend before rendering */
  if (!window.EXAM_DEMO || !window.EXAM_DEMO.exams || !window.EXAM_DEMO.exams.length) {
    await loadExamsFromApi();
  }
  populateExamDropdown();
}

document.addEventListener('DOMContentLoaded', initMeritList);