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

// ============================================
// 2. DATA LOADING FROM DATABASE
// ============================================
async function loadData() {
    try {
        // Load students directly from MongoDB API
        const studentsResponse = await fetch(`${API_BASE_URL}/students?limit=1000`);
        const studentsDataObj = await studentsResponse.json();
        studentsData = studentsDataObj.students || [];
        
        // Load payments directly from MongoDB API
        const paymentsResponse = await fetch(`${API_BASE_URL}/payments?limit=1000`);
        const paymentsDataObj = await paymentsResponse.json();
        paymentsData = paymentsDataObj.payments || [];
    } catch (error) {
        console.error('Error loading data from database API:', error);
        // Fallback to localStorage
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
        
        if (student.photo) {
            profilePhotoEl.src = student.photo;
            profilePhotoEl.style.display = 'block';
            if (photoContainer) {
                photoContainer.style.display = 'block';
                photoContainer.classList.add('visible');
            }
            if (profileCover) {
                profileCover.style.display = 'block';
                profileCover.classList.add('visible');
            }
        } else {
            profilePhotoEl.style.display = 'none';
            if (photoContainer) {
                photoContainer.classList.remove('visible');
                photoContainer.classList.add('hidden');
            }
            if (profileCover) {
                profileCover.classList.remove('visible');
                profileCover.classList.add('hidden');
            }
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
        statusBadge.innerText = student.status || 'Active';
        statusBadge.className = `status-indicator status-${(student.status || 'active').toLowerCase()}`;

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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No payment history found.</td></tr>`;
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
                    backgroundColor: 'rgba(78, 115, 223, 0.7)',
                    borderColor: '#4e73df',
                    borderWidth: 2,
                    borderRadius: 6
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
    // 9. HELPER FUNCTIONS
    // ============================================
    function formatDate(dateString) {
        if (!dateString) return '--';
        const date = new Date(dateString);
        const options = { day: '2-digit', month: 'short', year: 'numeric' };
        return date.toLocaleDateString('en-GB', options);
    }

    // ============================================
    // 10. ACTION HANDLERS & EDIT MODAL
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
    // 11. SIDEBAR TOGGLE
    // ============================================
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

    // ============================================
    // 12. INITIALIZE
    // ============================================
    await loadData();

    const studentId = getStudentIdFromURL();
    if (studentId) {
        let student = findStudent(studentId);
        if (!student) {
            try {
                const singleRes = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}`);
                const singleData = await singleRes.json();
                if (singleData.success && singleData.student) {
                    student = singleData.student;
                    studentsData.push(student);
                }
            } catch (err) {
                console.error('Error fetching single student from database:', err);
            }
        }
        populateProfile(student);
        loadPaymentHistory();
        updateStats();
        loadPaymentChart();
    } else {
        // If no ID, show first student (for testing)
        if (studentsData.length > 0) {
            const student = studentsData[0];
            populateProfile(student);
            loadPaymentHistory();
            updateStats();
            loadPaymentChart();
        } else {
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
