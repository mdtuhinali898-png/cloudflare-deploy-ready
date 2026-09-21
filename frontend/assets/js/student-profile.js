// assets/js/student-profile.js

document.addEventListener('DOMContentLoaded', async () => {
    
// ============================================
// 1. CONFIG & STATE
// ============================================
const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? `${window.location.protocol}//${window.location.hostname}:${window.location.port || '5002'}/api`
    : 'http://localhost:5002/api';

const STUDENTS_KEY = 'erp_students_data';
const PAYMENTS_KEY = 'erp_payments_data';
    
let studentsData = [];
let paymentsData = [];
let currentStudent = null;
let studentPayments = [];
let studentResults = [];      // published results for this student
let comparisonData = [];      // batch average comparison data
let performanceChartInst = null; // chart.js instance ref (for destroy on re-render)

// ============================================
// 2. DATA LOADING FROM DATABASE
// ============================================

// Loading overlay helpers
function showLoading() {
    const overlay = document.getElementById('profileLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('profileLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showContent() {
    ['profileMainContent', 'profileStatsSection', 'profileTabBar',
     'sectionInfo', 'sectionPayments', 'sectionAcademics'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.visibility = 'visible';
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s ease';
            requestAnimationFrame(() => { el.style.opacity = '1'; });
        }
    });
}

// Targeted load: fetch only THIS student + their payments + results in parallel
async function loadStudentData(studentId) {
    try {
        const [studentRes, paymentsRes, resultsRes, comparisonRes] = await Promise.all([
            fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}`),
            fetch(`${API_BASE_URL}/payments?studentId=${encodeURIComponent(studentId)}&limit=500`),
            fetch(`${API_BASE_URL}/results/student/${encodeURIComponent(studentId)}`),
            fetch(`${API_BASE_URL}/results/student/${encodeURIComponent(studentId)}/comparison`)
        ]);

        const studentJson  = await studentRes.json();
        const paymentsJson = await paymentsRes.json();
        const resultsJson  = await resultsRes.json();
        const compJson     = await comparisonRes.json();

        const student = studentJson.success ? studentJson.student : null;
        paymentsData   = paymentsJson.payments   || [];
        studentResults = resultsJson.success  ? (resultsJson.data || [])       : [];
        comparisonData = compJson.success     ? (compJson.comparison || [])    : [];

        return student;
    } catch (error) {
        console.error('Error loading student data:', error);
        return null;
    }
}

// Fallback bulk load (used when no ?id= in URL — dev/test mode only)
async function loadData() {
    try {
        const [studentsRes, paymentsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/students?limit=1000`),
            fetch(`${API_BASE_URL}/payments?limit=1000`)
        ]);
        const studentsJson = await studentsRes.json();
        const paymentsJson = await paymentsRes.json();
        studentsData = studentsJson.students || [];
        paymentsData = paymentsJson.payments || [];
    } catch (error) {
        console.error('Error loading data from database API:', error);
        studentsData = JSON.parse(localStorage.getItem(STUDENTS_KEY)) || [];
        paymentsData = JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || [];
    }
}

    // ============================================
    // 3. GET STUDENT ID FROM URL
    // ============================================
    function getStudentIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    // ============================================
    // 4. FIND STUDENT DATA
    // ============================================
    function findStudent(studentId) {
            if (!studentId) return undefined;
            const normalized = String(studentId).toLowerCase();
            return studentsData.find(s =>
                String(s.studentId || '').toLowerCase() === normalized ||
                String(s._id || '').toLowerCase() === normalized ||
                String(s.id || '').toLowerCase() === normalized
            );
        }

    // ============================================
    // 5. POPULATE PROFILE
    // ============================================
    function populateProfile(student) {
        if (!student) {
            alert('Student not found!');
            window.location.href = 'students.html';
            return;
        }

        currentStudent = student;

        // Header Info
        const profilePhotoEl = document.getElementById('profilePhoto');
        const photoContainer = document.getElementById('profilePhotoContainer');
        const profileCover = document.querySelector('.profile-cover');
        const avatarFallback = document.getElementById('avatarFallback');
        const avatarInitial = document.getElementById('avatarInitial');
        
        if (student.photo) {
            profilePhotoEl.src = student.photo;
            profilePhotoEl.style.display = 'block';
            if (photoContainer) {
                photoContainer.style.display = 'block';
                photoContainer.classList.add('visible');
                photoContainer.classList.remove('hidden');
            }
            if (avatarFallback) {
                avatarFallback.style.display = 'none';
            }
        } else {
            profilePhotoEl.style.display = 'none';
            if (photoContainer) {
                photoContainer.style.display = 'none';
                photoContainer.classList.remove('visible');
                photoContainer.classList.add('hidden');
            }
            if (avatarFallback) {
                avatarFallback.style.display = 'flex';
                if (avatarInitial) {
                    avatarInitial.innerText = (student.name || 'S').trim().charAt(0).toUpperCase();
                }
            }
        }
        if (profileCover) {
            profileCover.style.display = 'block';
            profileCover.classList.add('visible');
        }
        document.getElementById('profileName').innerText = student.name || '--';
        document.getElementById('profileId').innerText = student.studentId;
        document.getElementById('profileBatch').innerText = student.batch || '--';
        document.getElementById('profilePhone').innerText = student.phone || '--';
        document.getElementById('profileAdmission').innerText = student.admissionDate 
            ? formatDate(student.admissionDate) 
            : '--';
        
        // Status Badge
        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            statusBadge.innerHTML = `<i class="fas fa-circle status-dot"></i> ${student.status || 'Active'}`;
            statusBadge.className = `status-indicator status-${(student.status || 'active').toLowerCase()}`;
            statusBadge.style.display = '';
        }

        // Personal Info
        document.getElementById('fatherName').innerText = student.guardianName || '--';
        document.getElementById('motherName').innerText = student.motherName || '--';
        document.getElementById('dob').innerText = student.dob ? formatDate(student.dob) : '--';
        document.getElementById('gender').innerText = student.gender || '--';
        document.getElementById('address').innerText = student.address || '--';
        document.getElementById('guardian').innerText = student.guardianName 
            ? `${student.guardianName} (${student.guardianPhone || 'N/A'})` 
            : '--';

        // Academic Info
        document.getElementById('batch').innerText = student.batch || '--';
        document.getElementById('classGroup').innerText = student.group || '--';
        document.getElementById('roll').innerText = student.roll || '--';
        document.getElementById('previousSchool').innerText = student.previousSchool || '--';
        document.getElementById('monthlyFee').innerText = '৳' + (student.fee || 0);
        document.getElementById('startMonth').innerText = student.startMonth || '--';

        // Notes
        if (student.notes) {
            document.getElementById('notesCard').style.display = 'block';
            document.getElementById('notesText').innerText = student.notes;
        }
    }

    // ============================================
    // 6. LOAD PAYMENT HISTORY
    // ============================================
    function loadPaymentHistory() {
        if (!currentStudent) return;

        studentPayments = paymentsData.filter(p => p.studentId === currentStudent.studentId);
        
        const tbody = document.getElementById('paymentHistoryBody');
        tbody.innerHTML = '';
        document.getElementById('paymentCount').innerText = `${studentPayments.length} Transactions`;

        if (studentPayments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:36px 20px; color:#94a3b8;"><i class="fas fa-receipt" style="font-size:28px; color:#cbd5e1; margin-bottom:8px; display:block;"></i>No payment history found for this student.</td></tr>`;
            return;
        }

        studentPayments.forEach(p => {
            const statusClass = p.status === 'Paid' ? 'status-paid' : (p.status === 'Partial' ? 'status-partial' : 'status-due');
            const row = `
                <tr>
                    <td><strong>${p.receiptNo}</strong></td>
                    <td>${p.month}</td>
                    <td>৳${p.amount}</td>
                    <td>${p.paymentMethod}</td>
                    <td><span class="status-badge ${statusClass}">${p.status}</span></td>
                    <td><a href="receipt.html?receipt=${p.receiptNo}" class="btn-view-sm"><i class="fas fa-eye"></i> View</a></td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    }

    // ============================================
    // 7. UPDATE STATS
    // ============================================
    function updateStats() {
        if (!currentStudent) return;

        const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalDue = studentPayments.reduce((sum, p) => {
            const expected = (p.fee || 0) - (p.discount || 0) + (p.fine || 0);
            return sum + Math.max(0, expected - (p.amount || 0));
        }, 0);
        
        const lastPayment = studentPayments.length > 0 
            ? formatDate(studentPayments[0].date || studentPayments[0].createdAt) 
            : '--';

        document.getElementById('totalPaid').innerText = '৳' + totalPaid.toLocaleString();
        document.getElementById('totalDue').innerText = '৳' + totalDue.toLocaleString();
        document.getElementById('totalPayments').innerText = studentPayments.length;
        document.getElementById('lastPayment').innerText = lastPayment;
    }

    // ============================================
    // 8. LOAD PAYMENT CHART
    // ============================================
    function loadPaymentChart() {
        if (!currentStudent || studentPayments.length === 0) return;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = new Array(12).fill(0);

        studentPayments.forEach(p => {
            const monthIndex = months.indexOf(p.month.substring(0, 3));
            if (monthIndex !== -1) {
                monthlyData[monthIndex] += p.amount || 0;
            }
        });

        const ctx = document.getElementById('paymentChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Payment (৳)',
                    data: monthlyData,
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 8,
                    hoverBackgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { callback: v => '৳' + v }
                    }
                }
            }
        });
    }

    // ============================================
    // 9. RESULT SECTION HELPERS & RENDER
    // ============================================

    // Map grade string → CSS class
    function gradeClass(grade) {
        const map = { 'A+': 'grade-aplus', 'A': 'grade-a', 'A-': 'grade-aminus',
                      'B': 'grade-b', 'C': 'grade-c', 'D': 'grade-d', 'F': 'grade-f' };
        return map[grade] || 'grade-d';
    }

    // Map examType → CSS class + label
    function examTypeMeta(type) {
        const map = {
            weekly:     { cls: 'exam-type-weekly',     label: 'Weekly'     },
            monthly:    { cls: 'exam-type-monthly',    label: 'Monthly'    },
            model_test: { cls: 'exam-type-model_test', label: 'Model Test' },
            midterm:    { cls: 'exam-type-midterm',    label: 'Midterm'    },
            final:      { cls: 'exam-type-final',      label: 'Final'      },
            other:      { cls: 'exam-type-other',      label: 'Other'      }
        };
        return map[type] || map['other'];
    }

    // Ordinal suffix: 1 → "1st", 2 → "2nd" …
    function ordinal(n) {
        if (!n || n === 0) return '--';
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    // Best grade from results array (A+ > A > A- > B > C > D > F)
    function bestGrade(results) {
        const order = ['A+','A','A-','B','C','D','F'];
        let best = null;
        results.forEach(r => {
            if (!best) { best = r.grade; return; }
            if (order.indexOf(r.grade) < order.indexOf(best)) best = r.grade;
        });
        return best || '--';
    }

    // ---- Render result summary KPI cards ----
    function renderResultSummaryCards() {
        const wrap = document.getElementById('resultSummaryCards');
        if (!wrap) return;
        if (studentResults.length === 0) { wrap.style.display = 'none'; return; }

        const avg = studentResults.reduce((s, r) => s + (r.percentage || 0), 0) / studentResults.length;
        document.getElementById('resultTotalExams').innerText = studentResults.length;
        document.getElementById('resultBestGrade').innerText  = bestGrade(studentResults);
        document.getElementById('resultAvgPct').innerText     = avg.toFixed(1) + '%';
        wrap.style.display = 'grid';
    }

    // ---- Render result history table ----
    function renderResultTable() {
        const countEl    = document.getElementById('resultCount');
        const emptyState = document.getElementById('resultEmptyState');
        const tableWrap  = document.getElementById('resultTableWrap');
        const tbody      = document.getElementById('resultTableBody');
        if (!tbody) return;

        countEl.innerText = `${studentResults.length} Exam${studentResults.length !== 1 ? 's' : ''}`;

        if (studentResults.length === 0) {
            emptyState.style.display  = 'flex';
            tableWrap.style.display   = 'none';
            return;
        }

        emptyState.style.display = 'none';
        tableWrap.style.display  = 'block';
        tbody.innerHTML = '';

        // Sort by exam date ascending so newest is at top
        const sorted = [...studentResults].sort((a, b) => {
            const da = new Date(a.examId?.date || a.createdAt || 0);
            const db = new Date(b.examId?.date || b.createdAt || 0);
            return db - da;
        });

        sorted.forEach(r => {
            const exam    = r.examId || {};
            const typeMeta = examTypeMeta(exam.examType || 'other');
            const posClass = r.position <= 3 ? `pos-${r.position}` : '';
            const posIcon  = r.position === 1 ? '🥇' : r.position === 2 ? '🥈' : r.position === 3 ? '🥉' : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis;">
                    <strong title="${exam.name || '--'}">${exam.name || '--'}</strong>
                </td>
                <td>
                    <span class="exam-type-badge ${typeMeta.cls}">${typeMeta.label}</span>
                </td>
                <td>${exam.date ? formatDate(exam.date) : '--'}</td>
                <td>
                    <div class="score-cell">${r.totalMarks}/${r.totalFullMarks}</div>
                    <div class="score-pct">${r.percentage}%</div>
                </td>
                <td><span class="grade-badge ${gradeClass(r.grade)}">${r.grade}</span></td>
                <td>
                    <span class="position-badge ${posClass}">
                        ${posIcon} ${ordinal(r.position)}
                    </span>
                </td>
                <td>
                    <button class="btn-view-sm" onclick="openSubjectDetail('${r._id}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // ---- Render performance trend chart ----
    function renderPerformanceChart() {
        const card = document.getElementById('resultChartCard');
        if (!card) return;

        // Need at least 2 data points for a meaningful line chart
        if (studentResults.length < 1) { card.style.display = 'none'; return; }
        card.style.display = 'block';

        // Sort chronologically
        const sorted = [...studentResults].sort((a, b) =>
            new Date(a.examId?.date || a.createdAt || 0) - new Date(b.examId?.date || b.createdAt || 0)
        );

        const labels      = sorted.map(r => r.examId?.name || 'Exam');
        const studentPcts = sorted.map(r => r.percentage || 0);

        // Build batch avg array from comparisonData (keyed by examId)
        const compMap = {};
        comparisonData.forEach(c => {
            const key = c.examId?._id || c.examId;
            if (key) compMap[String(key)] = c.batchAverage || 0;
        });
        const batchAvgs = sorted.map(r => {
            const key = r.examId?._id || r.examId;
            return key ? (compMap[String(key)] || null) : null;
        });
        const hasBatchData = batchAvgs.some(v => v !== null && v > 0);

        // Legend
        const legendEl = document.getElementById('resultChartLegend');
        if (legendEl) {
            legendEl.innerHTML = `
                <span><span class="legend-dot legend-student"></span> My Score</span>
                ${hasBatchData ? '<span><span class="legend-dot legend-batch"></span> Batch Avg</span>' : ''}
            `;
        }

        // Destroy old chart if it exists
        if (performanceChartInst) { performanceChartInst.destroy(); performanceChartInst = null; }

        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;

        const datasets = [
            {
                label: 'My Score (%)',
                data: studentPcts,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.10)',
                borderWidth: 2.5,
                pointBackgroundColor: '#6366f1',
                pointRadius: 5,
                pointHoverRadius: 7,
                tension: 0.35,
                fill: true
            }
        ];

        if (hasBatchData) {
            datasets.push({
                label: 'Batch Avg (%)',
                data: batchAvgs,
                borderColor: '#94a3b8',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [6, 4],
                pointBackgroundColor: '#94a3b8',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.35,
                fill: false
            });
        }

        performanceChartInst = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 0,
                        max: 100,
                        ticks: { callback: v => v + '%', stepSize: 20 },
                        grid: { color: '#f1f5f9' }
                    },
                    x: {
                        ticks: {
                            maxRotation: 30,
                            font: { size: 11 },
                            callback: function(val, idx) {
                                const lbl = labels[idx] || '';
                                return lbl.length > 14 ? lbl.substring(0, 13) + '…' : lbl;
                            }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // ---- Open subject detail modal ----
    window.openSubjectDetail = (resultId) => {
        const result = studentResults.find(r => r._id === resultId);
        if (!result) return;

        const exam = result.examId || {};
        const typeMeta = examTypeMeta(exam.examType || 'other');

        document.getElementById('subjectDetailExamName').innerText = exam.name || 'Exam Detail';
        document.getElementById('subjectDetailMeta').innerHTML =
            `<span class="exam-type-badge ${typeMeta.cls}" style="font-size:10px;">${typeMeta.label}</span>
             ${exam.date ? formatDate(exam.date) : ''}
             &nbsp;·&nbsp; Grade: <span class="grade-badge ${gradeClass(result.grade)}" style="font-size:10px;">${result.grade}</span>
             &nbsp;·&nbsp; Position: ${ordinal(result.position)}`;

        const tbody = document.getElementById('subjectDetailBody');
        const tfoot = document.getElementById('subjectDetailFoot');
        tbody.innerHTML = '';
        tfoot.innerHTML = '';

        (result.subjects || []).forEach(sub => {
            const pct = sub.fullMark > 0 ? Math.round((sub.mark / sub.fullMark) * 100) : 0;
            const fillColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 40 ? '#f59e0b' : '#e11d48';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${sub.subject}</td>
                <td>${sub.mark}</td>
                <td>${sub.fullMark}</td>
                <td>
                    <div class="subject-pct-bar">
                        <span class="pct-num">${pct}%</span>
                        <div class="pct-track">
                            <div class="pct-fill" style="width:${pct}%; background:${fillColor};"></div>
                        </div>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const totalPct = result.totalFullMarks > 0
            ? Math.round((result.totalMarks / result.totalFullMarks) * 100)
            : 0;
        tfoot.innerHTML = `
            <tr>
                <td><strong>Total</strong></td>
                <td><strong>${result.totalMarks}</strong></td>
                <td><strong>${result.totalFullMarks}</strong></td>
                <td><strong>${totalPct}%</strong></td>
            </tr>
        `;

        const modal = document.getElementById('subjectDetailModal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeSubjectDetail = () => {
        const modal = document.getElementById('subjectDetailModal');
        if (modal) modal.style.display = 'none';
    };

    // Close subject detail on backdrop click
    const subjectModal = document.getElementById('subjectDetailModal');
    if (subjectModal) {
        subjectModal.addEventListener('click', e => {
            if (e.target === subjectModal) closeSubjectDetail();
        });
    }

    // ---- Master render for entire result section ----
    function renderResultSection() {
        renderResultSummaryCards();
        renderResultTable();
        renderPerformanceChart();
    }

    // ============================================
    // 10. HELPER FUNCTIONS
    // ============================================
    function formatDate(dateString) {
        if (!dateString) return '--';
        const date = new Date(dateString);
        const options = { day: '2-digit', month: 'short', year: 'numeric' };
        return date.toLocaleDateString('en-GB', options);
    }

    // ============================================
    // 11. ACTION HANDLERS & EDIT MODAL
    // ============================================
    window.closeEditModal = () => {
        const modal = document.getElementById('editStudentModal');
        if (modal) modal.style.display = 'none';
    };

    window.editStudent = async () => {
        if (!currentStudent) return alert('No student loaded');

        // Populate modal fields with existing student data
        document.getElementById('editName').value = currentStudent.name || '';
        document.getElementById('editPhone').value = currentStudent.phone || '';
        document.getElementById('editGuardianName').value = currentStudent.guardianName || '';
        document.getElementById('editGuardianPhone').value = currentStudent.guardianPhone || '';
        document.getElementById('editMotherName').value = currentStudent.motherName || '';
        document.getElementById('editDob').value = currentStudent.dob ? new Date(currentStudent.dob).toISOString().split('T')[0] : '';
        document.getElementById('editGender').value = currentStudent.gender || 'Male';
        document.getElementById('editAddress').value = currentStudent.address || '';
        document.getElementById('editRoll').value = currentStudent.roll || '';
        document.getElementById('editGroup').value = currentStudent.group || '';
        document.getElementById('editPreviousSchool').value = currentStudent.previousSchool || '';
        document.getElementById('editFee').value = currentStudent.fee || 0;
        document.getElementById('editAdmissionFee').value = currentStudent.admissionFee || 0;
        document.getElementById('editStartMonth').value = currentStudent.startMonth || 'July';
        document.getElementById('editStatus').value = currentStudent.status || 'Active';
        document.getElementById('editReference').value = currentStudent.reference || '';
        document.getElementById('editNotes').value = currentStudent.notes || '';

        // Populate batches dropdown
        const batchSelect = document.getElementById('editBatch');
        batchSelect.innerHTML = '<option value="">Loading batches...</option>';
        try {
            const res = await fetch(`${API_BASE_URL}/batches`);
            const data = await res.json();
            const batches = (data.data || []).filter(b => !b.status || b.status === 'Active');
            
            batchSelect.innerHTML = '';
            // Ensure current batch is present as option even if inactive
            const batchNames = new Set(batches.map(b => b.name));
            if (currentStudent.batch && !batchNames.has(currentStudent.batch)) {
                batchNames.add(currentStudent.batch);
            }
            
            Array.from(batchNames).forEach(bName => {
                const opt = document.createElement('option');
                opt.value = bName;
                opt.textContent = bName;
                if (bName === currentStudent.batch) opt.selected = true;
                batchSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Error fetching batches for edit:', e);
            batchSelect.innerHTML = `<option value="${currentStudent.batch || ''}" selected>${currentStudent.batch || 'Select Batch'}</option>`;
        }

        document.getElementById('editStudentModal').style.display = 'flex';
    };

    window.saveStudentEdit = async (event) => {
        event.preventDefault();
        if (!currentStudent) return;

        const updatedData = {
            name: document.getElementById('editName').value.trim(),
            phone: document.getElementById('editPhone').value.trim(),
            guardianName: document.getElementById('editGuardianName').value.trim(),
            guardianPhone: document.getElementById('editGuardianPhone').value.trim(),
            motherName: document.getElementById('editMotherName').value.trim(),
            dob: document.getElementById('editDob').value || null,
            gender: document.getElementById('editGender').value,
            address: document.getElementById('editAddress').value.trim(),
            roll: document.getElementById('editRoll').value.trim(),
            batch: document.getElementById('editBatch').value,
            group: document.getElementById('editGroup').value.trim(),
            previousSchool: document.getElementById('editPreviousSchool').value.trim(),
            fee: Number(document.getElementById('editFee').value || 0),
            admissionFee: Number(document.getElementById('editAdmissionFee').value || 0),
            startMonth: document.getElementById('editStartMonth').value,
            status: document.getElementById('editStatus').value,
            reference: document.getElementById('editReference').value.trim(),
            notes: document.getElementById('editNotes').value.trim()
        };

        const saveBtn = event.target.querySelector('button[type="submit"]');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const sid = currentStudent.studentId || currentStudent._id;
            const res = await fetch(`${API_BASE_URL}/students/${sid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Failed to update student profile');
            }

            // Update local object & refresh profile view immediately
            currentStudent = data.student || { ...currentStudent, ...updatedData };
            populateProfile(currentStudent);
            updateStats();

            closeEditModal();
            alert('Student information updated successfully!');
        } catch (error) {
            console.error('Error saving student profile:', error);
            alert(error.message || 'Error saving student profile');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    };

    window.goToPayment = () => {
        if (currentStudent) {
            const idParam = currentStudent.studentId || currentStudent.id || currentStudent._id || '';
            window.location.href = `payments.html?student=${encodeURIComponent(idParam)}`;
        }
    };

    window.printProfile = () => {
        window.print();
    };

    // ============================================
    // 12. SIDEBAR TOGGLE
    // ============================================
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

    // ============================================
    // 13. STICKY TAB BAR — scroll highlight + click
    // ============================================
    function initTabBar() {
        const tabs = document.querySelectorAll('.profile-tab');
        const sections = [
            document.getElementById('sectionInfo'),
            document.getElementById('sectionPayments'),
            document.getElementById('sectionAcademics')
        ].filter(Boolean);

        if (!tabs.length || !sections.length) return;

        const tabBar    = document.getElementById('profileTabBar');
        const topHeader = document.querySelector('.top-header');

        // ---- Dynamically set tab bar's sticky top ----
        // top-header is sticky at top:16px, so tab bar must stick just below it
        function updateTabBarTop() {
            if (!tabBar) return;
            const headerH = topHeader ? topHeader.offsetHeight : 0;
            tabBar.style.top = (headerH + 16) + 'px';
        }
        updateTabBarTop();
        window.addEventListener('resize', updateTabBarTop);

        // ---- Total offset for scroll calculations ----
        function getStickyOffset() {
            const tabH    = tabBar    ? tabBar.offsetHeight    : 0;
            const headerH = topHeader ? topHeader.offsetHeight : 0;
            return tabH + headerH + 16 + 16; // top-header top:16 + tabBar height + 16 buffer
        }

        // ---- Click: smooth scroll to section ----
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = document.getElementById(tab.dataset.target);
                if (!target) return;

                const offset = getStickyOffset();
                const top    = target.getBoundingClientRect().top + window.scrollY - offset;

                // set active immediately on click
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                window.scrollTo({ top, behavior: 'smooth' });
            });
        });

        // ---- Scroll event: highlight tab based on section position ----
        function onScroll() {
            const offset = getStickyOffset() + 8;

            // Walk sections from bottom to top — first one whose top ≤ scrollY+offset wins
            let activeId = sections[0].id; // default to first
            sections.forEach(sec => {
                const rect = sec.getBoundingClientRect();
                // section top is at or above the trigger line
                if (rect.top <= offset) {
                    activeId = sec.id;
                }
            });

            tabs.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.target === activeId);
            });
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        // run once on init to set correct state
        onScroll();
    }

    // ============================================
    // 14. INITIALIZE
    // ============================================
    showLoading();

    const studentId = getStudentIdFromURL();
    const shouldOpenEditModal = new URLSearchParams(window.location.search).get('edit') === '1';
    if (studentId) {
        // Targeted fast path: fetch only this student + their payments in parallel
        const student = await loadStudentData(studentId);
        if (student) {
            populateProfile(student);
            loadPaymentHistory();
            updateStats();
            hideLoading();
            showContent();
            loadPaymentChart();
            renderResultSection();
            initTabBar();
            if (shouldOpenEditModal) window.editStudent();
        } else {
            hideLoading();
            alert('Student not found!');
            window.location.href = 'students.html';
        }
    } else {
        // No ?id= — fallback bulk load (dev/test mode)
        await loadData();
        if (studentsData.length > 0) {
            const student = studentsData[0];
            populateProfile(student);
            loadPaymentHistory();
            updateStats();
            hideLoading();
            showContent();
            loadPaymentChart();
            renderResultSection();
            initTabBar();
        } else {
            hideLoading();
            alert('No student data found!');
            window.location.href = 'students.html';
        }
    }

    // Close modal on backdrop click
    const editModal = document.getElementById('editStudentModal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });
    }

});
