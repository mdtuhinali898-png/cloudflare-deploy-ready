const fs = require('fs');
const FILE = 'frontend/ucc/assets/js/mark-entry.js';
let c = fs.readFileSync(FILE, 'utf8');

/* ============ 1. Update renderEntryTable - remove Absent column ============ */
const oldTable = `    return \`<tr id="meRow-${i}" class="${r.isAbsent?'me-row-absent':''}">
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
          value="${r.isAbsent?'':((r.correct!==undefined&&r.correct!==null)?r.correct:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          oninput="onNegInput(${i},'correct',this)">
      </td>
      <td>
        <input type="number" id="wrg-${i}" class="me-neg-input"
          value="${r.isAbsent?'':((r.wrong!==undefined&&r.wrong!==null)?r.wrong:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          oninput="onNegInput(${i},'wrong',this)">
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
    </tr>\`;`;

const newTable = `    return \`<tr id="meRow-${i}" class="${r.isAbsent?'me-row-absent':''}">
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
          data-row="${i}" data-col="0"
          oninput="onMarkInput(${i},this)"
          onkeydown="handleKey(event,${i},'mark',this)"
        >
      </td>
      <td>
        <input type="number" id="cor-${i}" class="me-neg-input"
          value="${r.isAbsent?'':((r.correct!==undefined&&r.correct!==null)?r.correct:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          data-row="${i}" data-col="1"
          oninput="onNegInput(${i},'correct',this)"
          onkeydown="handleKey(event,${i},'cor',this)">
      </td>
      <td>
        <input type="number" id="wrg-${i}" class="me-neg-input"
          value="${r.isAbsent?'':((r.wrong!==undefined&&r.wrong!==null)?r.wrong:'')}"
          min="0" max="${currentExam.total}" placeholder="—"
          ${r.isAbsent?'disabled':negDisabled}
          data-row="${i}" data-col="2"
          oninput="onNegInput(${i},'wrong',this)"
          onkeydown="handleKey(event,${i},'wrg',this)">
      </td>
      <td>
        <span id="neg-calc-${i}" style="font-weight:800;font-size:13px;">—</span>
      </td>
      <td>
        <input type="text" id="rem-${i}" class="me-remarks-input"
          value="${r.remarks||''}" placeholder="Optional..."
          data-row="${i}" data-col="3"
          onkeydown="handleKey(event,${i},'rem',this)"
          oninput="entryData[${i}].remarks=this.value">
      </td>
    </tr>\`;`;

if (!c.includes(oldTable)) { console.error('ERR: table pattern not found'); process.exit(1); }
c = c.replace(oldTable, newTable, 1);

/* ============ 2. Update handleKey for arrow navigation ============ */
const oldHandleKey = `/* ── Enter/Tab navigation ── */
function handleKey(e, i, field) {
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const next = i + 1;
    if (next < entryData.length) {
      const target = field === 'mark' ? \`rem-\${i}\` : \`mark-\${next}\`;
      const el = $(target);
      if (el && !el.disabled) el.focus();
    }
  }
}`;

const newHandleKey = `/* ── Enter/Tab/Arrow navigation ── */
function handleKey(e, i, field, el) {
  /* Arrow navigation */
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const row = i;
    const col = field === 'mark' ? 0 : field === 'cor' ? 1 : field === 'wrg' ? 2 : 3;
    let targetRow = row, targetCol = col;

    if (e.key === 'ArrowDown') targetRow = row + 1;
    else if (e.key === 'ArrowUp') targetRow = row - 1;
    else if (e.key === 'ArrowLeft') targetCol = col - 1;
    else if (e.key === 'ArrowRight') targetCol = col + 1;

    if (targetRow < 0 || targetRow >= entryData.length) return;
    if (targetCol < 0 || targetCol > 3) return;

    const targetId = targetCol === 0 ? \`mark-\${targetRow}\` : targetCol === 1 ? \`cor-\${targetRow}\` : targetCol === 2 ? \`wrg-\${targetRow}\` : \`rem-\${targetRow}\`;
    const targetEl = $(targetId);
    if (targetEl && !targetEl.disabled) targetEl.focus();
    return;
  }

  /* Enter/Tab navigation */
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    const next = i + 1;
    if (next < entryData.length) {
      const target = field === 'mark' ? \`rem-\${i}\` : \`mark-\${next}\`;
      const el2 = $(target);
      if (el2 && !el2.disabled) el2.focus();
    }
  }
}`;

if (!c.includes(oldHandleKey)) { console.error('ERR: handleKey not found'); process.exit(1); }
c = c.replace(oldHandleKey, newHandleKey, 1);

/* ============ 3. Update onMarkInput to auto-detect absent ============ */
const oldOnMarkInput = `function onMarkInput(i, el) {
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
}`;

const newOnMarkInput = `function onMarkInput(i, el) {
  const val = el.value === '' ? '' : parseFloat(el.value);
  entryData[i].obtained = val;
  /* Auto-detect absent: if marks field is blank, student is absent */
  entryData[i].isAbsent = (val === '' || val === null);
  const row = $(\`meRow-\${i}\`);
  if (row) row.classList.toggle('me-row-absent', entryData[i].isAbsent);
  if (val !== '' && val > currentExam.total) {
    el.className = 'me-mark-input over';
  } else if (val !== '') {
    el.className = 'me-mark-input filled';
  } else {
    el.className = 'me-mark-input';
  }
  renderEntryStats();
}`;

if (!c.includes(oldOnMarkInput)) { console.error('ERR: onMarkInput not found'); process.exit(1); }
c = c.replace(oldOnMarkInput, newOnMarkInput, 1);

/* ============ 4. Update onNegInput to auto-detect absent ============ */
const oldOnNegInput = `function onNegInput(i, field, el) {
  const val = el.value === '' ? '' : parseFloat(el.value);
  entryData[i][field] = val;
  el.classList.toggle('filled', val !== '');
  recalcOne(i);
}`;

const newOnNegInput = `function onNegInput(i, field, el) {
  const val = el.value === '' ? '' : parseFloat(el.value);
  entryData[i][field] = val;
  el.classList.toggle('filled', val !== '');
  /* Auto-detect absent: if both correct and wrong are blank, student is absent */
  const corBlank = (entryData[i].correct === '' || entryData[i].correct === null || entryData[i].correct === undefined);
  const wrgBlank = (entryData[i].wrong === '' || entryData[i].wrong === null || entryData[i].wrong === undefined);
  entryData[i].isAbsent = corBlank && wrgBlank;
  const row = $(\`meRow-\${i}\`);
  if (row) row.classList.toggle('me-row-absent', entryData[i].isAbsent);
  recalcOne(i);
}`;

if (!c.includes(oldOnNegInput)) { console.error('ERR: onNegInput not found'); process.exit(1); }
c = c.replace(oldOnNegInput, newOnNegInput, 1);

/* ============ 5. Update recalcOne to handle absent ============ */
const oldRecalcOne = `function recalcOne(i) {
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
}`;

const newRecalcOne = `function recalcOne(i) {
  const r = entryData[i];
  if (!r) return;
  /* If both correct and wrong are blank, treat as absent */
  const corBlank = (r.correct === '' || r.correct === null || r.correct === undefined);
  const wrgBlank = (r.wrong === '' || r.wrong === null || r.wrong === undefined);
  if (corBlank && wrgBlank) {
    r.isAbsent = true;
    r.obtained = '';
    const calcEl = $('neg-calc-' + i);
    if (calcEl) calcEl.textContent = '—';
    const markEl = $('mark-' + i);
    if (markEl) { markEl.value = ''; markEl.classList.remove('filled'); }
    const row = $(\`meRow-\${i}\`);
    if (row) row.classList.add('me-row-absent');
    renderEntryStats();
    return;
  }
  r.isAbsent = false;
  const rate = (r.negRate !== undefined && r.negRate !== null) ? Number(r.negRate) : negGlobalRate;
  const cor  = corBlank ? 0 : Number(r.correct);
  const wrg  = wrgBlank ? 0 : Number(r.wrong);
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
  const row = $(\`meRow-\${i}\`);
  if (row) row.classList.remove('me-row-absent');
  renderEntryStats();
}`;

if (!c.includes(oldRecalcOne)) { console.error('ERR: recalcOne not found'); process.exit(1); }
c = c.replace(oldRecalcOne, newRecalcOne, 1);

/* ============ 6. Update markAllAbsent - clear marks instead of checkbox ============ */
const oldMarkAllAbsent = `function markAllAbsent() {
  entryData.forEach((r, i) => {
    r.isAbsent = true; r.obtained = 0;
    const cb = $(\`abs-\${i}\`);
    const mk = $(\`mark-\${i}\`);
    if (cb) cb.checked = true;
    if (mk) { mk.disabled = true; mk.value = ''; mk.className = 'me-mark-input'; }
    $(\`meRow-\${i}\`)?.classList.add('me-row-absent');
  });
  renderEntryStats();
  exToast('সবাইকে Absent করা হয়েছে।');
}`;

const newMarkAllAbsent = `function markAllAbsent() {
  entryData.forEach((r, i) => {
    r.isAbsent = true; r.obtained = ''; r.correct = ''; r.wrong = '';
    const mk = $(\`mark-\${i}\`);
    const cor = $(\`cor-\${i}\`);
    const wrg = $(\`wrg-\${i}\`);
    const calc = $(\`neg-calc-\${i}\`);
    if (mk) { mk.value = ''; mk.className = 'me-mark-input'; }
    if (cor) { cor.value = ''; cor.classList.remove('filled'); }
    if (wrg) { wrg.value = ''; wrg.classList.remove('filled'); }
    if (calc) calc.textContent = '—';
    $(\`meRow-\${i}\`)?.classList.add('me-row-absent');
  });
  renderEntryStats();
  exToast('সবাইকে Absent করা হয়েছে।');
}`;

if (!c.includes(oldMarkAllAbsent)) { console.error('ERR: markAllAbsent not found'); process.exit(1); }
c = c.replace(oldMarkAllAbsent, newMarkAllAbsent, 1);

/* ============ 7. Update clearAllMarks - remove checkbox refs ============ */
const oldClearAll = `function clearAllMarks() {
  entryData.forEach((r, i) => {
    r.obtained = ''; r.isAbsent = false; r.remarks = '';
    const cb = $(\`abs-\${i}\`);
    const mk = $(\`mark-\${i}\`);
    const rm = $(\`rem-\${i}\`);
    if (cb) cb.checked = false;
    if (mk) { mk.disabled = false; mk.value = ''; mk.className = 'me-mark-input'; }
    if (rm) rm.value = '';
    $(\`meRow-\${i}\`)?.classList.remove('me-row-absent');
  });
  renderEntryStats();
  exToast('সব marks clear হয়েছে।');
}`;

const newClearAll = `function clearAllMarks() {
  entryData.forEach((r, i) => {
    r.obtained = ''; r.isAbsent = false; r.remarks = ''; r.correct = ''; r.wrong = '';
    const mk = $(\`mark-\${i}\`);
    const cor = $(\`cor-\${i}\`);
    const wrg = $(\`wrg-\${i}\`);
    const calc = $(\`neg-calc-\${i}\`);
    const rm = $(\`rem-\${i}\`);
    if (mk) { mk.value = ''; mk.className = 'me-mark-input'; }
    if (cor) { cor.value = ''; cor.classList.remove('filled'); }
    if (wrg) { wrg.value = ''; wrg.classList.remove('filled'); }
    if (calc) calc.textContent = '—';
    if (rm) rm.value = '';
    $(\`meRow-\${i}\`)?.classList.remove('me-row-absent');
  });
  renderEntryStats();
  exToast('সব marks clear হয়েছে।');
}`;

if (!c.includes(oldClearAll)) { console.error('ERR: clearAllMarks not found'); process.exit(1); }
c = c.replace(oldClearAll, newClearAll, 1);

/* ============ 8. Update validateEntries - blank marks = absent ============ */
const oldValidate = `function validateEntries() {
  for (let i = 0; i < entryData.length; i++) {
    const r = entryData[i];
    if (!r.isAbsent) {
      if (r.obtained === '' || r.obtained === null) {
        exToast(\`Roll \${r.roll} (\${r.name})-এর marks দিন অথবা Absent mark করুন।\`, 'error');
        $(\`mark-\${i}\`)?.focus();
        return false;
      }
      if (Number(r.obtained) > currentExam.total) {
        exToast(\`Roll \${r.roll}: marks (\${r.obtained}) total marks (\${currentExam.total})-এর বেশি হতে পারে না।\`, 'error');
        $(\`mark-\${i}\`)?.focus();
        return false;
      }
    }
  }
  return true;
}`;

const newValidate = `function validateEntries() {
  for (let i = 0; i < entryData.length; i++) {
    const r = entryData[i];
    /* Blank marks = absent, so no validation needed for blank */
    if (!r.isAbsent && r.obtained !== '' && r.obtained !== null) {
      if (Number(r.obtained) > currentExam.total) {
        exToast(\`Roll \${r.roll}: marks (\${r.obtained}) total marks (\${currentExam.total})-এর বেশি হতে পারে না।\`, 'error');
        $(\`mark-\${i}\`)?.focus();
        return false;
      }
    }
  }
  return true;
}`;

if (!c.includes(oldValidate)) { console.error('ERR: validateEntries not found'); process.exit(1); }
c = c.replace(oldValidate, newValidate, 1);

/* ============ 9. Update submitMarks - use isAbsent from blank marks ============ */
const oldSubmit = `  entryData.forEach(r => {
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
  });`;

const newSubmit = `  entryData.forEach(r => {
    /* Auto-detect absent: blank marks = absent */
    const isAbs = r.isAbsent || r.obtained === '' || r.obtained === null;
    results.push({
      examId:   currentExam.id,
      roll:     r.roll,
      name:     r.name,
      obtained: isAbs ? 0 : Number(r.obtained),
      isAbsent: isAbs,
      remarks:  r.remarks || '',
      correct:  r.correct !== undefined ? Number(r.correct) : null,
      wrong:    r.wrong !== undefined ? Number(r.wrong) : null,
      negRate:  r.negRate !== undefined ? Number(r.negRate) : 0.25
    });
  });`;

if (!c.includes(oldSubmit)) { console.error('ERR: submit not found'); process.exit(1); }
c = c.replace(oldSubmit, newSubmit, 1);

/* ============ 10. Update backend payload in submitMarks ============ */
const oldBackend = `    const markEntries = entryData.map(r => ({
      studentId: r.studentId,
      subjectMarks: [],
      totalObtained: r.isAbsent ? 0 : Number(r.obtained),
      status: r.isAbsent ? 'Absent' : (Number(r.obtained) >= (currentExam.pass || 0) ? 'Pass' : 'Fail')
    }));`;

const newBackend = `    const markEntries = entryData.map(r => {
      const isAbs = r.isAbsent || r.obtained === '' || r.obtained === null;
      return {
        studentId: r.studentId,
        subjectMarks: [],
        totalObtained: isAbs ? 0 : Number(r.obtained),
        correct: r.correct !== undefined ? Number(r.correct) : null,
        wrong: r.wrong !== undefined ? Number(r.wrong) : null,
        negRate: r.negRate !== undefined ? Number(r.negRate) : 0.25,
        status: isAbs ? 'Absent' : (Number(r.obtained) >= (currentExam.pass || 0) ? 'Pass' : 'Fail')
      };
    });`;

if (!c.includes(oldBackend)) { console.error('ERR: backend payload not found'); process.exit(1); }
c = c.replace(oldBackend, newBackend, 1);

/* ============ 11. Update renderEntryStats - absent from blank ============ */
const oldStats = `function renderEntryStats() {
  const filled  = entryData.filter(r => r.obtained!=='' && !r.isAbsent).length;
  const absent  = entryData.filter(r => r.isAbsent).length;
  const total   = entryData.length;
  const pending = total - filled - absent;`;

const newStats = `function renderEntryStats() {
  const filled  = entryData.filter(r => r.obtained!=='' && r.obtained!==null && !r.isAbsent).length;
  const absent  = entryData.filter(r => r.isAbsent || r.obtained==='' || r.obtained===null).length;
  const total   = entryData.length;
  const pending = total - filled - absent;`;

if (!c.includes(oldStats)) { console.error('ERR: stats not found'); process.exit(1); }
c = c.replace(oldStats, newStats, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('mark-entry.js updated successfully');