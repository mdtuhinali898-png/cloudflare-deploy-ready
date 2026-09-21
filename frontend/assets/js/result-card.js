// result-card.js - Student Result Card (popup/admin view)

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
        ? 'http://localhost:5002/api' 
        : '/api';

    const params = new URLSearchParams(window.location.search);
    const examId = params.get('examId');
    const studentId = params.get('studentId');

    if (!examId || !studentId) {
        document.getElementById('loadingSection').innerHTML = '<p style="color:var(--danger)">Missing parameters</p>';
        return;
    }

    async function loadData() {
        try {
            // Get exam results for this student AND the specific exam result
            const [examRes, studentRes] = await Promise.all([
                fetch(`${API_BASE_URL}/results/exam/${examId}`),
                fetch(`${API_BASE_URL}/results/student/${studentId}`)
            ]);
            
            const examData = await examRes.json();
            const studentData = await studentRes.json();
            
            if (!examData.success) {
                throw new Error('Failed to load exam data');
            }
            
            const exam = examData.exam;
            const allResults = examData.results || [];
            const currentResult = allResults.find(r => r.studentId === studentId);
            
            if (!currentResult) {
                throw new Error('Result not found for this student');
            }
            
            // Get student info
            const student = examData.students.find(s => s.studentId === studentId) || {};
            
            // Render the card
            renderCard(exam, currentResult, student, allResults, studentData.data || []);
            
            document.getElementById('loadingSection').style.display = 'none';
            document.getElementById('resultContent').style.display = 'block';
            
        } catch (error) {
            console.error('Error:', error);
            document.getElementById('loadingSection').innerHTML = 
                `<p style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> ${error.message}</p>`;
        }
    }

    function renderCard(exam, result, student, allResults, studentHistory) {
        const examDate = new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const examTypeLabel = exam.examType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        const statusCls = exam.status === 'published' ? 'rc-status-published' : 'rc-status-draft';

        // ── Header ──
        document.getElementById('cardHeader').innerHTML = `
            <div class="rc-header">
                <div class="rc-header-top">
                    <div class="rc-header-icon"><i class="fas fa-graduation-cap"></i></div>
                    <div class="rc-header-info">
                        <div class="rc-header-institute">EduSmart — Result Card</div>
                        <div class="rc-header-title">${exam.name}</div>
                        <div class="rc-header-meta">
                            <span class="rc-meta-pill"><i class="fas fa-layer-group"></i>${exam.batch}</span>
                            <span class="rc-meta-pill"><i class="fas fa-tag"></i>${examTypeLabel}</span>
                            <span class="rc-meta-pill"><i class="fas fa-calendar-alt"></i>${examDate}</span>
                            <span class="rc-status-pill ${statusCls}">${exam.status.toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // ── Student Bar ──
        const initials = result.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const avatarHtml = student.photo
            ? `<img src="${student.photo}" alt="${result.studentName}">`
            : initials;
        document.getElementById('studentInfoBar').innerHTML = `
            <div class="rc-student-bar">
                <div class="rc-avatar">${avatarHtml}</div>
                <div class="rc-student-info">
                    <h3>${result.studentName}</h3>
                    <div class="rc-student-meta">
                        <span class="rc-student-tag"><i class="fas fa-id-card"></i> ID: ${result.studentId}</span>
                        ${result.roll ? `<span class="rc-student-tag"><i class="fas fa-list-ol"></i> Roll: ${result.roll}</span>` : ''}
                        <span class="rc-student-tag"><i class="fas fa-users"></i> ${exam.batch}</span>
                    </div>
                </div>
            </div>
        `;

        // ── Summary Grid ──
        const pctColor = result.percentage >= 40 ? 'rc-sc-green' : 'rc-sc-danger';
        document.getElementById('summaryGrid').innerHTML = `
            <div class="rc-summary">
                <div class="rc-section-label">Performance Summary</div>
                <div class="rc-summary-grid">
                    <div class="rc-summary-card rc-sc-blue">
                        <div class="sc-icon"><i class="fas fa-pencil-alt"></i></div>
                        <div class="sc-label">Total Marks</div>
                        <div class="sc-value">${result.totalMarks}<span style="font-size:13px;font-weight:500;color:#94a3b8;">/${result.totalFullMarks}</span></div>
                    </div>
                    <div class="rc-summary-card ${result.percentage >= 40 ? 'rc-sc-green' : 'rc-sc-status'}">
                        <div class="sc-icon"><i class="fas fa-percent"></i></div>
                        <div class="sc-label">Percentage</div>
                        <div class="sc-value">${result.percentage.toFixed(1)}%</div>
                    </div>
                    <div class="rc-summary-card rc-sc-gold">
                        <div class="sc-icon"><i class="fas fa-award"></i></div>
                        <div class="sc-label">Grade</div>
                        <div class="sc-value">${result.grade}</div>
                    </div>
                    <div class="rc-summary-card rc-sc-purple">
                        <div class="sc-icon"><i class="fas fa-star"></i></div>
                        <div class="sc-label">Grade Point</div>
                        <div class="sc-value">${result.gradePoint.toFixed(2)}</div>
                    </div>
                    <div class="rc-summary-card rc-sc-cyan">
                        <div class="sc-icon"><i class="fas fa-trophy"></i></div>
                        <div class="sc-label">Position</div>
                        <div class="sc-value">${result.position || '—'}<span style="font-size:13px;font-weight:500;color:#94a3b8;"> / ${allResults.length}</span></div>
                    </div>
                    <div class="rc-summary-card rc-sc-status">
                        <div class="sc-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="sc-label">Result Status</div>
                        <div class="sc-value" style="color:${result.percentage >= 40 ? '#059669' : '#e11d48'}">${result.percentage >= 40 ? 'Passed' : 'Failed'}</div>
                    </div>
                </div>
            </div>
        `;

        // ── Subject Breakdown ──
        let subRows = '';
        result.subjects.forEach(sub => {
            const pct = sub.fullMark > 0 ? (sub.mark / sub.fullMark) * 100 : 0;
            const barW = Math.min(pct, 100).toFixed(1);
            let barCls, badgeCls, badgeIcon, badgeLabel;
            if (pct >= 80)      { barCls = 'rc-bar-strong'; badgeCls = 'rc-badge-strong'; badgeIcon = 'fa-circle-check'; badgeLabel = 'Strong'; }
            else if (pct >= 60) { barCls = 'rc-bar-avg';    badgeCls = 'rc-badge-avg';    badgeIcon = 'fa-minus-circle'; badgeLabel = 'Average'; }
            else                { barCls = 'rc-bar-weak';   badgeCls = 'rc-badge-weak';   badgeIcon = 'fa-exclamation-circle'; badgeLabel = 'Weak'; }

            subRows += `
                <tr>
                    <td class="rc-sub-name">${sub.subject}</td>
                    <td><span class="rc-sub-marks" style="color:${pct>=60?'#059669':'#e11d48'}">${sub.mark}</span> <span class="rc-sub-full">/ ${sub.fullMark}</span></td>
                    <td>
                        <div class="rc-bar-wrap">
                            <div class="rc-bar-track"><div class="rc-bar-fill ${barCls}" style="width:${barW}%"></div></div>
                            <span class="rc-bar-pct">${pct.toFixed(0)}%</span>
                        </div>
                    </td>
                    <td style="text-align:center;"><span class="rc-badge ${badgeCls}"><i class="fas ${badgeIcon}"></i>${badgeLabel}</span></td>
                </tr>`;
        });

        document.getElementById('subjectBreakdown').innerHTML = `
            <div class="rc-subjects">
                <div class="rc-section-label">Subject-wise Breakdown</div>
                <table class="rc-subject-table">
                    <thead><tr>
                        <th>Subject</th>
                        <th>Marks</th>
                        <th style="min-width:160px">Performance</th>
                        <th style="text-align:center">Status</th>
                    </tr></thead>
                    <tbody>${subRows}</tbody>
                </table>
            </div>
        `;

        // ── Strength & Weakness ──
        const withPct = result.subjects.map(s => ({ ...s, pct: s.fullMark > 0 ? (s.mark / s.fullMark) * 100 : 0 }));
        const strong = withPct.filter(s => s.pct >= 70);
        const weak   = withPct.filter(s => s.pct < 60);

        if (strong.length > 0 || weak.length > 0) {
            let boxes = '';
            if (strong.length > 0) {
                boxes += `<div class="rc-analysis-box strength">
                    <div class="rc-analysis-title"><i class="fas fa-thumbs-up"></i> Strengths</div>
                    <div class="rc-analysis-tags">
                        ${strong.map(s => `<span class="rc-analysis-tag">${s.subject} (${s.pct.toFixed(0)}%)</span>`).join('')}
                    </div>
                </div>`;
            }
            if (weak.length > 0) {
                boxes += `<div class="rc-analysis-box weakness">
                    <div class="rc-analysis-title"><i class="fas fa-triangle-exclamation"></i> Needs Improvement</div>
                    <div class="rc-analysis-tags">
                        ${weak.map(s => `<span class="rc-analysis-tag">${s.subject} (${s.pct.toFixed(0)}%)</span>`).join('')}
                    </div>
                </div>`;
            }
            document.getElementById('strengthWeakness').innerHTML = `
                <div class="rc-analysis">
                    <div class="rc-section-label">Subject Analysis</div>
                    <div class="rc-analysis-grid">${boxes}</div>
                </div>
            `;
        }

        // ── Remarks ──
        if (result.remarks) {
            document.getElementById('remarksSection').innerHTML = `
                <div class="rc-remarks">
                    <div class="rc-section-label">Teacher's Remarks</div>
                    <div class="rc-remarks-box">${result.remarks}</div>
                </div>
            `;
        }

        // ── Progress Chart ──
        if (studentHistory.length > 1) {
            const sorted = [...studentHistory].sort((a, b) => new Date(a.examId?.date || 0) - new Date(b.examId?.date || 0));
            document.getElementById('progressSection').innerHTML = `
                <div class="rc-progress">
                    <div class="rc-section-label">Progress Over Time</div>
                    <div class="rc-chart-wrap">
                        <canvas id="progressChart" height="220"></canvas>
                    </div>
                </div>
            `;
            setTimeout(() => {
                const ctx = document.getElementById('progressChart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: sorted.map(r => r.examId?.name || 'Unknown'),
                        datasets: [{
                            label: 'Percentage',
                            data: sorted.map(r => r.percentage),
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99,102,241,0.08)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#6366f1',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)}%` }
                            }
                        },
                        scales: {
                            y: {
                                min: 0, max: 100,
                                ticks: { callback: v => v + '%', font: { size: 11 } },
                                grid: { color: '#f1f5f9' }
                            },
                            x: {
                                ticks: { font: { size: 11 } },
                                grid: { display: false }
                            }
                        }
                    }
                });
            }, 100);
        }

        // ── Footer ──
        document.getElementById('cardFooter').innerHTML = `
            <div class="rc-footer">
                <span>Generated by <span class="rc-footer-brand">EduSmart</span></span>
                <span>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
        `;
    }

    loadData();

});