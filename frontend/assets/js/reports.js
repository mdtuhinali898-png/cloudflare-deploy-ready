// Reports JavaScript - Complete functionality
let currentTab = 'collection';
let allPayments  = [];
let allStudents  = [];
let allBookSales = [];   // ← Book Sale data
let charts = {};
let multiMonthPaymentStatusReport = null;
let tabRenderToken = 0;

const reportTabLabels = {
    collection: 'Collection report',
    due: 'Due report',
    batch: 'Batch-wise report',
    method: 'Payment method report',
    student: 'Student-wise report',
    booksales: 'Book sales report'
};

const studentKey = student => student.studentId || student.id;
const findStudent = payment => allStudents.find(student => studentKey(student) === payment.studentId);
const paymentBatch = payment => payment.batch || findStudent(payment)?.batch || 'Unassigned';

function getFilteredPayments() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const batch = document.getElementById('filterBatch').value;
    const status = document.getElementById('filterStatus').value;
    return allPayments.filter(payment =>
        (!fromDate || payment.date >= fromDate) &&
        (!toDate || payment.date <= toDate) &&
        (batch === 'all' || paymentBatch(payment) === batch) &&
        (status === 'all' || payment.status === status)
    );
}

function renderChart(name, canvas, config) {
    if (!canvas || typeof Chart !== 'function') return;
    try {
        // Destroy both the instance tracked by this page and any instance that
        // Chart.js retained after a refresh/navigation. This prevents the
        // "Canvas is already in use" crash.
        if (charts[name]) charts[name].destroy();
        const existingChart = typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
        if (existingChart) existingChart.destroy();
        charts[name] = new Chart(canvas.getContext('2d'), config);
    } catch (error) {
        console.error(`Unable to render ${name} chart:`, error);
        canvas.replaceWith(Object.assign(document.createElement('div'), {
            className: 'chart-error',
            textContent: 'Chart could not be loaded. Please refresh the page.'
        }));
    }
}

function getDueData() {
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return allStudents.filter(student => student.status === 'Active').map(student => {
        const fee = Number(student.fee || 0);
        let expected = 0, paid = 0, dueMonths = 0;
        for (let offset = 0; offset < 12; offset++) {
            const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const monthlyPaid = allPayments.filter(payment => payment.studentId === studentKey(student) && payment.type !== 'Admission' && payment.month === months[date.getMonth()] && Number(payment.year) === date.getFullYear()).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            expected += fee; paid += monthlyPaid;
            if (monthlyPaid < fee) dueMonths++;
        }
        return { ...student, dueAmount: Math.max(0, expected - paid), dueMonths, totalPaid: paid };
    });
}

// Initialize reports page
document.addEventListener('DOMContentLoaded', function() {
    initializeReports();
});

function initializeReports() {
    // Populate year dropdown (doesn't need data)
    populateYearDropdown();
    
    // Load institute info for print headers
    loadInstituteInfo();
    
    // Load all data (this will also populate batch dropdowns after loading)
    loadAllData();
}

// Load institute info for use in print headers
async function loadInstituteInfo() {
    try {
        const response = await fetch('/api/institute/public');
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
                const data = result.data;
                const name = data.name || 'ABC Coaching Center';
                const phone = data.phone || '017XXXXXXXX';
                const email = data.email || 'info@abccoaching.com';
                const address = data.address || 'Rajshahi, Bangladesh';
                window._instituteName = name;
                window._instituteDetails = `${address} | Phone: ${phone} | Email: ${email}`;
            }
        }
    } catch (error) {
        console.warn('Could not load institute info, using defaults:', error);
    }
}

// Read complete report datasets without asking Supabase for oversized pages.
async function fetchAllReportPages(endpoint, collectionKey) {
    const baseUrl = new URL(endpoint, window.location.origin);
    const pageSize = 1000;

    async function fetchPage(page) {
        const url = new URL(baseUrl);
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('page', String(page));
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`Failed to load ${collectionKey} (page ${page})`);
        return response.json();
    }

    const firstPage = await fetchPage(1);
    const records = [...(firstPage[collectionKey] || [])];
    const totalPages = Math.max(1, Number(firstPage.totalPages) || 1);

    // Fetch a few pages concurrently to keep large reports responsive without
    // sending an unbounded burst of requests to Supabase.
    for (let firstPageNumber = 2; firstPageNumber <= totalPages; firstPageNumber += 5) {
        const pageNumbers = Array.from(
            { length: Math.min(5, totalPages - firstPageNumber + 1) },
            (_, index) => firstPageNumber + index
        );
        const pages = await Promise.all(pageNumbers.map(fetchPage));
        for (const page of pages) records.push(...(page[collectionKey] || []));
    }

    return records;
}

// Load all necessary data
async function loadAllData() {
    try {
        console.log('Loading data from API...');

        // Load report datasets in parallel to avoid serial page-load delays.
        const [payments, students, bookSalesResponse] = await Promise.all([
            fetchAllReportPages('/api/payments', 'payments'),
            fetchAllReportPages('/api/students', 'students'),
            fetch('/api/book-sales?limit=10000').catch(error => {
                console.warn('Could not load book sales:', error.message);
                return null;
            })
        ]);

        allPayments = payments;
        allStudents = students;
        console.log('Total payments loaded:', allPayments.length);
        console.log('Total students loaded:', allStudents.length);
        
        // Populate batch dropdowns after loading students
        if (allStudents.length > 0) {
            populateBatchDropdowns();
            console.log('Batch dropdowns populated');
        } else {
            console.warn('No students found, batch dropdown will be empty');
        }

        if (bookSalesResponse?.ok) {
            const bookSalesData = await bookSalesResponse.json();
            allBookSales = bookSalesData.sales || [];
        } else {
            allBookSales = [];
        }

        // Load data for current tab
        refreshCurrentTab();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Refresh current tab data
function refreshCurrentTab() {
    switch(currentTab) {
        case 'collection':
            loadCollectionReport();
            break;
        case 'due':
            // Only auto-load if month already selected; otherwise show placeholder
            if (document.getElementById('dueMonth')?.value) {
                return loadDueReport();
            }
            break;
        case 'batch':
            return loadBatchReport();
        case 'method':
            loadMethodReport();
            break;
        case 'student':
            loadStudentReport();
            break;
        case 'booksales':
            loadBookSalesTab();
            break;
    }
}

// Tab switching
function switchTab(tabName) {
    currentTab = tabName;
    const renderToken = ++tabRenderToken;
    showReportTabLoader();

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');

    // Toggle filter bars: due tab gets month/year filter, others get date range
    const isDue      = tabName === 'due';
    const isBookSale = tabName === 'booksales';
    document.getElementById('dateRangeFilter').style.display = (isDue || isBookSale) ? 'none' : 'flex';
    document.getElementById('dueFilterBar').style.display    = isDue ? 'flex' : 'none';

    // Allow the browser to paint the overlay first, then start report work.
    requestAnimationFrame(() => setTimeout(() => {
        if (renderToken !== tabRenderToken) return;
        try {
            updateSummaryCards();
            Promise.resolve(refreshCurrentTab())
                .catch(error => {
                    console.error('Could not render report tab:', error);
                })
                .finally(() => {
                    if (renderToken === tabRenderToken) hideReportTabLoader();
                });
        } catch (error) {
            console.error('Could not render report tab:', error);
            if (renderToken === tabRenderToken) hideReportTabLoader();
        }
    }, 0));
}

function showReportTabLoader() {
    const loader = document.getElementById('reportTabLoader');
    if (!loader) return;
    loader.classList.add('is-visible');
    loader.setAttribute('aria-hidden', 'false');
}

function hideReportTabLoader() {
    const loader = document.getElementById('reportTabLoader');
    if (!loader) return;
    loader.classList.remove('is-visible');
    loader.setAttribute('aria-hidden', 'true');
}

// Set today's filter
function setTodayFilter() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fromDate').value = today;
    document.getElementById('toDate').value = today;
}

// Apply filters
function applyFilters() {
    refreshCurrentTab();
}

// Reset filters
function resetFilters() {
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    document.getElementById('filterBatch').value = 'all';
    document.getElementById('filterStatus').value = 'all';
    refreshCurrentTab();
}

// Populate batch dropdowns
function populateBatchDropdowns() {
    const filterBatch        = document.getElementById('filterBatch');
    const monthlyBatchSelect = document.getElementById('monthlyBatchSelect');
    const multiMonthBatch    = document.getElementById('multiMonthBatch');
    const dueBatch           = document.getElementById('dueBatch');

    filterBatch.innerHTML        = '<option value="all">All Batches</option>';
    monthlyBatchSelect.innerHTML = '<option value="">-- Select Batch --</option>';
    multiMonthBatch.innerHTML    = '<option value="">-- Select Batch --</option>';
    dueBatch.innerHTML           = '<option value="all">All Batches</option>';

    const batches = [...new Set(allStudents.map(s => s.batch))].filter(Boolean).sort();

    batches.forEach(batch => {
        [filterBatch, dueBatch].forEach(sel => {
            const o = document.createElement('option');
            o.value = batch; o.textContent = batch;
            sel.appendChild(o);
        });
        [monthlyBatchSelect, multiMonthBatch].forEach(sel => {
            const o = document.createElement('option');
            o.value = batch; o.textContent = batch;
            sel.appendChild(o);
        });
    });
}

// Populate year dropdown
function populateYearDropdown() {
    const yearSelect    = document.getElementById('monthlyYearSelect');
    const multiMonthYear = document.getElementById('multiMonthYear');
    const dueYear       = document.getElementById('dueYear');
    const currentYear   = new Date().getFullYear();

    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
        const opt = document.createElement('option');
        opt.value = year; opt.textContent = year;
        yearSelect.appendChild(opt);
        multiMonthYear.appendChild(opt.cloneNode(true));
        dueYear.appendChild(opt.cloneNode(true));
    }
    yearSelect.value     = String(currentYear);
    multiMonthYear.value = String(currentYear);
    dueYear.value        = String(currentYear);
}

// Collection Report
function loadCollectionReport() {
    updateSummaryCards();
    loadDailyActivitySummary();
    loadCollectionCharts();
    loadDailyCollectionSummary();
    loadCollectionDetails();
}

function loadCollectionCharts() {
    const payments = getFilteredPayments();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthlyTotals = months.map(month => payments.filter(payment => payment.month === month).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    renderChart('collection', document.getElementById('collectionChart'), {
        type: 'line',
        data: { labels: months.map(month => month.slice(0, 3)), datasets: [{ label: 'Collection', data: monthlyTotals, borderColor: '#1cc88a', backgroundColor: 'rgba(28,200,138,.12)', fill: true, tension: .35 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const dates = [...new Set(payments.map(payment => payment.date))].sort().slice(-14);
    renderChart('daily', document.getElementById('dailyChart'), {
        type: 'bar',
        data: { labels: dates, datasets: [{ label: 'Daily collection', data: dates.map(date => payments.filter(payment => payment.date === date).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)), backgroundColor: '#4e73df' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// Update summary cards
function updateSummaryCards() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const batch = document.getElementById('filterBatch').value;
    const status = document.getElementById('filterStatus').value;
    
    let filtered = getFilteredPayments();
    
    const totalCollection = filtered.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalDue = getDueData().reduce((sum, student) => sum + student.dueAmount, 0);
    const totalTransactions = filtered.length;
    const collectionRate = totalCollection + totalDue > 0 ? ((totalCollection / (totalCollection + totalDue)) * 100).toFixed(1) : 0;
    
    document.getElementById('totalCollection').textContent = `৳${totalCollection.toLocaleString()}`;
    document.getElementById('totalDue').textContent = `৳${totalDue.toLocaleString()}`;
    document.getElementById('totalTransactions').textContent = totalTransactions;
    document.getElementById('collectionRate').textContent = `${collectionRate}%`;
}

// Load daily activity summary (or selected date range summary)
function loadDailyActivitySummary() {
    const filteredPayments = getFilteredPayments();
    const fromDate = document.getElementById('fromDate').value;
    const toDate   = document.getElementById('toDate').value;

    const admissionPayments = filteredPayments.filter(p => p.type === 'Admission');
    const admissionCount  = admissionPayments.length;
    const admissionAmount = admissionPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const generalPayments = filteredPayments.filter(p => p.type !== 'Admission');
    const paymentCount  = generalPayments.length;
    const paymentAmount = generalPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // ── Book Sale data (filtered by same date range) ──
    let filteredBookSales = allBookSales;
    if (fromDate) filteredBookSales = filteredBookSales.filter(s => s.saleDate >= fromDate);
    if (toDate)   filteredBookSales = filteredBookSales.filter(s => s.saleDate <= toDate);
    const bookSaleCount  = filteredBookSales.length;
    const bookSaleAmount = filteredBookSales.reduce((sum, s) => sum + (Number(s.netAmount) || 0), 0);

    const totalAmount = admissionAmount + paymentAmount + bookSaleAmount;

    const dateSubtitle = document.getElementById('dailyActivityDate');
    const totalLabel   = document.querySelector('.activity-total p');

    if (dateSubtitle) {
        if (fromDate && toDate) {
            dateSubtitle.textContent = `Overview (${fromDate} to ${toDate})`;
        } else if (fromDate) {
            dateSubtitle.textContent = `Overview (From ${fromDate})`;
        } else if (toDate) {
            dateSubtitle.textContent = `Overview (Up to ${toDate})`;
        } else {
            dateSubtitle.textContent = 'All Time Overview';
        }
    }

    if (totalLabel) {
        totalLabel.textContent = (fromDate || toDate) ? 'Total Selected Range' : 'Total Collection';
    }

    document.getElementById('dailyAdmissionCount').textContent  = admissionCount;
    document.getElementById('dailyAdmissionAmount').textContent = `৳${admissionAmount.toLocaleString()}`;
    document.getElementById('dailyPaymentCount').textContent    = paymentCount;
    document.getElementById('dailyPaymentAmount').textContent   = `৳${paymentAmount.toLocaleString()}`;

    const bsCountEl  = document.getElementById('dailyBookSaleCount');
    const bsAmountEl = document.getElementById('dailyBookSaleAmount');
    if (bsCountEl)  bsCountEl.textContent  = bookSaleCount;
    if (bsAmountEl) bsAmountEl.textContent = `৳${bookSaleAmount.toLocaleString()}`;

    document.getElementById('dailyTotalAmount').textContent    = `৳${totalAmount.toLocaleString()}`;
    document.getElementById('dailyTotalBreakdown').textContent = `Admission + Payment + Book Sale`;
}

// Load daily collection summary
function loadDailyCollectionSummary() {
    const tbody    = document.getElementById('dailySummaryBody');
    tbody.innerHTML = '';

    const fromDate = document.getElementById('fromDate').value;
    const toDate   = document.getElementById('toDate').value;

    let filtered = getFilteredPayments();

    // ── Group payments by date (admission vs monthly) ──
    const grouped = {};
    filtered.forEach(p => {
        if (!grouped[p.date]) grouped[p.date] = { admission: 0, payment: 0, bookSale: 0 };
        if (p.type === 'Admission') grouped[p.date].admission += p.amount || 0;
        else                        grouped[p.date].payment   += p.amount || 0;
    });

    // ── Merge book sales grouped by date ──
    let filteredBS = allBookSales;
    if (fromDate) filteredBS = filteredBS.filter(s => s.saleDate >= fromDate);
    if (toDate)   filteredBS = filteredBS.filter(s => s.saleDate <= toDate);

    filteredBS.forEach(s => {
        if (!grouped[s.saleDate]) grouped[s.saleDate] = { admission: 0, payment: 0, bookSale: 0 };
        grouped[s.saleDate].bookSale += s.netAmount || 0;
    });

    // Sort by date descending
    const sorted = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

    sorted.forEach(([date, data]) => {
        const dateObj = new Date(date);
        const day     = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const total   = data.admission + data.payment + data.bookSale;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="daily-date">${date}</span></td>
            <td><span class="daily-day">${day}</span></td>
            <td>${data.admission > 0 ? '৳' + data.admission.toLocaleString() : '—'}</td>
            <td>${data.payment   > 0 ? '৳' + data.payment.toLocaleString()   : '—'}</td>
            <td>${data.bookSale  > 0 ? '<span style="color:#f97316;font-weight:600;">৳' + data.bookSale.toLocaleString() + '</span>' : '—'}</td>
            <td>৳${total.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });

    // Total row
    const totAdm  = sorted.reduce((s,[,d]) => s + d.admission, 0);
    const totPay  = sorted.reduce((s,[,d]) => s + d.payment,   0);
    const totBS   = sorted.reduce((s,[,d]) => s + d.bookSale,  0);
    const totAll  = totAdm + totPay + totBS;

    const totalRow = document.createElement('tr');
    totalRow.className = 'daily-total-row';
    totalRow.innerHTML = `
        <td colspan="2"><strong>Total</strong></td>
        <td><strong>৳${totAdm.toLocaleString()}</strong></td>
        <td><strong>৳${totPay.toLocaleString()}</strong></td>
        <td><strong style="color:#f97316;">৳${totBS.toLocaleString()}</strong></td>
        <td><strong>৳${totAll.toLocaleString()}</strong></td>
    `;
    tbody.appendChild(totalRow);
}

// Load collection details
function loadCollectionDetails() {
    const tbody = document.getElementById('collectionTableBody');
    tbody.innerHTML = '';
    
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    const batch = document.getElementById('filterBatch').value;
    const status = document.getElementById('filterStatus').value;
    
    let filtered = getFilteredPayments();
    
    filtered.sort((a, b) => b.date.localeCompare(a.date));
    
    filtered.forEach(p => {
        const student = findStudent(p);
        const sid = student ? studentKey(student) : (p.studentId || 'N/A');
        const statusClass = p.status === 'Paid' ? 'status-paid' : (p.status === 'Due' ? 'status-due' : 'status-partial');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${p.date}</td>
            <td><a href="#" class="btn-view-sm">${p.receiptNo}</a></td>
            <td><strong>${sid}</strong></td>
            <td>${student ? student.name : 'N/A'}</td>
            <td>${paymentBatch(p)}</td>
            <td>${p.month}</td>
            <td>৳${p.fee?.toLocaleString() || '0'}</td>
            <td>৳${p.amount?.toLocaleString() || '0'}</td>
            <td>${p.paymentMethod || 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${p.status}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Due Report
function loadDueReport() {
    const month  = document.getElementById('dueMonth').value;
    const year   = document.getElementById('dueYear').value;
    const batch  = document.getElementById('dueBatch').value;

    if (!month || !year) {
        alert('মাস এবং বছর সিলেক্ট করুন।');
        return;
    }

    // Filter active students by batch
    let students = allStudents.filter(s => s.status === 'Active');
    if (batch && batch !== 'all') {
        students = students.filter(s => s.batch === batch);
    }

    const paidStudents   = [];
    const unpaidStudents = [];

    students.forEach(student => {
        const sid = studentKey(student);
        const fee = Number(student.fee || 0);

        // Find monthly fee payments only (exclude Admission type) for selected month+year
        const monthPayments = allPayments.filter(p =>
            p.studentId === sid &&
            p.month     === month &&
            String(p.year) === String(year) &&
            (p.type !== 'Admission')
        );

        const totalPaid = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const lastP     = [...monthPayments].sort((a, b) => b.date.localeCompare(a.date))[0];

        // Paid = has any payment this month, OR paid amount >= fee (if fee set)
        const isPaid = monthPayments.length > 0 && (fee === 0 || totalPaid >= fee);

        if (isPaid) {
            paidStudents.push({
                ...student,
                paidAmount : totalPaid,
                paymentDate: lastP ? lastP.date : 'N/A',
                method     : lastP ? (lastP.paymentMethod || 'N/A') : 'N/A'
            });
        } else {
            unpaidStudents.push({ ...student, fee });
        }
    });

    const total          = students.length;
    const paidCount      = paidStudents.length;
    const unpaidCount    = unpaidStudents.length;
    const collectionRate = total > 0 ? ((paidCount / total) * 100).toFixed(1) : 0;

    // Show summary cards
    document.getElementById('dueSummaryCards').style.display  = 'grid';
    document.getElementById('dueListsContainer').style.display = 'grid';
    document.getElementById('duePlaceholder').style.display   = 'none';

    document.getElementById('dueTotalStudents').textContent   = total;
    document.getElementById('duePaidCount').textContent       = paidCount;
    document.getElementById('dueUnpaidCount').textContent     = unpaidCount;
    document.getElementById('dueCollectionRate').textContent  = collectionRate + '%';
    document.getElementById('duePaidBadge').textContent       = paidCount;
    document.getElementById('dueUnpaidBadge').textContent     = unpaidCount;

    // Render paid list
    const paidBody = document.getElementById('duePaidBody');
    paidBody.innerHTML = paidStudents.length
        ? paidStudents
            .sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), undefined, { numeric: true }))
            .map(s => `<tr>
                <td>${studentKey(s)}</td>
                <td>${s.name}</td>
                <td>${s.phone || 'N/A'}</td>
                <td>${s.batch}</td>
                <td>৳${Number(s.paidAmount).toLocaleString()}</td>
                <td>${s.paymentDate}</td>
                <td>${s.method}</td>
            </tr>`).join('')
        : '<tr><td colspan="7" class="empty-msg">No paid students found.</td></tr>';

    // Render due/unpaid list
    const unpaidBody = document.getElementById('dueUnpaidBody');
    unpaidBody.innerHTML = unpaidStudents.length
        ? unpaidStudents
            .sort((a, b) => String(a.studentId || '').localeCompare(String(b.studentId || ''), undefined, { numeric: true }))
            .map(s => `<tr>
                <td>${studentKey(s)}</td>
                <td>${s.name}</td>
                <td>${s.phone || 'N/A'}</td>
                <td>${s.batch}</td>
                <td>৳${Number(s.fee).toLocaleString()}</td>
                <td><button class="btn-view-sm" onclick="collectDue('${studentKey(s)}')">Collect</button></td>
            </tr>`).join('')
        : '<tr><td colspan="6" class="empty-msg">No due students. All paid!</td></tr>';
}

function resetDueFilter() {
    document.getElementById('dueMonth').value = '';
    document.getElementById('dueYear').value  = String(new Date().getFullYear());
    document.getElementById('dueBatch').value = 'all';
    document.getElementById('dueSummaryCards').style.display   = 'none';
    document.getElementById('dueListsContainer').style.display = 'none';
    document.getElementById('duePlaceholder').style.display    = 'block';
    document.getElementById('duePaidBody').innerHTML   = '<tr><td colspan="6" class="empty-msg">Select month, year and batch then click Show Report</td></tr>';
    document.getElementById('dueUnpaidBody').innerHTML = '<tr><td colspan="5" class="empty-msg">Select month, year and batch then click Show Report</td></tr>';
}

function loadDueTable() {
    const tbody = document.getElementById('dueTableBody');
    tbody.innerHTML = '';

    const selectedBatch = document.getElementById('filterBatch').value;
    const fromDate      = document.getElementById('fromDate').value;
    const toDate        = document.getElementById('toDate').value;

    // Step 1: filter students by batch
    let students = allStudents.filter(s => s.status === 'Active');
    if (selectedBatch && selectedBatch !== 'all') {
        students = students.filter(s => s.batch === selectedBatch);
    }

    // Step 2: for each student calculate due from payments
    const dueStudents = students.map(student => {
        const fee = Number(student.fee || 0);

        // all payments for this student (optionally date-filtered)
        let studentPayments = allPayments.filter(p => p.studentId === studentKey(student));
        if (fromDate) studentPayments = studentPayments.filter(p => p.date >= fromDate);
        if (toDate)   studentPayments = studentPayments.filter(p => p.date <= toDate);

        const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // count unique months that have a Due or Partial payment
        const duePayments = studentPayments.filter(p => p.status === 'Due' || p.status === 'Partial');
        const dueMonths   = new Set(duePayments.map(p => `${p.month}-${p.year}`)).size;

        // total due = sum of (fee - paid) for each Due/Partial payment
        const dueAmount = duePayments.reduce((sum, p) => {
            const shortfall = Number(p.fee || fee) - Number(p.amount || 0);
            return sum + Math.max(0, shortfall);
        }, 0);

        const lastPayment = [...studentPayments].sort((a, b) => b.date.localeCompare(a.date))[0];

        return { ...student, dueAmount, dueMonths, totalPaid, lastPayment };
    }).filter(s => s.dueAmount > 0);

    // Step 3: render
    if (dueStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6c757d;font-style:italic;">No due students found.</td></tr>';
        return;
    }

    dueStudents.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${studentKey(student)}</td>
            <td>${student.name}</td>
            <td>${student.batch}</td>
            <td>৳${student.fee?.toLocaleString() || '0'}</td>
            <td>${student.lastPayment ? student.lastPayment.date : 'N/A'}</td>
            <td>${student.dueMonths || 0}</td>
            <td>৳${student.dueAmount?.toLocaleString() || '0'}</td>
            <td><button class="btn-view-sm" onclick="collectDue('${studentKey(student)}')">Collect</button></td>
        `;
        tbody.appendChild(row);
    });
}

// Batch Report
function loadBatchReport() {
    loadBatchChart();
    loadBatchCollectionChart();
    loadBatchTable();
    return loadBatchMonthlyStatus();
}

function loadBatchChart() {
    const ctx = document.getElementById('batchStudentsChart');
    if (!ctx) return;
    
    const batches = [...new Set(allStudents.map(s => s.batch))];
    const studentCounts = batches.map(batch => allStudents.filter(s => s.batch === batch).length);
    
    renderChart('batchStudents', ctx, {
        type: 'doughnut',
        data: {
            labels: batches,
            datasets: [{
                data: studentCounts,
                backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b']
            }]
        }
    });
}

function loadBatchCollectionChart() {
    const ctx = document.getElementById('batchCollectionChart');
    if (!ctx) return;
    
    const batches = [...new Set(allStudents.map(s => s.batch))];
    const collectionData = batches.map(batch => {
        return allPayments
            .filter(p => paymentBatch(p) === batch)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
    });
    
    renderChart('batchCollection', ctx, {
        type: 'bar',
        data: {
            labels: batches,
            datasets: [{
                label: 'Collection',
                data: collectionData,
                backgroundColor: '#4e73df'
            }]
        }
    });
}

function loadBatchTable() {
    const tbody = document.getElementById('batchTableBody');
    tbody.innerHTML = '';
    
    const batches = [...new Set(allStudents.map(s => s.batch))].filter(Boolean).sort();
    
    batches.forEach(batch => {
        const students  = allStudents.filter(s => s.batch === batch);
        const payments  = allPayments.filter(p => paymentBatch(p) === batch);
        
        const totalStudents   = students.length;
        const activeStudents  = students.filter(s => s.status === 'Active').length;
        const monthlyFee      = Number(students[0]?.fee || 0);
        const expected        = totalStudents * monthlyFee;
        const collected       = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const due             = Math.max(0, expected - collected);
        const collectionRate  = expected > 0 ? ((collected / expected) * 100).toFixed(1) : 0;
        
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.title = `Click to see ${batch} details`;
        row.innerHTML = `
            <td><span style="color:#4e73df;font-weight:700;">${batch}</span> <i class="fas fa-chevron-right" style="font-size:10px;color:#adb5bd;margin-left:4px;"></i></td>
            <td>${totalStudents}</td>
            <td>${activeStudents}</td>
            <td>৳${monthlyFee.toLocaleString()}</td>
            <td>৳${expected.toLocaleString()}</td>
            <td>৳${collected.toLocaleString()}</td>
            <td>৳${due.toLocaleString()}</td>
            <td>${collectionRate}%</td>
        `;
        row.addEventListener('click', () => showBatchDetails(batch));
        row.addEventListener('mouseenter', () => row.style.background = '#eef2ff');
        row.addEventListener('mouseleave', () => row.style.background = '');
        tbody.appendChild(row);
    });
}

// Show batch details panel
function showBatchDetails(batch) {
    const students = allStudents.filter(s => s.batch === batch);
    const payments = allPayments.filter(p => paymentBatch(p) === batch);

    // Title
    document.getElementById('batchDetailTitle').textContent = batch;

    // Quick stats
    const totalStudents  = students.length;
    const activeStudents = students.filter(s => s.status === 'Active').length;
    const monthlyFee     = Number(students[0]?.fee || 0);
    const collected      = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const expected       = totalStudents * monthlyFee;
    const rate           = expected > 0 ? ((collected / expected) * 100).toFixed(1) : 0;

    document.getElementById('batchDetailStats').innerHTML = `
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
            <div style="background:#eef2ff;padding:10px 16px;border-radius:8px;border-left:3px solid #4e73df;">
                <div style="font-size:18px;font-weight:700;color:#4e73df;">${totalStudents}</div>
                <div style="font-size:11px;color:#6c757d;">Total Students</div>
            </div>
            <div style="background:#d4edda;padding:10px 16px;border-radius:8px;border-left:3px solid #1cc88a;">
                <div style="font-size:18px;font-weight:700;color:#1cc88a;">${activeStudents}</div>
                <div style="font-size:11px;color:#6c757d;">Active</div>
            </div>
            <div style="background:#fff3cd;padding:10px 16px;border-radius:8px;border-left:3px solid #f6c23e;">
                <div style="font-size:18px;font-weight:700;color:#d97706;">৳${monthlyFee.toLocaleString()}</div>
                <div style="font-size:11px;color:#6c757d;">Monthly Fee</div>
            </div>
            <div style="background:#d4edda;padding:10px 16px;border-radius:8px;border-left:3px solid #1cc88a;">
                <div style="font-size:18px;font-weight:700;color:#1cc88a;">৳${collected.toLocaleString()}</div>
                <div style="font-size:11px;color:#6c757d;">Total Collected</div>
            </div>
            <div style="background:#f8d7da;padding:10px 16px;border-radius:8px;border-left:3px solid #e74a3b;">
                <div style="font-size:18px;font-weight:700;color:#e74a3b;">৳${Math.max(0, expected - collected).toLocaleString()}</div>
                <div style="font-size:11px;color:#6c757d;">Total Due</div>
            </div>
            <div style="background:#e8d5fb;padding:10px 16px;border-radius:8px;border-left:3px solid #8b5cf6;">
                <div style="font-size:18px;font-weight:700;color:#8b5cf6;">${rate}%</div>
                <div style="font-size:11px;color:#6c757d;">Collection Rate</div>
            </div>
        </div>`;

    // Students list
    // Cache current batch students for search
    window._currentBatchStudents = [...students].sort((a, b) =>
        String(studentKey(a)).localeCompare(String(studentKey(b)), undefined, { numeric: true })
    );

    document.getElementById('batchDetailStudentCount').textContent = totalStudents;
    document.getElementById('batchStudentSearch').value = '';
    renderBatchStudentRows(window._currentBatchStudents);

    // Recent payments (last 20)
    const recentPayments = [...payments]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20);

    document.getElementById('batchDetailPaymentCount').textContent = payments.length;
    const paymentsTbody = document.getElementById('batchDetailPayments');
    paymentsTbody.innerHTML = recentPayments.length
        ? recentPayments.map(p => {
            const statusClass = p.status === 'Paid' ? 'status-paid' : p.status === 'Due' ? 'status-due' : 'status-partial';
            return `<tr>
                <td>${p.date}</td>
                <td>${p.studentName || 'N/A'}</td>
                <td>${p.month}</td>
                <td>৳${Number(p.amount || 0).toLocaleString()}</td>
                <td><span class="status-badge ${statusClass}">${p.status}</span></td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="5" class="empty-msg">No payments found.</td></tr>';

    // Show panel & scroll to it
    const panel = document.getElementById('batchDetailsPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBatchDetails() {
    document.getElementById('batchDetailsPanel').style.display = 'none';
}

// ── Render student rows (shared by showBatchDetails + search) ────────────────
function renderBatchStudentRows(students) {
    const tbody = document.getElementById('batchDetailStudents');
    tbody.innerHTML = students.length
        ? students.map(s => {
            const sid = studentKey(s);
            const statusClass = s.status === 'Active' ? 'status-paid' : 'status-due';
            return `<tr id="srow-${sid}">
                <td>${sid}</td>
                <td>${s.name}</td>
                <td>${s.phone || 'N/A'}</td>
                <td>৳${Number(s.fee || 0).toLocaleString()}</td>
                <td><span class="status-badge ${statusClass}">${s.status || 'N/A'}</span></td>
                <td>
                    <button onclick="openEditStudent('${sid}')"
                        title="Edit student"
                        style="border:none;background:none;cursor:pointer;color:#4e73df;font-size:15px;padding:2px 5px;">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="6" class="empty-msg">No students found.</td></tr>';
}

// ── Search in Batch Summary: find student by ID/Name/Phone, show their details ──
function searchStudentInBatchSummary() {
    const q       = document.getElementById('batchSummarySearch').value.trim().toLowerCase();
    const box     = document.getElementById('batchSummarySearch');
    const result  = document.getElementById('batchSearchResult');
    const content = document.getElementById('batchSearchResultContent');

    if (!q) {
        result.style.display = 'none';
        box.style.borderColor = '#dee2e6';
        return;
    }

    const student = allStudents.find(s =>
        String(studentKey(s)).toLowerCase() === q ||
        String(s.phone || '').toLowerCase() === q
    ) || allStudents.find(s =>
        String(s.name || '').toLowerCase() === q
    ) || allStudents.find(s =>
        String(studentKey(s)).toLowerCase().startsWith(q) ||
        String(s.phone || '').toLowerCase().startsWith(q) ||
        String(s.name  || '').toLowerCase().startsWith(q)
    );

    if (!student) {
        box.style.borderColor = '#e74a3b';
        result.style.display  = 'none';
        return;
    }

    box.style.borderColor = '#1cc88a';

    // Total paid by this student
    const totalPaid = allPayments
        .filter(p => p.studentId === studentKey(student))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const sid         = studentKey(student);
    const statusClass = student.status === 'Active' ? 'status-paid' : 'status-due';

    content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px;">
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">ID</span><br><strong>${sid}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Name</span><br><strong>${student.name}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Phone</span><br><strong>${student.phone || 'N/A'}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Batch</span><br><strong>${student.batch || 'N/A'}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Monthly Fee</span><br><strong>৳${Number(student.fee || 0).toLocaleString()}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Total Paid</span><br><strong style="color:#1cc88a;">৳${totalPaid.toLocaleString()}</strong></div>
            <div><span style="font-size:11px;color:#6c757d;font-weight:600;">Status</span><br><span class="status-badge ${statusClass}">${student.status}</span></div>
        </div>
        <button onclick="openEditStudent('${sid}')"
            style="padding:7px 16px;border:none;background:linear-gradient(135deg,#4e73df,#2e59d9);color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
            <i class="fas fa-edit"></i> Edit Student
        </button>`;

    result.style.display = 'block';
}

function clearBatchSearch() {
    document.getElementById('batchSummarySearch').value = '';
    document.getElementById('batchSummarySearch').style.borderColor = '#dee2e6';
    document.getElementById('batchSearchResult').style.display = 'none';
}

// ── Search students by ID / Name / Phone ─────────────────────────────────────
function searchBatchStudent() {
    const q = document.getElementById('batchStudentSearch').value.trim().toLowerCase();
    const list = window._currentBatchStudents || [];
    if (!q) {
        renderBatchStudentRows(list);
        return;
    }
    const filtered = list.filter(s =>
        String(studentKey(s)).toLowerCase().includes(q) ||
        String(s.name  || '').toLowerCase().includes(q) ||
        String(s.phone || '').toLowerCase().includes(q)
    );
    renderBatchStudentRows(filtered);
}

// ── Open edit modal ──────────────────────────────────────────────────────────
function openEditStudent(sid) {
    const student = (window._currentBatchStudents || []).find(s => studentKey(s) === sid)
                 || allStudents.find(s => studentKey(s) === sid);
    if (!student) return;

    document.getElementById('editStudentId').value     = sid;
    document.getElementById('editStudentName').value   = student.name    || '';
    document.getElementById('editStudentPhone').value  = student.phone   || '';
    document.getElementById('editStudentFee').value    = student.fee     || 0;
    document.getElementById('editStudentStatus').value = student.status  || 'Active';

    const modal = document.getElementById('studentEditModal');
    modal.style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('studentEditModal').style.display = 'none';
}

// Close modal on outside click
document.addEventListener('click', e => {
    const modal = document.getElementById('studentEditModal');
    if (modal && e.target === modal) closeEditModal();
});

// ── Save edited student ──────────────────────────────────────────────────────
async function saveEditStudent() {
    const sid    = document.getElementById('editStudentId').value;
    const name   = document.getElementById('editStudentName').value.trim();
    const phone  = document.getElementById('editStudentPhone').value.trim();
    const fee    = Number(document.getElementById('editStudentFee').value);
    const status = document.getElementById('editStudentStatus').value;

    if (!name) { alert('Name cannot be empty.'); return; }

    const saveBtn = document.getElementById('editSaveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        // Find the student's MongoDB _id from allStudents
        const student = allStudents.find(s => studentKey(s) === sid);
        if (!student) throw new Error('Student not found.');

        const mongoId = student._id;
        const response = await fetch(`/api/students/${mongoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, fee, status })
        });

        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Update failed.');

        // Update local allStudents cache
        const idx = allStudents.findIndex(s => studentKey(s) === sid);
        if (idx !== -1) {
            allStudents[idx] = { ...allStudents[idx], name, phone, fee, status };
        }

        // Update _currentBatchStudents cache
        const cidx = (window._currentBatchStudents || []).findIndex(s => studentKey(s) === sid);
        if (cidx !== -1) {
            window._currentBatchStudents[cidx] = { ...window._currentBatchStudents[cidx], name, phone, fee, status };
        }

        closeEditModal();

        // Re-render the students list so changes show immediately
        searchBatchStudent();

        alert('Student updated successfully!');
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
}

// Method Report
function loadMethodReport() {
    loadMethodChart();
    loadMethodTable();
}

function loadMethodChart() {
    const ctx = document.getElementById('methodChart');
    if (!ctx) return;
    
    const methods = {};
    getFilteredPayments().forEach(p => {
        const method = p.paymentMethod || 'Unknown';
        methods[method] = (methods[method] || 0) + 1;
    });
    
    renderChart('method', ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(methods),
            datasets: [{
                data: Object.values(methods),
                backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e']
            }]
        }
    });
}

function loadMethodTable() {
    const tbody = document.getElementById('methodTableBody');
    tbody.innerHTML = '';
    
    const methods = {};
    const filtered = getFilteredPayments();
    filtered.forEach(p => {
        const method = p.paymentMethod || 'Unknown';
        if (!methods[method]) {
            methods[method] = { count: 0, total: 0 };
        }
        methods[method].count++;
        methods[method].total += p.amount || 0;
    });
    
    Object.entries(methods).forEach(([method, data]) => {
        const average = data.count > 0 ? data.total / data.count : 0;
        const percentage = filtered.length > 0 ? (data.count / filtered.length * 100).toFixed(1) : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${method}</td>
            <td>${data.count}</td>
            <td>৳${data.total.toLocaleString()}</td>
            <td>৳${average.toFixed(2)}</td>
            <td>${percentage}%</td>
        `;
        tbody.appendChild(row);
    });
}

// Student Report
function loadStudentReport() {
    const tbody = document.getElementById('studentTableBody');
    tbody.innerHTML = '';
    
    getDueData().forEach(student => {
        const studentPayments = allPayments.filter(p => p.studentId === studentKey(student));
        const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalDue = student.dueAmount;
        const paymentCount = studentPayments.length;
        const lastPayment = studentPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
        
        const statusClass = totalDue > 0 ? 'status-due' : 'status-paid';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${studentKey(student)}</td>
            <td>${student.name}</td>
            <td>${student.batch}</td>
            <td>৳${totalPaid.toLocaleString()}</td>
            <td>৳${totalDue.toLocaleString()}</td>
            <td>${paymentCount}</td>
            <td>${lastPayment ? lastPayment.date : 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${totalDue > 0 ? 'Due' : 'Paid'}</span></td>
        `;
        tbody.appendChild(row);
    });
}

// Batch-wise Monthly Status
async function loadBatchMonthlyStatus() {
    const batch = document.getElementById('monthlyBatchSelect').value;
    const month = document.getElementById('monthlyMonthSelect').value;
    const year = document.getElementById('monthlyYearSelect').value;
    
    if (!batch || !month || !year) {
        document.getElementById('batchMonthlySummary').style.display = 'none';
        document.getElementById('batchMonthlyLists').style.display = 'none';
        return;
    }
    
    try {
        console.log('Loading batch monthly status:', { batch, month, year });
        const response = await fetch(`/api/payments/batch-monthly-status?batch=${encodeURIComponent(batch)}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`);
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Batch monthly data:', data);
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load data');
        }
        
        // Show sections
        document.getElementById('batchMonthlySummary').style.display = 'grid';
        document.getElementById('batchMonthlyLists').style.display = 'block';
        
        // Update summary cards
        document.getElementById('bmTotalStudents').textContent = data.totalStudents || 0;
        document.getElementById('bmPaidCount').textContent = data.paidCount || 0;
        document.getElementById('bmUnpaidCount').textContent = data.unpaidCount || 0;
        document.getElementById('bmCollectionRate').textContent = (data.collectionRate || 0) + '%';
        
        // Update badges
        document.getElementById('bmPaidBadge').textContent = data.paidCount || 0;
        document.getElementById('bmUnpaidBadge').textContent = data.unpaidCount || 0;
        
        // Load paid students
        loadPaidStudents(data.paidStudents || []);
        
        // Load unpaid students
        loadUnpaidStudents(data.unpaidStudents || []);
        
    } catch (error) {
        console.error('Error loading batch monthly status:', error);
        alert('Error: ' + error.message + '\n\nMake sure the backend server is running with the latest code.');
    }
}

function loadPaidStudents(students) {
    const tbody = document.getElementById('bmPaidBody');
    tbody.innerHTML = '';
    
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No paid students found</td></tr>';
        return;
    }
    
    [...students]
        .sort((first, second) => String(first.id || '').localeCompare(String(second.id || ''), undefined, { numeric: true, sensitivity: 'base' }))
        .forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.phone}</td>
            <td>৳${student.paidAmount?.toLocaleString() || '0'}</td>
            <td>${student.paymentDate || 'N/A'}</td>
            <td>${student.receiptNo || 'N/A'}</td>
            <td>${student.method || 'N/A'}</td>
        `;
            tbody.appendChild(row);
        });
}

async function loadMultiMonthPaymentStatus() {
    const batch = document.getElementById('multiMonthBatch').value;
    const year = document.getElementById('multiMonthYear').value;
    const monthOrder = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const months = monthOrder.filter(month => document.querySelector(`#multiMonthPicker input[value="${month}"]`)?.checked);
    if (!batch || !year || months.length === 0) {
        alert('Please select a batch, year and at least one month.');
        return;
    }
    try {
        const response = await fetch(`/api/payments/batch-payment-status?batch=${encodeURIComponent(batch)}&year=${encodeURIComponent(year)}&months=${encodeURIComponent(months.join(','))}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load payment status');

        multiMonthPaymentStatusReport = {
            batch: data.batch,
            year: data.year,
            months: monthOrder.filter(month => data.months.includes(month)),
            students: [...(data.students || [])].sort((first, second) => String(first.id || '').localeCompare(
                String(second.id || ''),
                undefined,
                { numeric: true, sensitivity: 'base' }
            )).map(student => ({
                ...student,
                phone: student.phone || allStudents.find(s => studentKey(s) === student.id)?.phone || 'N/A'
            }))
        };
        data.students = multiMonthPaymentStatusReport.students;

        document.getElementById('multiMonthTableHead').innerHTML = `<tr><th>ID</th><th>Name</th><th>Phone</th><th>Batch</th><th>Monthly Fee</th>${multiMonthPaymentStatusReport.months.map(month => `<th>${month}</th>`).join('')}</tr>`;
        const tbody = document.getElementById('multiMonthTableBody');
        tbody.innerHTML = multiMonthPaymentStatusReport.students.length
            ? data.students.map(student => {
                const phone = student.phone || allStudents.find(s => studentKey(s) === student.id)?.phone || 'N/A';
                return `<tr><td>${student.id}</td><td>${student.name}</td><td>${phone}</td><td>${student.batch}</td><td>৳${Number(student.fee).toLocaleString()}</td>${data.months.map(month => { const status = student.monthlyStatus[month]; const statusClass = status === 'Unpaid' ? 'status-due' : `status-${status.toLowerCase()}`; return `<td><span class="status-badge ${statusClass}">${status}</span></td>`; }).join('')}</tr>`;
              }).join('')
            : `<tr><td colspan="${5 + data.months.length}" class="empty-msg">No students found in this batch.</td></tr>`;
        document.getElementById('multiMonthTableWrap').style.display = 'block';
    } catch (error) {
        console.error('Error loading multi-month payment status:', error);
        alert(error.message);
    }
}

function loadUnpaidStudents(students) {
    const tbody = document.getElementById('bmUnpaidBody');
    tbody.innerHTML = '';
    
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">No unpaid students found</td></tr>';
        return;
    }
    
    [...students]
        .sort((first, second) => String(first.id || '').localeCompare(String(second.id || ''), undefined, { numeric: true, sensitivity: 'base' }))
        .forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.phone}</td>
            <td>৳${student.dueAmount?.toLocaleString() || '0'}</td>
            <td>${student.lastPaymentDate || 'N/A'}</td>
        `;
            tbody.appendChild(row);
        });
}

// Main Print Report button handler
function handlePrintReport() {
    if (currentTab === 'due') {
        const month = document.getElementById('dueMonth').value || '—';
        const year  = document.getElementById('dueYear').value  || '—';
        const batch = document.getElementById('dueBatch').value;
        const batchLabel = (!batch || batch === 'all') ? 'All Batches' : batch;

        const instituteName    = window._instituteName    || 'ABC Coaching Center';
        const instituteDetails = window._instituteDetails || 'Rajshahi, Bangladesh';

        const el = document.getElementById('duePrintInstituteName');
        const ed = document.getElementById('duePrintInstituteDetails');
        const em = document.getElementById('duePrintMonth');
        const eb = document.getElementById('duePrintBatch');
        if (el) el.textContent = instituteName;
        if (ed) ed.textContent = instituteDetails;
        if (em) em.textContent = `${month} ${year}`;
        if (eb) eb.textContent = batchLabel;

        // Remove inline display:none so @media print CSS can take over
        const ph     = document.getElementById('duePrintHeader');
        const lists  = document.getElementById('dueListsContainer');
        const cards  = document.getElementById('dueSummaryCards');
        const holder = document.getElementById('duePlaceholder');
        const globalHeader = document.querySelector('.print-report-header');

        const prevPh     = ph     ? ph.style.display     : '';
        const prevLists  = lists  ? lists.style.display  : '';
        const prevCards  = cards  ? cards.style.display  : '';
        const prevHolder = holder ? holder.style.display : '';

        if (ph)           ph.style.display           = 'block';
        if (lists)        lists.style.removeProperty('display');
        if (cards)        cards.style.removeProperty('display');
        if (holder)       holder.style.display       = 'none';
        if (globalHeader) globalHeader.style.display = 'none';  // hide global header

        document.body.classList.add('printing-due');
        window.print();

        // Restore
        setTimeout(() => {
            document.body.classList.remove('printing-due');
            if (ph)           ph.style.display           = 'none';
            if (lists)        lists.style.display        = prevLists;
            if (cards)        cards.style.display        = prevCards;
            if (holder)       holder.style.display       = prevHolder;
            if (globalHeader) globalHeader.style.display = '';
        }, 500);

    } else {
        // Collection / Batch / Method / Student tabs — populate the global print header
        const instituteName    = window._instituteName    || 'ABC Coaching Center';
        const instituteDetails = window._instituteDetails || 'Rajshahi, Bangladesh';

        const elName = document.getElementById('printInstituteName');
        const elDetails = document.getElementById('printInstituteDetails');
        const elDateRange = document.getElementById('printDateRange');

        if (elName)    elName.textContent    = instituteName;
        if (elDetails) elDetails.textContent = instituteDetails;

        // Build date range text from the filter fields
        const fromDate = document.getElementById('fromDate').value;
        const toDate   = document.getElementById('toDate').value;
        const batch    = document.getElementById('filterBatch').value;
        const status   = document.getElementById('filterStatus').value;

        let dateRangeText = '';
        if (fromDate && toDate) {
            dateRangeText = `${fromDate} to ${toDate}`;
        } else if (fromDate) {
            dateRangeText = `From ${fromDate}`;
        } else if (toDate) {
            dateRangeText = `Up to ${toDate}`;
        } else {
            dateRangeText = 'All Dates';
        }

        // Append batch and status info if filtered
        if (batch && batch !== 'all') {
            dateRangeText += ` | Batch: ${batch}`;
        }
        if (status && status !== 'all') {
            dateRangeText += ` | Status: ${status}`;
        }

        if (elDateRange) elDateRange.textContent = dateRangeText;

        // ── Book sale summary line for print header ──
        const fromDateVal = document.getElementById('fromDate').value;
        const toDateVal   = document.getElementById('toDate').value;
        let bsFiltered = allBookSales;
        if (fromDateVal) bsFiltered = bsFiltered.filter(s => s.saleDate >= fromDateVal);
        if (toDateVal)   bsFiltered = bsFiltered.filter(s => s.saleDate <= toDateVal);
        const bsTotal = bsFiltered.reduce((s, x) => s + (x.netAmount || 0), 0);

        const fp = getFilteredPayments();
        const admTotal = fp.filter(p => p.type === 'Admission').reduce((s,p) => s+(p.amount||0), 0);
        const payTotal = fp.filter(p => p.type !== 'Admission').reduce((s,p) => s+(p.amount||0), 0);
        const grandTotal = admTotal + payTotal + bsTotal;

        let summaryEl = document.getElementById('printSummaryLine');
        if (!summaryEl) {
            summaryEl = document.createElement('p');
            summaryEl.id = 'printSummaryLine';
            summaryEl.style.fontSize = '11px';
            summaryEl.style.color    = '#333';
            summaryEl.style.fontWeight = '600';
            const header = document.querySelector('.print-report-header');
            if (header) header.appendChild(summaryEl);
        }
        summaryEl.textContent = `Admission: ৳${admTotal.toLocaleString()}  |  Monthly Fee: ৳${payTotal.toLocaleString()}  |  Book Sale: ৳${bsTotal.toLocaleString()}  |  Total: ৳${grandTotal.toLocaleString()}`;

        window.print();
    }
}

// Print batch monthly report
window.printBatchMonthly = () => {
    const batch = document.getElementById('monthlyBatchSelect').value;
    const month = document.getElementById('monthlyMonthSelect').value;
    const year = document.getElementById('monthlyYearSelect').value;

    if (!batch || !month) {
        alert('Please select a batch and month first.');
        return;
    }

    const instituteName = window._instituteName || 'ABC Coaching Center';
    const instituteDetails = window._instituteDetails || 'Rajshahi, Bangladesh | Phone: 017XXXXXXXX | Email: info@abccoaching.com';

    const elName = document.getElementById('bmPrintInstituteName');
    const elDetails = document.getElementById('bmPrintInstituteDetails');
    if (elName) elName.textContent = instituteName;
    if (elDetails) elDetails.textContent = instituteDetails;

    document.getElementById('bmPrintBatchName').textContent = batch;
    document.getElementById('bmPrintMonth').textContent = `${month} ${year}`;

    const printHeader = document.getElementById('bmPrintHeader');
    if (printHeader) {
        printHeader.style.display = 'block';
    }

    document.body.classList.add('printing-bm');
    window.print();

    setTimeout(() => {
        document.body.classList.remove('printing-bm');
        if (printHeader) {
            printHeader.style.display = 'none';
        }
    }, 500);
};

// Print Multi-month Payment Status report
window.printMultiMonthPaymentStatus = () => {
    const report = multiMonthPaymentStatusReport;
    if (!report || !report.batch || !report.year || report.months.length === 0) {
        alert('Please generate the report first by clicking "Show Report".');
        return;
    }

    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    const getStatusClass = status => status === 'Unpaid' ? 'status-due' : `status-${String(status || 'Unpaid').toLowerCase()}`;
    const instituteName = window._instituteName || 'ABC Coaching Center';
    const instituteDetails = window._instituteDetails || 'Rajshahi, Bangladesh | Phone: 017XXXXXXXX | Email: info@abccoaching.com';
    const container = document.createElement('div');
    container.className = 'multi-month-print-container';
    container.classList.add(`multi-month-print-months-${report.months.length}`);
    container.id = 'multiMonthPrintContainer';

    const rowsHtml = report.students.length
        ? report.students.map(student => `<tr><td>${escapeHtml(student.id)}</td><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.phone || 'N/A')}</td><td>${escapeHtml(student.batch)}</td><td>৳${Number(student.fee || 0).toLocaleString()}</td>${report.months.map(month => { const status = student.monthlyStatus?.[month] || 'Unpaid'; return `<td><span class="status-badge ${getStatusClass(status)}">${escapeHtml(status)}</span></td>`; }).join('')}</tr>`).join('')
        : `<tr><td colspan="${5 + report.months.length}" class="multi-month-print-empty">No students found in this batch.</td></tr>`;

    container.innerHTML = `
        <div class="multi-month-print-header">
            <h1>${escapeHtml(instituteName)}</h1>
            <p>${escapeHtml(instituteDetails)}</p>
            <h2>Multi-month Payment Status Report</h2>
            <p><strong>Batch:</strong> ${escapeHtml(report.batch)} | <strong>Year:</strong> ${escapeHtml(report.year)}<br><strong>Months:</strong> ${report.months.map(escapeHtml).join(' | ')}</p>
        </div>
        <table class="multi-month-print-table">
            <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Batch</th><th>Monthly Fee</th>${report.months.map(month => `<th>${escapeHtml(month)}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>`;
    document.body.appendChild(container);

    document.body.classList.add('printing-mm');

    const cleanup = () => {
        document.body.classList.remove('printing-mm');
        document.getElementById('multiMonthPrintContainer')?.remove();
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
};

// Export to CSV
function exportToCSV() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Receipt,ID,Student,Batch,Month,Fee,Paid,Method,Status\n";

    getFilteredPayments().forEach(p => {
        const student = findStudent(p);
        const sid = student ? studentKey(student) : (p.studentId || 'N/A');
        const row = `${p.date},${p.receiptNo},${sid},${student ? student.name : 'N/A'},${paymentBatch(p)},${p.month},${p.fee || 0},${p.amount || 0},${p.paymentMethod || 'N/A'},${p.status}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payment_report_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export batch to Excel
function exportBatchToExcel() {
    const rows = [['Batch', 'Total Students', 'Active Students', 'Monthly Fee', 'Expected', 'Collected', 'Due', 'Collection Rate']];
    const batches = [...new Set(allStudents.map(student => student.batch))];
    batches.forEach(batch => {
        const students = allStudents.filter(student => student.batch === batch);
        const fee = Number(students[0]?.fee || 0);
        const collected = allPayments.filter(payment => paymentBatch(payment) === batch).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        const expected = students.length * fee;
        rows.push([batch, students.length, students.filter(student => student.status === 'Active').length, fee, expected, collected, Math.max(0, expected - collected), expected ? ((collected / expected) * 100).toFixed(1) + '%' : '0%']);
    });
    downloadCsv('batch_report.csv', rows);
}

// Export batch monthly to Excel
function exportBatchMonthlyToExcel() {
    const rows = [['Status', 'Student ID', 'Name', 'Phone', 'Amount', 'Payment Date', 'Receipt', 'Method']];
    document.querySelectorAll('#bmPaidBody tr').forEach(row => rows.push(['Paid', ...[...row.cells].map(cell => cell.textContent.trim())]));
    document.querySelectorAll('#bmUnpaidBody tr').forEach(row => rows.push(['Unpaid', ...[...row.cells].map(cell => cell.textContent.trim())]));
    downloadCsv('batch_monthly_payment_status.csv', rows);
}

function downloadCsv(filename, rows) {
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Send SMS reminder
function sendSMSReminder() {
    alert('SMS reminder feature coming soon!');
}

// Collect due
function collectDue(studentId) {
    window.location.href = `payments.html?studentId=${encodeURIComponent(studentId)}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOK SALES TAB — Reports Page Integration
// ══════════════════════════════════════════════════════════════════════════════

function setBsToday() {
    const today = new Date().toISOString().split('T')[0];
    const f = document.getElementById('bsFromDate');
    const t = document.getElementById('bsToDate');
    if (f) f.value = today;
    if (t) t.value = today;
    loadBookSalesTab();
}

function resetBsFilter() {
    const f = document.getElementById('bsFromDate');
    const t = document.getElementById('bsToDate');
    const b = document.getElementById('bsBuyerType');
    if (f) f.value = '';
    if (t) t.value = '';
    if (b) b.value = 'all';
    loadBookSalesTab();
}

function loadBookSalesTab() {
    const fromDate  = document.getElementById('bsFromDate')?.value  || '';
    const toDate    = document.getElementById('bsToDate')?.value    || '';
    const buyerType = document.getElementById('bsBuyerType')?.value || 'all';

    // Filter
    let sales = allBookSales;
    if (fromDate) sales = sales.filter(s => s.saleDate >= fromDate);
    if (toDate)   sales = sales.filter(s => s.saleDate <= toDate);
    if (buyerType !== 'all') sales = sales.filter(s => s.buyerType === buyerType);

    // Summary cards
    const totalAmt   = sales.reduce((s, x) => s + (x.netAmount   || 0), 0);
    const totalItems = sales.reduce((s, x) => s + (x.totalItems  || 0), 0);

    const today     = new Date().toISOString().split('T')[0];
    const curMonth  = new Date().toLocaleString('default', { month: 'long' });
    const curYear   = new Date().getFullYear();

    const todaySales = allBookSales.filter(s => s.saleDate === today);
    const todayAmt   = todaySales.reduce((s,x) => s+(x.netAmount||0), 0);
    const todayItems = todaySales.reduce((s,x) => s+(x.totalItems||0), 0);

    const monthSales = allBookSales.filter(s => s.month === curMonth && Number(s.year) === curYear);
    const monthAmt   = monthSales.reduce((s,x) => s+(x.netAmount||0), 0);
    const monthItems = monthSales.reduce((s,x) => s+(x.totalItems||0), 0);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('bsrTodayAmt',   '৳' + todayAmt.toLocaleString());
    setEl('bsrTodayPcs',   todayItems + ' pcs');
    setEl('bsrMonthAmt',   '৳' + monthAmt.toLocaleString());
    setEl('bsrMonthPcs',   monthItems + ' pcs');
    setEl('bsrTotalAmt',   '৳' + totalAmt.toLocaleString());
    setEl('bsrTotalPcs',   totalItems + ' pcs');
    setEl('bsrTotalSales', sales.length + ' sales');

    // Top books from filtered sales
    const bookMap = {};
    sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            if (!bookMap[item.bookId]) bookMap[item.bookId] = { title: item.title, qty: 0, amt: 0 };
            bookMap[item.bookId].qty += item.quantity || 0;
            bookMap[item.bookId].amt += item.subtotal || 0;
        });
    });
    const topBooks = Object.values(bookMap).sort((a,b) => b.qty - a.qty).slice(0, 5);

    const topEl = document.getElementById('bsrTopBooks');
    if (topEl) {
        if (topBooks.length === 0) {
            topEl.innerHTML = '<p style="text-align:center;color:#6c757d;padding:20px;">কোনো ডেটা নেই</p>';
        } else {
            topEl.innerHTML = topBooks.map((b, i) => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid #e3e6f0;">
                    <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i+1}</div>
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:600;color:#2c3e50;">${b.title}</div>
                        <div style="font-size:12px;color:#6c757d;">${b.qty} কপি বিক্রি</div>
                    </div>
                    <div style="font-size:14px;font-weight:700;color:#f97316;">৳${b.amt.toLocaleString()}</div>
                </div>
            `).join('');
        }
    }

    // Sales table
    const tbody = document.getElementById('bsrTableBody');
    if (!tbody) return;

    if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#6c757d;font-style:italic;">কোনো বিক্রির রেকর্ড পাওয়া যায়নি।</td></tr>`;
        return;
    }

    const sorted = [...sales].sort((a, b) => b.saleDate.localeCompare(a.saleDate));

    tbody.innerHTML = sorted.map(s => {
        const btBadge = s.buyerType === 'Student'
            ? `<span class="status-badge" style="background:#dbeafe;color:#1e40af;">Student</span>`
            : `<span class="status-badge" style="background:#ede9fe;color:#5b21b6;">External</span>`;
        const psBadge = s.paymentStatus === 'Paid'
            ? `<span class="status-badge status-paid">Paid</span>`
            : `<span class="status-badge status-due">Due</span>`;
        return `<tr>
            <td>${s.saleDate}</td>
            <td><strong style="color:#f97316;">${s.receiptNo}</strong></td>
            <td>${s.buyerName}<br><small style="color:#6c757d;">${s.studentId ? 'ID: '+s.studentId : s.buyerPhone || ''}</small></td>
            <td>${btBadge}</td>
            <td>${s.totalItems || 0} pcs</td>
            <td style="font-weight:700;color:#1cc88a;">৳${(s.netAmount||0).toLocaleString()}</td>
            <td>${s.paymentMethod || '—'}</td>
            <td>${psBadge}</td>
        </tr>`;
    }).join('');
}

// Print book sales report
function printBookSalesReport() {
    const instituteName    = window._instituteName    || 'EduSmart';
    const instituteDetails = window._instituteDetails || '';

    const fromDate = document.getElementById('bsFromDate')?.value || '';
    const toDate   = document.getElementById('bsToDate')?.value   || '';

    let dateText = fromDate && toDate ? `${fromDate} to ${toDate}` :
                   fromDate ? `From ${fromDate}` :
                   toDate   ? `Up to ${toDate}`  : 'All Dates';

    const elN  = document.getElementById('bsPrintInstituteName');
    const elD  = document.getElementById('bsPrintInstituteDetails');
    const elDR = document.getElementById('bsPrintDateRange');

    if (elN)  elN.textContent  = instituteName;
    if (elD)  elD.textContent  = instituteDetails;
    if (elDR) elDR.textContent = `Date Range: ${dateText}`;

    // Show print header
    const ph = document.getElementById('booksalePrintHeader');
    if (ph) ph.style.display = 'block';

    document.body.classList.add('printing-booksale');
    window.print();

    setTimeout(() => {
        document.body.classList.remove('printing-booksale');
        if (ph) ph.style.display = 'none';
    }, 500);
}
