// assets/js/batch-transfer.js
// Modern, User-Friendly Batch Transfer Controller

document.addEventListener('DOMContentLoaded', () => {

// ============================================
// 1. CONFIG & STATE
// ============================================
const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
    ? 'http://localhost:5002/api' 
    : '/api';

let currentStudent = null;
let batchesData = [];
let allStudentsData = [];
let debounceTimer = null;
let targetPreviewRequest = 0;

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchSuggestions = document.getElementById('searchSuggestions');
const loadingSpinner = document.getElementById('loadingSpinner');
const notFound = document.getElementById('notFound');
const transferWorkflow = document.getElementById('transferWorkflow');
const studentDetailsCard = document.getElementById('studentDetailsCard');
const transferFormSection = document.getElementById('transferFormSection');
const transferSuccess = document.getElementById('transferSuccess');
const targetBatchSelect = document.getElementById('targetBatch');
const newStudentIdDisplay = document.getElementById('newStudentIdDisplay');
const newBatchFeeDisplay = document.getElementById('newBatchFeeDisplay');
const feeDifferenceBadge = document.getElementById('feeDifferenceBadge');
const copyNewIdBtn = document.getElementById('copyNewIdBtn');
const transferBtn = document.getElementById('transferBtn');
const confirmModal = document.getElementById('confirmModal');
const recentTransfersBody = document.getElementById('recentTransfersBody');

// ============================================
// 2. INITIALIZATION
// ============================================
async function init() {
    setupEventListeners();
    await loadBatches();
    loadRecentTransfers();
    
    // Background prefetch for instant search
    loadAllStudents();

    // Check URL for student ID parameter (e.g. ?studentId=H26-001)
    const urlParams = new URLSearchParams(window.location.search);
    const studentId = urlParams.get('studentId');
    if (studentId) {
        searchInput.value = studentId;
        searchStudent();
    }
}

// ============================================
// 3. DATA LOADING
// ============================================
async function loadBatches() {
    try {
        const response = await fetch(`${API_BASE_URL}/batches`);
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
            batchesData = result.data;
        }
    } catch (error) {
        console.error('Error loading batches:', error);
    }
}

async function loadAllStudents() {
    try {
        const response = await fetch(`${API_BASE_URL}/students?limit=1000`);
        const result = await response.json();
        if (result.success || result.students) {
            allStudentsData = result.students || result.data || [];
        }
    } catch (error) {
        console.error('Error loading students for auto-suggest:', error);
    }
}

// ============================================
// 4. LIVE SEARCH & AUTO-SUGGEST
// ============================================
function handleSearchInput() {
    const query = searchInput.value.trim();

    if (query.length > 0) {
        if (clearSearchBtn) clearSearchBtn.style.display = 'block';
    } else {
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';
        hideSuggestions();
        return;
    }

    // Debounce live suggestions
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        showSuggestions(query);
    }, 200);
}

function showSuggestions(query) {
    if (!searchSuggestions || allStudentsData.length === 0) return;

    const lowerQuery = query.toLowerCase();
    const matches = allStudentsData.filter(s => 
        (s.studentId && s.studentId.toLowerCase().includes(lowerQuery)) ||
        (s.name && s.name.toLowerCase().includes(lowerQuery)) ||
        (s.phone && s.phone.includes(query)) ||
        (s.guardianPhone && s.guardianPhone.includes(query)) ||
        (s.roll && String(s.roll).includes(query))
    ).slice(0, 5);

    if (matches.length === 0) {
        hideSuggestions();
        return;
    }

    searchSuggestions.innerHTML = matches.map(s => `
        <div class="bt-suggestion-item" data-id="${s.studentId}">
            <div class="bt-suggestion-avatar">
                ${s.photo ? `<img src="${s.photo}" alt="${s.name}">` : `<i class="fas fa-user-graduate"></i>`}
            </div>
            <div class="bt-suggestion-info">
                <div class="bt-suggestion-name">${s.name}</div>
                <div class="bt-suggestion-meta">
                    <span><i class="fas fa-id-card"></i> ${s.studentId}</span>
                    <span><i class="fas fa-layer-group"></i> ${s.batch || 'No Batch'}</span>
                    ${s.phone ? `<span><i class="fas fa-phone"></i> ${s.phone}</span>` : ''}
                    ${s.guardianPhone ? `<span><i class="fas fa-user-shield"></i> G: ${s.guardianPhone}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');

    searchSuggestions.classList.add('active');

    // Attach click events
    searchSuggestions.querySelectorAll('.bt-suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const selectedId = el.getAttribute('data-id');
            searchInput.value = selectedId;
            hideSuggestions();
            searchStudent();
        });
    });
}

function hideSuggestions() {
    if (searchSuggestions) {
        searchSuggestions.classList.remove('active');
        searchSuggestions.innerHTML = '';
    }
}

// ============================================
// 5. SEARCH STUDENT
// ============================================
window.searchStudent = async function() {
    hideSuggestions();
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.focus();
        return;
    }

    // Update UI states
    loadingSpinner.classList.add('active');
    if (transferWorkflow) transferWorkflow.classList.remove('active');
    studentDetailsCard.classList.remove('active');
    transferFormSection.classList.remove('active');
    transferSuccess.classList.remove('active');
    notFound.classList.remove('active');
    searchBtn.disabled = true;

    try {
        // Search by exact student ID, phone or name
        const response = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(query)}`);
        const result = await response.json();

        if (result.success && result.student) {
            const s = result.student;
            const q = query.trim().toLowerCase();
            const idMatches = s.studentId && s.studentId.toLowerCase() === q;
            const cleanDigits = query.replace(/[^0-9]/g, '');
            const phoneMatches = cleanDigits.length >= 5 && (
                (s.phone && s.phone.replace(/[^0-9]/g, '') === cleanDigits) ||
                (s.guardianPhone && s.guardianPhone.replace(/[^0-9]/g, '') === cleanDigits)
            );
            const nameMatches = s.name && s.name.toLowerCase() === q;

            if (idMatches || phoneMatches || nameMatches) {
                currentStudent = s;
                displayStudentDetails(currentStudent);
            } else {
                throw new Error('Student not found');
            }
        } else {
            throw new Error('Student not found');
        }
    } catch (error) {
        console.error('Search error:', error);
        notFound.classList.add('active');
        currentStudent = null;
    } finally {
        loadingSpinner.classList.remove('active');
        searchBtn.disabled = false;
    }
};

// ============================================
// 6. DISPLAY STUDENT DETAILS
// ============================================
function displayStudentDetails(student) {
    // Left profile information
    document.getElementById('studentNameDisplay').textContent = student.name || 'Unnamed Student';
    document.getElementById('studentIdDisplay').textContent = student.studentId || '-';
    
    // Hidden fallback fields
    const cb = document.getElementById('currentBatchDisplay');
    if (cb) cb.textContent = student.batch || '-';
    const dsId = document.getElementById('detailStudentId');
    if (dsId) dsId.textContent = student.studentId || '-';
    const dn = document.getElementById('detailName');
    if (dn) dn.textContent = student.name || '-';

    // Avatar
    const avatarContainer = document.getElementById('studentAvatarLarge');
    if (avatarContainer) {
        if (student.photo) {
            avatarContainer.innerHTML = `<img src="${student.photo}" alt="${student.name}">`;
        } else {
            avatarContainer.innerHTML = `<i class="fas fa-user-graduate"></i>`;
        }
    }

    // Detail specs
    const detailPhone = document.getElementById('detailPhone');
    if (detailPhone) detailPhone.textContent = student.phone || '-';

    const detailGuardianPhone = document.getElementById('detailGuardianPhone');
    if (detailGuardianPhone) {
        if (student.guardianPhone) {
            detailGuardianPhone.textContent = student.guardianPhone;
            if (student.guardianName) {
                detailGuardianPhone.title = `Guardian: ${student.guardianName}`;
            }
        } else if (student.guardianName) {
            detailGuardianPhone.textContent = student.guardianName;
        } else {
            detailGuardianPhone.textContent = '-';
        }
    }

    const detailBatch = document.getElementById('detailBatch');
    if (detailBatch) detailBatch.textContent = student.batch || '-';

    const currentFee = student.fee || 0;
    const detailFee = document.getElementById('detailFee');
    if (detailFee) detailFee.textContent = `৳${currentFee.toLocaleString('en-US')}`;

    const statusEl = document.getElementById('detailStatus');
    if (statusEl) {
        const isInactive = student.status && student.status.toLowerCase() === 'inactive';
        statusEl.innerHTML = `<span class="bt-status-badge ${isInactive ? 'status-inactive' : 'status-active'}">${student.status || 'Active'}</span>`;
    }

    // Inactive alert
    const inactiveWarning = document.getElementById('inactiveWarning');
    if (inactiveWarning) {
        const isInactive = student.status && student.status.toLowerCase() === 'inactive';
        inactiveWarning.style.display = isInactive ? 'flex' : 'none';
    }

    // Target batch dropdown
    populateTargetBatches(student.batch);

    // Show workflow card
    if (transferWorkflow) transferWorkflow.classList.add('active');
    studentDetailsCard.classList.add('active');
    transferFormSection.classList.add('active');
    notFound.classList.remove('active');
    transferSuccess.classList.remove('active');

    // Reset right side inputs
    document.getElementById('transferFee').value = 0;
    document.getElementById('transferNotes').value = '';
    resetTargetPreview();
}

// ============================================
// 7. POPULATE TARGET BATCHES
// ============================================
function populateTargetBatches(currentBatch) {
    targetBatchSelect.innerHTML = '<option value="">-- Choose New Batch --</option>';
    let availableCount = 0;

    batchesData.forEach(batch => {
        // Exclude student's current batch
        if (batch.name !== currentBatch && batch.status === 'Active') {
            const option = document.createElement('option');
            option.value = batch.name;
            option.textContent = `${batch.name} (৳${batch.fee || 0})`;
            option.dataset.fee = batch.fee || 0;
            targetBatchSelect.appendChild(option);
            availableCount++;
        }
    });

    if (availableCount === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No other active batches available';
        option.disabled = true;
        targetBatchSelect.appendChild(option);
    }
}

// ============================================
// 8. ON TARGET BATCH CHANGE
// ============================================
window.onTargetBatchChange = async function() {
    const targetBatch = targetBatchSelect.value;
    if (!targetBatch || !currentStudent) {
        targetPreviewRequest++;
        resetTargetPreview();
        return;
    }

    const requestId = ++targetPreviewRequest;
    transferBtn.disabled = true;
    newStudentIdDisplay.textContent = 'Calculating…';
    if (copyNewIdBtn) copyNewIdBtn.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/batches/${encodeURIComponent(targetBatch)}/next-student-id`);
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not calculate the next ID.');
        if (requestId !== targetPreviewRequest || targetBatchSelect.value !== targetBatch) return;
        newStudentIdDisplay.textContent = result.studentId;
        if (copyNewIdBtn) copyNewIdBtn.style.display = 'inline-flex';
        transferBtn.disabled = false;
    } catch (error) {
        if (requestId !== targetPreviewRequest) return;
        newStudentIdDisplay.textContent = 'Could not load';
        transferBtn.disabled = true;
        console.error('Could not preview next student ID:', error);
    }

    // Calculate new fee and difference
    const targetBatchObj = batchesData.find(b => b.name === targetBatch);
    const newFee = targetBatchObj ? (targetBatchObj.fee || 0) : (currentStudent.fee || 0);
    const currentFee = currentStudent.fee || 0;
    const diff = newFee - currentFee;

    if (newBatchFeeDisplay) {
        newBatchFeeDisplay.textContent = `৳${newFee.toLocaleString('en-US')}`;
    }

    if (feeDifferenceBadge) {
        if (diff > 0) {
            feeDifferenceBadge.className = 'bt-diff-badge increase';
            feeDifferenceBadge.textContent = `+৳${diff} increase`;
        } else if (diff < 0) {
            feeDifferenceBadge.className = 'bt-diff-badge decrease';
            feeDifferenceBadge.textContent = `-৳${Math.abs(diff)} decrease`;
        } else {
            feeDifferenceBadge.className = 'bt-diff-badge neutral';
            feeDifferenceBadge.textContent = 'Same fee';
        }
    }

};

function resetTargetPreview() {
    newStudentIdDisplay.textContent = '---';
    if (copyNewIdBtn) copyNewIdBtn.style.display = 'none';
    if (newBatchFeeDisplay) newBatchFeeDisplay.textContent = '৳0';
    if (feeDifferenceBadge) {
        feeDifferenceBadge.className = 'bt-diff-badge neutral';
        feeDifferenceBadge.textContent = 'No change';
    }
    transferBtn.disabled = true;
}

// ============================================
// 10. COPY STUDENT ID
// ============================================
window.copyNewStudentId = function() {
    const idText = newStudentIdDisplay.textContent;
    if (!idText || idText === '---') return;

    navigator.clipboard.writeText(idText).then(() => {
        const originalIcon = copyNewIdBtn.innerHTML;
        copyNewIdBtn.innerHTML = '<i class="fas fa-check" style="color:#10b981;"></i>';
        setTimeout(() => {
            copyNewIdBtn.innerHTML = originalIcon;
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy ID:', err);
    });
};

// ============================================
// 11. CONFIRM MODAL
// ============================================
window.showConfirmModal = function() {
    if (!currentStudent || !targetBatchSelect.value) return;

    const targetBatch = targetBatchSelect.value;
    const newId = newStudentIdDisplay.textContent;
    const transferFee = parseFloat(document.getElementById('transferFee').value) || 0;
    const notes = document.getElementById('transferNotes').value.trim();
    const targetBatchObj = batchesData.find(b => b.name === targetBatch);
    const newFee = targetBatchObj ? targetBatchObj.fee : currentStudent.fee;

    const confirmDetails = document.getElementById('confirmDetails');
    confirmDetails.innerHTML = `
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Student Name</span>
            <span class="bt-confirm-val">${currentStudent.name}</span>
        </div>
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Current Batch</span>
            <span class="bt-confirm-val">${currentStudent.batch}</span>
        </div>
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Current ID</span>
            <span class="bt-confirm-val">${currentStudent.studentId}</span>
        </div>
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Target Batch</span>
            <span class="bt-confirm-val highlight">${targetBatch}</span>
        </div>
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">New Student ID</span>
            <span class="bt-confirm-val highlight">${newId}</span>
        </div>
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">New Monthly Fee</span>
            <span class="bt-confirm-val">৳${(newFee || 0).toLocaleString('en-US')}</span>
        </div>
        ${transferFee > 0 ? `
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Transfer Fee</span>
            <span class="bt-confirm-val">৳${transferFee}</span>
        </div>` : ''}
        ${notes ? `
        <div class="bt-confirm-row">
            <span class="bt-confirm-label">Notes</span>
            <span class="bt-confirm-val">${notes}</span>
        </div>` : ''}
    `;

    confirmModal.classList.add('active');
};

window.closeConfirmModal = function() {
    confirmModal.classList.remove('active');
};

// ============================================
// 12. EXECUTE TRANSFER
// ============================================
window.executeTransfer = async function() {
    const targetBatch = targetBatchSelect.value;
    const transferFee = parseFloat(document.getElementById('transferFee').value) || 0;
    const notes = document.getElementById('transferNotes').value.trim();
    
    const confirmBtn = document.getElementById('confirmTransferBtn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transferring...';

    try {
        const response = await fetch(`${API_BASE_URL}/batches/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: currentStudent.studentId,
                targetBatch: targetBatch,
                transferFee: transferFee,
                notes: notes
            })
        });

        const result = await response.json();

        if (result.success) {
            closeConfirmModal();

            // Hide workflow, show success state
            if (transferWorkflow) transferWorkflow.classList.remove('active');
            studentDetailsCard.classList.remove('active');
            transferFormSection.classList.remove('active');

            const data = result.data;
            const successDetails = document.getElementById('successDetails');
            successDetails.innerHTML = `
                <div class="bt-summary-item">
                    <span class="bt-summary-label">Student Name</span>
                    <span class="bt-summary-val">${data.student.name}</span>
                </div>
                <div class="bt-summary-item">
                    <span class="bt-summary-label">Transfer Date</span>
                    <span class="bt-summary-val">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div class="bt-summary-item">
                    <span class="bt-summary-label">From Batch</span>
                    <span class="bt-summary-val">${data.previousBatch} <small>(${data.previousStudentId})</small></span>
                </div>
                <div class="bt-summary-item">
                    <span class="bt-summary-label">To Batch</span>
                    <span class="bt-summary-val text-primary">${data.targetBatch} <small>(${data.newStudentId})</small></span>
                </div>
                ${transferFee > 0 ? `
                <div class="bt-summary-item">
                    <span class="bt-summary-label">Transfer Fee</span>
                    <span class="bt-summary-val">৳${transferFee}</span>
                </div>` : ''}
                <div class="bt-summary-item">
                    <span class="bt-summary-label">Record Status</span>
                    <span class="bt-summary-val text-success"><i class="fas fa-check-circle"></i> Payments & Results Linked</span>
                </div>
            `;

            transferSuccess.classList.add('active');

            // Refresh the cache before another transfer is started on this page.
            await Promise.all([loadAllStudents(), loadRecentTransfers()]);

        } else {
            alert('❌ Transfer Failed: ' + result.message);
        }

    } catch (error) {
        console.error('Transfer error:', error);
        alert('❌ Network or server error. Please ensure backend server is operational.');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Transfer';
    }
};

// ============================================
// 13. RESET ACTIONS
// ============================================
window.resetForm = function() {
    targetBatchSelect.value = '';
    document.getElementById('transferFee').value = 0;
    document.getElementById('transferNotes').value = '';
    resetTargetPreview();
};

window.resetAll = function() {
    currentStudent = null;
    searchInput.value = '';
    hideSuggestions();
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    if (transferWorkflow) transferWorkflow.classList.remove('active');
    studentDetailsCard.classList.remove('active');
    transferFormSection.classList.remove('active');
    transferSuccess.classList.remove('active');
    notFound.classList.remove('active');

    targetBatchSelect.innerHTML = '<option value="">-- Choose New Batch --</option>';
    document.getElementById('transferFee').value = 0;
    document.getElementById('transferNotes').value = '';
    resetTargetPreview();

    searchInput.focus();
};

// ============================================
// 14. RECENT TRANSFERS LOG
// ============================================
window.loadRecentTransfers = async function() {
    if (!recentTransfersBody) return;

    const refreshIcon = document.getElementById('recentRefreshIcon');
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    try {
        const response = await fetch(`${API_BASE_URL}/batches/transfers/recent`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load recent transfers.');
        renderRecentTransfers(Array.isArray(data.transfers) ? data.transfers : []);
    } catch (error) {
        recentTransfersBody.innerHTML = `
            <tr>
                <td colspan="7" class="bt-table-empty">
                    <i class="fas fa-info-circle"></i> Unable to load recent transfers. Please refresh and try again.
                </td>
            </tr>
        `;
    } finally {
        if (refreshIcon) setTimeout(() => refreshIcon.classList.remove('fa-spin'), 400);
    }
};

function renderRecentTransfers(list) {
    if (!recentTransfersBody) return;

    if (!list.length) {
        recentTransfersBody.innerHTML = `
            <tr>
                <td colspan="7" class="bt-table-empty">
                    <i class="fas fa-inbox"></i> No recent batch transfers recorded yet.
                </td>
            </tr>
        `;
        return;
    }

    recentTransfersBody.innerHTML = list.map(item => {
        // Parse from rawNote if available
        let fromBatch = item.previousBatch || 'Previous';
        let toBatch = item.currentBatch || 'Target';
        let fee = item.transferFee || 0;
        
        if (item.rawNote) {
            const matchFrom = item.rawNote.match(/From "([^"]+)"/);
            const matchTo = item.rawNote.match(/To "([^"]+)"/);
            const matchFee = item.rawNote.match(/Transfer Fee: ৳([0-9]+)/);
            if (matchFrom) fromBatch = matchFrom[1];
            if (matchTo) toBatch = matchTo[1];
            if (matchFee) fee = matchFee[1];
        }

        const dateStr = item.updatedAt || item.date;
        const formattedDate = dateStr 
            ? new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Recent';

        return `
            <tr>
                <td>
                    <strong>${item.studentName || 'Student'}</strong><br>
                    <small class="text-muted" style="font-family:monospace;">${item.currentStudentId || ''}</small>
                </td>
                <td><span class="bt-status-badge" style="background:#f1f5f9;color:#475569;">${fromBatch}</span></td>
                <td class="text-center">
                    <span class="bt-transfer-arrow-pill"><i class="fas fa-arrow-right"></i></span>
                </td>
                <td><span class="bt-status-badge status-active">${toBatch}</span></td>
                <td>${fee > 0 ? `৳${fee}` : '<span class="text-muted">None</span>'}</td>
                <td><small>${formattedDate}</small></td>
                <td><span class="bt-status-badge status-active"><i class="fas fa-check"></i> Completed</span></td>
            </tr>
        `;
    }).join('');
}

// ============================================
// 15. EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Search input enter & typing
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            searchStudent();
        }
    });

    searchInput.addEventListener('input', handleSearchInput);

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.bt-input-icon-group')) {
            hideSuggestions();
        }
    });

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmModal.classList.contains('active')) {
            closeConfirmModal();
        }
    });

    // Sidebar toggle support
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.toggle('active');
        });
    }
}

// ============================================
// 16. RUN
// ============================================
init();

});
