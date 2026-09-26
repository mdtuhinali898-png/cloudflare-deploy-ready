// view-result.js - Admin view of exam results

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
        ? 'http://localhost:5002/api' 
        : '/api';
    
    let examData = null;
    let resultsData = [];
    let allStudents = [];
    let instituteInfo = {};

    // ============================================
    // 1. GET EXAM ID FROM URL
    // ============================================
    window.getExamId = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('examId');
    };

    // ============================================
    // 2. LOAD DATA
    // ============================================
    async function loadData() {
        const examId = getExamId();
        if (!examId) {
            document.getElementById('loadingSection').innerHTML = 
                '<p style="color:var(--danger)">No exam selected. <a href="exams.html" style="color:var(--primary)">Go to Exams</a></p>';
            return;
        }

        try {
            // Fetch both exam info and results
            const [response, instituteResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/results/exam/${examId}`),
                fetch(`${API_BASE_URL}/institute/public`).catch(() => null)
            ]);
            const data = await response.json();

            if (instituteResponse?.ok) {
                try {
                    const instituteResult = await instituteResponse.json();
                    if (instituteResult.success && instituteResult.data) instituteInfo = instituteResult.data;
                } catch (instituteError) {
                    console.warn('Could not read institute settings for the print header:', instituteError);
                }
            }
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to load results');
            }
            
            examData = data.exam;
            resultsData = data.results || [];
            allStudents = data.students || [];
            
            // Display exam info
            document.getElementById('examTitle').innerText = `${examData.name} - Results`;
            const date = new Date(examData.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
            document.getElementById('examMeta').innerHTML = `
                <strong>${examData.batch}</strong> | ${examData.examType.replace('_', ' ')} | ${date}
                | Subjects: ${examData.subjects.map(s => s.name).join(', ')}
                | Status: <span class="status-badge ${examData.status === 'published' ? 'status-published' : 'status-draft'}">${examData.status.toUpperCase()}</span>
            `;
            
            // Calculate stats
            calculateStats();
            
            // Render results table
            renderResultsTable(resultsData);
            
            // Render leaderboard
            renderLeaderboard();
            
            document.getElementById('loadingSection').style.display = 'none';
            document.getElementById('resultsContent').style.display = 'block';
            
        } catch (error) {
            console.error('Error loading results:', error);
            document.getElementById('loadingSection').innerHTML = `
                <p style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> ${error.message}</p>
                <button class="btn-primary" onclick="location.reload()" style="margin-top:15px;"><i class="fas fa-redo"></i> Retry</button>
            `;
        }
    }

    // ============================================
    // 3. CALCULATE STATS
    // ============================================
    function calculateStats() {
        const total = resultsData.length;
        document.getElementById('statTotalStudents').innerText = total;
        
        if (total === 0) return;
        
        // Average
        const avg = resultsData.reduce((sum, r) => sum + r.percentage, 0) / total;
        document.getElementById('statAverage').innerText = avg.toFixed(1) + '%';
        
        // Highest
        const highest = Math.max(...resultsData.map(r => r.percentage));
        document.getElementById('statHighest').innerText = highest.toFixed(1) + '%';
        
        // Pass rate (grade >= D, i.e. 40%)
        const passCount = resultsData.filter(r => r.percentage >= 40).length;
        const passRate = (passCount / total) * 100;
        document.getElementById('statPassRate').innerText = passRate.toFixed(1) + '%';
    }

    // ============================================
    // 4. RESULTS TABLE
    // ============================================
    function renderResultsTable(results) {
        const tbody = document.getElementById('resultsTableBody');
        
        if (!results || results.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:#888;">
                <i class="fas fa-info-circle"></i> No results entered yet. 
                <a href="mark-entry.html?examId=${getExamId()}" style="color:var(--primary)">Enter marks</a>
            </td></tr>`;
            document.getElementById('resultCount').innerText = '0 students';
            return;
        }
        
        tbody.innerHTML = '';
        
        results.sort((a, b) => (a.position || 999) - (b.position || 999));
        
        results.forEach(r => {
            const rankClass = r.position === 1 ? 'gold' : r.position === 2 ? 'silver' : r.position === 3 ? 'bronze' : '';
            
            const row = `
                <tr>
                    <td><strong>${r.position || '-'}</strong></td>
                    <td><strong>${r.studentName}</strong></td>
                    <td>${r.roll || '-'}</td>
                    <td>${r.studentId}</td>
                    <td>${r.totalMarks}/${r.totalFullMarks}</td>
                    <td>${r.percentage.toFixed(1)}%</td>
                    <td><span class="${getGradeClass(r.grade)}" style="font-weight:600;">${r.grade}</span></td>
                    <td><small>${r.remarks || '-'}</small></td>
                    <td>
                        <button class="btn-result-view" onclick="viewStudentResult('${r.studentId}')" title="View Result Card">
                            <i class="fas fa-eye"></i>
                            <span>View</span>
                        </button>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
        
        document.getElementById('resultCount').innerText = `${results.length} students`;
    }

    // ============================================
    // 5. LEADERBOARD
    // ============================================
    function renderLeaderboard() {
        const container = document.getElementById('leaderboardContent');
        
        const sorted = [...resultsData].sort((a, b) => (a.position || 999) - (b.position || 999));
        const top10 = sorted.slice(0, 10);
        
        if (top10.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No results to display.</p>';
            return;
        }
        
        let html = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Rank</th><th>Name</th><th>Total</th><th>%</th><th>Grade</th></tr></thead><tbody>';
        
        top10.forEach((r, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            html += `<tr>
                <td><strong>${medal || r.position}</strong></td>
                <td><strong>${r.studentName}</strong> <small style="color:var(--text-light)">(${r.roll || r.studentId})</small></td>
                <td>${r.totalMarks}/${r.totalFullMarks}</td>
                <td>${r.percentage.toFixed(1)}%</td>
                <td><span class="${getGradeClass(r.grade)}" style="font-weight:600;">${r.grade}</span></td>
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    // Print a standalone, branded report without the on-screen controls or leaderboard.
    window.printExamResults = () => {
        if (!examData) return;

        const subjects = Array.isArray(examData.subjects) ? examData.subjects : [];
        const sortedResults = [...resultsData].sort((a, b) => (a.position || 999) - (b.position || 999));
        const recordedCount = sortedResults.length;
        const batchStudentCount = allStudents.length;
        const average = recordedCount
            ? sortedResults.reduce((sum, result) => sum + Number(result.percentage || 0), 0) / recordedCount
            : null;
        const highest = recordedCount
            ? sortedResults.reduce((best, result) => Number(result.percentage || 0) > Number(best.percentage || 0) ? result : best, sortedResults[0])
            : null;
        const passCount = sortedResults.filter(result => Number(result.percentage || 0) >= 40).length;
        const passRate = recordedCount ? (passCount / recordedCount) * 100 : null;
        const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
        const dateText = value => {
            if (!value) return '—';
            const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
            return Number.isNaN(date.getTime()) ? escape(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };
        const subjectGroupWidth = subjects.length ? Math.min(36, 14 + (subjects.length * 4)) : 0;
        const flexibleWidth = 62 - subjectGroupWidth;
        const columnWidths = {
            rank: 5,
            student: flexibleWidth * 0.68,
            roll: 7,
            subject: subjects.length ? subjectGroupWidth / subjects.length : 0,
            total: 11,
            score: 8,
            grade: 7,
            remarks: flexibleWidth * 0.32
        };
        const colGroup = [
            `<col style="width:${columnWidths.rank.toFixed(2)}%">`,
            `<col style="width:${columnWidths.student.toFixed(2)}%">`,
            `<col style="width:${columnWidths.roll.toFixed(2)}%">`,
            ...subjects.map(() => `<col style="width:${columnWidths.subject.toFixed(2)}%">`),
            `<col style="width:${columnWidths.total.toFixed(2)}%">`,
            `<col style="width:${columnWidths.score.toFixed(2)}%">`,
            `<col style="width:${columnWidths.grade.toFixed(2)}%">`,
            `<col style="width:${columnWidths.remarks.toFixed(2)}%">`
        ].join('');
        const subjectHeaders = subjects.map(subject => `<th class="center">${escape(subject.name)}</th>`).join('');
        const resultRows = sortedResults.length ? sortedResults.map(result => {
            const markCells = subjects.map(subject => {
                const mark = (result.subjects || []).find(item => item.subject === subject.name);
                return `<td class="center number">${mark ? escape(mark.mark) : '—'}</td>`;
            }).join('');
            return `<tr>
                <td class="rank center">${escape(result.position || '—')}</td>
                <td class="student"><strong>${escape(result.studentName || '—')}</strong></td>
                <td class="center">${escape(result.roll || '—')}</td>
                ${markCells}
                <td class="center number total">${escape(result.totalMarks)}<small> / ${escape(result.totalFullMarks)}</small></td>
                <td class="center number">${Number(result.percentage || 0).toFixed(1)}%</td>
                <td class="grade">${escape(result.grade || '—')}</td>
                <td>${escape(result.remarks || '—')}</td>
            </tr>`;
        }).join('') : `<tr><td colspan="${7 + subjects.length}" class="empty">No student results have been entered for this exam.</td></tr>`;

        const generatedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const examType = String(examData.examType || '').replaceAll('_', ' ');
        const instituteName = instituteInfo.name || 'Institute Name';
        const instituteDetails = [instituteInfo.address, instituteInfo.phone, instituteInfo.email].filter(Boolean).join(' · ');
        const instituteLogo = instituteInfo.logo
            ? `<img class="brand-logo" src="${escape(instituteInfo.logo)}" alt="${escape(instituteName)} logo">`
            : `<div class="brand-mark">${escape(instituteName.trim().charAt(0).toUpperCase() || 'I')}</div>`;
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(examData.name)} - ${escape(instituteName)}</title>
        <style>
            @page{size:A4 portrait;margin:9mm}
            *{box-sizing:border-box}
            body{margin:0;background:#fff;color:#172033;font:10px/1.45 'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .sheet{width:100%;max-width:192mm;margin:0 auto}
            .brand{display:flex;align-items:center;gap:12px;border-bottom:2px solid #4f46e5;padding:0 0 12px;margin-bottom:12px}
            .brand-mark{width:38px;height:38px;border-radius:11px;background:#4f46e5;color:#fff;display:grid;place-items:center;font-size:19px;font-weight:800;flex:none}
            .brand-logo{width:42px;height:42px;object-fit:contain;flex:none}
            .brand-name{font-size:15px;font-weight:800;letter-spacing:.01em;color:#1e293b;overflow-wrap:anywhere}
            .brand-caption{font-size:8px;color:#64748b;margin-top:2px;overflow-wrap:anywhere}
            .report-title{margin-left:auto;text-align:right}
            .report-title h1{font-size:15px;line-height:1.2;margin:0;color:#172554;letter-spacing:.035em}
            .report-title p{margin:4px 0 0;color:#64748b;font-size:8px;text-transform:capitalize}
            .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 12px}
            .meta-item{border:1px solid #e2e8f0;border-radius:7px;padding:7px 9px;min-width:0}
            .meta-item small{display:block;color:#64748b;font-size:8px;text-transform:uppercase;font-weight:700;letter-spacing:.05em;margin-bottom:2px}
            .meta-item strong{display:block;color:#1e293b;font-size:10px;overflow-wrap:anywhere}
            .kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
            .kpi{border:1px solid #dbe4f0;border-radius:8px;padding:8px 10px;background:#f8faff;break-inside:avoid}
            .kpi small{display:block;color:#64748b;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.055em}
            .kpi strong{display:block;margin-top:3px;color:#172554;font-size:18px;line-height:1.2}
            .kpi span{display:block;color:#64748b;font-size:8px;margin-top:3px}
            .section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 7px}
            .section-title h2{margin:0;font-size:12px;color:#1e293b}
            .section-title span{font-size:8px;color:#64748b}
            table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${subjects.length > 5 ? '7' : '8'}px}
            thead{display:table-header-group}
            th{background:#eaf0ff;color:#273577;text-align:left;padding:6px 3px;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;font-size:7.5px;text-transform:uppercase;letter-spacing:.025em;overflow-wrap:anywhere}
            td{padding:5px 4px;border-bottom:1px solid #e8edf4;vertical-align:middle;overflow-wrap:anywhere}
            tbody tr:nth-child(even){background:#fafbfe}
            .rank{font-weight:800;color:#4338ca}
            .center{text-align:center}
            .number{white-space:nowrap;font-variant-numeric:tabular-nums}
            .total{font-weight:700}.total small{font-size:7px;color:#64748b;font-weight:400}
            .grade{font-weight:800;color:#312e81}
            .empty{text-align:center;color:#64748b;padding:24px}
            .signatures{display:flex;justify-content:space-between;gap:48px;margin:28px 4px 0;break-inside:avoid}
            .signature{width:180px;border-top:1px solid #64748b;padding-top:5px;text-align:center;color:#475569;font-size:8px}
            footer{display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:7px;margin-top:12px;color:#64748b;font-size:8px}
            @media print{tr{break-inside:avoid} .kpi,.meta-item{background:#f8faff!important}}
        </style></head><body><main class="sheet">
            <header class="brand">${instituteLogo}<div style="min-width:0;"><div class="brand-name">${escape(instituteName)}</div><div class="brand-caption">${escape(instituteDetails)}</div></div>
                <div class="report-title"><h1>EXAM RESULT REPORT</h1><p>${escape(examType)}${examData.status ? ` · ${escape(examData.status)}` : ''}</p></div>
            </header>
            <section class="meta">
                <div class="meta-item"><small>Exam</small><strong>${escape(examData.name || '—')}</strong></div>
                <div class="meta-item"><small>Batch</small><strong>${escape(examData.batch || '—')}</strong></div>
                <div class="meta-item"><small>Exam date</small><strong>${dateText(examData.date)}</strong></div>
                <div class="meta-item"><small>Subjects</small><strong>${subjects.length ? subjects.map(subject => escape(subject.name)).join(' · ') : '—'}</strong></div>
            </section>
            <section class="kpis">
                <article class="kpi"><small>Batch Total Students</small><strong>${batchStudentCount}</strong><span>Results recorded for ${recordedCount} student${recordedCount === 1 ? '' : 's'}</span></article>
                <article class="kpi"><small>Batch Average</small><strong>${average === null ? '—' : `${average.toFixed(1)}%`}</strong><span>Based on recorded results</span></article>
                <article class="kpi"><small>Highest Score</small><strong>${highest ? `${Number(highest.percentage || 0).toFixed(1)}%` : '—'}</strong><span>${highest ? `${escape(highest.studentName || 'Student')} · ${escape(highest.totalMarks)}/${escape(highest.totalFullMarks)}` : 'No result recorded'}</span></article>
                <article class="kpi"><small>Pass Rate</small><strong>${passRate === null ? '—' : `${passRate.toFixed(1)}%`}</strong><span>${passCount} passed · pass mark 40%</span></article>
            </section>
            <section><div class="section-title"><h2>Student Results</h2><span>${recordedCount} result${recordedCount === 1 ? '' : 's'}</span></div>
                <table><colgroup>${colGroup}</colgroup><thead><tr><th class="center">Rank</th><th>Student</th><th class="center">Roll</th>${subjectHeaders}<th class="center">Total</th><th class="center">Score</th><th class="center">Grade</th><th>Remarks</th></tr></thead><tbody>${resultRows}</tbody></table>
            </section>
            <section class="signatures"><div class="signature">Prepared by</div><div class="signature">Verified by</div><div class="signature">Authorized signature</div></section>
            <footer><span>${escape(instituteName)} · Exam Result Report</span><span>Printed ${escape(generatedAt)}</span></footer>
        </main></body></html>`;

        let frame = document.getElementById('examResultsPrintFrame');
        if (frame) frame.remove();
        frame = document.createElement('iframe');
        frame.id = 'examResultsPrintFrame';
        frame.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(frame);
        const printWindow = frame.contentWindow;
        const printDocument = printWindow.document;
        printDocument.open();
        printDocument.write(html);
        printDocument.close();

        let triggered = false;
        const triggerPrint = () => {
            if (triggered) return;
            triggered = true;
            printWindow.focus();
            printWindow.print();
        };
        frame.onload = () => setTimeout(triggerPrint, 200);
        setTimeout(() => {
            if (frame?.contentDocument?.readyState === 'complete') triggerPrint();
        }, 450);
        printWindow.addEventListener('afterprint', () => frame?.remove(), { once: true });
    };

    function getGradeClass(grade) {
        const map = {
            'A+': 'grade-aplus', 'A': 'grade-a', 'A-': 'grade-aminus',
            'B': 'grade-b', 'C': 'grade-c', 'D': 'grade-d', 'F': 'grade-f'
        };
        return map[grade] || '';
    }

    // ============================================
    // 6. SEARCH / FILTER
    // ============================================
    document.getElementById('resultSearch').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        
        if (!q) {
            renderResultsTable(resultsData);
            return;
        }
        
        const filtered = resultsData.filter(r => 
            r.studentName.toLowerCase().includes(q) ||
            r.studentId.toLowerCase().includes(q) ||
            (r.roll && r.roll.toLowerCase().includes(q))
        );
        
        renderResultsTable(filtered);
    });

    // ============================================
    // 7. VIEW STUDENT RESULT (open public view)
    // ============================================
    window.viewStudentResult = (studentId) => {
        const width = 800;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        window.open(
            `result-card.html?examId=${getExamId()}&studentId=${studentId}`,
            'resultPopup',
            `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
        );
    };

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

    // ============================================
    // 8. INIT
    // ============================================
    loadData();

});
