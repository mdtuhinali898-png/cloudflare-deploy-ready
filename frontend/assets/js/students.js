// assets/js/students.js

document.addEventListener('DOMContentLoaded', () => {
    
    // ============================================
    // 1. CONFIG & STATE
    // ============================================
    const STORAGE_KEY = 'erp_students_data';
    const ITEMS_PER_PAGE = 20;
    let currentPage = 1;
    let studentsData = [];
    let searchTimer = null;
    let studentsRequestController = null;
    let latestStudentsRequest = 0;

    // ============================================
    // 2. API CONFIGURATION
    // ============================================
    // Use relative URL if accessed through server, otherwise use localhost
    const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
        ? 'http://localhost:5002/api' 
        : '/api';
    let totalStudents = 0;
    let totalPages = 0;

    // ============================================
    // 3. API FUNCTIONS
    // ============================================
    async function fetchStudents() {
        try {
            const batch = document.getElementById('filterBatch').value;
            const status = document.getElementById('filterStatus').value;
            const search = document.getElementById('searchInput').value;
            
            if (studentsRequestController) studentsRequestController.abort();
            studentsRequestController = new AbortController();
            const requestId = ++latestStudentsRequest;
            let url = `${API_BASE_URL}/students?page=${currentPage}&limit=${ITEMS_PER_PAGE}&view=directory`;
            if (batch && batch !== 'all') url += `&batch=${encodeURIComponent(batch)}`;
            if (status && status !== 'all') url += `&status=${encodeURIComponent(status)}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const response = await fetch(url, { signal: studentsRequestController.signal });
            const data = await response.json();

            if (requestId !== latestStudentsRequest) return;
            
            studentsData = data.students || [];
            totalStudents = data.total || 0;
            totalPages = data.totalPages || 0;
            
            renderTable();
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Error fetching students:', error);
            alert('Failed to load students from server. Please try again.');
        }
    }

    async function fetchStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/students/stats`);
            const stats = await response.json();
            
            document.getElementById('statTotal').innerText = stats.total || 0;
            document.getElementById('statActive').innerText = stats.active || 0;
            document.getElementById('statInactive').innerText = stats.inactive || 0;
            document.getElementById('statNew').innerText = stats.newAdmission || 0;
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    // ============================================
    // 4. RENDERING LOGIC
    // ============================================
    function getFilteredData() {
        // Filtering is now done by backend API
        return studentsData;
    }

    function renderTable() {
        const tbody = document.getElementById('studentTableBody');
        const filtered = getFilteredData();
        
        // Pagination is now handled by backend
        if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

        // Clear Table
        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#888;">No students found.</td></tr>`;
        } else {
            filtered.forEach(s => {
                const statusClass = s.status === 'Active' ? 'status-active' : 'status-inactive';
                const row = `
                    <tr>
                        <td><img src="${s.photo}" alt="${s.name}" class="student-photo"></td>
                        <td><strong>${s.roll || 'N/A'}</strong></td>
                        <td><strong>${s.studentId}</strong></td>
                        <td>${s.name}</td>
                        <td>${s.phone}</td>
                        <td>${s.batch}</td>
                        <td>${new Date(s.admissionDate).toLocaleDateString('en-GB')}</td>
                        <td>৳${s.fee}</td>
                        <td><span class="${statusClass}">${s.status}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="btn-view" onclick="viewStudent('${s.studentId}')"><i class="fas fa-eye"></i></button>
                                <button class="btn-edit" onclick="editStudent('${s.studentId}')"><i class="fas fa-edit"></i></button>
                                <button class="btn-pay" onclick="goToPayment('${s.studentId}')"><i class="fas fa-money-bill"></i></button>
                                <button class="btn-delete" onclick="deleteStudent('${s.studentId}')"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        // Update UI Counters
        document.getElementById('resultCount').innerText = `Total: ${totalStudents} Students`;
        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        const container = document.getElementById('paginationContainer');
        container.innerHTML = '';

        if (totalPages <= 1) return;

        // Previous Button
        container.innerHTML += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">Prev</button>`;

        // Page Numbers with smart ellipsis
        const maxVisible = 7; // Show at most 7 page number buttons
        let startPage = 1;
        let endPage = totalPages;

        if (totalPages > maxVisible) {
            const half = Math.floor(maxVisible / 2);
            if (currentPage <= half + 1) {
                startPage = 1;
                endPage = maxVisible;
            } else if (currentPage >= totalPages - half) {
                startPage = totalPages - maxVisible + 1;
                endPage = totalPages;
            } else {
                startPage = currentPage - half;
                endPage = currentPage + half;
            }
        }

        if (startPage > 1) {
            container.innerHTML += `<button class="page-btn" onclick="changePage(1)">1</button>`;
            if (startPage > 2) {
                container.innerHTML += `<span class="page-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            container.innerHTML += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                container.innerHTML += `<span class="page-ellipsis">...</span>`;
            }
            container.innerHTML += `<button class="page-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
        }

        // Next Button
        container.innerHTML += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Next</button>`;
    }

    // ============================================
    // 5. ACTION HANDLERS (Global Scope for onclick)
    // ============================================
    window.changePage = (page) => {
        currentPage = page;
        fetchStudents();
    };

    window.viewStudent = (id) => {
        const student = studentsData.find(s => s.studentId === id);
        if (student) {
            window.location.href = `student-profile.html?id=${id}`;
        }
    };

    window.editStudent = (id) => {
        window.location.href = `student-profile.html?id=${encodeURIComponent(id)}&edit=1`;
    };

    window.goToPayment = (id) => {
        window.location.href = `payments.html?student=${id}`;
    };

    window.deleteStudent = async (id) => {
        if (confirm(`Are you sure you want to delete student ${id}? This action cannot be undone.`)) {
            try {
                const response = await fetch(`${API_BASE_URL}/students/${id}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    alert('Student deleted successfully!');
                    fetchStudents(); // Refresh the list
                    fetchStats(); // Refresh stats
                } else {
                    alert('Failed to delete student');
                }
            } catch (error) {
                console.error('Error deleting student:', error);
                alert('Error deleting student');
            }
        }
    };

    // ============================================
    // 6. LOAD BATCHES DYNAMICALLY
    // ============================================
    async function loadBatches() {
        try {
            const response = await fetch(`${API_BASE_URL}/batches`);
            const result = await response.json();
            
            if (result.success && result.data) {
                const batches = result.data;
                
                // Update batch dropdown
                const batchSelect = document.getElementById('filterBatch');
                const currentValue = batchSelect.value;
                
                // Keep first option
                batchSelect.innerHTML = '<option value="all">All Batch</option>';
                
                // Add all batches
                batches.forEach(batch => {
                    const option = document.createElement('option');
                    option.value = batch.name;
                    option.textContent = batch.name;
                    batchSelect.appendChild(option);
                });
                
                // Restore selection if possible
                if (currentValue && batches.some(b => b.name === currentValue)) {
                    batchSelect.value = currentValue;
                }
            }
        } catch (error) {
            console.error('Error loading batches:', error);
        }
    }

    // ============================================
    // 7. EVENT LISTENERS
    // ============================================
    document.getElementById('filterBatch').addEventListener('change', () => { currentPage = 1; fetchStudents(); });
    document.getElementById('filterStatus').addEventListener('change', () => { currentPage = 1; fetchStudents(); });
    document.getElementById('searchInput').addEventListener('input', () => {
        currentPage = 1;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(fetchStudents, 300);
    });

    // ============================================
    // 8. INITIALIZE
    // ============================================
    loadBatches();
    fetchStats();
    fetchStudents();

});
