// assets/js/receipt.js

document.addEventListener('DOMContentLoaded', () => {
    
// ============================================
// 1. CONFIG & STATE
// ============================================
// Use relative URL if accessed through server, otherwise use localhost
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? (window.location.port === '5002' ? '/api' : 'http://localhost:5002/api')
    : '/api';
    const STUDENTS_KEY = 'erp_students_data';
    const PAYMENTS_KEY = 'erp_payments_data';
    
    let studentsData = [];
    let paymentsData = [];
    let instituteInfo = {
        name: 'EduSmart Coaching Center',
        phone: '',
        email: '',
        address: '',
        about: '',
        logo: ''
    };

    // ============================================
    // 2. DATA LOADING
    // ============================================
    async function loadInstituteInfo() {
        try {
            const response = await fetch(`${API_BASE_URL}/institute/public`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    instituteInfo = { ...instituteInfo, ...result.data };
                    populateInstituteInfo(instituteInfo);
                }
            }
        } catch (error) {
            console.warn('Could not load institute info, using defaults:', error);
        }
    }

    function populateInstituteInfo(inst) {
        if (!inst) return;
        const nameEl = document.getElementById('receiptInstituteName');
        const addrEl = document.getElementById('receiptInstituteAddressText');
        const phoneEl = document.getElementById('receiptInstitutePhone');
        const emailEl = document.getElementById('receiptInstituteEmail');
        const footerNameEl = document.getElementById('receiptFooterInstituteName');
        const footerDetailsEl = document.getElementById('receiptFooterDetails');
        const logoIconEl = document.getElementById('receiptLogoIcon');
        const taglineEl = document.getElementById('receiptTagline');

        if (nameEl && inst.name) nameEl.textContent = inst.name;
        if (footerNameEl && inst.name) footerNameEl.textContent = inst.name;
        if (addrEl && inst.address) addrEl.textContent = inst.address;
        if (phoneEl) phoneEl.textContent = inst.phone || 'N/A';
        if (emailEl) emailEl.textContent = inst.email || 'N/A';

        if (footerDetailsEl) {
            const parts = [];
            if (inst.address) parts.push(inst.address);
            if (inst.phone) parts.push(`Phone: ${inst.phone}`);
            if (inst.email) parts.push(`Email: ${inst.email}`);
            footerDetailsEl.textContent = parts.join(' | ') || (inst.address || '');
        }

        if (taglineEl && inst.about) {
            taglineEl.textContent = `"${inst.about}"`;
        }

        if (logoIconEl && inst.logo) {
            logoIconEl.innerHTML = `<img src="${inst.logo}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`;
        }
    }

    async function loadData() {
        await loadInstituteInfo();

        try {
            const studentsResponse = await fetch(`${API_BASE_URL}/students?limit=1000`);
            const studentsResult = await studentsResponse.json();
            studentsData = studentsResult.students || [];
        } catch (error) {
            console.error('Error loading students:', error);
            studentsData = JSON.parse(localStorage.getItem(STUDENTS_KEY)) || [];
        }
        
        try {
            const paymentsResponse = await fetch(`${API_BASE_URL}/payments?limit=1000`);
            const paymentsResult = await paymentsResponse.json();
            paymentsData = paymentsResult.payments || [];
        } catch (error) {
            console.error('Error loading payments:', error);
            paymentsData = JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || [];
        }
    }

    // Fetch a single payment by receipt number directly from API
    async function fetchPaymentByReceipt(receiptNo) {
        try {
            const response = await fetch(`${API_BASE_URL}/payments/receipt/${receiptNo}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.payment) {
                    return result.payment;
                }
            }
        } catch (error) {
            console.error('Error fetching payment by receipt:', error);
        }
        return null;
    }

    function applyPrintPaperStyle(size) {
        // Set data attribute for CSS selectors
        // The @media print rules in receipt.css handle all print styling
        document.body.dataset.paperSize = size;
    }

    // ============================================
    // 3. GET RECEIPT ID FROM URL
    // ============================================
    function getReceiptIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('receipt');
    }

    // ============================================
    // 4. FIND PAYMENT & STUDENT DATA
    // ============================================
    function findPaymentData(receiptId) {
        return paymentsData.find(p => p.receiptNo === receiptId || p.receipt === receiptId);
    }

    function findStudentData(studentId) {
        return studentsData.find(s => s.studentId === studentId || s.id === studentId);
    }

    async function findStudentDataOrFetch(studentId) {
        const loadedStudent = findStudentData(studentId);
        if (loadedStudent || !studentId) return loadedStudent;

        try {
            const response = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(studentId)}`);
            if (!response.ok) return null;
            const result = await response.json();
            return result.student || null;
        } catch (error) {
            console.error('Error loading student for receipt:', error);
            return null;
        }
    }

    // ============================================
    // 5. POPULATE RECEIPT
    // ============================================
    function populateReceipt(payment, student) {
        if (!payment) {
            alert('Receipt not found!');
            window.location.href = 'payments.html';
            return;
        }

        // Determine if this is an admission receipt or monthly payment receipt
        const isAdmission = payment.type === 'Admission';
        const receiptTitle = isAdmission ? 'ADMISSION RECEIPT' : 'PAYMENT RECEIPT';
        
        // Receipt Meta
        document.getElementById('receiptNo').innerText = payment.receiptNo || payment.receipt;
        document.getElementById('receiptDate').innerText = formatDate(payment.date);

        document.querySelector('.receipt-title h2').innerText = receiptTitle;
        document.title = isAdmission ? `Admission Receipt - ${instituteInfo.name || 'Student ERP'}` : `Payment Receipt - ${instituteInfo.name || 'Student ERP'}`;

        // Student Information
        if (student) {
            document.getElementById('studentId').innerText = student.studentId || student.id;
            document.getElementById('studentName').innerText = student.name;
            document.getElementById('fatherName').innerText = student.guardianName || student.father || 'N/A';
            document.getElementById('motherName').innerText = student.motherName || 'N/A';
            document.getElementById('batch').innerText = student.batch || 'N/A';
            document.getElementById('className').innerText = student.group || 'N/A';
            document.getElementById('phone').innerText = student.phone || 'N/A';
            
            const statusEl = document.getElementById('studentStatus');
            statusEl.innerText = student.status || 'Active';
            statusEl.className = `value status-badge status-${(student.status || 'active').toLowerCase()}`;
        } else {
            document.getElementById('studentId').innerText = payment.studentId || 'N/A';
            document.getElementById('studentName').innerText = payment.studentName || payment.name || 'N/A';
            document.getElementById('fatherName').innerText = 'N/A';
            document.getElementById('motherName').innerText = 'N/A';
            document.getElementById('batch').innerText = payment.batch || 'General';
            document.getElementById('className').innerText = payment.group || 'N/A';
            document.getElementById('phone').innerText = payment.phone || 'N/A';
            
            const statusEl = document.getElementById('studentStatus');
            statusEl.innerText = 'Active';
            statusEl.className = 'value status-badge status-active';
        }

        // Payment Information
        if (isAdmission) {
            // For admission receipts, show admission-specific info
            document.getElementById('paymentMonth').innerText = formatDate(payment.date);
            document.getElementById('transactionId').innerText = 'TXN' + (payment.receiptNo || payment.receipt).replace('RCPT-', '');
        } else {
            document.getElementById('paymentMonth').innerText = (payment.month || 'N/A') + ' ' + (payment.year || new Date().getFullYear());
            document.getElementById('transactionId').innerText = 'TXN' + (payment.receiptNo || payment.receipt).replace('RCPT-', '');
        }
        
        document.getElementById('paymentMethod').innerText = payment.paymentMethod || 'Cash';
        document.getElementById('collectedBy').innerText = 'Administrator';
        document.getElementById('paymentTime').innerText = formatTime(new Date());
        
        const receiptStatusEl = document.getElementById('receiptStatus');
        receiptStatusEl.innerText = payment.status || 'Paid';
        receiptStatusEl.className = `value status-badge status-${(payment.status || 'Paid').toLowerCase()}`;

        // Dynamic QR Code Update (Top-Right Header)
        const qrImgEl = document.getElementById('receiptQrCode');
        if (qrImgEl) {
            const receiptNumber = payment.receiptNo || payment.receipt || 'N/A';
            const studentIdentifier = student ? (student.studentId || student.id || 'N/A') : 'N/A';
            const studentNameStr = student ? (student.name || 'N/A') : 'N/A';
            const txnNumber = 'TXN' + receiptNumber.replace('RCPT-', '');
            const paidAmountVal = payment.amount || payment.paid || 0;
            
            const qrSummaryText = `VERIFIED RECEIPT\nReceipt: ${receiptNumber}\nStudent: ${studentNameStr} (${studentIdentifier})\nTxn ID: ${txnNumber}\nPaid: BDT ${paidAmountVal}\nStatus: ${payment.status || 'Paid'}`;
            qrImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrSummaryText)}`;
        }

        // Payment Details Table
        const fee = payment.fee || 0;
        const monthlyFee = payment.monthlyFee || 0;
        const admissionFee = payment.admissionFee || 0;
        const discount = payment.discount || 0;
        const fine = payment.fine || 0;
        const totalFee = isAdmission ? (monthlyFee + admissionFee) : fee;
        const grandTotal = totalFee - discount + fine;
        const paid = payment.amount || payment.paid || 0;
        const due = Math.max(0, grandTotal - paid);

        if (isAdmission) {
            // For admission receipts: show Monthly Fee and Admission Fee
            document.getElementById('monthlyFee').innerText = monthlyFee.toFixed(2);
            if (admissionFee > 0) {
                document.getElementById('admissionFeeRow').style.display = '';
                document.getElementById('admissionFee').innerText = admissionFee.toFixed(2);
            } else {
                document.getElementById('admissionFeeRow').style.display = 'none';
            }
            document.getElementById('fine').innerText = fine.toFixed(2);
            document.getElementById('discount').innerText = '-' + discount.toFixed(2);
        } else {
            // For monthly payment receipts: show Monthly Tuition Fee
            document.getElementById('monthlyFee').innerText = fee.toFixed(2);
            document.getElementById('admissionFeeRow').style.display = 'none';
            document.getElementById('fine').innerText = fine.toFixed(2);
            document.getElementById('discount').innerText = '-' + discount.toFixed(2);
        }

        // Payment Summary
        document.getElementById('totalFee').innerText = '৳' + totalFee.toFixed(2);
        document.getElementById('totalDiscount').innerText = '৳' + discount.toFixed(2);
        document.getElementById('totalFine').innerText = '৳' + fine.toFixed(2);
        document.getElementById('grandTotal').innerText = '৳' + grandTotal.toFixed(2);
        document.getElementById('paidAmount').innerText = '৳' + paid.toFixed(2);
        document.getElementById('dueAmount').innerText = '৳' + due.toFixed(2);
    }

    // ============================================
    // 6. HELPER FUNCTIONS
    // ============================================
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        const options = { day: '2-digit', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('en-GB', options);
    }

    function formatTime(date) {
        let hours = date.getHours();
        let minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        return hours + ':' + minutes + ' ' + ampm;
    }

    // ============================================
    // 7. PAPER SIZE TOGGLE
    // ============================================
    window.changePaperSize = (size) => {
        const container = document.getElementById('receiptContainer');
        const buttons = document.querySelectorAll('.size-btn');
        
        buttons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-size="${size}"]`).classList.add('active');
        document.body.dataset.paperSize = size;
        applyPrintPaperStyle(size);
        
        if (size === 'a4') {
            container.classList.remove('a5-paper');
            container.classList.add('a4-paper');
        } else {
            container.classList.remove('a4-paper');
            container.classList.add('a5-paper');
        }
    };

    // ============================================
    // 8. DOWNLOAD PDF
    // ============================================
    window.downloadPDF = () => {
        alert('To save as PDF:\n1. Click "Print Receipt"\n2. In the print dialog, select "Save as PDF"\n3. Choose paper size (A4 or A5)\n4. Click Save');
        window.print();
    };

    // ============================================
    // 9. INITIALIZE
    // ============================================
    const initializeReceipt = () => {
        // Set initial paper size
        document.body.dataset.paperSize = 'a5';
        applyPrintPaperStyle('a5');
        
        // Set initial container class
        const container = document.getElementById('receiptContainer');
        if (container) {
            container.classList.remove('a4-paper');
            container.classList.add('a5-paper');
        }
        
        // Update toggle buttons
        const buttons = document.querySelectorAll('.size-btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.size === 'a5') {
                btn.classList.add('active');
            }
        });
    };
    
    initializeReceipt();

    loadData().then(() => {
        const receiptId = getReceiptIdFromURL();
        if (receiptId) {
            // First try to fetch directly from API by receipt number
            fetchPaymentByReceipt(receiptId).then(async payment => {
                if (payment) {
                    const student = await findStudentDataOrFetch(payment.studentId);
                    populateReceipt(payment, student);
                } else {
                    // Fallback: search in locally loaded payments
                    const localPayment = findPaymentData(receiptId);
                    if (localPayment) {
                        const student = await findStudentDataOrFetch(localPayment.studentId);
                        populateReceipt(localPayment, student);
                    } else {
                        document.getElementById('receiptNo').innerText = receiptId;
                        document.getElementById('receiptDate').innerText = '---';
                        document.querySelector('.receipt-title h2').innerText = 'RECEIPT NOT FOUND';
                    }
                }
            });
        } else {
            // If no receipt ID, show message to select a receipt
            document.getElementById('receiptNo').innerText = '---';
            document.getElementById('receiptDate').innerText = '---';
            document.querySelector('.receipt-title h2').innerText = 'NO RECEIPT SELECTED';
            document.getElementById('studentId').innerText = '---';
            document.getElementById('studentName').innerText = '---';
            document.getElementById('fatherName').innerText = '---';
            document.getElementById('motherName').innerText = '---';
            document.getElementById('batch').innerText = '---';
            document.getElementById('className').innerText = '---';
            document.getElementById('phone').innerText = '---';
            document.getElementById('studentStatus').innerText = '---';
            document.getElementById('paymentMonth').innerText = '---';
            document.getElementById('paymentMethod').innerText = '---';
            document.getElementById('transactionId').innerText = '---';
            document.getElementById('collectedBy').innerText = '---';
            document.getElementById('paymentTime').innerText = '---';
            document.getElementById('receiptStatus').innerText = '---';
            document.getElementById('monthlyFee').innerText = '0.00';
            document.getElementById('fine').innerText = '0.00';
            document.getElementById('discount').innerText = '0.00';
            document.getElementById('totalFee').innerText = '৳0.00';
            document.getElementById('totalDiscount').innerText = '৳0.00';
            document.getElementById('totalFine').innerText = '৳0.00';
            document.getElementById('grandTotal').innerText = '৳0.00';
            document.getElementById('paidAmount').innerText = '৳0.00';
            document.getElementById('dueAmount').innerText = '৳0.00';
        }
    });

});
