document.addEventListener('DOMContentLoaded', () => {
    const apiBase = window.location.protocol === 'http:' && window.location.hostname === 'localhost' ? 'http://localhost:5002/api' : '/api';
    const form = document.getElementById('addStudentForm');
    const batchSelect = document.getElementById('batch');
    const batchHelp = document.getElementById('batchHelp');
    const monthlyFee = document.getElementById('monthlyFee');
    const photoInput = document.getElementById('studentPhoto');
    let batches = [];
    let students = [];
    let photo = '';

    async function loadBatches() {
        batchSelect.innerHTML = '<option value="">Loading batches...</option>';
        try {
            const [batchResponse, studentsAll] = await Promise.all([
                fetch(`${apiBase}/batches`), fetchAllStudents()
            ]);
            const batchData = await batchResponse.json();
            if (!batchData.success) throw new Error(batchData.message || 'Could not load batches');
            batches = (batchData.data || []).filter(batch => batch.status === 'Active');
            students = studentsAll;
            renderBatches();
        } catch (error) {
            console.error('Batch load error:', error);
            loadLocalBatches();
        }
    }

    async function fetchAllStudents() {
        const limit = 1000;
        const firstResponse = await fetch(`${apiBase}/students?limit=${limit}&page=1`);
        if (!firstResponse.ok) throw new Error(`Could not load students (${firstResponse.status})`);
        const firstPage = await firstResponse.json();
        if (!firstPage.success && !Array.isArray(firstPage.students) && !Array.isArray(firstPage.data)) {
            throw new Error(firstPage.message || 'Could not load students');
        }

        const allStudents = firstPage.students || firstPage.data || [];
        const totalPages = Math.max(1, Number(firstPage.totalPages) || 1);
        if (totalPages === 1) return allStudents;

        const remainingPages = await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
            const page = index + 2;
            const response = await fetch(`${apiBase}/students?limit=${limit}&page=${page}`);
            if (!response.ok) throw new Error(`Could not load students page ${page} (${response.status})`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message || `Could not load students page ${page}`);
            return result.students || result.data || [];
        }));

        return allStudents.concat(...remainingPages);
    }

    function loadLocalBatches() {
        const savedSettings = JSON.parse(localStorage.getItem('erp_settings') || '{}');
        batches = (savedSettings.batches || []).filter(batch => !batch.status || batch.status === 'Active');
        students = JSON.parse(localStorage.getItem('erp_students_data') || '[]');
        renderBatches(true);
    }

    function renderBatches(offline = false) {
        batchSelect.innerHTML = '<option value="">Select Batch...</option>';
        if (!batches.length) {
            batchSelect.innerHTML += '<option value="" disabled>No active batch available</option>';
            batchHelp.innerHTML = 'আগে <a href="batches.html">Batch Management</a> থেকে একটি Active batch তৈরি করুন।';
            return;
        }
        batches.forEach(batch => {
            const option = document.createElement('option');
            option.value = batch.name;
            option.textContent = `${batch.name} — ৳${Number(batch.fee || 0).toLocaleString()}/month`;
            batchSelect.appendChild(option);
        });
        batchHelp.textContent = offline ? 'Server পাওয়া যায়নি—এই browser-এ সংরক্ষিত batch দেখানো হচ্ছে।' : `${batches.length}টি Active batch পাওয়া গেছে।`;
    }

    batchSelect.addEventListener('change', () => {
        const batchName = batchSelect.value;
        const selected = batches.find(batch => batch.name === batchName);
        if (selected && selected.fee !== undefined) monthlyFee.value = selected.fee;

        const rollInput = document.getElementById('rollNo');
        const rollHelp = document.getElementById('rollHelp');
        if (rollInput) {
            if (batchName) {
                const nextId = createStudentId(batchName);
                rollInput.value = nextId;
                if (rollHelp) rollHelp.textContent = `Auto-generated Next ID: ${nextId}`;
            } else {
                rollInput.value = '';
                if (rollHelp) rollHelp.textContent = '';
            }
        }
    });

    photoInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
            alert('Please select an image smaller than 2MB.'); photoInput.value = ''; return;
        }
        const reader = new FileReader();
        reader.onload = e => { photo = e.target.result; };
        reader.readAsDataURL(file);
    });

    function createStudentId(batchName) {
        const batch = batches.find(b => b.name === batchName);
        const normalizeBatchName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        const batchKey = normalizeBatchName(batchName);
        const batchStudents = students.filter(student => normalizeBatchName(student.batch) === batchKey);
        
        let prefix = (batch && batch.prefix) ? batch.prefix.toUpperCase().trim() : '';
        let padLength = 1;
        let hasHyphen = false;
        let maxNum = 0;

        if (batchStudents.length > 0) {
            for (const s of batchStudents) {
                const idStr = String(s.studentId || s.roll || '').trim();
                const m = idStr.match(/^([A-Za-z]+)(-?)(\d+)$/);
                if (m) {
                    if (!prefix) prefix = m[1].toUpperCase();
                    if (m[2] === '-') hasHyphen = true;
                    if (m[3].length > 1 && m[3].startsWith('0')) {
                        padLength = Math.max(padLength, m[3].length);
                    }
                    const num = parseInt(m[3], 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            }
        }

        if (!prefix) {
            prefix = batchName.split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 4) || 'STU';
        }

        if (padLength <= 1 && (batch && batch.year >= 2028)) {
            padLength = 3;
        }

        const nextNum = maxNum > 0 ? maxNum + 1 : (batchStudents.length + 1);
        const numStr = padLength > 1 ? String(nextNum).padStart(padLength, '0') : String(nextNum);
        return hasHyphen ? `${prefix}-${numStr}` : `${prefix}${numStr}`;
    }

    // Show processing overlay
    function showProcessingOverlay(message) {
        let overlay = document.getElementById('processingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'processingOverlay';
            overlay.className = 'processing-overlay';
            overlay.innerHTML = `
                <div class="processing-modal">
                    <div class="spinner"></div>
                    <h3>${message}</h3>
                    <p>Please wait...</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    function hideProcessingOverlay() {
        const overlay = document.getElementById('processingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    // Show admission success modal with student info and print button
    async function showAdmissionSuccessModal(student, payload, receiptNo) {
        // Fetch institute settings
        let institute = { name: 'EduSmart Coaching Center', phone: '', email: '', address: '' };
        try {
            const res = await fetch(`${apiBase}/institute/public`);
            if (res.ok) {
                const result = await res.json();
                if (result.success && result.data) institute = result.data;
            }
        } catch (e) { console.error('Institute fetch error:', e); }

        // Populate modal
        document.getElementById('modalStudentId').textContent = student.studentId;
        document.getElementById('modalStudentName').textContent = student.name;
        document.getElementById('modalBatch').textContent = student.batch;
        document.getElementById('modalTotalAmount').textContent = '৳' + Number((payload.fee || 0) + (payload.admissionFee || 0)).toLocaleString();

        // Store data for print
        window.__admissionData = { student, payload, receiptNo, institute };

        // Show modal
        const modal = document.getElementById('admissionSuccessModal');
        if (modal) modal.classList.add('show');
    }

    // Print admission receipt via hidden iframe (no new window/tab)
    function printAdmissionReceipt() {
        const data = window.__admissionData;
        if (!data) return;
        const { student, payload, receiptNo, institute } = data;
        const today = new Date();
        const admissionDate = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
        const receiptId = receiptNo || student.studentId;
        const monthlyFee = Number(payload.fee || 0);
        const admissionFee = Number(payload.admissionFee || 0);
        const totalAmount = monthlyFee + admissionFee;

        const origin = window.location.origin;
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        const baseUrl = origin + basePath;

        const receiptHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base href="${baseUrl}">
    <title>Admission Receipt - ${institute.name || 'EduSmart'}</title>
    <link rel="stylesheet" href="assets/css/receipt.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @page { size: A5 portrait; margin: 3mm; }
        body { margin: 0; padding: 0; font-size: 8.5px; }
        .no-print { display: none; }
    </style>
</head>
<body data-paper-size="a5">
    <div class="receipt-container a5-paper" id="receiptContainer">
        <div class="receipt-watermark">ADMISSION</div>
        <div class="receipt-inner">
            <div class="receipt-header">
                <div class="header-shine"></div>
                <div class="header-content">
                    <div class="logo-section">
                        <div class="logo-icon"><i class="fas fa-graduation-cap"></i></div>
                        <div class="institute-info">
                            <h1>${institute.name || 'EduSmart Coaching Center'}</h1>
                            <p class="address"><i class="fas fa-map-marker-alt"></i> ${institute.address || 'Rajshahi, Bangladesh'}</p>
                            <p class="contact"><i class="fas fa-phone"></i> ${institute.phone || 'N/A'} | <i class="fas fa-envelope"></i> ${institute.email || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="receipt-title">
                        <h2>ADMISSION RECEIPT</h2>
                        <div class="receipt-meta">
                            <div class="meta-item"><span class="meta-label">Receipt No:</span><span class="meta-value">${receiptId}</span></div>
                            <div class="meta-item"><span class="meta-label">Date:</span><span class="meta-value">${admissionDate}</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="header-bottom-line"></div>
            <div class="receipt-main-grid">
                <div class="info-section">
                    <h3 class="section-title"><i class="fas fa-user-graduate"></i> Student Information</h3>
                    <div class="info-grid">
                        <div class="info-item"><span class="label">Student ID:</span><span class="value">${student.studentId}</span></div>
                        <div class="info-item"><span class="label">Name:</span><span class="value">${student.name}</span></div>
                        <div class="info-item"><span class="label">Father's Name:</span><span class="value">${student.guardianName || 'N/A'}</span></div>
                        <div class="info-item"><span class="label">Mother's Name:</span><span class="value">${student.motherName || 'N/A'}</span></div>
                        <div class="info-item"><span class="label">Course/Batch:</span><span class="value">${student.batch}</span></div>
                        <div class="info-item"><span class="label">Phone:</span><span class="value">${student.phone}</span></div>
                        <div class="info-item"><span class="label">Admission Date:</span><span class="value">${admissionDate}</span></div>
                        <div class="info-item"><span class="label">Status:</span><span class="value status-badge status-active">Active</span></div>
                    </div>
                </div>
                <div class="info-section">
                    <h3 class="section-title"><i class="fas fa-credit-card"></i> Payment Information</h3>
                    <div class="info-grid">
                        <div class="info-item"><span class="label">Payment Method:</span><span class="value">Cash</span></div>
                        <div class="info-item"><span class="label">Collected By:</span><span class="value">Administrator</span></div>
                        <div class="info-item"><span class="label">Payment Time:</span><span class="value">${today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div class="info-item"><span class="label">Receipt Status:</span><span class="value status-badge status-paid">Paid</span></div>
                        <div class="info-item"><span class="label">Previous School:</span><span class="value">${student.previousSchool || 'N/A'}</span></div>
                    </div>
                </div>
            </div>
            <div class="info-section">
                <h3 class="section-title"><i class="fas fa-list-alt"></i> Payment Details</h3>
                <table class="details-table">
                    <thead>
                        <tr><th>SL</th><th>Description</th><th>Amount (৳)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>01</td><td>Monthly Course Fee</td><td>${monthlyFee.toFixed(2)}</td></tr>
                        <tr id="admissionFeeRow" style="${admissionFee > 0 ? '' : 'display:none;'}">
                            <td>02</td><td>Admission Fee</td><td>${admissionFee.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="summary-section">
                <div class="summary-grid">
                    <div class="summary-item"><span>Total Fee</span><strong>৳${totalAmount.toFixed(2)}</strong></div>
                    <div class="summary-item"><span>Paid Amount</span><strong class="paid-amount">৳${totalAmount.toFixed(2)}</strong></div>
                    <div class="summary-item"><span>Due Amount</span><strong class="due-amount">৳0.00</strong></div>
                </div>
            </div>
            <div class="signature-section">
                <div class="signature-box"><div class="signature-line"></div><p>Student Signature</p></div>
                <div class="signature-box"><div class="signature-line"></div><p>Account Officer</p></div>
                <div class="signature-box"><div class="signature-line"></div><p>Authorized Signature</p></div>
            </div>
            <div class="terms-section">
                <h4><i class="fas fa-info-circle"></i> Terms & Conditions</h4>
                <ul>
                    <li>This is a computer-generated admission receipt.</li>
                    <li>Keep this receipt safely for future reference.</li>
                    <li>Tuition fees once paid are non-refundable.</li>
                    <li>Discrepancy? Contact office within 7 days.</li>
                </ul>
            </div>
            <div class="receipt-footer">
                <div class="footer-content">
                    <p class="thank-you"><i class="fas fa-heart"></i> Thank you for joining ${institute.name || 'EduSmart'}!</p>
                    <p class="institute-name"><strong>${institute.name || 'EduSmart Coaching Center'}</strong></p>
                    <p class="institute-details">${institute.address || 'Rajshahi, Bangladesh'} | Phone: ${institute.phone || 'N/A'} | Email: ${institute.email || 'N/A'}</p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

        // Remove previous print frame if exists
        const oldFrame = document.getElementById('admissionPrintFrame');
        if (oldFrame) oldFrame.remove();

        // Create invisible iframe for seamless in-page printing
        const iframe = document.createElement('iframe');
        iframe.id = 'admissionPrintFrame';
        iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;z-index:-9999;';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(receiptHTML);
        iframeDoc.close();

        // Directly open browser print dialog when styles & content are loaded
        iframe.onload = function() {
            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (err) {
                    console.error('Print trigger error:', err);
                }
            }, 250);
        };

        // Clean up iframe after printing
        iframe.contentWindow.addEventListener('afterprint', () => {
            iframe.remove();
        });
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const batchName = batchSelect.value;
        const generatedId = createStudentId(batchName);
        const enteredRoll = document.getElementById('rollNo').value.trim();
        const finalId = enteredRoll || generatedId;

        const payload = {
            studentId: finalId,
            name: document.getElementById('studentName').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            guardianPhone: document.getElementById('guardianPhone').value.trim(),
            previousSchool: document.getElementById('institution').value.trim(),
            batch: batchName,
            roll: enteredRoll || finalId,
            fee: Number(monthlyFee.value),
            admissionFee: Number(document.getElementById('admissionFee').value || 0),
            photo,
            status: 'Active',
            reference: document.getElementById('reference').value.trim() || ''
        };
        if (!payload.name || !payload.phone || !payload.guardianPhone || !payload.fee) return alert('Please fill in all required fields.');
        const submitButton = form.querySelector('[type="submit"]');
        submitButton.disabled = true;

        showProcessingOverlay('Saving Admission...');

        try {
            // Step 1: Create the student
            const response = await fetch(`${apiBase}/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Student save failed');

            const student = data.student;

            // Step 2: Record the monthly fee and admission fee as separate paid transactions.
            let receiptNo = null;
            const today = new Date().toISOString().split('T')[0];
            const currentMonth = new Date().toLocaleString('default', { month: 'long' });
            const currentYear = new Date().getFullYear();
            const paymentErrors = [];

            async function createAdmissionPayment(paymentData, useReceipt = false) {
                try {
                    const paymentResponse = await fetch(`${apiBase}/payments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(paymentData)
                    });
                    const paymentResult = await paymentResponse.json();
                    if (!paymentResponse.ok || !paymentResult.success || !paymentResult.payment) {
                        throw new Error(paymentResult.message || 'Payment could not be saved.');
                    }
                    if (useReceipt || !receiptNo) receiptNo = paymentResult.payment.receiptNo;
                } catch (paymentError) {
                    console.error(`Could not save ${paymentData.type} payment:`, paymentError);
                    paymentErrors.push(paymentData.type);
                }
            }

            if (payload.admissionFee > 0) {
                await createAdmissionPayment({
                    studentId: student.studentId,
                    studentName: student.name,
                    month: currentMonth,
                    year: currentYear,
                    fee: payload.admissionFee,
                    monthlyFee: 0,
                    admissionFee: payload.admissionFee,
                    discount: 0,
                    fine: 0,
                    amount: payload.admissionFee,
                    paymentMethod: 'Cash',
                    type: 'Admission',
                    status: 'Paid',
                    remarks: 'Admission fee payment',
                    date: today
                }, true);
            }

            if (payload.fee > 0) {
                await createAdmissionPayment({
                    studentId: student.studentId,
                    studentName: student.name,
                    month: currentMonth,
                    year: currentYear,
                    fee: payload.fee,
                    monthlyFee: payload.fee,
                    admissionFee: 0,
                    discount: 0,
                    fine: 0,
                    amount: payload.fee,
                    paymentMethod: 'Cash',
                    type: 'Monthly',
                    status: 'Paid',
                    remarks: 'Monthly fee collected during admission',
                    date: today
                });
            }

            if (paymentErrors.length) {
                alert(`Student admission was saved, but the ${paymentErrors.join(' and ')} payment could not be recorded. Please collect/save the missing payment separately.`);
            }

            hideProcessingOverlay();

            // Step 3: Show success modal with student info and print button
            showAdmissionSuccessModal(student, payload, receiptNo);
        } catch (error) {
            hideProcessingOverlay();
            alert(error.message || 'Could not save student. Ensure the backend server is running.');
            submitButton.disabled = false;
        }
    });

    // Reset form after admission is closed/completed
    function resetAdmissionForm() {
        form.reset();
        photo = '';

        // Reset photo preview to default placeholder
        const previewImg = document.getElementById('photoPreviewImg');
        const placeholder = document.getElementById('photoPlaceholder');
        if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
        if (placeholder) { placeholder.style.display = 'flex'; }

        // Re-enable submit button
        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = false;

        // Reset fee summary display
        const sumMonthly = document.getElementById('sumMonthlyFee');
        const sumAdm = document.getElementById('sumAdmissionFee');
        const sumTotal = document.getElementById('sumTotalInitial');
        if (sumMonthly) sumMonthly.textContent = '৳ 0';
        if (sumAdm) sumAdm.textContent = '৳ 0';
        if (sumTotal) sumTotal.textContent = '৳ 0';

        const rollInput = document.getElementById('rollNo');
        const rollHelp = document.getElementById('rollHelp');
        if (rollInput) rollInput.value = '';
        if (rollHelp) rollHelp.textContent = '';

        // Reload batches to fetch updated students list and prepare next Roll/ID
        loadBatches();
    }

    function closeSuccessModal() {
        const modal = document.getElementById('admissionSuccessModal');
        if (modal) modal.classList.remove('show');
        resetAdmissionForm();
    }

    // Modal event handlers
    document.getElementById('modalClose')?.addEventListener('click', () => {
        closeSuccessModal();
    });
    document.getElementById('modalCloseBtn')?.addEventListener('click', () => {
        closeSuccessModal();
    });
    document.getElementById('modalPrintBtn')?.addEventListener('click', () => {
        printAdmissionReceipt();
    });
    document.getElementById('admissionSuccessModal')?.addEventListener('click', (e) => {
        const modal = document.getElementById('admissionSuccessModal');
        if (e.target === modal && modal) {
            closeSuccessModal();
        }
    });

    document.getElementById('sidebarToggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
    loadBatches();
});
