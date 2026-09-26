// ============================================
// PAYMENTS.JS - Professional Payment Management
// Modern, Feature-Rich Payment Processing
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    
// ============================================
// 1. CONFIG & STATE
// ============================================
// Use relative URL if accessed through server, otherwise use localhost
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '5002' ? '/api' : 'http://localhost:5002/api')
    : '/api';
const RECENT_KEY = 'erp_recent_searches';
    
let studentsData = [];
let paymentsData = [];
let currentStudent = null;

// ============================================
// 2. API FUNCTIONS
// ============================================
async function loadStudentsFromAPI() {
    // On-demand search is used; no need to download 1000 students on page load
    studentsData = [];
}

async function loadPaymentsFromAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/payments?limit=250`);
        const data = await response.json();
        const apiPayments = data.payments || data.data || [];
        
        // Normalize MongoDB field names to localStorage format
        paymentsData = apiPayments.map(p => ({
            receipt: p.receiptNo || p.receipt || 'N/A',
            studentId: p.studentId || '',
            name: p.studentName || p.name || '',
            month: p.month || '',
            fee: p.fee || 0,
            discount: p.discount || 0,
            fine: p.fine || 0,
            paid: p.amount || p.paid || 0,
            method: p.paymentMethod || p.method || '',
            status: p.status || 'Paid',
            remarks: p.remarks || '',
            date: p.date || '',
            _id: p._id || null,
            receiptNo: p.receiptNo || '', // Keep for receipt page
            type: p.type || 'Monthly' // Payment type: Monthly or Admission
        }));

        
    } catch (error) {
        console.error('Error loading payments:', error);
        paymentsData = [];
    }
}

function getPayments() {
    return paymentsData;
}

// ============================================
// 3. DATA MANAGEMENT
// ============================================
async function loadData() {
    await loadStudentsFromAPI();
    await loadPaymentsFromAPI();
    
    // If no payments, keep empty (API will handle it)
}

async function savePaymentToAPI(paymentData) {
    const response = await fetch(`${API_BASE_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
    });
    return await response.json();
}


    // ============================================
    // 4. RECENT SEARCHES
    // ============================================
    function getRecentSearches() {
        return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    }

    function addRecentSearch(studentId) {
        let recents = getRecentSearches();
        recents = recents.filter(id => id !== studentId);
        recents.unshift(studentId);
        if (recents.length > 5) recents = recents.slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
        renderRecentSearches();
    }

    function renderRecentSearches() {
        const recents = getRecentSearches();
        const container = document.getElementById('searchRecent');
        const tagsContainer = document.getElementById('recentTags');
        
        if (recents.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'flex';
        tagsContainer.innerHTML = recents.map(id => 
            `<span class="recent-tag" onclick="document.getElementById('studentSearchInput').value='${id}'; searchStudent();">${id}</span>`
        ).join('');
    }

    // ============================================
    // 5. TODAY'S COLLECTION
    // ============================================
    function updateTodayCollection() {
        const today = new Date().toISOString().split('T')[0];
        const todayPayments = paymentsData.filter(p => p.date === today);
        const total = todayPayments.reduce((sum, p) => sum + p.paid, 0);
        document.getElementById('todayCollection').innerText = '৳' + total.toLocaleString();
    }

// ============================================
// 6. STUDENT SEARCH FUNCTION
// ============================================
window.searchStudent = async () => {
    const searchInput = document.getElementById('studentSearchInput');
    const rawInput    = searchInput.value.trim();
    const studentId   = rawInput; // keep original case — backend uses case-insensitive regex

    if (!studentId) {
        showMessage('⚠️ Please enter a Student ID', 'error');
        shakeElement(searchInput);
        return;
    }

    // Show loading state
    const searchBtn = document.querySelector('.btn-search');
    if (searchBtn) {
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
        searchBtn.disabled  = true;
    }

    try {
        // ── Strategy 1: exact match by studentId ──
        let student = null;

        const exactRes = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}`);
        if (exactRes.ok) {
            const exactData = await exactRes.json();
            student = exactData.student || (exactData.success ? exactData : null);
        }

        // ── Strategy 2: fallback — search by name / phone ──
        if (!student) {
            const searchRes = await fetch(
                `${API_BASE_URL}/students?search=${encodeURIComponent(studentId)}&limit=5`
            );
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                const list = searchData.students || [];
                if (list.length === 1) {
                    student = list[0];
                } else if (list.length > 1) {
                    // Show multiple results as suggestions
                    showMessage(
                        `⚠️ Multiple matches found. Showing first result: <strong>${list[0].name}</strong>`,
                        'success'
                    );
                    student = list[0];
                }
            }
        }

        if (!student) throw new Error('Student not found');

        // Student found
        currentStudent = student;
        showMessage(`✅ Student found: <strong>${student.name}</strong>`, 'success');
        displayStudentInfo(student);
        showPaymentForm(student);
        addRecentSearch(student.studentId || student.id);

    } catch (error) {
        showMessage(`❌ Student not found with ID: <strong>${studentId}</strong>`, 'error');
        hideStudentInfo();
    } finally {
        if (searchBtn) {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Search Student';
            searchBtn.disabled  = false;
        }
    }
};

    function shakeElement(el) {
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = 'shake 0.4s ease-in-out';
    }

    function showMessage(message, type) {
        const messageDiv = document.getElementById('searchMessage');
        messageDiv.innerHTML = message;
        messageDiv.className = `search-message ${type}`;
    }

    function displayStudentInfo(student) {
        // Show student info section
        document.getElementById('studentInfoSection').style.display = 'block';

        // Populate student details
        document.getElementById('displayStudentId').innerText = student.studentId || student.id;
        if (student.photo) {
            document.getElementById('displayStudentPhoto').src = student.photo;
            document.getElementById('displayStudentPhoto').style.display = 'block';
        } else {
            document.getElementById('displayStudentPhoto').style.display = 'none';
        }
        document.getElementById('displayStudentName').innerText = student.name;
        document.getElementById('displayStudentBatch').innerText = student.batch || 'N/A';
        document.getElementById('displayStudentPhone').innerText = student.phone || 'N/A';
        document.getElementById('displayStudentFee').innerText = '৳' + (student.fee || 0);
        document.getElementById('displayStudentFather').innerText = student.guardianName || 'N/A';
        document.getElementById('displayStudentStatus').innerText = student.status || 'Active';
        
        // Load 12-month payment status
        loadMonthlyPaymentStatus(student.studentId || student.id);
    }
    
    // ============================================
    // 6A. 12-MONTH PAYMENT STATUS
    // ============================================
    async function loadMonthlyPaymentStatus(studentId) {
        try {
            const response = await fetch(`${API_BASE_URL}/payments/student/${studentId}/monthly-status`);
            const result = await response.json();
            
            if (result.success) {
                renderMonthlyStatus(result);
            }
        } catch (error) {
            console.error('Error loading monthly status:', error);
        }
    }
    
    function renderMonthlyStatus(data) {
        const { monthlyStatus, statistics } = data;
        
        // Show the section
        document.getElementById('monthlyStatusSection').style.display = 'block';
        
        // Update summary badges
        const summaryHtml = `
            <span class="summary-badge badge-paid">✅ Paid: ${statistics.paidMonths}</span>
            <span class="summary-badge badge-partial">⚠️ Partial: ${statistics.partialMonths}</span>
            <span class="summary-badge badge-unpaid">❌ Unpaid: ${statistics.unpaidMonths}</span>
        `;
        document.getElementById('monthlyStatsSummary').innerHTML = summaryHtml;
        
        // Render monthly grid
        const grid = document.getElementById('monthlyGrid');
        grid.innerHTML = monthlyStatus.map(m => {
            let statusClass, statusIcon, statusText;
            
            if (m.status === 'Paid') {
                statusClass = 'month-paid';
                statusIcon = '✅';
                statusText = `Paid: ৳${m.amount.toLocaleString()}`;
            } else if (m.status === 'Partial') {
                statusClass = 'month-partial';
                statusIcon = '⚠️';
                statusText = `Partial: ৳${m.amount.toLocaleString()}`;
            } else {
                statusClass = 'month-unpaid';
                statusIcon = '❌';
                statusText = 'Not paid yet';
            }
            
            return `
                <div class="month-item ${statusClass}">
                    <div class="month-name">${m.month.substring(0, 3)}</div>
                    <div class="month-icon">${statusIcon}</div>
                    <div class="month-status">${m.status}</div>
                    <div class="month-amount">${statusText}</div>
                    ${m.paidDate ? `<div class="month-date">${m.paidDate}</div>` : ''}
                    ${m.receiptNo ? `<div class="month-receipt">${m.receiptNo}</div>` : ''}
                </div>
            `;
        }).join('');
        
        // Update totals
        document.getElementById('totalExpected').innerHTML = '৳' + statistics.totalExpected.toLocaleString();
        document.getElementById('totalPaid').innerHTML = '৳' + statistics.totalPaid.toLocaleString();
        document.getElementById('totalDue').innerHTML = '৳' + statistics.totalDue.toLocaleString();
        document.getElementById('collectionRate').innerHTML = statistics.collectionRate + '%';
        
        // Color the collection rate
        const rateEl = document.getElementById('collectionRate');
        const rate = parseFloat(statistics.collectionRate);
        if (rate >= 80) rateEl.style.color = '#28a745';
        else if (rate >= 50) rateEl.style.color = '#ffc107';
        else rateEl.style.color = '#dc3545';
    }

    function showPaymentForm(student) {
        // Show payment form section
        document.getElementById('paymentFormSection').style.display = 'block';

        // Pre-fill form
        document.getElementById('monthlyFee').value = student.fee || 0;
        document.getElementById('paidAmount').value = student.fee || 0;
        document.getElementById('discount').value = 0;
        document.getElementById('fine').value = 0;

        // Update summary
        updateSummary();

        // Scroll to payment form smoothly
        setTimeout(() => {
            document.getElementById('paymentFormSection').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 500);
    }

    function hideStudentInfo() {
        document.getElementById('studentInfoSection').style.display = 'none';
        document.getElementById('paymentFormSection').style.display = 'none';
        currentStudent = null;
    }

    window.clearSearch = () => {
        const searchInput = document.getElementById('studentSearchInput');
        searchInput.value = '';
        searchInput.classList.remove('has-value');
        document.getElementById('searchMessage').className = 'search-message';
        hideStudentInfo();
        document.getElementById('paymentForm').reset();
        document.getElementById('sumMonth').innerText = '—';
    };

    // ============================================
    // 7. AUTO-CALCULATION & SUMMARY
    // ============================================
    ['monthlyFee', 'discount', 'fine', 'paidAmount', 'month'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateSummary);
        document.getElementById(id).addEventListener('change', updateSummary);
    });

    function updateSummary() {
        const fee = parseFloat(document.getElementById('monthlyFee').value) || 0;
        const discount = parseFloat(document.getElementById('discount').value) || 0;
        const fine = parseFloat(document.getElementById('fine').value) || 0;
        const paid = parseFloat(document.getElementById('paidAmount').value) || 0;
        const total = fee - discount + fine;
        const month = document.getElementById('month').value;
        
        // Update paid amount if not manually changed
        if (!document.getElementById('paidAmount').dataset.manual) {
            document.getElementById('paidAmount').value = total;
        }
        
        // Update Summary Box
        document.getElementById('sumStudent').innerText = currentStudent ? currentStudent.name : '—';
        document.getElementById('sumMonth').innerText = month || '—';
        document.getElementById('sumFee').innerText = '৳' + fee.toLocaleString();
        document.getElementById('sumDiscount').innerText = '৳' + discount.toLocaleString();
        document.getElementById('sumFine').innerText = '৳' + fine.toLocaleString();
        document.getElementById('sumTotal').innerText = '৳' + total.toLocaleString();
        
        // Determine status
        const statusEl = document.getElementById('sumStatus');
        if (paid === 0) {
            statusEl.innerText = '⏳ PENDING';
            statusEl.className = 'status-badge status-due';
        } else if (paid >= total && total > 0) {
            statusEl.innerText = '✅ PAID';
            statusEl.className = 'status-badge status-paid';
        } else if (paid > 0 && paid < total) {
            statusEl.innerText = '⚠️ PARTIAL';
            statusEl.className = 'status-badge status-partial';
        } else {
            statusEl.innerText = '⏳ PENDING';
            statusEl.className = 'status-badge status-due';
        }
    }

    // Track manual paid amount changes
    document.getElementById('paidAmount').addEventListener('focus', function() {
        this.dataset.manual = 'true';
    });

    // ============================================
    // 8. SAVE PAYMENT WITH PROCESSING OVERLAY
    // ============================================
    document.getElementById('paymentForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!currentStudent) {
            showNotification('❌ Please search and select a student first!', 'error');
            return;
        }

        // Validate form
        const month = document.getElementById('month').value;
        const method = document.getElementById('paymentMethod').value;
        const paid = parseFloat(document.getElementById('paidAmount').value) || 0;

        if (!month) {
            showNotification('⚠️ Please select a payment month', 'error');
            return;
        }
        if (!method) {
            showNotification('⚠️ Please select a payment method', 'error');
            return;
        }
        if (paid <= 0) {
            showNotification('⚠️ Paid amount must be greater than 0', 'error');
            return;
        }

        // Show processing overlay
        const overlay = document.getElementById('processingOverlay');
        overlay.style.display = 'flex';
        
        // Disable submit button
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').style.display = 'none';
        submitBtn.querySelector('.btn-loading').style.display = 'inline';

        try {
            const fee = parseFloat(document.getElementById('monthlyFee').value) || 0;
            
            let status = 'Paid';
            if (paid === 0) status = 'Due';
            else if (paid < fee) status = 'Partial';

            const paymentData = {
                studentId: currentStudent.studentId || currentStudent.id,
                studentName: currentStudent.name,
                month: month,
                year: new Date().getFullYear(),
                fee: fee,
                discount: parseFloat(document.getElementById('discount').value) || 0,
                fine: parseFloat(document.getElementById('fine').value) || 0,
                amount: paid,
                paymentMethod: method,
                status: status,
                remarks: document.getElementById('remarks').value,
                date: new Date().toISOString().split('T')[0]
            };

            // Save to API
            const savedPayment = await savePaymentToAPI(paymentData);

            const stored = savedPayment.payment;
            if (!savedPayment.success || !stored) throw new Error(savedPayment.message || 'Payment save failed');
            
            const receiptNo = stored.receiptNo || stored.receipt || savedPayment.receiptNo || '';

            const newPayment = {
                receipt: receiptNo,
                studentId: currentStudent.studentId || currentStudent.id,
                name: currentStudent.name,
                month: month,
                fee: fee,
                discount: parseFloat(document.getElementById('discount').value) || 0,
                fine: parseFloat(document.getElementById('fine').value) || 0,
                paid: paid,
                method: method,
                status: status,
                remarks: document.getElementById('remarks').value,
                date: stored.date,
                _id: stored._id,
                receiptNo: receiptNo
            };
            paymentsData.unshift(newPayment);

            // Hide overlay
            overlay.style.display = 'none';
            
            // Show success notification
            showNotification(
                `✅ Payment Successful! Redirecting to receipt...`,
                'success'
            );

            // Redirect to receipt immediately
            window.location.href = `receipt.html?receipt=${encodeURIComponent(receiptNo)}`;
            return;
        } catch (error) {
            console.error('Error saving payment:', error);
            showNotification('❌ Failed to save payment. Please try again.', 'error');
            
            // Hide overlay
            overlay.style.display = 'none';
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').style.display = 'inline';
            submitBtn.querySelector('.btn-loading').style.display = 'none';
        }
    });

    // ============================================
    // 9. NOTIFICATION SYSTEM
    // ============================================
    function showNotification(message, type) {
        // Remove existing notification
        const existing = document.querySelector('.custom-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `custom-notification ${type}`;
        notification.innerHTML = message.replace(/\n/g, '<br>');
        document.body.appendChild(notification);

        // Show with animation
        setTimeout(() => notification.classList.add('show'), 10);

        // Auto remove
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // ============================================
    // 10. RENDER HISTORY TABLE
    // ============================================
    function getFilteredHistory() {
        const month = document.getElementById('filterMonth').value;
        const method = document.getElementById('filterMethod').value;
        const status = document.getElementById('filterStatus').value;
        const search = document.getElementById('historySearch').value.toLowerCase();

        return paymentsData.filter(p => {
            const matchMonth = (month === 'all' || p.month === month);
            const matchMethod = (method === 'all' || p.method === method);
            const matchStatus = (status === 'all' || p.status === status);
            const matchSearch = (p.studentId.toLowerCase().includes(search) || p.name.toLowerCase().includes(search));
            return matchMonth && matchMethod && matchStatus && matchSearch;
        });
    }

    let historyPage = 1;
    const HISTORY_PAGE_SIZE = 25;

    function renderHistoryPagination(totalFiltered) {
        let container = document.getElementById('paymentPaginationContainer');
        if (!container) return;
        const totalPages = Math.ceil(totalFiltered / HISTORY_PAGE_SIZE) || 1;
        if (totalPages <= 1) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        let html = `
            <div style="font-size:13px; color:#64748b; font-weight:500;">
                Showing <strong>${(historyPage - 1) * HISTORY_PAGE_SIZE + 1}</strong> - <strong>${Math.min(historyPage * HISTORY_PAGE_SIZE, totalFiltered)}</strong> of <strong>${totalFiltered}</strong>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" class="btn-page-nav" ${historyPage === 1 ? 'disabled style="opacity:0.4; cursor:not-allowed; padding:6px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc;"' : 'style="cursor:pointer; padding:6px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-weight:600;"'} onclick="window.changeHistoryPage(${historyPage - 1})">
                    <i class="fas fa-chevron-left"></i> Prev
                </button>
                <span style="font-size:13px; font-weight:700; color:#334155; padding:4px 8px;">Page ${historyPage} / ${totalPages}</span>
                <button type="button" class="btn-page-nav" ${historyPage >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed; padding:6px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc;"' : 'style="cursor:pointer; padding:6px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-weight:600;"'} onclick="window.changeHistoryPage(${historyPage + 1})">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
        container.innerHTML = html;
    }

    window.changeHistoryPage = (newPage) => {
        historyPage = newPage;
        renderHistory();
        const tableCard = document.querySelector('.table-responsive');
        if (tableCard) tableCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    function renderHistory() {
        const tbody = document.getElementById('paymentHistoryBody');
        const filtered = getFilteredHistory();
        
        tbody.innerHTML = '';
        document.getElementById('historyCount').innerText = `Total Transactions: ${filtered.length}`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align:center; padding:40px 20px; color:#888;">
                        <i class="fas fa-inbox" style="font-size:40px; display:block; margin-bottom:10px; opacity:0.3;"></i>
                        No payments found matching your criteria.
                    </td>
                </tr>`;
            renderHistoryPagination(0);
            return;
        }

        const totalPages = Math.ceil(filtered.length / HISTORY_PAGE_SIZE) || 1;
        if (historyPage > totalPages) historyPage = totalPages;
        if (historyPage < 1) historyPage = 1;

        const startIndex = (historyPage - 1) * HISTORY_PAGE_SIZE;
        const pageItems = filtered.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);

        tbody.innerHTML = pageItems.map((p, index) => {
            const statusClass = p.status === 'Paid' ? 'status-paid' : (p.status === 'Partial' ? 'status-partial' : 'status-due');
            const statusIcon = p.status === 'Paid' ? '✅' : (p.status === 'Partial' ? '⚠️' : '❌');
            return `
                <tr style="animation: fadeSlideIn 0.2s ease-out both;">
                    <td><strong>${p.receipt}</strong></td>
                    <td>${p.studentId}</td>
                    <td>${p.name}</td>
                    <td>${p.month}</td>
                    <td>৳${p.fee.toLocaleString()}</td>
                    <td>৳${p.discount.toLocaleString()}</td>
                    <td><strong>৳${p.paid.toLocaleString()}</strong></td>
                    <td>${p.method}</td>
                    <td><span class="status-badge ${statusClass}">${statusIcon} ${p.status}</span></td>
                    <td>
                        <a href="receipt.html?receipt=${p.receipt}" class="btn-view" title="View Receipt">
                            <i class="fas fa-eye"></i> View
                        </a>
                    </td>
                </tr>
            `;
        }).join('');

        renderHistoryPagination(filtered.length);
    }

    // ============================================
    // 11. EVENT LISTENERS
    // ============================================
    document.getElementById('filterMonth').addEventListener('change', () => { historyPage = 1; renderHistory(); });
    document.getElementById('filterMethod').addEventListener('change', () => { historyPage = 1; renderHistory(); });
    document.getElementById('filterStatus').addEventListener('change', () => { historyPage = 1; renderHistory(); });
    document.getElementById('historySearch').addEventListener('input', () => { historyPage = 1; renderHistory(); });

    // Enter key to search
    document.getElementById('studentSearchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchStudent();
        }
    });

    // Input value tracking for visual feedback
    document.getElementById('studentSearchInput').addEventListener('input', function() {
        if (this.value.trim()) {
            this.classList.add('has-value');
        } else {
            this.classList.remove('has-value');
        }
    });

    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

    // Check if redirected from students.html
    const urlParams = new URLSearchParams(window.location.search);
    const studentIdFromURL = urlParams.get('student');
    if (studentIdFromURL) {
        document.getElementById('studentSearchInput').value = studentIdFromURL;
        setTimeout(searchStudent, 300);
    }

    // ============================================
    // 12. ADD CSS ANIMATIONS DYNAMICALLY
    // ============================================
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }

        .custom-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 18px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            transform: translateX(120%);
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
            line-height: 1.6;
        }
        .custom-notification.show {
            transform: translateX(0);
        }
        .custom-notification.success {
            background: linear-gradient(135deg, #d4edda, #c3e6cb);
            color: #155724;
            border-left: 5px solid #28a745;
        }
        .custom-notification.error {
            background: linear-gradient(135deg, #f8d7da, #f5c6cb);
            color: #721c24;
            border-left: 5px solid #dc3545;
        }

        .processing-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(8px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s ease-out;
        }
        .processing-modal {
            background: white;
            padding: 40px 50px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .processing-modal h3 {
            margin: 15px 0 5px;
            color: var(--pay-dark);
            font-size: 20px;
        }
        .processing-modal p {
            color: var(--pay-text-light);
            font-size: 14px;
            margin: 0;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e0e5ec;
            border-top-color: var(--pay-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes scaleIn {
            from { transform: scale(0.8); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        .input-wrapper {
            flex: 1;
            position: relative;
        }
        .input-wrapper .input-icon {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            color: #adb5bd;
            font-size: 16px;
            z-index: 1;
        }
        .input-wrapper input {
            padding-left: 42px !important;
        }

        .step-hint {
            color: rgba(255,255,255,0.7);
            font-size: 12px;
            font-weight: 500;
        }

        .header-stats {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .stat-chip {
            background: linear-gradient(135deg, #e8edf9, #d4e0f5);
            padding: 10px 20px;
            border-radius: 50px;
            font-size: 13px;
            font-weight: 600;
            color: var(--pay-primary-dark);
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(78,115,223,0.2);
        }
        .stat-chip i {
            font-size: 16px;
        }
        .stat-chip strong {
            font-size: 15px;
        }

        .search-recent {
            margin-top: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .recent-label {
            font-size: 12px;
            color: var(--pay-text-light);
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .recent-tags {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .recent-tag {
            padding: 4px 12px;
            background: #eef1f8;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            color: var(--pay-primary);
            cursor: pointer;
            transition: var(--pay-transition);
            border: 1px solid transparent;
        }
        .recent-tag:hover {
            background: var(--pay-primary);
            color: white;
            border-color: var(--pay-primary);
        }

        .header-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .btn-refresh {
            background: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--pay-transition);
            font-size: 14px;
        }
        .btn-refresh:hover {
            background: rgba(255,255,255,0.25);
            transform: rotate(180deg);
        }

        .photo-ring {
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--pay-primary), var(--pay-success));
            z-index: -1;
            animation: spinGradient 4s linear infinite;
        }
    `;
    document.head.appendChild(styleSheet);

    // ============================================
    // 13. INITIALIZE
    // ============================================
    loadData();
    renderHistory();
    renderRecentSearches();
    updateTodayCollection();

});
