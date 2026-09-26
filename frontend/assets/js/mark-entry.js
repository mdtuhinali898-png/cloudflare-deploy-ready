// mark-entry.js - Spreadsheet-style marks entry

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
        ? 'http://localhost:5002/api' 
        : '/api';
    
    let exam = null;
    let students = [];
    let existingResults = {};
    let hasUnsavedChanges = false;

    // ============================================
    // 1. LOAD EXAM DATA
    // ============================================
    async function loadExamData() {
        const params = new URLSearchParams(window.location.search);
        const examId = params.get('examId');
        
        if (!examId) {
            document.getElementById('examNameDisplay').innerText = 'No exam selected';
            document.getElementById('examMetaDisplay').innerHTML = '<span style="color:var(--danger)">Please select an exam from the exams page.</span>';
            document.getElementById('markEntryLoading').innerHTML = '<p style="color:var(--danger)">No exam ID provided. <a href="exams.html" style="color:var(--primary)">Go to Exams</a></p>';
            return;
        }
        
        try {
            // Fetch exam, students, and existing results in parallel
            const [examRes, resultsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/results/exam/${examId}`),
                fetch(`${API_BASE_URL}/exams/${examId}`)
            ]);
            
            const examData = await examRes.json();
            const examInfoRes = await resultsRes.json();
            
            if (!examData.success) {
                throw new Error(examData.message || 'Failed to load exam');
            }
            
            exam = examData.exam || examInfoRes.data;
            students = examData.students || [];
            existingResults = {};
            
            // Index existing results by studentId
            (examData.results || []).forEach(r => {
                existingResults[r.studentId] = r;
            });
            
            // Display exam info
            document.getElementById('examNameDisplay').innerText = exam.name;
            const date = new Date(exam.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
            document.getElementById('examMetaDisplay').innerHTML = `
                <strong>${exam.batch}</strong> | ${exam.examType.replace('_', ' ')} | ${date}
                | Subjects: ${exam.subjects.map(s => s.name).join(', ')}
                | Status: <span class="status-badge ${exam.status === 'published' ? 'status-published' : 'status-draft'}">${exam.status}</span>
            `;
            
            document.getElementById('totalStudents').innerText = students.length;
            
            // Build the table
            buildTable();
            
            document.getElementById('markEntryLoading').style.display = 'none';
            document.getElementById('markEntryTableWrapper').style.display = 'block';
            
            updateSummary();
            
        } catch (error) {
            console.error('Error loading exam data:', error);
            document.getElementById('markEntryLoading').innerHTML = `
                <p style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> Error: ${error.message}</p>
                <button class="btn-primary" onclick="location.reload()" style="margin-top:15px;"><i class="fas fa-redo"></i> Retry</button>
            `;
        }
    }
    
    // ============================================
    // 2. BUILD SPREADSHEET TABLE
    // ============================================
    function buildTable() {
        const thead = document.getElementById('markEntryHead');
        const tbody = document.getElementById('markEntryBody');
        
        // Build header
        let headerHtml = `<tr>
            <th class="student-col"># Student Name</th>
            <th>Roll</th>`;
        
        exam.subjects.forEach(sub => {
            headerHtml += `<th>${sub.name}<br><small>${sub.fullMark}</small></th>`;
        });
        
        headerHtml += `<th>Total</th>
            <th>%</th>
            <th>Grade</th>
            <th>Remarks</th>
        </tr>`;
        
        thead.innerHTML = headerHtml;
        
        // Build body rows
        tbody.innerHTML = '';
        
        students.forEach((student, index) => {
            const existing = existingResults[student.studentId];
            const subjects = existing ? existing.subjects : [];
            
            let rowHtml = `<tr>
                <td class="student-info">
                    <strong>${index + 1}. ${student.name}</strong>
                    <br><small style="color:var(--text-light)">${student.studentId} | ${student.phone || ''}</small>
                </td>
                <td>${student.roll || '-'}</td>`;
            
            // Subject mark inputs
            exam.subjects.forEach((sub, subIndex) => {
                const existingMark = subjects.find(s => s.subject === sub.name);
                const markValue = existingMark ? existingMark.mark : '';
                const fullMark = sub.fullMark;
                
                rowHtml += `<td>
                    <input type="number" 
                           class="mark-input" 
                           data-student="${student.studentId}" 
                           data-subject="${sub.name}" 
                           data-fullmark="${fullMark}"
                           value="${markValue}" 
                           min="0" 
                           max="${fullMark}"
                           step="0.5"
                           onchange="updateRowCalculation('${student.studentId}')"
                           onfocus="this.select()"
                           onkeydown="handleKeyNavigation(event, ${index}, ${subIndex})">
                </td>`;
            });
            
            // Total, Percentage, Grade (auto-calculated)
            const summary = calculateRowSummary(student.studentId);
            rowHtml += `<td class="total-col" id="total-${student.studentId}">${summary.total}</td>`;
            rowHtml += `<td class="percent-col" id="percent-${student.studentId}">${summary.percent}</td>`;
            rowHtml += `<td class="grade-col" id="grade-${student.studentId}">
                <span class="${getGradeClass(summary.grade)}">${summary.grade}</span>
            </td>`;
            
            // Remarks
            const remarks = existing ? (existing.remarks || '') : '';
            rowHtml += `<td>
                <input type="text" 
                       class="remarks-input" 
                       data-student="${student.studentId}"
                       data-row="${index}"
                       value="${remarks}" 
                       placeholder="Remarks..."
                       onkeydown="handleRemarksNavigation(event, ${index})">
            </td>`;
            
            rowHtml += `</tr>`;
            tbody.innerHTML += rowHtml;
        });
        
        // Attach input listeners for auto-update
        document.querySelectorAll('.mark-input').forEach(input => {
            input.addEventListener('input', () => {
                hasUnsavedChanges = true;
                updateSummary();
            });
        });
    }
    
    // ============================================
    // 3. CALCULATION FUNCTIONS
    // ============================================
    function calculateRowSummary(studentId) {
        const inputs = document.querySelectorAll(`.mark-input[data-student="${studentId}"]`);
        let total = 0;
        let fullTotal = 0;
        
        inputs.forEach(input => {
            const val = parseFloat(input.value);
            const full = parseFloat(input.dataset.fullmark);
            if (!isNaN(val)) {
                total += val;
                fullTotal += full;
            }
        });
        
        const percent = fullTotal > 0 ? Math.round((total / fullTotal) * 100 * 100) / 100 : 0;
        const grade = calculateGrade(percent);
        
        return { total, fullTotal, percent: percent.toFixed(2), grade: grade.grade };
    }
    
    function calculateGrade(percentage) {
        if (percentage >= 90) return { grade: 'A+', gradePoint: 4.00 };
        if (percentage >= 80) return { grade: 'A', gradePoint: 3.75 };
        if (percentage >= 70) return { grade: 'A-', gradePoint: 3.50 };
        if (percentage >= 60) return { grade: 'B', gradePoint: 3.00 };
        if (percentage >= 50) return { grade: 'C', gradePoint: 2.00 };
        if (percentage >= 40) return { grade: 'D', gradePoint: 1.00 };
        return { grade: 'F', gradePoint: 0.00 };
    }
    
    function getGradeClass(grade) {
        const map = {
            'A+': 'grade-aplus', 'A': 'grade-a', 'A-': 'grade-aminus',
            'B': 'grade-b', 'C': 'grade-c', 'D': 'grade-d', 'F': 'grade-f'
        };
        return map[grade] || '';
    }
    
    // ============================================
    // 4. UPDATE FUNCTIONS (Global for onclick)
    // ============================================
    window.updateRowCalculation = (studentId) => {
        const summary = calculateRowSummary(studentId);
        
        document.getElementById(`total-${studentId}`).innerText = summary.total;
        document.getElementById(`percent-${studentId}`).innerText = summary.percent;
        
        const gradeEl = document.getElementById(`grade-${studentId}`);
        gradeEl.innerHTML = `<span class="${getGradeClass(summary.grade)}">${summary.grade}</span>`;
        
        hasUnsavedChanges = true;
        updateSummary();
    };
    
    function updateSummary() {
        const inputs = document.querySelectorAll('.mark-input');
        let filled = 0;
        let totalStudents = students.length;
        
        // Group by student
        const studentMap = {};
        inputs.forEach(input => {
            const sid = input.dataset.student;
            if (!studentMap[sid]) studentMap[sid] = { filled: 0, total: exam.subjects.length };
            if (input.value !== '') studentMap[sid].filled++;
        });
        
        let studentWithMarks = 0;
        Object.values(studentMap).forEach(s => {
            if (s.filled > 0) studentWithMarks++;
        });
        
        document.getElementById('marksEntered').innerText = studentWithMarks;
        document.getElementById('marksNotEntered').innerText = totalStudents - studentWithMarks;
        document.getElementById('entryStatus').innerText = exam.status === 'published' ? 'Published' : 'Draft';
        document.getElementById('entryStatus').style.color = exam.status === 'published' ? 'var(--success)' : 'var(--warning)';
    }
    
    // ============================================
    // 5. KEYBOARD NAVIGATION (Tab-like)
    // ============================================
    window.handleKeyNavigation = (event, rowIndex, colIndex) => {
        const inputs = document.querySelectorAll('.mark-input');
        const currentIndex = rowIndex * exam.subjects.length + colIndex;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const nextIndex = currentIndex + exam.subjects.length;
            if (nextIndex < inputs.length) {
                inputs[nextIndex].focus();
                inputs[nextIndex].select();
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prevIndex = currentIndex - exam.subjects.length;
            if (prevIndex >= 0) {
                inputs[prevIndex].focus();
                inputs[prevIndex].select();
            }
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (colIndex < exam.subjects.length - 1) {
                const nextIndex = currentIndex + 1;
                if (nextIndex < inputs.length) {
                    inputs[nextIndex].focus();
                    inputs[nextIndex].select();
                }
            } else {
                const remarksInput = document.querySelector(`.remarks-input[data-row="${rowIndex}"]`);
                if (remarksInput) {
                    remarksInput.focus();
                    const end = remarksInput.value.length;
                    remarksInput.setSelectionRange(end, end);
                }
            }
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            const prevIndex = currentIndex - 1;
            if (prevIndex >= 0) {
                inputs[prevIndex].focus();
                inputs[prevIndex].select();
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const nextIndex = currentIndex + 1;
            if (nextIndex < inputs.length) {
                inputs[nextIndex].focus();
                inputs[nextIndex].select();
            }
        } else if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            const nextIndex = currentIndex + 1;
            if (nextIndex < inputs.length) {
                inputs[nextIndex].focus();
                inputs[nextIndex].select();
            }
        } else if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            const prevIndex = currentIndex - 1;
            if (prevIndex >= 0) {
                inputs[prevIndex].focus();
                inputs[prevIndex].select();
            }
        }
    };
    
    window.handleRemarksNavigation = (event, rowIndex) => {
        const remarksInputs = document.querySelectorAll('.remarks-input');
        const markInputs = document.querySelectorAll('.mark-input');

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            const prevIndex = rowIndex - 1;
            if (prevIndex >= 0) {
                remarksInputs[prevIndex].focus();
                remarksInputs[prevIndex].select();
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            const nextIndex = rowIndex + 1;
            if (nextIndex < remarksInputs.length) {
                remarksInputs[nextIndex].focus();
                remarksInputs[nextIndex].select();
            }
        } else if (event.key === 'ArrowLeft' && event.target.selectionStart === 0 && event.target.selectionEnd === 0) {
            event.preventDefault();
            // last subject of same row
            const lastMarkIndex = (rowIndex + 1) * exam.subjects.length - 1;
            if (lastMarkIndex >= 0 && lastMarkIndex < markInputs.length) {
                markInputs[lastMarkIndex].focus();
                markInputs[lastMarkIndex].select();
            }
        } else if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            const lastMarkIndex = (rowIndex + 1) * exam.subjects.length - 1;
            if (lastMarkIndex >= 0 && lastMarkIndex < markInputs.length) {
                markInputs[lastMarkIndex].focus();
                markInputs[lastMarkIndex].select();
            }
        } else if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
            event.preventDefault();
            const nextIndex = rowIndex + 1;
            if (nextIndex < remarksInputs.length) {
                remarksInputs[nextIndex].focus();
                remarksInputs[nextIndex].select();
            }
        }
    };
    // ============================================
    window.saveAllMarks = async () => {
        const params = new URLSearchParams(window.location.search);
        const examId = params.get('examId');
        
        if (!examId) {
            alert('No exam ID found');
            return;
        }
        
        // Collect all student data
        const studentResults = [];
        let hasAnyMarks = false;
        
        students.forEach(student => {
            const inputs = document.querySelectorAll(`.mark-input[data-student="${student.studentId}"]`);
            const subjects = [];
            let hasMark = false;
            
            inputs.forEach(input => {
                const val = input.value.trim();
                const mark = val !== '' ? parseFloat(val) : 0;
                subjects.push({
                    subject: input.dataset.subject,
                    mark: isNaN(mark) ? 0 : mark,
                    fullMark: parseFloat(input.dataset.fullmark)
                });
                if (val !== '') hasMark = true;
            });
            
            // Only save if at least one mark is entered
            if (hasMark) {
                hasAnyMarks = true;
                const remarksInput = document.querySelector(`.remarks-input[data-student="${student.studentId}"]`);
                
                studentResults.push({
                    studentId: student.studentId,
                    studentName: student.name,
                    roll: student.roll || '',
                    subjects,
                    remarks: remarksInput ? remarksInput.value : ''
                });
            }
        });
        
        if (!hasAnyMarks) {
            alert('Please enter marks for at least one student before saving.');
            return;
        }
        
        const btn = document.getElementById('saveAllBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Saving...';
        
        try {
            const response = await fetch(`${API_BASE_URL}/results/save-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, studentResults })
            });
            
            const result = await response.json();
            
            if (result.success) {
                hasUnsavedChanges = false;
                alert(result.message);
                // Reload to show updated positions
                loadExamData();
            } else {
                let errMsg = result.message || 'Failed to save marks';
                if (result.data && result.data.errors && result.data.errors.length > 0) {
                    errMsg += `\n\nErrors: ${result.data.errors.slice(0, 5).map(e => 
                        `Student ${e.studentId}: ${e.message}`
                    ).join('\n')}`;
                }
                alert(errMsg);
            }
        } catch (error) {
            console.error('Error saving marks:', error);
            alert('Failed to save marks. Please check your connection and try again.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save All Marks';
        }
    };
    
    // ============================================
    // 7. WARN BEFORE LEAVING WITH UNSAVED CHANGES
    // ============================================
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    // Sidebar toggle (use sidebarToggle if available)
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }
    
    // ============================================
    // 8. INITIALIZE
    // ============================================
    loadExamData();

});
