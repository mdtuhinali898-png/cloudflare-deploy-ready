// frontend/ucc/assets/js/student-profile.js

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? `${window.location.protocol}//${window.location.hostname}:${window.location.port || '5002'}/api`
    : 'http://localhost:5002/api';
  let currentRawStudent = null;

  // Format currency
  function fmt(amt) {
    return '৳' + Number(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Get roll parameter from URL
  function getRollFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('roll') || params.get('id');
  }

  // Switch tabs
  window.switchTab = function(tabName, btnEl) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content-panel').forEach(panel => panel.classList.remove('active'));

    btnEl.classList.add('active');
    const targetPanel = document.getElementById(`tab-${tabName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
  };

  // Close Edit Modal
  window.closeEditModal = function() {
    const modal = document.getElementById('editUccStudentModal');
    if (modal) modal.style.display = 'none';
  };

  // Dynamic fee calculation preview in edit modal
  window.calculateUccEditNetFee = function() {
    const courseFee = parseFloat(document.getElementById('uccEditCourseFee').value) || 0;
    const discountType = document.getElementById('uccEditDiscountType').value;
    const discountValue = parseFloat(document.getElementById('uccEditDiscountValue').value) || 0;

    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = Math.round((courseFee * discountValue) / 100);
    } else if (discountType === 'fixed') {
      discountAmount = discountValue;
    }

    const netFee = Math.max(0, courseFee - discountAmount);
    const totalPaid = currentRawStudent ? (currentRawStudent.totalPaid || 0) : 0;
    const totalDue = Math.max(0, netFee - totalPaid);

    document.getElementById('previewNetFee').textContent = fmt(netFee);
    document.getElementById('previewTotalPaid').textContent = fmt(totalPaid);
    document.getElementById('previewTotalDue').textContent = fmt(totalDue);
  };

  // Open Edit Modal
  window.openEditModal = async function() {
    if (!currentRawStudent) {
      alert('Student data is not loaded yet');
      return;
    }

    // Populate modal fields
    document.getElementById('uccEditRoll').value = currentRawStudent.roll || '';
    document.getElementById('uccEditName').value = currentRawStudent.name || '';
    document.getElementById('uccEditPhone').value = currentRawStudent.phone || '';
    document.getElementById('uccEditGuardianPhone').value = currentRawStudent.guardianPhone || '';
    document.getElementById('uccEditGuardianName').value = currentRawStudent.guardianName || '';
    document.getElementById('uccEditEmail').value = currentRawStudent.email || '';
    document.getElementById('uccEditProgram').value = currentRawStudent.program || 'Medical';
    document.getElementById('uccEditBranch').value = currentRawStudent.branch || 'Pabna';
    document.getElementById('uccEditStatus').value = currentRawStudent.status || 'Active';
    document.getElementById('uccEditCourseFee').value = currentRawStudent.courseFee || 0;
    document.getElementById('uccEditDiscountType').value = currentRawStudent.discountType || 'none';
    document.getElementById('uccEditDiscountValue').value = currentRawStudent.discountValue || 0;
    document.getElementById('uccEditDiscountReference').value = currentRawStudent.discountReference || '';
    document.getElementById('uccEditAddress').value = currentRawStudent.address || '';
    document.getElementById('uccEditNotes').value = currentRawStudent.notes || '';

    // Load available UCC batches
    const batchSelect = document.getElementById('uccEditBatchName');
    batchSelect.innerHTML = '<option value="">Loading batches...</option>';
    try {
      const res = await fetch(`${API_BASE_URL}/ucc/batches`);
      const data = await res.json();
      if (data.success && data.batches) {
        batchSelect.innerHTML = '';
        const batchNames = new Set(data.batches.map(b => b.batchName));
        if (currentRawStudent.batchName) batchNames.add(currentRawStudent.batchName);

        Array.from(batchNames).forEach(bName => {
          const opt = document.createElement('option');
          opt.value = bName;
          opt.textContent = bName;
          if (bName === currentRawStudent.batchName) opt.selected = true;
          batchSelect.appendChild(opt);
        });
      } else {
        batchSelect.innerHTML = `<option value="${currentRawStudent.batchName || 'General'}" selected>${currentRawStudent.batchName || 'General Batch'}</option>`;
      }
    } catch (e) {
      console.error('Error fetching UCC batches:', e);
      batchSelect.innerHTML = `<option value="${currentRawStudent.batchName || 'General'}" selected>${currentRawStudent.batchName || 'General Batch'}</option>`;
    }

    calculateUccEditNetFee();
    document.getElementById('editUccStudentModal').style.display = 'flex';
  };

  // Save UCC Student Edit
  window.saveUccEditStudent = async function(event) {
    event.preventDefault();
    if (!currentRawStudent) return;

    const payload = {
      roll: document.getElementById('uccEditRoll').value.trim(),
      name: document.getElementById('uccEditName').value.trim(),
      phone: document.getElementById('uccEditPhone').value.trim(),
      guardianPhone: document.getElementById('uccEditGuardianPhone').value.trim(),
      guardianName: document.getElementById('uccEditGuardianName').value.trim(),
      email: document.getElementById('uccEditEmail').value.trim(),
      batchName: document.getElementById('uccEditBatchName').value,
      program: document.getElementById('uccEditProgram').value,
      branch: document.getElementById('uccEditBranch').value.trim() || 'Pabna',
      status: document.getElementById('uccEditStatus').value,
      courseFee: Number(document.getElementById('uccEditCourseFee').value || 0),
      discountType: document.getElementById('uccEditDiscountType').value,
      discountValue: Number(document.getElementById('uccEditDiscountValue').value || 0),
      discountReference: document.getElementById('uccEditDiscountReference').value.trim(),
      address: document.getElementById('uccEditAddress').value.trim(),
      notes: document.getElementById('uccEditNotes').value.trim()
    };

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE_URL}/ucc/students/${currentRawStudent._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update student profile');
      }

      closeEditModal();
      alert('Student profile updated successfully!');

      // If roll changed, update URL parameter so reloading profile works seamlessly
      if (payload.roll && payload.roll !== currentRawStudent.roll) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('roll', payload.roll);
        window.history.replaceState({}, '', newUrl.toString());
      }

      // Reload profile immediately
      await loadStudentProfile();
    } catch (error) {
      console.error('Error updating UCC student:', error);
      alert(error.message || 'Error updating student profile');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };

  async function loadStudentProfile() {
    const roll = getRollFromURL();

    if (!roll) {
      // No roll parameter - show error state
      document.getElementById('profileName').textContent = 'No Student Selected';
      document.getElementById('profileRoll').textContent = 'ROLL: ---';
      return;
    }

    try {
      // Fetch from UCC API
      const response = await fetch(`${API_BASE_URL}/ucc/students?search=${encodeURIComponent(roll)}`);
      const data = await response.json();

      if (!data.success || !data.students || data.students.length === 0) {
        document.getElementById('profileName').textContent = `No Student Found (Roll: ${roll})`;
        document.getElementById('profileRoll').textContent = 'ROLL: ---';
        return;
      }

      // Find exact roll match first
      const s = data.students.find(st => st.roll === roll) || data.students[0];
      currentRawStudent = s;

      // Map UCC data to display format
      const student = {
        _id: s._id,
        roll: s.roll,
        name: s.name,
        phone: s.phone || 'N/A',
        guardian: s.guardianName || 'N/A',
        guardianPhone: s.guardianPhone || 'N/A',
        batch: s.batchName || 'General',
        program: s.program || 'N/A',
        branch: s.branch || 'Pabna',
        totalFee: s.finalFee || s.courseFee || 0,
        courseFee: s.courseFee || 0,
        discount: s.discountAmount || 0,
        paid: s.totalPaid || 0,
        due: s.totalDue || 0,
        paymentStatus: s.paymentStatus || 'Unpaid',
        materials: s.distributionOverride ? 'Distributed' : (s.totalDue === 0 ? 'Distributed' : 'Pending'),
        status: s.status || 'Active',
        admissionDate: s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'
      };

      // Populate Page Header
      document.getElementById('avatarLetter').textContent = (student.name || 'S').charAt(0).toUpperCase();
      document.getElementById('profileName').textContent = student.name || 'Student Name';
      document.getElementById('profileRoll').textContent = `ROLL: ${student.roll || 'N/A'}`;
      document.getElementById('profileBatch').textContent = student.batch || 'General Batch';
      document.getElementById('profilePhone').textContent = student.phone || 'N/A';
      document.getElementById('profileGuardian').textContent = student.guardianPhone || student.guardian || 'N/A';

      // Status badge
      const statusBadge = document.getElementById('profileStatus');
      if (student.status === 'Active') {
        statusBadge.className = 'status-badge-custom status-active';
        statusBadge.textContent = 'ACTIVE';
      } else {
        statusBadge.className = 'status-badge-custom status-inactive';
        statusBadge.textContent = (student.status || 'INACTIVE').toUpperCase();
      }

      // Action Links
      document.getElementById('btnCollectPayment').href = `payment.html?roll=${encodeURIComponent(student.roll)}`;
      document.getElementById('btnIssueMaterials').href = `distribution.html?roll=${encodeURIComponent(student.roll)}`;

      // Populate Stat Cards
      const totalFee = student.totalFee || 0;
      const paid = student.paid || 0;
      const due = student.due !== undefined ? student.due : Math.max(0, totalFee - paid);

      document.getElementById('statTotalFee').textContent = fmt(totalFee);
      document.getElementById('statTotalPaid').textContent = fmt(paid);
      document.getElementById('statTotalDue').textContent = fmt(due);
      document.getElementById('statMaterialStatus').textContent = student.materials || 'Pending';

      // Payment status badge on stat
      if (due <= 0) {
        document.getElementById('statMaterialStatus').textContent = 'Full Paid';
      }

      // Tab 1: Overview
      document.getElementById('infoName').textContent = student.name || '---';
      document.getElementById('infoRoll').textContent = student.roll || '---';
      document.getElementById('infoPhone').textContent = student.phone || '---';
      document.getElementById('infoGuardian').textContent = student.guardian || '---';
      document.getElementById('infoGuardianPhone').textContent = student.guardianPhone || '---';
      document.getElementById('infoBatch').textContent = student.batch || '---';
      document.getElementById('infoUnit').textContent = student.program || '---';
      document.getElementById('infoBranch').textContent = student.branch || 'Pabna Branch';
      document.getElementById('infoAdmissionDate').textContent = student.admissionDate || '---';

      // Tab 2: Payments History - Fetch actual payment records
      try {
        const payRes = await fetch(`${API_BASE_URL}/ucc/students/${student._id}`);
        const payData = await payRes.json();
        if (payData.success && payData.payments && payData.payments.length > 0) {
          const paymentBody = document.getElementById('paymentHistoryBody');
          paymentBody.innerHTML = payData.payments.map(p => `
            <tr>
              <td style="font-weight:700;color:var(--ucc-primary);">${p.receiptNo}</td>
              <td>${new Date(p.paymentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td>${p.paymentType || 'Installment'}${p.remarks ? ' - ' + p.remarks : ''}</td>
              <td>${p.paymentMethod || 'Cash'}</td>
              <td style="font-weight:800;color:var(--ucc-success);">${fmt(p.amount)}</td>
              <td>
                <a href="payment.html?receipt=${encodeURIComponent(p.receiptNo)}" class="ucc-btn ucc-btn-sm ucc-btn-outline" style="padding:4px 10px;font-size:12px;">
                  <i class="fas fa-print"></i> Receipt
                </a>
              </td>
            </tr>
          `).join('');
        } else {
          document.getElementById('paymentHistoryBody').innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No payment records found.</td>
            </tr>
          `;
        }

        // Tab 4: Exam Results — from same API response
        const examBody = document.getElementById('examHistoryBody');
        if (examBody) {
          if (payData.success && payData.results && payData.results.length > 0) {
            // Only show results from Published exams
            const published = payData.results.filter(r => {
              const exam = r.examId;
              return exam && exam.status === 'Completed'; // backend: Published = Completed
            });

            if (published.length > 0) {
              examBody.innerHTML = published.map(r => {
                const exam    = r.examId || {};
                const name    = exam.title || '—';
                const subject = (exam.subjects && exam.subjects.length) ? exam.subjects.map(s => s.subjectName).join(' + ') : '—';
                const total   = exam.totalMarks || 100;
                const obtained = r.totalObtained != null ? r.totalObtained : '—';
                const pct     = r.percentage != null ? r.percentage + '%' : '—';
                const rank    = r.meritPosition && r.status !== 'Absent' ? `Rank #${r.meritPosition}` : '—';
                const rankBg  = r.meritPosition === 1 ? '#fef9c3;color:#92400e' :
                                r.meritPosition === 2 ? '#f1f5f9;color:#475569' :
                                r.meritPosition === 3 ? '#fdf2f8;color:#9d174d' :
                                '#e0e7ff;color:#3730a3';
                const statusColor = r.status === 'Pass' ? '#15803d' : r.status === 'Absent' ? '#92400e' : '#dc2626';

                return `<tr>
                  <td style="font-weight:700;">${name}</td>
                  <td>${subject}</td>
                  <td style="font-weight:800;color:var(--ucc-primary);">${r.status === 'Absent' ? 'Absent' : obtained}</td>
                  <td>${r.status === 'Absent' ? '—' : total}</td>
                  <td style="font-weight:700;color:${statusColor};">${pct}</td>
                  <td>
                    <span style="background:${rankBg};padding:4px 10px;border-radius:12px;font-weight:800;font-size:12px;">
                      ${r.status === 'Absent' ? 'Absent' : rank}
                    </span>
                  </td>
                </tr>`;
              }).join('');
            } else {
              examBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No published exam results yet.</td></tr>`;
            }
          } else {
            examBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No exam results found.</td></tr>`;
          }
        }
      } catch (payErr) {
        console.warn('Failed to fetch payments/results:', payErr);
        const examBody = document.getElementById('examHistoryBody');
        if (examBody) examBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Failed to load exam results.</td></tr>`;
      }

      // Tab 3: Materials
      const matItemsEl = document.getElementById('materialItemsList');
      if (matItemsEl) {
        matItemsEl.textContent = student.materials === 'Distributed' 
          ? 'All books & lecture sheets issued. ✅'
          : `Pending due: ${fmt(due)}. Books & sheets will be issued after due cleared.`;
      }

    } catch (err) {
      console.error('Error loading student profile:', err);
      document.getElementById('profileName').textContent = 'Error Loading Student';
      document.getElementById('profileRoll').textContent = 'ROLL: ---';
    }
  }

  // Close UCC modal on backdrop click
  const uccEditModal = document.getElementById('editUccStudentModal');
  if (uccEditModal) {
    uccEditModal.addEventListener('click', (e) => {
      if (e.target === uccEditModal) closeEditModal();
    });
  }

  loadStudentProfile();
});
