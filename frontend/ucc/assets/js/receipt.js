// frontend/ucc/assets/js/receipt.js

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const API_BASE_URL = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? (window.location.port === '5002' ? '/api' : `${window.location.protocol}//${window.location.hostname}:5002/api`)
    : 'http://localhost:5002/api';

  async function fetchApi(endpoint) {
    try {
      const url = `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
      console.log('[RECEIPT] Fetching:', url);
      const res = await fetch(url);
      console.log('[RECEIPT] Response status:', res.status, res.statusText);
      
      if (res.ok) {
        const json = await res.json();
        console.log('[RECEIPT] Response data:', json);
        if (json && json.success) return json;
        console.warn('[RECEIPT] Response success=false:', json.message);
        return null; // Changed from continuing to return null
      } else {
        console.error('[RECEIPT] HTTP error:', res.status, res.statusText);
        const errorText = await res.text();
        console.error('[RECEIPT] Error response:', errorText);
        
        // Show user-friendly error for 404
        if (res.status === 404) {
          const urlParams = new URLSearchParams(window.location.search);
          const receiptNo = urlParams.get('receipt') || '';
          alert(`⚠️ Receipt not found in database!\n\nReceipt Number: ${receiptNo}\n\nThis could mean:\n1. Payment was not saved in database\n2. Receipt number is incorrect\n3. Backend server issue\n\nPlease check browser console for details.`);
        }
      }
    } catch (e) {
      console.error('[RECEIPT] API fetch error:', e);
      alert(`❌ Network Error: Cannot connect to backend server!\n\nError: ${e.message}\n\nPlease check:\n1. Backend server is running on port 5002\n2. MongoDB is connected\n3. Internet connection`);
    }
    return null;
  }

  // Format currency
  function fmtBDT(val) {
    return '৳' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Paper Size Toggle
  window.changePaperSize = function(size) {
    const container = document.getElementById('receiptContainer');
    const buttons = document.querySelectorAll('.size-btn');

    buttons.forEach(btn => {
      if (btn.getAttribute('data-size') === size) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (container) {
      if (size === 'a4') {
        container.classList.remove('a5-paper');
        container.classList.add('a4-paper');
      } else {
        container.classList.remove('a4-paper');
        container.classList.add('a5-paper');
      }
    }
    document.body.dataset.paperSize = size;
  };

  // Dedicated Print Receipt function
  window.printReceipt = function() {
    try {
      window.focus();
      setTimeout(() => {
        window.print();
      }, 50);
    } catch (err) {
      console.error('Print failed:', err);
      window.print();
    }
  };

  // Download PDF
  window.downloadPDF = function() {
    const element = document.getElementById('receiptContainer');
    if (!element) return;

    const receiptNo = document.getElementById('receiptNo').textContent || 'UCC-Receipt';
    const opt = {
      margin:       0.2,
      filename:     `${receiptNo}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a5', orientation: 'portrait' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(element).save();
    } else {
      window.print();
    }
  };

  // Populate Receipt Data
  async function loadReceipt() {
    const urlParams = new URLSearchParams(window.location.search);
    const receiptNo = urlParams.get('receipt') || urlParams.get('id') || '';
    const roll = urlParams.get('roll') || '';

    console.log('[RECEIPT] Loading receipt with params:', { receiptNo, roll });

    let paymentData = null;
    let studentData = null;
    let historyData = [];

    // 1. Try fetching receipt data by receiptNo
    if (receiptNo) {
      console.log('[RECEIPT] Fetching from API:', `/ucc/payments/receipt/${encodeURIComponent(receiptNo)}?roll=${encodeURIComponent(roll)}`);
      const json = await fetchApi(`/ucc/payments/receipt/${encodeURIComponent(receiptNo)}?roll=${encodeURIComponent(roll)}`);
      console.log('[RECEIPT] API Response:', json);
      if (json && json.payment) {
        paymentData = json.payment;
        studentData = json.student;
        historyData = json.history || [];
        console.log('[RECEIPT] Payment data loaded:', paymentData);
      } else {
        console.warn('[RECEIPT] No payment data in response');
      }
    }

    // 2. Try fetching student profile by roll if studentData missing
    if (!studentData && roll) {
      console.log('[RECEIPT] Student data missing, fetching by roll:', roll);
      const sJson = await fetchApi(`/ucc/students?search=${encodeURIComponent(roll)}`);
      console.log('[RECEIPT] Student search response:', sJson);
      
      if (sJson && sJson.students && sJson.students.length > 0) {
        const st = sJson.students.find(s => s.roll === roll) || sJson.students[0];
        console.log('[RECEIPT] Student found:', st);
        
        studentData = {
          _id: st._id,
          roll: st.roll,
          name: st.name,
          father: st.guardianName || st.guardianPhone || 'N/A',
          batch: st.batchName || 'General',
          unit: st.program || 'Coaching',
          phone: st.phone || 'N/A',
          status: st.status || 'Active',
          courseFee: st.courseFee,
          discountAmount: st.discountAmount,
          finalFee: st.finalFee,
          totalPaid: st.totalPaid,
          totalDue: st.totalDue
        };
        console.log('[RECEIPT] Formatted student data:', studentData);

        // Fetch history profile if history empty
        if (st._id && historyData.length === 0) {
          const stProfileJson = await fetchApi(`/ucc/students/${st._id}`);
          if (stProfileJson && stProfileJson.payments) {
            historyData = stProfileJson.payments.map(p => ({
              receiptNo: p.receiptNo,
              date: p.paymentDate,
              type: p.paymentType,
              method: p.paymentMethod,
              amount: p.amount,
              trxId: p.transactionId
            }));
          }
        }
      }
    }

    // 3. Fallback to all students lookup if still missing
    if (!studentData) {
      console.log('[RECEIPT] Student data still missing, fetching all students');
      const allSJson = await fetchApi('/ucc/students');
      console.log('[RECEIPT] All students response:', allSJson);
      
      if (allSJson && allSJson.students && allSJson.students.length > 0) {
        const st = allSJson.students[0];
        console.log('[RECEIPT] Using first student as fallback:', st);
        
        studentData = {
          _id: st._id,
          roll: st.roll,
          name: st.name,
          father: st.guardianName || st.guardianPhone || 'N/A',
          batch: st.batchName || 'General',
          unit: st.program || 'Coaching',
          phone: st.phone || 'N/A',
          status: st.status || 'Active',
          courseFee: st.courseFee,
          discountAmount: st.discountAmount,
          finalFee: st.finalFee,
          totalPaid: st.totalPaid,
          totalDue: st.totalDue
        };
      }
    }
    
    console.log('[RECEIPT] Final paymentData:', paymentData);
    console.log('[RECEIPT] Final studentData:', studentData);

    // Clean fallback data if not fetched from API (No fake demo names)
    if (!paymentData) {
      console.warn('[RECEIPT] ⚠️ No payment data found! Using empty fallback.');
      paymentData = {
        receiptNo: receiptNo,
        date: new Date().toISOString(),
        paymentMethod: 'Cash',
        amount: 0,
        totalFee: 0,
        discount: 0,
        paid: 0,
        due: 0,
        status: 'Paid'
      };
    }

    if (!studentData) {
      console.warn('[RECEIPT] ⚠️ No student data found! Using empty fallback.');
      studentData = {
        roll: roll || 'N/A',
        name: 'Loading... (Student Not Found)',
        father: 'N/A',
        batch: 'General Batch',
        unit: 'Coaching Unit',
        phone: 'N/A',
        status: 'Active'
      };
    }
    
    console.log('[RECEIPT] ✅ Starting UI population...');

    // Update Student UI
    console.log('[RECEIPT] Updating receipt UI elements...');
    
    const receiptNoEl = document.getElementById('receiptNo');
    const receiptDateEl = document.getElementById('receiptDate');
    const studentIdEl = document.getElementById('studentId');
    const studentNameEl = document.getElementById('studentName');
    const fatherNameEl = document.getElementById('fatherName');
    const batchEl = document.getElementById('batch');
    const classNameEl = document.getElementById('className');
    const phoneEl = document.getElementById('phone');
    
    if (receiptNoEl) receiptNoEl.textContent = paymentData.receiptNo || receiptNo;
    if (receiptDateEl) receiptDateEl.textContent = formatDate(paymentData.date);
    if (studentIdEl) studentIdEl.textContent = studentData.roll || roll;
    if (studentNameEl) studentNameEl.textContent = studentData.name || 'Student Name';
    if (fatherNameEl) fatherNameEl.textContent = studentData.father || studentData.guardian || 'N/A';
    if (batchEl) batchEl.textContent = studentData.batch || 'General Batch';
    if (classNameEl) classNameEl.textContent = studentData.unit || 'Medical Special';
    if (phoneEl) phoneEl.textContent = studentData.phone || 'N/A';
    
    console.log('[RECEIPT] UI elements updated:', {
      receiptNo: receiptNoEl?.textContent,
      studentName: studentNameEl?.textContent,
      roll: studentIdEl?.textContent
    });

    // Update Payment UI
    document.getElementById('transactionId').textContent = paymentData.transactionId || ('TXN' + (paymentData.receiptNo || receiptNo).replace(/[^0-9]/g, ''));
    document.getElementById('paymentMethod').textContent = paymentData.paymentMethod || 'Cash';
    document.getElementById('paymentMonth').textContent = formatDate(paymentData.date);
    document.getElementById('paymentTime').textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Always use fixed courseFee (e.g. 12,000 BDT) — never shrinks to previous due
    const currentBatchName = (studentData && studentData.batch) || (paymentData && paymentData.batchName) || 'Course';
    const discountVal = (studentData && studentData.discountAmount !== undefined) ? studentData.discountAmount : (paymentData.discount || 0);
    const cumulativePaidVal = (studentData && studentData.totalPaid !== undefined) ? studentData.totalPaid : (paymentData.totalPaid !== undefined ? paymentData.totalPaid : (paymentData.paid || paymentData.amount));
    const dueVal = (studentData && studentData.totalDue !== undefined) ? studentData.totalDue : (paymentData.due !== undefined ? paymentData.due : 0);
    
    let totalFeeVal = (studentData && studentData.courseFee && studentData.courseFee > 0) ? studentData.courseFee : (paymentData && paymentData.totalFee ? paymentData.totalFee : 0);
    if (!totalFeeVal || totalFeeVal <= 0) {
      totalFeeVal = cumulativePaidVal + dueVal + discountVal;
    }

    // Try fetching live batch baseFee from API to be 100% accurate
    try {
      const bRes = await fetch(`${API_BASE_URL}/ucc/batches`);
      if (bRes.ok) {
        const bData = await bRes.json();
        if (bData.success && bData.batches) {
          const match = bData.batches.find(b => b.batchName.trim().toLowerCase() === currentBatchName.trim().toLowerCase());
          if (match && match.baseFee) {
            totalFeeVal = match.baseFee;
          }
        }
      }
    } catch (_) {}

    const discountRefText = urlParams.get('discountRef') || paymentData.discountRef || paymentData.reference || '';

    // Render Itemized Fee Table Breakdown (Line 01 = Fixed Batch Course Fee)
    const feeTableBody = document.getElementById('feeTableBody');
    if (feeTableBody) {
      feeTableBody.innerHTML = `
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px;">01</td>
          <td style="padding:6px 8px;font-weight:600;">${currentBatchName} Fee</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;">${fmtBDT(totalFeeVal).replace('৳', '')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:6px 8px;">02</td>
          <td style="padding:6px 8px;font-weight:600;">Lectures & Book Materials</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;">Included</td>
        </tr>
      `;
    }

    document.getElementById('totalFee').textContent = fmtBDT(totalFeeVal);
    document.getElementById('totalDiscount').textContent = fmtBDT(discountVal);
    
    // Discount Reference Display
    const discountRefRow = document.getElementById('discountRefRow');
    const discountRefName = document.getElementById('discountRefName');
    if (discountRefRow && discountRefName) {
      if (discountVal > 0 || discountRefText) {
        discountRefName.textContent = discountRefText || 'Special Discount';
        discountRefRow.style.display = 'block';
      } else {
        discountRefRow.style.display = 'none';
      }
    }

    // Calculate accurate cumulative paid value and due
    const netCourseFee = Math.max(0, totalFeeVal - discountVal);
    const cumulativePaidVal = Math.max(0, netCourseFee - dueVal);

    document.getElementById('paidAmount').textContent = fmtBDT(cumulativePaidVal);
    document.getElementById('dueAmount').textContent = fmtBDT(dueVal);

    // Ensure Admission payment is explicitly present as Row #1 in historyData
    if (historyData && historyData.length > 0) {
      const hasAdmission = historyData.some(h => (h.type && h.type.toLowerCase().includes('admission')));
      if (!hasAdmission && cumulativePaidVal > 0) {
        const sumInstallments = historyData.filter(h => !h.type || !h.type.toLowerCase().includes('admission')).reduce((acc, h) => acc + (h.amount || 0), 0);
        const admAmount = Math.max(0, cumulativePaidVal - sumInstallments);
        if (admAmount > 0) {
          historyData.unshift({
            receiptNo: `UCC-ADM-${studentData.roll || roll}`,
            date: studentData.createdAt || paymentData.date,
            type: 'Admission Payment',
            method: 'Cash',
            amount: admAmount
          });
        }
      }
    } else if (cumulativePaidVal > 0) {
      const isCurrentAdmission = (paymentData && paymentData.paymentType === 'Admission');
      if (isCurrentAdmission) {
        historyData = [{
          receiptNo: paymentData.receiptNo || `UCC-ADM-${studentData.roll || roll}`,
          date: paymentData.date,
          type: 'Admission Payment',
          method: paymentData.paymentMethod || 'Cash',
          amount: paymentData.amount || cumulativePaidVal
        }];
      } else {
        const admAmt = Math.max(0, cumulativePaidVal - (paymentData.amount || 0));
        historyData = [];
        if (admAmt > 0) {
          historyData.push({
            receiptNo: `UCC-ADM-${studentData.roll || roll}`,
            date: studentData.createdAt || paymentData.date,
            type: 'Admission Payment',
            method: 'Cash',
            amount: admAmt
          });
        }
        historyData.push({
          receiptNo: paymentData.receiptNo || receiptNo,
          date: paymentData.date,
          type: paymentData.paymentType || 'Installment',
          method: paymentData.paymentMethod || 'Cash',
          amount: paymentData.amount || 0
        });
      }
    }

    // Populate Payment History Table (Admission + All Installments)
    const historyBody = document.getElementById('paymentHistoryBody');
    if (historyBody) {
      if (historyData && historyData.length > 0) {
        historyBody.innerHTML = historyData.map(h => `
          <tr style="border-bottom:1px solid #e2e8f0;${h.receiptNo === (paymentData.receiptNo || receiptNo) ? 'background:#f0fdf4;' : ''}">
            <td style="padding:4px 6px;">${formatDate(h.date)}</td>
            <td style="padding:4px 6px;font-weight:700;color:#4f46e5;">#${h.receiptNo}</td>
            <td style="padding:4px 6px;">${h.type || 'Payment'} (${h.method || 'Cash'})</td>
            <td style="padding:4px 6px;text-align:right;font-weight:700;color:#059669;">${fmtBDT(h.amount)}</td>
          </tr>
        `).join('');
      } else {
        historyBody.innerHTML = `
          <tr style="border-bottom:1px solid #e2e8f0;background:#f0fdf4;">
            <td style="padding:4px 6px;">${formatDate(paymentData.date)}</td>
            <td style="padding:4px 6px;font-weight:700;color:#4f46e5;">#${paymentData.receiptNo || receiptNo}</td>
            <td style="padding:4px 6px;">${paymentData.paymentType || 'Payment'} (${paymentData.paymentMethod || 'Cash'})</td>
            <td style="padding:4px 6px;text-align:right;font-weight:700;color:#059669;">${fmtBDT(paymentData.amount || paymentData.paid)}</td>
          </tr>
        `;
      }
    }

    // Dynamic Top-Right QR Code Generation
    const qrImgEl = document.getElementById('receiptQrCode');
    if (qrImgEl) {
      const qrDataText = `UCC PABNA RECEIPT\nReceipt: ${paymentData.receiptNo || receiptNo}\nStudent: ${studentData.name} (Roll: ${studentData.roll || roll})\nBatch Fee: BDT ${totalFeeVal}\nTotal Paid: BDT ${cumulativePaidVal}\nDue: BDT ${dueVal}\nStatus: ${dueVal <= 0 ? 'Paid' : 'Partial'}`;
      qrImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrDataText)}`;
    }

    // Auto print if parameter set
    if (urlParams.get('autoPrint') === 'true') {
      setTimeout(() => {
        if (window.printReceipt) window.printReceipt();
      }, 600);
    }
  }

  loadReceipt();
});
