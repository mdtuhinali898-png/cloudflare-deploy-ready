/* ==========================================================================
   UCC পাবনা — Mark Entry JS (Backend Connected)
   ========================================================================== */

/* $ is provided by exams.js (loaded before this file) */
const API_BASE_ME = 'http://localhost:5002/api';

let currentExam = null;
let entryData   = [];   /* [{ roll, name, obtained, isAbsent, remarks }] */

/* ── Helpers ── */
function exToast(msg, type='success') {
  const t = $('exToast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'ex-toast' + (type==='error' ? ' error' : '');
  clearTimeout(window._meToast);
  window._meToast = setTimeout(() => t.className = 'ex-toast hidden', 3200);
}
function gradeClass(g) {
  const map = { 'A+':'me-grade-aplus','A':'me-grade-a','B':'me-grade-b','C':'me-grade-c','D':'me-grade-d','F':'me-grade-f','ABS':'me-grade-abs' };
  return map[g] || 'me-grade-abs';
}
function posClass(p) {
  if (!p) return 'me-pos me-pos-abs';
  if (p===1) return 'me-pos me-pos-1';
  if (p===2) return 'me-pos me-pos-2';
  if (p===3) return 'me-pos me-pos-3';
  return 'me-pos';
}

/* ── Load students from backend by batch name ── */
async function loadStudentsByBatch(batchName) {
  try {
    const res = await fetch(`${API_BASE_ME}/ucc/students?batch=${encodeURIComponent(batchName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.students) {
        return data.students
          .map(s => ({
            roll: s.roll,
            name: s.name,
            _id: s._id
          }))
          .sort((a, b) => {
            const na = parseInt(String(a.roll).replace(/[^0-9]/g, ''), 10) || 0;
            const nb = parseInt(String(b.roll).replace(/[^0-9]/g, ''), 10) || 0;
            return na - nb;
          });
      }
    }
  } catch (e) { /* ignore */ }
  return [];
}

/* ── Step 1: Render Exam Cards ── */
async function renderExamCards() {
  const grid    = $('examSelectGrid');
  const exams   = (window.EXAM_DEMO || {}).exams || [];
  const urlExam = new URLSearchParams(window.location.search).get('exam');

  if (!exams.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#64748b;">
      <i class="fas fa-clipboard-list" style="font-size:40px;opacity:.3;display:block;margin-bottom:12px;"></i>
      কোনো exam নেই। <a href="exams.html" style="color:#4f46e5;font-weight:700;">Exam তৈরি করুন।</a>
    </div>`;
    return;
  }

  grid.innerHTML = exams.map(e => {
    const cnt = ((window.EXAM_DEMO||{}).results||[]).filter(r => r.examId===e.id && !r.isAbsent).length;
    return `
      <div class="me-exam-card ${urlExam===e.id?'selected':''}" onclick="selectExam('${e.id}')">
        <span class="me-exam-card-badge ${e.status==='Draft'?'draft':''}">${e.status}</span>
        <div class="me-exam-card-name">${e.name}</div>
        <div class="me-exam-card-meta">
          <i class="fas fa-layer-group" style="color:#4f46e5;"></i> ${e.batch}<br>
          <i class="fas fa-tag" style="color:#7c3aed;"></i> ${e.type} · ${e.subject||'—'}<br>
          <i class="fas fa-calendar" style="color:#059669;"></i> ${e.date}<br>
          <i class="fas fa-users" style="color:#f59e0b;"></i> ${cnt} entries recorded
        </div>
        <div class="me-exam-card-total">Total: ${e.total} marks</div>
      </div>`;
  }).join('');

  /* auto-select from URL param */
  if (urlExam && exams.find(e => e.id===urlExam)) {
    selectExam(urlExam);
  }
}

/* ── Select Exam → go to Step 2 ── */
async function selectExam(examId) {
  const exams = (window.EXAM_DEMO||{}).exams||[];
  currentExam = exams.find(e => e.id===examId);
  if (!currentExam) return;

  /* highlight card */
  document.querySelectorAll('.me-exam-card').forEach(c => c.classList.remove('selected'));
  const cards = document.querySelectorAll('.me-exam-card');
  cards.forEach(c => { if (c.onclick.toString().includes(examId)) c.classList.add('selected'); });

  /* build entry data from existing results or fresh */
  const students = await loadStudentsByBatch(currentExam.batch);
  const existing = ((window.EXAM_DEMO||{}).results||[]).filter(r => r.examId===examId);

  entryData = students.map(s => {
    const ex = existing.find(r => r.roll===s.roll);
    return {
      roll: s.roll, name: s.name,
      studentId: s._id,
      obtained:  ex ? ex.obtained  : '',
      correct:   (ex && ex.correct !== undefined && ex.correct !== null) ? ex.correct : '',
      wrong:     (ex && ex.wrong !== undefined && ex.wrong !== null) ? ex.wrong : '',
      negRate:   (ex && ex.negRate !== undefined && ex.negRate !== null) ? ex.negRate : 0.25,
      isAbsent:  ex ? ex.isAbsent  : false,
      remarks:   ex ? (ex.remarks||'') : ''
    };
  });

  restoreNegConfig();
  renderExamBanner();
  renderEntryTable();
  renderEntryStats();

  $('stepSelectCard').style.display = 'none';
  $('stepResultCard').style.display  = 'none';
  $('stepEntryCard').style.display  = '';
  setTimeout(() => $('stepEntryCard').scrollIntoView({behavior:'smooth',block:'start'}), 50);
}

/* ── Exam Banner ── */
function renderExamBanner() {
  const e = currentExam;
  $('meExamBanner').innerHTML = `
    <div>
      <div class="me-exam-banner-title">${e.name}</div>
      <div class="me-exam-banner-meta">${e.batch} · ${e.subject||'—'} · ${e.date}</div>
    </div>
    <div class="me-exam-banner-chips">
      <span class="me-banner-chip"><i class="fas fa-tag"></i> ${e.type}</span>
      <span class="me-banner-chip"><i class="fas fa-star"></i> Total: ${e.total} marks</span>
      ${e.pass?`<span class="me-banner-chip"><i class="fas fa-check"></i> Pass: ${e.pass}</span>`:''}
      ${e.duration?`<span class="me-banner-chip"><i class="fas fa-clock"></i> ${e.duration} min</span>`:''}
    </div>`;
}

/* ── Entry Stats ── */
function renderEntryStats() {
  const filled  = entryData.filter(r => r.obtained!=='' && !r.isAbsent).length;
  const absent  = entryData.filter(r => r.isAbsent).length;
  const total   = entryData.length;
  const pending = total - filled - absent;

  $('meEntryStats').innerHTML = `
    <div class="me-stat-pill"><i class="fas fa-users" style="color:#4f46e5;"></i> Total: <b>${total}</b></div>
    <div class="me-stat-pill"><i class="fas fa-pen" style="color:#059669;"></i> Entered: <b style="color:#059669;">${filled}</b></div>
    <div class="me-stat-pill"><i class="fas fa-hourglass" style="color:#f59e0b;"></i> Pending: <b style="color:#f59e0b;">${pending}</b></div>
    <div class="me-stat-pill"><i class="fas fa-user-slash" style="color:#ef4444;"></i> Absent: <b style="color:#ef4444;">${absent}</b></div>`;

  $('meEnteredCount').textContent = `${filled} / ${total} entries complete`;
}

/* ── Entry Table ── */
function renderEntryTable() {
  const negDisabled = negMarkingActive ? '' : 'disabled';
  const tbody = $('meTableBody');
  tbody.innerHTML = entryData.map((r, i) => {
    const over   = r.obtained!=='' && !r.isAbsent && Number(r.obtained) > currentExam.total;
    const filled = r.obtained!=='' && !r.isAbsent && !over;
    const inpClass = over ? 'me-mark-input over' : filled ? 'me-mark-input filled' : 'me-mark-input';
    return `<tr id="meRow-${i}" class="${r.isAbsent?'me-row-absent':''}">
      <td style="font-weight:700;color:#94a3b8;">${i+1}</td>
      <td style="font-weight:800;color:#4f46e5;">${r.roll}</td>
      <td style="font-weight:600;">${r.name}</td>
      <td>
        <input type="number"
          id="mark-${i}" class="${inpClass}"
          value="${r.isAbsent?'':r.obtained}"
          min="0" max="${currentExam.total}"
          placeholder="0 – ${currentExam.total}"
          ${r.isAbsent?'disabled':''}
          oninput="onMarkInput(${i},this)"
          onkeydown="handleKey(event,${i},'mark')"
        >
      </td>
      <td>
        <input type="number" id="cor-${i}" class="me-neg-input"
          value="${r.isAbsent?'':((r.correct!==undefined&&r.correct!==null&&r.correct!=='')?r.correct:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          oninput="onNegInput(${i},'correct',this)"
          onkeydown="handleKey(event,${i},'cor')">
      </td>
      <td>
        <input type="number" id="wrg-${i}" class="me-neg-input"
          value="${r.isAbsent?'':((r.wrong!==undefined&&r.wrong!==null&&r.wrong!=='')?r.wrong:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          oninput="onNegInput(${i},'wrong',this)"
          onkeydown="handleKey(event,${i},'wrg')">
      </td>
      <td>
        <span id="neg-calc-${i}" style="font-weight:800;font-size:13px;">—</span>
      </td>
      <td>
        <label class="me-absent-wrap">
          <input type="checkbox" id="abs-${i}" ${r.isAbsent?'checked':''}
            onchange="onAbsentChange(${i},this)">
          <span class="me-absent-label">Absent</span>
        </label>
      </td>
      <td>
        <input type="text" id="rem-${i}" class="me-remarks-input"
          value="${r.remarks||''}" placeholder="Optional..."
          onkeydown="handleKey(event,${i},'rem')"
          oninput="entryData[${i}].remarks=this.value">
      </td>
    </tr>`;
  }).join('');
}

/* ── Input handler ── */
function onMarkInput(i, el) {
  const val = el.value === '' ? '' : parseFloat(el.value);
  entryData[i].obtained = val;
  if (val !== '' && val > currentExam.total) {
    el.className = 'me-mark-input over';
  } else if (val !== '') {
    el.className = 'me-mark-input filled';
  } else {
    el.className = 'me-mark-input';
  }
  renderEntryStats();
}

/* ════ Negative Marking System ════ */
let negMarkingActive = false;
let negGlobalRate = 0.25;
let negMode = 'global';

function toggleNegPanel() {
  const panel = $('meNegPanel');
  if (!panel) return;
  panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? '' : 'none';
}
function onNegEnabledChange(el) {
  negMarkingActive = el.checked;
  const body = $('meNegBody');
  const lbl  = $('meNegToggleLabel');
  if (body) body.style.display = el.checked ? '' : 'none';
  if (lbl)  lbl.textContent   = el.checked ? 'Enabled' : 'Disabled';
  if (currentExam) currentExam._neg_used = el.checked === true;
  if (el.checked && $('meNegPerWrong')) {
    negGlobalRate = Number($('meNegPerWrong').value);
    if (currentExam) currentExam._neg_rate = negGlobalRate;
    entryData.forEach(r => { r.negRate = negGlobalRate; });
  }
  renderEntryTable();
  renderEntryStats();
}
function onNegRateChange(el) {
  negGlobalRate = Number(el.value);
  if (currentExam) currentExam._neg_rate = negGlobalRate;
  entryData.forEach(r => { r.negRate = negGlobalRate; });
  recalcAllNeg();
}
function restoreNegConfig() {
  if (!currentExam) return;
  const bool = currentExam._neg_used === true;
  const rate = currentExam._neg_rate ? Number(currentExam._neg_rate) : 0.25;
  const panel = $('meNegPanel');
  const enEl  = $('meNegEnabled');
  const body  = $('meNegBody');
  const rateSel = $('meNegPerWrong');
  const lbl  = $('meNegToggleLabel');
  if (panel && enEl) {
    negMarkingActive = enEl.checked = bool;
    if (bool) {
      panel.style.display = '';
      if (body) body.style.display = '';
      if (lbl)  lbl.textContent   = 'Enabled';
      if (rateSel) {
        rateSel.value = String(rate);
        negGlobalRate = rate;
        entryData.forEach(r => { r.negRate = rate; });
      }
    } else {
      panel.style.display = '';
      if (body) body.style.display = 'none';
      if (lbl)  lbl.textContent   = 'Disabled';
    }
  }
}
function onNegInput(i, field, el) {
  const val = el.value === '' ? '' : parseFloat(el.value);
  entryData[i][field] = val;
  el.classList.toggle('filled', val !== '');
  recalcOne(i);
}
function recalcOne(i) {
  const r = entryData[i];
  if (!r || r.isAbsent) return;
  const rate = (r.negRate !== undefined && r.negRate !== null) ? Number(r.negRate) : negGlobalRate;
  const cor  = (r.correct === '' || r.correct === null || r.correct === undefined) ? 0 : Number(r.correct);
  const wrg  = (r.wrong   === '' || r.wrong   === null || r.wrong   === undefined) ? 0 : Number(r.wrong);
  let obtained = cor - (wrg * rate);
  if (obtained < 0) obtained = 0;
  obtained = Math.round(obtained * 100) / 100;
  r.obtained = obtained;
  const calcEl = $('neg-calc-' + i);
  if (calcEl) calcEl.textContent = String(obtained);
  const markEl = $('mark-' + i);
  if (markEl) {
    markEl.value = String(obtained);
    markEl.classList.add('filled');
  }
  renderEntryStats();
}
function recalcAllNeg() {
  entryData.forEach((_, i) => { if (!entryData[i].isAbsent) recalcOne(i); });
}

/* ── Absent toggle ── */
function onAbsentChange(i, el) {
  entryData[i].isAbsent = el.checked;
  const markEl = $(`mark-${i}`);
  const corEl  = $(`cor-${i}`);
  const wrgEl  = $(`wrg-${i}`);
  const row    = $(`meRow-${i}`);
  if (el.checked) {
    entryData[i].obtained = 0;
    entryData[i].correct  = '';
    entryData[i].wrong    = '';
    markEl.value = ''; markEl.disabled = true; markEl.className = 'me-mark-input';
    if (corEl) { corEl.value = ''; corEl.disabled = true; }
    if (wrgEl) { wrgEl.value = ''; wrgEl.disabled = true; }
    row.classList.add('me-row-absent');
  } else {
    markEl.disabled = false;
    markEl.value    = '';
    entryData[i].obtained = '';
    if (corEl) corEl.disabled = !negMarkingActive;
    if (wrgEl) wrgEl.disabled = !negMarkingActive;
    row.classList.remove('me-row-absent');
  }
  renderEntryStats();
}

/* ══════════════════════════════════════════════════════════════
   Excel-style 2D Keyboard Navigation
   Grid columns:  0=mark  1=cor  2=wrg  3=rem
   Keys handled:
     ArrowRight / Tab          → next col  (wraps to next row col-0)
     ArrowLeft  / Shift+Tab    → prev col  (wraps to prev row col-3)
     ArrowDown  / Enter        → same col, next row
     ArrowUp                   → same col, prev row
   Disabled / absent cells are skipped automatically.
══════════════════════════════════════════════════════════════ */

const ME_COLS   = ['mark', 'cor', 'wrg', 'rem'];   // column order
const ME_COL_IDX = { mark: 0, cor: 1, wrg: 2, rem: 3 };

/* Return the input element for (row, col). col is 0-3 index. */
function meCell(row, col) {
  const prefix = ME_COLS[col];
  if (prefix === undefined) return null;
  return $(`${prefix}-${row}`);
}

/* Focus the cell at (row, col), skipping disabled cells.
   dir: +1 = forward, -1 = backward (for skip direction). */
function meFocus(row, col, dir) {
  const totalRows = entryData.length;
  let r = row, c = col;

  for (let attempts = 0; attempts < totalRows * ME_COLS.length; attempts++) {
    // Clamp column within bounds
    if (c < 0) { c = ME_COLS.length - 1; r -= 1; }
    if (c >= ME_COLS.length) { c = 0; r += 1; }
    // Out of table bounds — stop
    if (r < 0 || r >= totalRows) return;

    const el = meCell(r, c);
    if (el && !el.disabled) {
      el.focus();
      return;
    }
    // Cell is disabled/absent — keep moving in same direction
    if (dir >= 0) { c += 1; } else { c -= 1; }
  }
}

function handleKey(e, row, field) {
  const col = ME_COL_IDX[field] ?? 0;

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      meFocus(row, col + 1, +1);
      break;

    case 'ArrowLeft':
      e.preventDefault();
      meFocus(row, col - 1, -1);
      break;

    case 'Tab':
      e.preventDefault();
      if (e.shiftKey) {
        meFocus(row, col - 1, -1);
      } else {
        meFocus(row, col + 1, +1);
      }
      break;

    case 'ArrowDown':
    case 'Enter':
      e.preventDefault();
      meFocus(row + 1, col, +1);
      break;

    case 'ArrowUp':
      e.preventDefault();
      meFocus(row - 1, col, -1);
      break;

    default:
      break;
  }
}

/* ── Bulk actions ── */
function markAllAbsent() {
  entryData.forEach((r, i) => {
    r.isAbsent = true; r.obtained = 0;
    const cb = $(`abs-${i}`);
    const mk = $(`mark-${i}`);
    if (cb) cb.checked = true;
    if (mk) { mk.disabled = true; mk.value = ''; mk.className = 'me-mark-input'; }
    $(`meRow-${i}`)?.classList.add('me-row-absent');
  });
  renderEntryStats();
  exToast('সবাইকে Absent করা হয়েছে।');
}

function clearAllMarks() {
  entryData.forEach((r, i) => {
    r.obtained = ''; r.isAbsent = false; r.remarks = '';
    const cb = $(`abs-${i}`);
    const mk = $(`mark-${i}`);
    const rm = $(`rem-${i}`);
    if (cb) cb.checked = false;
    if (mk) { mk.disabled = false; mk.value = ''; mk.className = 'me-mark-input'; }
    if (rm) rm.value = '';
    $(`meRow-${i}`)?.classList.remove('me-row-absent');
  });
  renderEntryStats();
  exToast('সব marks clear হয়েছে।');
}

/* ── Validate ── */
function validateEntries() {
  for (let i = 0; i < entryData.length; i++) {
    const r = entryData[i];
    if (!r.isAbsent) {
      if (r.obtained === '' || r.obtained === null) {
        exToast(`Roll ${r.roll} (${r.name})-এর marks দিন অথবা Absent mark করুন।`, 'error');
        $(`mark-${i}`)?.focus();
        return false;
      }
      if (Number(r.obtained) > currentExam.total) {
        exToast(`Roll ${r.roll}: marks (${r.obtained}) total marks (${currentExam.total})-এর বেশি হতে পারে না।`, 'error');
        $(`mark-${i}`)?.focus();
        return false;
      }
    }
  }
  return true;
}

/* ── Submit & Calculate (Posts to backend) ── */
async function submitMarks() {
  if (!validateEntries()) return;

  const results = window.EXAM_DEMO.results;
  /* remove old entries for this exam */
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].examId === currentExam.id) results.splice(i, 1);
  }
  /* add new entries */
  entryData.forEach(r => {
    results.push({
      examId:   currentExam.id,
      roll:     r.roll,
      name:     r.name,
      obtained: r.isAbsent ? 0 : Number(r.obtained),
      isAbsent: r.isAbsent,
      remarks:  r.remarks || '',
      correct:  r.correct !== undefined ? Number(r.correct) : null,
      wrong:    r.wrong !== undefined ? Number(r.wrong) : null,
      negRate:  r.negRate !== undefined ? Number(r.negRate) : 0.25
    });
  });

  /* calculate positions */
  const examResults = results.filter(r => r.examId === currentExam.id);
  window.calcPositions(examResults, currentExam.total);

  /* mark exam as Published */
  currentExam.status = 'Published';
  const ex = (window.EXAM_DEMO.exams||[]).find(e => e.id===currentExam.id);
  if (ex) ex.status = 'Published';

  /* Save to backend */
  try {
    const markEntries = entryData.map(r => ({
      studentId: r.studentId,
      subjectMarks: [],
      totalObtained: r.isAbsent ? 0 : Number(r.obtained),
      correct:  (r.correct  !== '' && r.correct  != null) ? Number(r.correct)  : null,
      wrong:    (r.wrong    !== '' && r.wrong    != null) ? Number(r.wrong)    : null,
      negRate:  r.negRate != null ? Number(r.negRate) : 0.25,
      status:   r.isAbsent ? 'Absent' : (Number(r.obtained) >= (currentExam.pass || 0) ? 'Pass' : 'Fail')
    }));

    const res = await fetch(`${API_BASE_ME}/ucc/results/mark-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: currentExam.id, markEntries })
    });
    const data = await res.json();
    if (!data.success) {
      exToast('❌ ' + (data.message || 'Save failed'), 'error');
    }
  } catch (e) {
    exToast('❌ API connection error', 'error');
  }

  renderResultPreview(examResults);
  $('stepEntryCard').style.display = 'none';
  $('stepResultCard').style.display = '';
  $(`meritListLink`).href = `merit-list.html?exam=${currentExam.id}`;
  $('stepResultCard').scrollIntoView({behavior:'smooth',block:'start'});
  exToast('✅ Marks save হয়েছে! Position calculate হয়েছে।');
}

/* ── Result Preview ── */
function renderResultPreview(results) {
  const sorted  = [...results].sort((a,b) => (a.position||999)-(b.position||999));
  const total   = currentExam.total;
  const active  = results.filter(r => !r.isAbsent);
  const absent  = results.filter(r => r.isAbsent).length;
  const avg     = active.length ? (active.reduce((s,r) => s+r.obtained,0)/active.length).toFixed(1) : 0;
  const highest = active.length ? Math.max(...active.map(r=>r.obtained)) : 0;
  const lowest  = active.length ? Math.min(...active.map(r=>r.obtained)) : 0;
  const passed  = active.filter(r => currentExam.pass && r.obtained >= currentExam.pass).length;

  $('meResultSub').textContent = `${currentExam.name} — ${currentExam.batch} · ${results.length} students`;

  $('resultPreviewBody').innerHTML = sorted.map(r => `
    <tr>
      <td>
        <span class="${posClass(r.position)}">${r.position||'—'}</span>
      </td>
      <td style="font-weight:700;color:#4f46e5;">${r.roll}</td>
      <td style="font-weight:600;">${r.name}</td>
      <td style="font-weight:800;text-align:center;">${r.isAbsent?'ABS':r.obtained}</td>
      <td style="text-align:center;color:#64748b;">${total}</td>
      <td style="text-align:center;font-weight:700;">${r.isAbsent?'—':r.percentage+'%'}</td>
      <td><span class="me-grade ${gradeClass(r.grade)}">${r.grade}</span></td>
      <td>
        ${r.isAbsent
          ? '<span style="color:#94a3b8;font-size:12px;">Absent</span>'
          : (currentExam.pass
              ? (r.obtained>=currentExam.pass
                  ? '<span style="color:#059669;font-weight:700;font-size:12px;">✓ Pass</span>'
                  : '<span style="color:#dc2626;font-weight:700;font-size:12px;">✗ Fail</span>')
              : '—')}
      </td>
    </tr>`).join('');

  $('meResultSummary').innerHTML = `
    <div class="me-res-box"><small>Average</small><strong>${avg}%</strong></div>
    <div class="me-res-box"><small>Highest</small><strong>${highest}</strong></div>
    <div class="me-res-box"><small>Lowest</small><strong>${lowest}</strong></div>
    <div class="me-res-box"><small>Passed</small><strong style="color:#059669;">${currentExam.pass?passed:'—'}</strong></div>
    <div class="me-res-box"><small>Absent</small><strong style="color:#ef4444;">${absent}</strong></div>`;
}

/* ── Navigation ── */
function goBackToSelect() {
  $('stepEntryCard').style.display = 'none';
  $('stepSelectCard').style.display = '';
  currentExam = null;
}
function goBackToEntry() {
  $('stepResultCard').style.display = 'none';
  $('stepEntryCard').style.display  = '';
}

/* ── Init ── */
async function initMarkEntry() {
  const user = JSON.parse(sessionStorage.getItem('uccAdminUser')||'{}');
  if (user.username) $('uccAdminName').textContent = user.username;
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('uccAdminToken');
    window.location.href = 'admin-login.html';
  });

  /* Wait for exams data to load from backend before rendering */
  if (!window.EXAM_DEMO || !window.EXAM_DEMO.exams || !window.EXAM_DEMO.exams.length) {
    await loadExamsFromApi();
  }
  renderExamCards();
}

document.addEventListener('DOMContentLoaded', initMarkEntry);