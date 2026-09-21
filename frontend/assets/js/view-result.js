// view-result.js - Admin view of exam results

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
        ? 'http://localhost:5002/api' 
        : '/api';
    
    let examData = null;
    let resultsData = [];
    let allStudents = [];

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
            const response = await fetch(`${API_BASE_URL}/results/exam/${examId}`);
            const data = await response.json();
            
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
