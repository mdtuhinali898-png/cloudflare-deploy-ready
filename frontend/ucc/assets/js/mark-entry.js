/* ==========================================================================
   UCC পাবনা — Mark Entry JS (Dynamic Multi-Subject & Negative Marking)
   ========================================================================== */

/* $ is provided by exams.js (loaded before this file) */
const API_BASE_ME = 'http://localhost:5002/api';

let currentExam = null;
let entryData   = [];   /* [{ roll, name, studentId, isAbsent, remarks, obtained, subjects: [{ subjectName, fullMarks, passMarks, marks, correct, wrong }] }] */

/* ── Negative Marking Configuration ── */
let negMarkingActive = false;
let negGlobalRate = 0.25;

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
    const subCount = (e.subjects && e.subjects.length) ? e.subjects.length : 1;
    const negBadge = e.negativeMarking ? `<span style="font-size:10px;font-weight:700;color:#7c3aed;background:#f5f3ff;padding:2px 6px;border-radius:4px;margin-left:4px;">Neg -${e.negativeMarkPerWrong || 0.25}</span>` : '';
    return `
      <div class="me-exam-card ${urlExam===e.id?'selected':''}" onclick="selectExam('${e.id}')">
        <span class="me-exam-card-badge ${e.status==='Draft'?'draft':''}">${e.status}</span>
        <div class="me-exam-card-name">${e.name} ${negBadge}</div>
        <div class="me-exam-card-meta">
          <i class="fas fa-layer-group" style="color:#4f46e5;"></i> ${e.batch}<br>
          <i class="fas fa-book" style="color:#7c3aed;"></i> ${subCount} Subjects: ${e.subject || 'General'}<br>
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

  // Ensure subjects array exists
  if (!currentExam.subjects || !currentExam.subjects.length) {
    currentExam.subjects = [{
      subjectName: currentExam.subject || currentExam.type || 'General',
      fullMarks: currentExam.total || 100,
      passMarks: currentExam.pass || 40
    }];
  }

  // Set negative marking default from exam settings
  negMarkingActive = currentExam.negativeMarking === true;
  negGlobalRate    = currentExam.negativeMarkPerWrong != null ? Number(currentExam.negativeMarkPerWrong) : 0.25;

  /* highlight card */
  document.querySelectorAll('.me-exam-card').forEach(c => c.classList.remove('selected'));
  const cards = document.querySelectorAll('.me-exam-card');
  cards.forEach(c => { if (c.onclick && c.onclick.toString().includes(examId)) c.classList.add('selected'); });

  /* load students & previous results */
  const [students, existingResults] = await Promise.all([
    loadStudentsByBatch(currentExam.batch),
    loadExamResultsFromBackend(examId)
  ]);

  entryData = students.map(s => {
    const ex = existingResults.find(r => r.studentRoll === s.roll || (r.studentId && r.studentId._id === s._id));
    
    // Map subjects
    const subjects = currentExam.subjects.map((sub, sIdx) => {
      const exSub = (ex && ex.subjectMarks && ex.subjectMarks.length)
        ? ex.subjectMarks.find(sm => sm.subjectName === sub.subjectName || (sIdx === 0 && !sm.subjectName))
        : null;

      let marks   = '';
      let correct = '';
      let wrong   = '';

      if (exSub) {
        marks   = exSub.marksObtained != null ? exSub.marksObtained : '';
        correct = exSub.correct != null ? exSub.correct : '';
        wrong   = exSub.wrong != null ? exSub.wrong : '';
      } else if (ex && currentExam.subjects.length === 1) {
        marks   = ex.totalObtained != null ? ex.totalObtained : '';
        correct = ex.correctAnswer != null ? ex.correctAnswer : '';
        wrong   = ex.wrongAnswer != null ? ex.wrongAnswer : '';
      }

      // If marks exist but correct/wrong are empty, auto-sync
      if (marks !== '' && marks != null && correct === '' && wrong === '') {
        correct = marks;
        wrong = 0;
      }

      return {
        subjectName: sub.subjectName,
        fullMarks: Number(sub.fullMarks) || 25,
        passMarks: Number(sub.passMarks) || 0,
        marks,
        correct,
        wrong
      };
    });

    const isAbsent = ex ? ex.status === 'Absent' : false;
    let totalObtained = '';
    if (ex) {
      totalObtained = ex.totalObtained != null ? ex.totalObtained : '';
    } else {
      const hasMarks = subjects.some(sb => sb.marks !== '');
      if (hasMarks) {
        totalObtained = subjects.reduce((sum, sb) => sum + (Number(sb.marks) || 0), 0);
      }
    }

    return {
      roll: s.roll,
      name: s.name,
      studentId: s._id,
      isAbsent,
      remarks: ex ? (ex.remarks || '') : '',
      subjects,
      obtained: isAbsent ? 0 : totalObtained
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

/* ── Fetch existing results directly from backend ── */
async function loadExamResultsFromBackend(examId) {
  try {
    const res = await fetch(`${API_BASE_ME}/ucc/results/merit-list/${examId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.meritList) {
        return data.meritList;
      }
    }
  } catch (e) { /* ignore */ }
  return [];
}

/* ── Exam Banner ── */
function renderExamBanner() {
  const e = currentExam;
  const subNames = (e.subjects && e.subjects.length)
    ? e.subjects.map(s => `${s.subjectName} (${s.fullMarks})`).join(' + ')
    : (e.subject || '—');

  $('meExamBanner').innerHTML = `
    <div>
      <div class="me-exam-banner-title">${e.name}</div>
      <div class="me-exam-banner-meta">${e.batch} · Subjects: ${subNames} · ${e.date}</div>
    </div>
    <div class="me-exam-banner-chips">
      <span class="me-banner-chip"><i class="fas fa-tag"></i> ${e.type}</span>
      <span class="me-banner-chip"><i class="fas fa-layer-group"></i> ${e.subjects.length} Subjects</span>
      <span class="me-banner-chip"><i class="fas fa-star"></i> Total: ${e.total} marks</span>
      ${e.pass?`<span class="me-banner-chip"><i class="fas fa-check"></i> Pass: ${e.pass}</span>`:''}
      ${negMarkingActive?`<span class="me-banner-chip" style="background:#fae8ff;color:#701a75;border-color:#f0abfc;"><i class="fas fa-balance-scale"></i> Neg -${negGlobalRate}</span>`:''}
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

/* ── Negative Marking Configuration Controls ── */
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
  
  if (el.checked && $('meNegPerWrong')) {
    negGlobalRate = Number($('meNegPerWrong').value);
  }

  // Preserve marks by auto-populating correct if correct is empty
  if (negMarkingActive) {
    entryData.forEach(r => {
      if (!r.isAbsent && r.subjects) {
        r.subjects.forEach(s => {
          if (s.marks !== '' && s.marks != null && (s.correct === '' || s.correct == null)) {
            s.correct = s.marks;
            s.wrong = (s.wrong === '' || s.wrong == null) ? 0 : s.wrong;
          }
        });
      }
    });
  }
  
  // Recalculate and re-render table
  recalcAllScores();
  renderExamBanner();
  renderEntryTable();
  renderEntryStats();
}

function onNegRateChange(el) {
  negGlobalRate = Number(el.value);
  recalcAllScores();
  renderExamBanner();
  renderEntryTable();
  renderEntryStats();
}

function restoreNegConfig() {
  const panel   = $('meNegPanel');
  const enEl    = $('meNegEnabled');
  const body    = $('meNegBody');
  const rateSel = $('meNegPerWrong');
  const lbl     = $('meNegToggleLabel');

  if (panel && enEl) {
    enEl.checked = negMarkingActive;
    panel.style.display = '';
    if (negMarkingActive) {
      if (body) body.style.display = '';
      if (lbl)  lbl.textContent = 'Enabled';
      if (rateSel) rateSel.value = String(negGlobalRate);
    } else {
      if (body) body.style.display = 'none';
      if (lbl)  lbl.textContent = 'Disabled';
    }
  }
}

/* ── Entry Table Header & Body Rendering ── */
function renderEntryTable() {
  const thead = $('meTableHead');
  const tbody = $('meTableBody');
  if (!thead || !tbody || !currentExam) return;

  const subjects = currentExam.subjects || [];

  // 1. Render Table Header
  if (negMarkingActive) {
    // Two-tier header for Negative Marking
    let row1 = `
      <tr>
        <th rowspan="2" style="width:45px;">#</th>
        <th rowspan="2" style="width:75px;">Roll</th>
        <th rowspan="2" style="min-width:140px;">Student Name</th>`;
    
    subjects.forEach((sub) => {
      row1 += `<th colspan="3" class="me-sub-hdr">${sub.subjectName} <small style="opacity:.85;">(${sub.fullMarks})</small></th>`;
    });

    row1 += `
        <th rowspan="2" style="width:95px;text-align:center;">Total (${currentExam.total})</th>
        <th rowspan="2" style="width:85px;text-align:center;">Absent</th>
        <th rowspan="2" style="min-width:110px;">Remarks</th>
      </tr>`;

    let row2 = `<tr>`;
    subjects.forEach(() => {
      row2 += `
        <th class="me-sub-subhdr" style="width:66px;min-width:66px;">Cor</th>
        <th class="me-sub-subhdr" style="width:66px;min-width:66px;">Wrg</th>
        <th class="me-sub-subhdr" style="width:56px;min-width:56px;">Marks</th>`;
    });
    row2 += `</tr>`;

    thead.innerHTML = row1 + row2;
  } else {
    // Single-tier header for Direct Subject Marks
    let row = `
      <tr>
        <th style="width:45px;">#</th>
        <th style="width:75px;">Roll</th>
        <th style="min-width:140px;">Student Name</th>`;

    subjects.forEach((sub) => {
      row += `<th style="text-align:center;min-width:90px;">${sub.subjectName} <small style="color:#6366f1;">(${sub.fullMarks})</small></th>`;
    });

    row += `
        <th style="width:95px;text-align:center;">Total (${currentExam.total})</th>
        <th style="width:85px;text-align:center;">Absent</th>
        <th style="min-width:110px;">Remarks</th>
      </tr>`;

    thead.innerHTML = row;
  }

  // 2. Render Table Body
  tbody.innerHTML = entryData.map((r, i) => {
    const isOver = r.obtained !== '' && !r.isAbsent && Number(r.obtained) > currentExam.total;
    const rowClass = r.isAbsent ? 'me-row-absent' : '';
    const totalBadgeClass = isOver ? 'me-total-badge over' : 'me-total-badge';

    let subjectCells = '';

    if (negMarkingActive) {
      r.subjects.forEach((s, j) => {
        const corVal = s.correct != null ? s.correct : '';
        const wrgVal = s.wrong != null ? s.wrong : '';
        const scoreVal = (s.marks !== '' && s.marks != null) ? s.marks : '—';
        subjectCells += `
          <td style="text-align:center;">
            <input type="number" id="subCor-${i}-${j}" class="me-neg-input ${corVal !== '' ? 'filled' : ''}"
              value="${r.isAbsent ? '' : corVal}" min="0" max="${s.fullMarks}" placeholder="0"
              ${r.isAbsent ? 'disabled' : ''}
              oninput="onSubNegInput(${i}, ${j}, 'correct', this)"
              onkeydown="handleKeyNav(event, ${i}, 'cor', ${j})">
          </td>
          <td style="text-align:center;">
            <input type="number" id="subWrg-${i}-${j}" class="me-neg-input ${wrgVal !== '' ? 'filled' : ''}"
              value="${r.isAbsent ? '' : wrgVal}" min="0" placeholder="0"
              ${r.isAbsent ? 'disabled' : ''}
              oninput="onSubNegInput(${i}, ${j}, 'wrong', this)"
              onkeydown="handleKeyNav(event, ${i}, 'wrg', ${j})">
          </td>
          <td style="text-align:center;">
            <span id="subScore-${i}-${j}" class="me-sub-score-badge">${r.isAbsent ? 'ABS' : scoreVal}</span>
          </td>`;
      });
    } else {
      r.subjects.forEach((s, j) => {
        const markVal = (s.marks !== '' && s.marks != null) ? s.marks : '';
        const overMark = markVal !== '' && !r.isAbsent && Number(markVal) > s.fullMarks;
        const filled = markVal !== '' && !r.isAbsent && !overMark;
        const inpClass = overMark ? 'me-submark-input over' : (filled ? 'me-submark-input filled' : 'me-submark-input');

        subjectCells += `
          <td style="text-align:center;">
            <input type="number" id="subMark-${i}-${j}" class="${inpClass}"
              value="${r.isAbsent ? '' : markVal}" min="0" max="${s.fullMarks}"
              placeholder="0–${s.fullMarks}"
              ${r.isAbsent ? 'disabled' : ''}
              oninput="onSubMarkInput(${i}, ${j}, this)"
              onkeydown="handleKeyNav(event, ${i}, 'mark', ${j})">
          </td>`;
      });
    }

    const totalDisplay = r.isAbsent ? 'ABS' : (r.obtained !== '' ? r.obtained : '—');

    return `
      <tr id="meRow-${i}" class="${rowClass}">
        <td style="font-weight:700;color:#94a3b8;text-align:center;">${i + 1}</td>
        <td style="font-weight:800;color:#4f46e5;">${r.roll}</td>
        <td style="font-weight:600;">${r.name}</td>
        ${subjectCells}
        <td style="text-align:center;">
          <span id="totalMark-${i}" class="${totalBadgeClass}">${totalDisplay}</span>
        </td>
        <td style="text-align:center;">
          <label class="me-absent-wrap" style="justify-content:center;">
            <input type="checkbox" id="abs-${i}" ${r.isAbsent ? 'checked' : ''}
              onchange="onAbsentChange(${i}, this)">
            <span class="me-absent-label">Absent</span>
          </label>
        </td>
        <td>
          <input type="text" id="rem-${i}" class="me-remarks-input"
            value="${r.remarks || ''}" placeholder="Optional notes"
            onkeydown="handleKeyNav(event, ${i}, 'rem', 0)"
            oninput="entryData[${i}].remarks=this.value">
        </td>
      </tr>`;
  }).join('');
}

/* ── Live Input Handlers ── */
function onSubMarkInput(studentIdx, subIdx, el) {
  const r = entryData[studentIdx];
  if (!r || r.isAbsent) return;
  const s = r.subjects[subIdx];
  if (!s) return;

  const rawVal = el.value.trim();
  const val = rawVal === '' ? '' : parseFloat(rawVal);
  s.marks = val;
  s.correct = val;
  s.wrong = (val !== '') ? 0 : '';

  if (val !== '' && Number(val) > s.fullMarks) {
    el.className = 'me-submark-input over';
  } else if (val !== '') {
    el.className = 'me-submark-input filled';
  } else {
    el.className = 'me-submark-input';
  }

  recalcRow(studentIdx);
}

function onSubNegInput(studentIdx, subIdx, field, el) {
  const r = entryData[studentIdx];
  if (!r || r.isAbsent) return;
  const s = r.subjects[subIdx];
  if (!s) return;

  const rawVal = el.value.trim();
  const val = rawVal === '' ? '' : parseFloat(rawVal);
  s[field] = val;

  el.classList.toggle('filled', val !== '');

  // Calculate subject score from correct & wrong
  if ((s.correct === '' || s.correct == null) && (s.wrong === '' || s.wrong == null)) {
    s.marks = '';
  } else {
    const corVal = (s.correct !== '' && s.correct != null) ? Number(s.correct) : 0;
    const wrgVal = (s.wrong !== '' && s.wrong != null) ? Number(s.wrong) : 0;
    let score = corVal - (wrgVal * negGlobalRate);
    if (score < 0) score = 0;
    if (s.fullMarks && score > s.fullMarks) score = s.fullMarks;
    s.marks = Math.round(score * 100) / 100;
  }

  const scoreEl = $(`subScore-${studentIdx}-${subIdx}`);
  if (scoreEl) scoreEl.textContent = (s.marks !== '' && s.marks != null) ? s.marks : '—';

  recalcRow(studentIdx);
}

function recalcRow(studentIdx) {
  const r = entryData[studentIdx];
  if (!r) return;

  if (r.isAbsent) {
    r.obtained = 0;
    const totEl = $(`totalMark-${studentIdx}`);
    if (totEl) { totEl.textContent = 'ABS'; totEl.className = 'me-total-badge'; }
  } else {
    const hasAnyMarks = r.subjects.some(s => s.marks !== '' && s.marks != null);
    if (hasAnyMarks) {
      const sum = r.subjects.reduce((acc, s) => acc + (s.marks !== '' ? Number(s.marks) : 0), 0);
      r.obtained = Math.round(sum * 100) / 100;
    } else {
      r.obtained = '';
    }

    const totEl = $(`totalMark-${studentIdx}`);
    if (totEl) {
      totEl.textContent = r.obtained !== '' ? r.obtained : '—';
      const isOver = r.obtained !== '' && Number(r.obtained) > currentExam.total;
      totEl.className = isOver ? 'me-total-badge over' : 'me-total-badge';
    }
  }

  renderEntryStats();
}

function recalcAllScores() {
  entryData.forEach((r, i) => {
    if (!r.isAbsent && r.subjects) {
      if (negMarkingActive) {
        r.subjects.forEach((s) => {
          if ((s.correct === '' || s.correct == null) && (s.wrong === '' || s.wrong == null)) {
            if (s.marks !== '' && s.marks != null) {
              s.correct = s.marks;
              s.wrong = 0;
            } else {
              s.marks = '';
            }
          } else {
            const corVal = (s.correct !== '' && s.correct != null) ? Number(s.correct) : 0;
            const wrgVal = (s.wrong !== '' && s.wrong != null) ? Number(s.wrong) : 0;
            let score = corVal - (wrgVal * negGlobalRate);
            if (score < 0) score = 0;
            if (s.fullMarks && score > s.fullMarks) score = s.fullMarks;
            s.marks = Math.round(score * 100) / 100;
          }
        });
      }
      recalcRow(i);
    }
  });
}

/* ── Absent Handler ── */
function onAbsentChange(studentIdx, el) {
  const r = entryData[studentIdx];
  if (!r) return;
  r.isAbsent = el.checked;

  const row = $(`meRow-${studentIdx}`);
  if (el.checked) {
    r.obtained = 0;
    row?.classList.add('me-row-absent');
  } else {
    row?.classList.remove('me-row-absent');
    const hasAnyMarks = r.subjects.some(s => s.marks !== '' && s.marks != null);
    r.obtained = hasAnyMarks ? r.subjects.reduce((acc, s) => acc + (Number(s.marks) || 0), 0) : '';
  }

  renderEntryTable();
  renderEntryStats();
}

/* ══════════════════════════════════════════════════════════════
   Excel-style 2D Keyboard Navigation (Multi-Subject Supported)
══════════════════════════════════════════════════════════════ */
function getRowFocusableIds(studentIdx) {
  const subjects = currentExam.subjects || [];
  const ids = [];

  if (negMarkingActive) {
    subjects.forEach((_, j) => {
      ids.push(`subCor-${studentIdx}-${j}`);
      ids.push(`subWrg-${studentIdx}-${j}`);
    });
  } else {
    subjects.forEach((_, j) => {
      ids.push(`subMark-${studentIdx}-${j}`);
    });
  }

  ids.push(`rem-${studentIdx}`);
  return ids;
}

function handleKeyNav(e, studentIdx, type, subIdx) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Tab', 'ArrowDown', 'ArrowUp', 'Enter'];
  if (!keys.includes(e.key)) return;

  const rowIds = getRowFocusableIds(studentIdx);
  let currentId = '';
  if (type === 'mark') currentId = `subMark-${studentIdx}-${subIdx}`;
  else if (type === 'cor') currentId = `subCor-${studentIdx}-${subIdx}`;
  else if (type === 'wrg') currentId = `subWrg-${studentIdx}-${subIdx}`;
  else if (type === 'rem') currentId = `rem-${studentIdx}`;

  const colIdx = rowIds.indexOf(currentId);
  const totalCols = rowIds.length;
  const totalRows = entryData.length;

  if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    if (colIdx < totalCols - 1) {
      const nextEl = $(rowIds[colIdx + 1]);
      if (nextEl && !nextEl.disabled) nextEl.focus();
    } else if (studentIdx < totalRows - 1) {
      // Jump to next student's first cell
      const nextRowIds = getRowFocusableIds(studentIdx + 1);
      const nextEl = $(nextRowIds[0]);
      if (nextEl && !nextEl.disabled) nextEl.focus();
    }
  } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault();
    if (colIdx > 0) {
      const prevEl = $(rowIds[colIdx - 1]);
      if (prevEl && !prevEl.disabled) prevEl.focus();
    } else if (studentIdx > 0) {
      // Jump to previous student's last cell
      const prevRowIds = getRowFocusableIds(studentIdx - 1);
      const prevEl = $(prevRowIds[totalCols - 1]);
      if (prevEl && !prevEl.disabled) prevEl.focus();
    }
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault();
    if (studentIdx < totalRows - 1) {
      const nextRowIds = getRowFocusableIds(studentIdx + 1);
      const nextEl = $(nextRowIds[colIdx]);
      if (nextEl && !nextEl.disabled) nextEl.focus();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (studentIdx > 0) {
      const prevRowIds = getRowFocusableIds(studentIdx - 1);
      const prevEl = $(prevRowIds[colIdx]);
      if (prevEl && !prevEl.disabled) prevEl.focus();
    }
  }
}

/* ── Bulk Actions ── */
function markAllAbsent() {
  entryData.forEach((r, i) => {
    r.isAbsent = true;
    r.obtained = 0;
  });
  renderEntryTable();
  renderEntryStats();
  exToast('সবাইকে Absent mark করা হয়েছে।');
}

function clearAllMarks() {
  entryData.forEach((r, i) => {
    r.isAbsent = false;
    r.obtained = '';
    r.remarks  = '';
    r.subjects.forEach(s => {
      s.marks   = '';
      s.correct = '';
      s.wrong   = '';
    });
  });
  renderEntryTable();
  renderEntryStats();
  exToast('সব নম্বর মুছে দেওয়া হয়েছে।');
}

/* ── Validate Entries ── */
function validateEntries() {
  for (let i = 0; i < entryData.length; i++) {
    const r = entryData[i];
    if (!r.isAbsent) {
      if (r.obtained === '' || r.obtained == null) {
        exToast(`Roll ${r.roll} (${r.name})-এর নম্বর দিন অথবা Absent mark করুন।`, 'error');
        const firstInput = $(`subMark-${i}-0`) || $(`subCor-${i}-0`);
        firstInput?.focus();
        return false;
      }
      if (Number(r.obtained) > currentExam.total) {
        exToast(`Roll ${r.roll}: প্রাপ্ত মোট নম্বর (${r.obtained}) পরীক্ষার পূর্ণমান (${currentExam.total})-এর বেশি হতে পারে না।`, 'error');
        return false;
      }
      for (let j = 0; j < r.subjects.length; j++) {
        const s = r.subjects[j];
        if (s.marks !== '' && Number(s.marks) > s.fullMarks) {
          exToast(`Roll ${r.roll}: ${s.subjectName}-এর নম্বর (${s.marks}) পূর্ণমান (${s.fullMarks})-এর চেয়ে বেশি হতে পারে না।`, 'error');
          const input = $(`subMark-${i}-${j}`) || $(`subCor-${i}-${j}`);
          input?.focus();
          return false;
        }
      }
    }
  }
  return true;
}

/* ── Submit Marks & Calculate Merit List ── */
async function submitMarks() {
  if (!validateEntries()) return;

  const results = window.EXAM_DEMO.results || [];
  /* Remove existing entries in local cache */
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].examId === currentExam.id) results.splice(i, 1);
  }

  /* Add new entries to local cache */
  entryData.forEach(r => {
    results.push({
      examId:   currentExam.id,
      roll:     r.roll,
      name:     r.name,
      obtained: r.isAbsent ? 0 : Number(r.obtained),
      isAbsent: r.isAbsent,
      remarks:  r.remarks || '',
      subjects: r.subjects
    });
  });

  const examResults = results.filter(r => r.examId === currentExam.id);
  window.calcPositions(examResults, currentExam.total);

  // Update exam status
  currentExam.status = 'Published';
  const ex = (window.EXAM_DEMO.exams||[]).find(e => e.id===currentExam.id);
  if (ex) ex.status = 'Published';

  // Construct markEntries for Backend
  const markEntries = entryData.map(r => ({
    studentId: r.studentId,
    subjectMarks: r.subjects.map(s => ({
      subjectName: s.subjectName,
      fullMarks: s.fullMarks,
      passMarks: s.passMarks,
      marksObtained: r.isAbsent ? 0 : (s.marks !== '' ? Number(s.marks) : 0),
      correct: (s.correct !== '' && s.correct != null) ? Number(s.correct) : null,
      wrong: (s.wrong !== '' && s.wrong != null) ? Number(s.wrong) : null
    })),
    totalObtained: r.isAbsent ? 0 : Number(r.obtained || 0),
    correct: r.subjects.reduce((acc, s) => acc + (s.correct !== '' && s.correct != null ? Number(s.correct) : 0), 0),
    wrong: r.subjects.reduce((acc, s) => acc + (s.wrong !== '' && s.wrong != null ? Number(s.wrong) : 0), 0),
    negRate: negGlobalRate,
    status: r.isAbsent ? 'Absent' : (Number(r.obtained || 0) >= (currentExam.pass || 0) ? 'Pass' : 'Fail')
  }));

  try {
    const res = await fetch(`${API_BASE_ME}/ucc/results/mark-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: currentExam.id, markEntries })
    });
    const data = await res.json();
    if (data.success) {
      exToast('✅ Marks save হয়েছে! Position calculate হয়েছে।');
    } else {
      exToast('❌ ' + (data.message || 'Save failed'), 'error');
    }
  } catch (e) {
    exToast('❌ API connection error', 'error');
  }

  renderResultPreview(examResults);
  $('stepEntryCard').style.display = 'none';
  $('stepResultCard').style.display = '';
  $('meritListLink').href = `merit-list.html?exam=${currentExam.id}`;
  $('stepResultCard').scrollIntoView({behavior:'smooth',block:'start'});
}

/* ── Result Preview Table ── */
function renderResultPreview(results) {
  const sorted  = [...results].sort((a,b) => (a.position||999)-(b.position||999));
  const total   = currentExam.total;
  const active  = results.filter(r => !r.isAbsent);
  const absent  = results.filter(r => r.isAbsent).length;
  const avg     = active.length ? (active.reduce((s,r) => s+r.obtained,0)/active.length).toFixed(1) : 0;
  const highest = active.length ? Math.max(...active.map(r=>r.obtained)) : 0;
  const lowest  = active.length ? Math.min(...active.map(r=>r.obtained)) : 0;
  const passed  = active.filter(r => currentExam.pass && r.obtained >= currentExam.pass).length;

  $('meResultSub').textContent = `${currentExam.name} — ${currentExam.batch} · ${results.length} students (${currentExam.subjects.length} subjects)`;

  const subjects = currentExam.subjects || [];

  // Update table header in step 3
  const table = $('resultPreviewTable');
  if (table) {
    let theadHtml = `
      <tr>
        <th style="width:60px;">Position</th>
        <th style="width:80px;">Roll</th>
        <th>Student Name</th>`;
    
    subjects.forEach(s => {
      theadHtml += `<th style="text-align:center;">${s.subjectName} (${s.fullMarks})</th>`;
    });

    theadHtml += `
        <th style="text-align:center;">Total</th>
        <th style="text-align:center;">%</th>
        <th>Grade</th>
        <th>Status</th>
      </tr>`;
    
    table.querySelector('thead').innerHTML = theadHtml;
  }

  $('resultPreviewBody').innerHTML = sorted.map(r => {
    let subCells = '';
    const studentEntry = entryData.find(e => e.roll === r.roll);
    subjects.forEach((sub, sIdx) => {
      const sData = studentEntry ? studentEntry.subjects[sIdx] : null;
      const score = r.isAbsent ? 'ABS' : (sData && sData.marks !== '' ? sData.marks : '—');
      subCells += `<td style="text-align:center;font-weight:600;">${score}</td>`;
    });

    return `
      <tr>
        <td><span class="${posClass(r.position)}">${r.position||'—'}</span></td>
        <td style="font-weight:700;color:#4f46e5;">${r.roll}</td>
        <td style="font-weight:600;">${r.name}</td>
        ${subCells}
        <td style="font-weight:800;text-align:center;color:#4f46e5;">${r.isAbsent ? 'ABS' : r.obtained}</td>
        <td style="text-align:center;font-weight:700;">${r.isAbsent ? '—' : r.percentage + '%'}</td>
        <td><span class="me-grade ${gradeClass(r.grade)}">${r.grade}</span></td>
        <td>
          ${r.isAbsent
            ? '<span style="color:#94a3b8;font-size:12px;">Absent</span>'
            : (currentExam.pass
                ? (r.obtained >= currentExam.pass
                    ? '<span style="color:#059669;font-weight:700;font-size:12px;">✓ Pass</span>'
                    : '<span style="color:#dc2626;font-weight:700;font-size:12px;">✗ Fail</span>')
                : '—')}
        </td>
      </tr>`;
  }).join('');

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