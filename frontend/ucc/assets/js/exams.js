/* ==========================================================================
   UCC Pabna — Exam Management JS (Backend Connected)
   Loads from MongoDB via /api/ucc/exams
   ========================================================================== */

const API_BASE = 'http://localhost:5002/api';

/* ── State ── */
let EXAM_DEMO = { exams: [], results: [] };
let deleteTargetId = null;
let filteredExams = [];
let cachedBatches = [];

/* ── Helpers ── */
const $ = id => document.getElementById(id);
const exMoney = n => '৳' + Number(n||0).toLocaleString('en-IN');
function exToast(msg, type = 'success') {
  const t = $('exToast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'ex-toast' + (type === 'error' ? ' error' : '');
  clearTimeout(window._exToastTimer);
  window._exToastTimer = setTimeout(() => t.className = 'ex-toast hidden', 3200);
}
function getGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}
function calcPositions(results, totalMarks) {
  const active = results.filter(r => !r.isAbsent).sort((a,b) => b.obtained - a.obtained);
  let pos = 1;
  active.forEach((r, i) => {
    if (i > 0 && r.obtained < active[i-1].obtained) pos = i + 1;
    r.position   = pos;
    r.percentage = totalMarks ? Math.round((r.obtained / totalMarks) * 100 * 10) / 10 : 0;
    r.grade      = getGrade(r.percentage);
  });
  results.filter(r => r.isAbsent).forEach(r => { r.position = null; r.percentage = 0; r.grade = 'ABS'; });
  return results;
}
function entryCount(examId) {
  return EXAM_DEMO.results.filter(r => r.examId === examId && !r.isAbsent).length;
}

/* ── API: Load exams & results from backend ── */
async function loadExamsFromApi() {
  try {
    const examsRes = await fetch(`${API_BASE}/ucc/exams`).then(r => r.json()).catch(() => ({ success: false }));

    if (examsRes.success && examsRes.exams) {
      EXAM_DEMO.exams = examsRes.exams.map(e => ({
        id: e._id,
        name: e.title || e.examCode || '',
        batch: e.batchName || '',
        batchId: e.batchId || null,
        type: e.program || 'Medical',
        subject: (e.subjects && e.subjects.length) ? e.subjects.map(s => s.subjectName).join(' + ') : '',
        date: e.examDate ? new Date(e.examDate).toISOString().split('T')[0] : '',
        total: e.totalMarks || 100,
        pass: (e.subjects && e.subjects.length) ? e.subjects.reduce((sum, s) => sum + (s.passMarks || 0), 0) : 40,
        subjects: e.subjects || [],
        negativeMarking: e.negativeMarking === true,
        negativeMarkPerWrong: e.negativeMarkPerWrong != null ? e.negativeMarkPerWrong : 0.25,
        duration: e.duration || 0,
        status: e.status === 'Completed' ? 'Published' : 'Draft',
        notes: e.notes || ''
      }));
    }

    // Load results for each exam
    EXAM_DEMO.results = [];
    for (const exam of EXAM_DEMO.exams) {
      try {
        const res = await fetch(`${API_BASE}/ucc/results/merit-list/${exam.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.meritList) {
            data.meritList.forEach(r => {
              EXAM_DEMO.results.push({
                examId: exam.id,
                roll: r.studentRoll,
                name: r.studentName,
                obtained: r.totalObtained || 0,
                isAbsent: r.status === 'Absent',
                remarks: '',
                percentage: r.percentage,
                position: r.meritPosition,
                grade: getGrade(r.percentage || 0)
              });
            });
          }
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) {
    console.warn('Failed to load exams from API:', e);
    EXAM_DEMO = { exams: [], results: [] };
  }

  filteredExams = [...EXAM_DEMO.exams];
}

function saveExamData() {
  // No-op: data is in backend
}

/* ── Populate batch dropdowns from DB ── */
async function loadBatches() {
  try {
    const res = await fetch(`${API_BASE}/ucc/batches`);
    const data = await res.json();
    if (data.success && data.batches) {
      cachedBatches = data.batches;
      populateBatchFilter(data.batches);
      populateBatchSelect(data.batches);
    }
  } catch (e) { /* ignore */ }
}

function populateBatchFilter(batches) {
  const filterSel = $('filterBatch');
  if (filterSel) {
    const current = filterSel.value;
    filterSel.innerHTML = '<option value="all">All Batches</option>';
    batches.forEach(b => {
      filterSel.insertAdjacentHTML('beforeend', `<option value="${b.batchName}">${b.batchName}</option>`);
    });
    filterSel.value = current || 'all';
  }
}

function populateBatchSelect(batches) {
  const sel = $('newExamBatch');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Batch --</option>';
    batches.forEach(b => {
      sel.insertAdjacentHTML('beforeend', `<option value="${b.batchName}">${b.batchName}</option>`);
    });
  }
}

/* ── Stat Cards ── */
function renderStats() {
  const total     = EXAM_DEMO.exams.length;
  const published = EXAM_DEMO.exams.filter(e => e.status === 'Published').length;
  const draft     = EXAM_DEMO.exams.filter(e => e.status === 'Draft').length;
  const entries   = EXAM_DEMO.results.filter(r => !r.isAbsent).length;
  $('statTotal').textContent     = total;
  $('statPublished').textContent = published;
  $('statDraft').textContent     = draft;
  $('statEntries').textContent   = entries;
}

/* ── Filter ── */
function applyFilter() {
  const batch  = $('filterBatch').value;
  const type   = $('filterType').value;
  const status = $('filterStatus').value;
  const q      = ($('filterSearch').value || '').toLowerCase();
  filteredExams = EXAM_DEMO.exams.filter(e =>
    (batch  === 'all' || e.batch   === batch)  &&
    (type   === 'all' || e.type    === type)   &&
    (status === 'all' || e.status  === status) &&
    (!q || e.name.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q))
  );
  renderTable();
}
function resetFilter() {
  $('filterBatch').value  = 'all';
  $('filterType').value   = 'all';
  $('filterStatus').value = 'all';
  $('filterSearch').value = '';
  filteredExams = [...EXAM_DEMO.exams];
  renderTable();
}

/* ── Table ── */
function renderTable() {
  $('examCountBadge').textContent = filteredExams.length + ' Exams';
  const tbody = $('examTableBody');
  if (!filteredExams.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#64748b;">
      <div style="font-size:36px;margin-bottom:10px;opacity:.4;">📋</div>
      No exams found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filteredExams.map((e, i) => {
    const cnt    = entryCount(e.id);
    const pubBtn = e.status === 'Published'
      ? `<button class="ex-act ex-act-unpub" onclick="toggleStatus('${e.id}')"><i class="fas fa-eye-slash"></i> Unpublish</button>`
      : `<button class="ex-act ex-act-pub"   onclick="toggleStatus('${e.id}')"><i class="fas fa-eye"></i> Publish</button>`;
    return `<tr>
      <td style="font-weight:700;color:#4f46e5;">${i+1}</td>
      <td>
        <div style="font-weight:700;color:#0f172a;">${e.name}</div>
        <div style="font-size:11px;color:#64748b;">${e.subject || '—'}</div>
      </td>
      <td style="font-size:13px;">${e.batch}</td>
      <td><span class="ex-type">${e.type}</span></td>
      <td style="font-size:13px;">${e.date}</td>
      <td style="font-weight:700;text-align:center;">${e.total}</td>
      <td style="text-align:center;">
        <span style="font-weight:700;color:${cnt>0?'#059669':'#64748b'};">${cnt}</span>
      </td>
      <td><span class="ex-badge ${e.status==='Published'?'ex-badge-published':'ex-badge-draft'}">${e.status}</span></td>
      <td>
        <div class="ex-action-btns">
          <a href="mark-entry.html?exam=${e.id}" class="ex-act ex-act-mark"><i class="fas fa-pen"></i> Marks</a>
          <a href="merit-list.html?exam=${e.id}" class="ex-act ex-act-merit"><i class="fas fa-list-ol"></i> Merit</a>
          ${pubBtn}
          <button class="ex-act ex-act-csv" title="Download Merit CSV" onclick="downloadExamCSV('${e.id}')"><i class="fas fa-file-csv"></i> CSV</button>
          <button class="ex-act ex-act-del" onclick="openDeleteModal('${e.id}')" title="Delete Exam"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ── Toggle status ── */
async function toggleStatus(id) {
  const exam = EXAM_DEMO.exams.find(e => e.id === id);
  if (!exam) return;
  exam.status = exam.status === 'Published' ? 'Draft' : 'Published';
  
  // Update in backend
  try {
    await fetch(`${API_BASE}/ucc/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: exam.name,
        batchName: exam.batch,
        program: exam.type,
        totalMarks: exam.total,
        subjects: (exam.subjects && exam.subjects.length) ? exam.subjects : undefined,
        status: exam.status === 'Published' ? 'Completed' : 'Scheduled'
      })
    });
  } catch (e) { /* ignore */ }
  
  applyFilter();
  renderStats();
  exToast(`"${exam.name}" → ${exam.status}`);
}

/* ── Create Exam Modal & Dynamic Subject Builder ── */
let modalSubjects = [];

function toggleModalNeg(el) {
  const wrap = $('newExamNegRateWrap');
  if (wrap) wrap.style.display = el.checked ? 'flex' : 'none';
}

function renderModalSubjects() {
  const list = $('modalSubjectsList');
  if (!list) return;

  if (!modalSubjects.length) {
    modalSubjects = [{ name: 'General', full: 100, pass: 40 }];
  }

  list.innerHTML = modalSubjects.map((s, idx) => `
    <div class="ex-sub-row" id="subRow-${idx}">
      <div>
        <input type="text" placeholder="Subject Name (e.g. Physics)" value="${s.name || ''}"
          oninput="onSubjectFieldChange(${idx}, 'name', this.value)">
      </div>
      <div>
        <input type="number" placeholder="Full Marks" min="1" value="${s.full != null ? s.full : ''}"
          oninput="onSubjectFieldChange(${idx}, 'full', this.value)">
      </div>
      <div>
        <input type="number" placeholder="Pass Marks" min="0" value="${s.pass != null ? s.pass : ''}"
          oninput="onSubjectFieldChange(${idx}, 'pass', this.value)">
      </div>
      <div>
        <button type="button" class="ex-sub-del" title="Remove Subject" onclick="removeModalSubjectRow(${idx})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  updateSubjectTotals();
}

function onSubjectFieldChange(idx, field, val) {
  if (!modalSubjects[idx]) return;
  if (field === 'name') {
    modalSubjects[idx].name = val;
  } else if (field === 'full') {
    modalSubjects[idx].full = val === '' ? '' : Math.max(1, parseInt(val) || 0);
  } else if (field === 'pass') {
    modalSubjects[idx].pass = val === '' ? '' : Math.max(0, parseInt(val) || 0);
  }
  updateSubjectTotals();
}

function addModalSubjectRow(name = '', full = 25, pass = 10) {
  modalSubjects.push({ name, full, pass });
  renderModalSubjects();
  setTimeout(() => {
    const list = $('modalSubjectsList');
    if (list) list.scrollTop = list.scrollHeight;
  }, 50);
}

function removeModalSubjectRow(idx) {
  if (modalSubjects.length <= 1) {
    exToast('At least 1 subject is required.', 'error');
    return;
  }
  modalSubjects.splice(idx, 1);
  renderModalSubjects();
}

function addSubjectPreset(preset) {
  if (preset === 'medical') {
    modalSubjects = [
      { name: 'Physics', full: 25, pass: 10 },
      { name: 'Chemistry', full: 25, pass: 10 },
      { name: 'Biology', full: 30, pass: 12 },
      { name: 'English', full: 10, pass: 4 },
      { name: 'General Knowledge', full: 10, pass: 4 }
    ];
    $('newExamType').value = 'Model Test';
  } else if (preset === 'varsity_a') {
    modalSubjects = [
      { name: 'Physics', full: 25, pass: 10 },
      { name: 'Chemistry', full: 25, pass: 10 },
      { name: 'Higher Math', full: 25, pass: 10 },
      { name: 'Biology', full: 25, pass: 10 }
    ];
    $('newExamType').value = 'MCQ';
  } else if (preset === 'varsity_b') {
    modalSubjects = [
      { name: 'Bangla', full: 35, pass: 14 },
      { name: 'English', full: 35, pass: 14 },
      { name: 'General Knowledge', full: 30, pass: 12 }
    ];
    $('newExamType').value = 'MCQ';
  }
  renderModalSubjects();
  exToast(`Preset "${preset}" loaded!`);
}

function updateSubjectTotals() {
  const count = modalSubjects.length;
  const calcTotal = modalSubjects.reduce((sum, s) => sum + (Number(s.full) || 0), 0);
  const calcPass = modalSubjects.reduce((sum, s) => sum + (Number(s.pass) || 0), 0);

  if ($('modalSubCount')) $('modalSubCount').textContent = count;
  if ($('modalCalcTotal')) $('modalCalcTotal').textContent = `${calcTotal} Marks`;
  if ($('modalCalcPass')) $('modalCalcPass').textContent = `${calcPass} Marks`;
}

function openCreateModal() {
  $('createModal').style.display = 'flex';
  $('newExamDate').value = new Date().toISOString().split('T')[0];
  
  // Default subjects (4 subjects by default)
  modalSubjects = [
    { name: 'Physics', full: 25, pass: 10 },
    { name: 'Chemistry', full: 25, pass: 10 },
    { name: 'Biology', full: 25, pass: 10 },
    { name: 'GK & English', full: 25, pass: 10 }
  ];
  renderModalSubjects();

  // Reset negative switch
  const negEn = $('newExamNegEnabled');
  if (negEn) {
    negEn.checked = false;
    toggleModalNeg(negEn);
  }
  
  // Populate batch dropdown from DB
  loadBatches().then(() => {});
  
  setTimeout(() => $('newExamName').focus(), 80);
}

function closeCreateModal(e) {
  if (e && e.target !== $('createModal')) return;
  $('createModal').style.display = 'none';
}

async function saveExam() {
  const name  = $('newExamName').value.trim();
  const batch = $('newExamBatch').value;
  const type  = $('newExamType').value;
  const date  = $('newExamDate').value;
  const negEnabled = $('newExamNegEnabled')?.checked === true;
  const negRate = parseFloat($('newExamNegRate')?.value) || 0.25;

  if (!name)  { exToast('Please enter exam name.', 'error'); $('newExamName').focus(); return; }
  if (!batch) { exToast('Please select a batch.', 'error'); return; }
  if (!type)  { exToast('Please select exam type.', 'error'); return; }
  if (!date)  { exToast('Please select a date.', 'error'); return; }

  // Validate subjects
  if (!modalSubjects || !modalSubjects.length) {
    exToast('Please add at least 1 subject.', 'error');
    return;
  }
  for (let i = 0; i < modalSubjects.length; i++) {
    const s = modalSubjects[i];
    if (!s.name || !s.name.trim()) {
      exToast(`Please enter name for Subject #${i+1}.`, 'error');
      return;
    }
    if (!s.full || Number(s.full) <= 0) {
      exToast(`Please enter valid Full Marks (>0) for "${s.name}".`, 'error');
      return;
    }
  }

  const totalMarks = modalSubjects.reduce((sum, s) => sum + Number(s.full), 0);
  const matchedBatch = cachedBatches.find(b => b.batchName === batch);

  const payload = {
    title: name,
    program: type,
    batchId: matchedBatch ? matchedBatch._id : null,
    batchName: batch,
    examDate: new Date(date).toISOString(),
    totalMarks: totalMarks,
    negativeMarking: negEnabled,
    negativeMarkPerWrong: negRate,
    subjects: modalSubjects.map(s => ({
      subjectName: s.name.trim(),
      fullMarks: Number(s.full),
      passMarks: Number(s.pass) || 0
    })),
    duration: parseInt($('newExamDuration')?.value) || 0,
    notes: $('newExamNotes')?.value.trim() || '',
    status: 'Scheduled'
  };

  try {
    const res = await fetch(`${API_BASE}/ucc/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      $('createModal').style.display = 'none';
      ['newExamName','newExamDuration','newExamNotes'].forEach(id => {
        if ($(id)) $(id).value = '';
      });
      $('newExamBatch').value = '';
      $('newExamType').value  = '';
      await loadExamsFromApi();
      applyFilter();
      renderStats();
      exToast(`✅ "${name}" (${modalSubjects.length} subjects, ${totalMarks} marks) created!`);
    } else {
      exToast('❌ ' + (data.message || 'Save failed'), 'error');
    }
  } catch (e) {
    exToast('❌ API connection error', 'error');
  }
}

/* ── Delete ── */
function openDeleteModal(id) {
  deleteTargetId = id;
  const exam = EXAM_DEMO.exams.find(e => e.id === id);
  $('deleteExamName').textContent = exam ? `"${exam.name}" — ${exam.batch}` : '—';
  $('deleteModal').style.display = 'flex';
}
function closeDeleteModal(e) {
  if (e && e.target !== $('deleteModal')) return;
  $('deleteModal').style.display = 'none';
  deleteTargetId = null;
}
async function confirmDelete() {
  if (!deleteTargetId) return;
  
  try {
    const res = await fetch(`${API_BASE}/ucc/exams/${deleteTargetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      EXAM_DEMO.exams = EXAM_DEMO.exams.filter(e => e.id !== deleteTargetId);
      EXAM_DEMO.results = EXAM_DEMO.results.filter(r => r.examId !== deleteTargetId);
      exToast(`🗑️ Exam deleted`);
    } else {
      exToast('❌ ' + (data.message || 'Delete failed'), 'error');
    }
  } catch (e) {
    exToast('❌ API connection error', 'error');
  }
  
  closeDeleteModal();
  filteredExams = [...EXAM_DEMO.exams];
  applyFilter();
  renderStats();
}

/* ── CSV Download ── */
async function downloadExamCSV(examId) {
  const exam = EXAM_DEMO.exams.find(e => e.id === examId);
  if (!exam) {
    exToast('Exam not found', 'error');
    return;
  }

  exToast(`Generating CSV for "${exam.name}"...`);

  try {
    const res = await fetch(`${API_BASE}/ucc/results/merit-list/${examId}`);
    const data = await res.json();

    if (!data.success || !data.meritList || !data.meritList.length) {
      exToast('No results/entries found for this exam.', 'error');
      return;
    }

    // Sort: Present by position, Absent at the bottom
    const sorted = [...data.meritList].sort((a, b) => {
      const isAbsA = a.status === 'Absent';
      const isAbsB = b.status === 'Absent';
      if (isAbsA && !isAbsB) return 1;
      if (!isAbsA && isAbsB) return -1;
      return (a.meritPosition || 9999) - (b.meritPosition || 9999);
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
      const isAbsent = r.status === 'Absent';
      const studentPhone = (r.studentId && r.studentId.phone) ? r.studentId.phone : (r.phone || '');
      const guardianPhone = (r.studentId && r.studentId.guardianPhone) ? r.studentId.guardianPhone : (r.guardianPhone || '');
      const correct = isAbsent ? '—' : (r.correctAnswer != null ? r.correctAnswer : '');
      const wrong = isAbsent ? '—' : (r.wrongAnswer != null ? r.wrongAnswer : '');
      const marks = isAbsent ? 'ABS' : (r.totalObtained != null ? r.totalObtained : 0);
      const rank = isAbsent ? '—' : (r.meritPosition || '—');
      const pct = isAbsent ? '0%' : `${r.percentage != null ? r.percentage : 0}%`;
      const grade = isAbsent ? 'ABS' : getGrade(r.percentage || 0);
      const status = r.status || (isAbsent ? 'Absent' : 'Pass');

      const subMarks = hasMultiSubjects
        ? exam.subjects.map((sub, sIdx) => {
            if (isAbsent) return 'ABS';
            const sm = (r.subjectMarks && r.subjectMarks.length)
              ? r.subjectMarks.find(item => item.subjectName === sub.subjectName || (sIdx === 0 && !item.subjectName))
              : null;
            return sm && sm.marksObtained != null ? sm.marksObtained : '—';
          })
        : [];

      return [
        r.studentRoll || '',
        r.studentName || '',
        studentPhone,
        guardianPhone,
        ...subMarks,
        marks,
        correct,
        wrong,
        rank,
        pct,
        grade,
        status
      ];
    });

    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v != null ? v : '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanExamName = (exam.name || 'Exam').replace(/[^a-zA-Z0-9_\u0980-\u09FF-]/g, '_');
    const cleanBatch = (exam.batch || 'Batch').replace(/[^a-zA-Z0-9_\u0980-\u09FF-]/g, '_');
    a.download = `MeritList_${cleanExamName}_${cleanBatch}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    exToast(`✅ CSV downloaded for "${exam.name}"`);
  } catch (err) {
    console.error('CSV download error:', err);
    exToast('Failed to download CSV', 'error');
  }
}

/* ── Auth ── */
function initPage() {
  const user = JSON.parse(sessionStorage.getItem('uccAdminUser') || '{}');
  if (user.username) $('uccAdminName').textContent = user.username;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem('uccAdminToken');
    sessionStorage.removeItem('uccAdminUser');
    window.location.href = 'admin-login.html';
  });
}

/* ── Keyboard ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const cm = $('createModal');
    const dm = $('deleteModal');
    if (cm) cm.style.display = 'none';
    if (dm) dm.style.display = 'none';
  }
});

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  initPage();
  await Promise.all([loadExamsFromApi(), loadBatches()]);
  
  if (document.getElementById('examTableBody')) {
    renderStats();
    renderTable();
  }
});

/* ── Export for other pages ── */
window.EXAM_DEMO        = EXAM_DEMO;
window.calcPositions    = calcPositions;
window.getGrade         = getGrade;
window.downloadExamCSV  = downloadExamCSV;