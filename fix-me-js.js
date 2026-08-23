const fs = require('fs');
const FILE = 'frontend/ucc/assets/js/mark-entry.js';
let c = fs.readFileSync(FILE, 'utf8');

/* ===== 1. entryData init ===== */
const old1 = "      obtained: ex ? ex.obtained  : '',\n      isAbsent: ex ? ex.isAbsent  : false,\n      remarks:  ex ? (ex.remarks||'') : ''";
if (!c.includes("obtained:  ex ? ex")) { console.error('ERR1: pattern not found'); process.exit(1); }
const old1r = "      obtained:  ex ? ex.obtained  : '',\n      isAbsent:  ex ? ex.isAbsent  : false,\n      remarks:   ex ? (ex.remarks||'') : ''";
const new1r = "      obtained:  ex ? ex.obtained  : '',\n      correct:   (ex && ex.correct !== undefined && ex.correct !== null) ? ex.correct : '',\n      wrong:     (ex && ex.wrong !== undefined && ex.wrong !== null) ? ex.wrong : '',\n      negRate:   (ex && ex.negRate !== undefined && ex.negRate !== null) ? ex.negRate : 0.25,\n      isAbsent:  ex ? ex.isAbsent  : false,\n      remarks:   ex ? (ex.remarks||'') : ''";
c = c.replace(old1r, new1r, 1);

/* ========= 2. restoreNegConfig call ========= */
const anchor2 = "  renderExamBanner();\n  renderEntryTable();\n  renderEntryStats();";
const insert2 = "  restoreNegConfig();\n  renderExamBanner();\n  renderEntryTable();\n  renderEntryStats();";
if (!c.includes(anchor2)) { console.error('ERR: anchor2'); process.exit(1); }
c = c.replace(anchor2, insert2, 1);

/* ========= 3. Negative marking functions ========= */
const anchor3 = "  renderEntryStats();\n}\n\n/* ── Absent toggle ── */";
if (!c.includes(anchor3)) { console.error('ERR: anchor3'); process.exit(1); }

const negFunctions = `  renderEntryStats();
}

/* ════ Negative Marking System ════ */
let negMarkingActive = false;
let negGlobalRate = 0.25;

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

/* ── Absent toggle ── */`;

c = c.replace(anchor3, negFunctions, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('ALL 3 PARTS APPLIED');