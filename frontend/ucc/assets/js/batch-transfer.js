// ============================================
// UCC BATCH TRANSFER - MAIN SCRIPT
// ============================================

const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? (window.location.port === '5002' ? '/api/ucc' : `${window.location.protocol}//${window.location.hostname}:5002/api/ucc`)
  : 'http://localhost:5002/api/ucc';

let currentStudent = null;
let availableBatches = [];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Hide loading screen
  setTimeout(() => {
    const loading = document.getElementById('uccLoading');
    if (loading) loading.style.display = 'none';
  }, 800);

  // Load available batches
  await loadBatches();

  // Event listeners
  document.getElementById('searchBtn')?.addEventListener('click', searchStudent);
  document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchStudent();
  });
  document.getElementById('targetBatch')?.addEventListener('change', onBatchChange);
  document.getElementById('resetBtn')?.addEventListener('click', resetForm);
  document.getElementById('transferBtn')?.addEventListener('click', showConfirmModal);
  document.getElementById('transferAnotherBtn')?.addEventListener('click', resetAll);
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeModal);
  document.getElementById('modalConfirmBtn')?.addEventListener('click', executeTransfer);
});

// ============================================
// LOAD BATCHES
// ============================================

async function loadBatches() {
  try {
    const response = await fetch(`${API_BASE_URL}/batches`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('Batches loaded:', data); // Debug log
    
    if (data.success && Array.isArray(data.batches)) {
      availableBatches = data.batches.filter(b => b.status === 'Active');
      console.log('Active batches:', availableBatches.length); // Debug log
      populateBatchDropdown();
    } else {
      console.warn('No batches found or invalid response');
    }
  } catch (error) {
    console.error('Error loading batches:', error);
    showToast('Failed to load batches. Please refresh the page.', 'error');
  }
}

function populateBatchDropdown() {
  const select = document.getElementById('targetBatch');
  if (!select) return;

  select.innerHTML = '<option value="">Select Target Batch</option>';
  
  availableBatches.forEach(batch => {
    const option = document.createElement('option');
    option.value = batch._id;
    option.textContent = `${batch.batchName} (${batch.program})`;
    option.dataset.batchName = batch.batchName;
    option.dataset.program = batch.program;
    select.appendChild(option);
  });
}

// ============================================
// SEARCH STUDENT
// ============================================

async function searchStudent() {
  const searchValue = document.getElementById('searchInput')?.value.trim();
  
  if (!searchValue) {
    showToast('Please enter a Student ID, Roll, or Phone Number', 'warning');
    return;
  }

  // Show loading
  hideAllStates();
  document.getElementById('loadingState')?.classList.add('active');

  try {
    // Search by studentId, roll, or phone
    const response = await fetch(`${API_BASE_URL}/students?search=${encodeURIComponent(searchValue)}`);
    
    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('Search response:', data); // Debug log

    if (data.success && data.students && data.students.length > 0) {
      // If multiple students found, take the first one (or implement selection)
      currentStudent = data.students[0];
      console.log('Found student:', currentStudent); // Debug log
      displayStudentDetails(currentStudent);
    } else {
      // Student not found
      console.log('No students found for:', searchValue); // Debug log
      hideAllStates();
      document.getElementById('notFoundState')?.classList.add('active');
      currentStudent = null;
    }
  } catch (error) {
    console.error('Error searching student:', error);
    showToast('Failed to connect to server. Please check if the backend is running.', 'error');
    hideAllStates();
  }
}

function displayStudentDetails(student) {
  hideAllStates();
  
  // Show student card
  const studentCard = document.getElementById('studentCard');
  if (studentCard) studentCard.classList.add('active');

  // Populate student details
  document.getElementById('studentName').textContent = student.name || '-';
  document.getElementById('studentId').textContent = student.studentId || '-';
  document.getElementById('studentRoll').textContent = student.roll || '-';
  document.getElementById('currentBatch').textContent = student.batchName || '-';
  document.getElementById('studentPhone').textContent = student.phone || '-';
  document.getElementById('studentProgram').textContent = student.program || '-';
  document.getElementById('studentFee').textContent = formatCurrency(student.courseFee || 0);
  document.getElementById('studentPaid').textContent = formatCurrency(student.totalPaid || 0);
  document.getElementById('studentDue').textContent = formatCurrency(student.totalDue || 0);

  // Payment status badge
  const statusElement = document.getElementById('studentPaymentStatus');
  if (statusElement) {
    const status = student.paymentStatus || 'Unpaid';
    let badgeClass = 'badge-danger';
    if (status === 'Full Paid') badgeClass = 'badge-success';
    else if (status === 'Partial Paid') badgeClass = 'badge-warning';
    
    statusElement.innerHTML = `<span class="badge ${badgeClass}">${status}</span>`;
  }

  // Student avatar (initials)
  const avatar = document.getElementById('studentAvatar');
  if (avatar && student.name) {
    const initials = student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatar.textContent = initials;
  }

  // Show transfer form
  const transferForm = document.getElementById('transferForm');
  if (transferForm) transferForm.classList.add('active');

  // Reset form fields
  document.getElementById('targetBatch').value = '';
  document.getElementById('transferNotes').value = '';
  document.getElementById('newRollPreviewGroup').style.display = 'none';
  document.getElementById('transferBtn').disabled = true;
}

// ============================================
// BATCH CHANGE HANDLER
// ============================================

async function onBatchChange() {
  const select = document.getElementById('targetBatch');
  const selectedOption = select.options[select.selectedIndex];
  
  if (!select.value || !currentStudent) {
    document.getElementById('newRollPreviewGroup').style.display = 'none';
    document.getElementById('transferBtn').disabled = true;
    return;
  }

  const targetBatchName = selectedOption.dataset.batchName;

  // Check if transferring to same batch
  if (targetBatchName === currentStudent.batchName) {
    showToast('Cannot transfer to the same batch', 'warning');
    select.value = '';
    document.getElementById('newRollPreviewGroup').style.display = 'none';
    document.getElementById('transferBtn').disabled = true;
    return;
  }

  // Get next available roll for target batch
  try {
    const url = `${API_BASE_URL}/batches/${encodeURIComponent(targetBatchName)}/next-roll`;
    console.log('Fetching next roll from:', url); // Debug
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Next roll response:', data); // Debug

    if (data.success && data.nextRoll) {
      const nextRoll = data.nextRoll;
      
      // Display new roll preview
      document.getElementById('newRollPreview').textContent = nextRoll;
      document.getElementById('newRollPreviewGroup').style.display = 'block';
      document.getElementById('transferBtn').disabled = false;
    } else {
      console.error('Invalid response:', data);
      showToast('Failed to fetch next roll number', 'error');
      document.getElementById('transferBtn').disabled = true;
    }
  } catch (error) {
    console.error('Error fetching next roll:', error);
    showToast(`Failed to fetch next roll: ${error.message}`, 'error');
    document.getElementById('transferBtn').disabled = true;
  }
}

// ============================================
// SHOW CONFIRMATION MODAL
// ============================================

function showConfirmModal() {
  if (!currentStudent) return;

  const select = document.getElementById('targetBatch');
  const selectedOption = select.options[select.selectedIndex];
  const targetBatchName = selectedOption.dataset.batchName;
  const newRoll = document.getElementById('newRollPreview').textContent;
  const notes = document.getElementById('transferNotes')?.value || 'N/A';

  // Populate confirmation details
  const confirmDetails = document.getElementById('confirmDetails');
  confirmDetails.innerHTML = `
    <div class="confirm-row">
      <span class="confirm-label">Student Name</span>
      <span class="confirm-value">${currentStudent.name}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Current Student ID</span>
      <span class="confirm-value">${currentStudent.studentId}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Current Roll</span>
      <span class="confirm-value">${currentStudent.roll}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Batch Transfer</span>
      <span class="confirm-value">
        ${currentStudent.batchName}
        <i class="fas fa-arrow-right transfer-arrow"></i>
        ${targetBatchName}
      </span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">New Roll</span>
      <span class="confirm-value" style="color: #10b981;">${newRoll}</span>
    </div>
    ${notes !== 'N/A' ? `
      <div class="confirm-row">
        <span class="confirm-label">Notes</span>
        <span class="confirm-value">${notes}</span>
      </div>
    ` : ''}
  `;

  // Show modal
  document.getElementById('confirmModal')?.classList.add('active');
}

function closeModal() {
  document.getElementById('confirmModal')?.classList.remove('active');
}

// ============================================
// EXECUTE TRANSFER
// ============================================

async function executeTransfer() {
  const select = document.getElementById('targetBatch');
  const selectedOption = select.options[select.selectedIndex];
  const targetBatchName = selectedOption.dataset.batchName;
  const notes = document.getElementById('transferNotes')?.value || '';

  if (!currentStudent || !targetBatchName) return;

  // Disable button and show loading
  const confirmBtn = document.getElementById('modalConfirmBtn');
  const originalBtnText = confirmBtn.innerHTML;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transferring...';
  confirmBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/batch-transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: currentStudent.studentId,
        targetBatchName: targetBatchName,
        notes: notes
      })
    });

    const data = await response.json();

    if (data.success) {
      // Close modal
      closeModal();

      // Show success state
      hideAllStates();
      document.getElementById('successState')?.classList.add('active');

      // Populate success details
      const successDetails = document.getElementById('successDetails');
      successDetails.innerHTML = `
        <div class="confirm-row">
          <span class="confirm-label">Student Name</span>
          <span class="confirm-value">${currentStudent.name}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Previous Batch</span>
          <span class="confirm-value">${data.data?.oldBatch || currentStudent.batchName}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">New Batch</span>
          <span class="confirm-value" style="color: #10b981;">${data.data?.newBatch || targetBatchName}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">Previous Roll</span>
          <span class="confirm-value">${currentStudent.roll}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">New Roll</span>
          <span class="confirm-value" style="color: #10b981;">${data.data?.student?.roll || '-'}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">New Student ID</span>
          <span class="confirm-value" style="color: #10b981;">${data.data?.student?.studentId || '-'}</span>
        </div>
      `;

      showToast('Batch transfer successful!', 'success');
    } else {
      showToast(data.message || 'Failed to transfer student', 'error');
    }
  } catch (error) {
    console.error('Error transferring student:', error);
    showToast('Failed to transfer student', 'error');
  } finally {
    // Restore button
    confirmBtn.innerHTML = originalBtnText;
    confirmBtn.disabled = false;
  }
}

// ============================================
// RESET FUNCTIONS
// ============================================

function resetForm() {
  document.getElementById('targetBatch').value = '';
  document.getElementById('transferNotes').value = '';
  document.getElementById('newRollPreviewGroup').style.display = 'none';
  document.getElementById('transferBtn').disabled = true;
}

function resetAll() {
  // Clear search
  document.getElementById('searchInput').value = '';
  
  // Clear current student
  currentStudent = null;
  
  // Hide all states
  hideAllStates();
  
  // Reset form
  resetForm();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function hideAllStates() {
  document.getElementById('loadingState')?.classList.remove('active');
  document.getElementById('notFoundState')?.classList.remove('active');
  document.getElementById('studentCard')?.classList.remove('active');
  document.getElementById('transferForm')?.classList.remove('active');
  document.getElementById('successState')?.classList.remove('active');
}

function formatCurrency(amount) {
  return `৳${Number(amount || 0).toLocaleString('en-IN')}`;
}

function showToast(message, type = 'info') {
  // Simple toast notification
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-weight: 600;
    font-size: 14px;
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
