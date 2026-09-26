// ==========================================================================
// EduSmart Payroll Management JavaScript
// ==========================================================================

let currentMonth = '';
let currentYear = new Date().getFullYear();
let currentPayrollId = null;
let editingPayrollPaid = 0;
let currentPayrollRecords = [];
let currentPayrollPage = 1;
const PAYROLL_PAGE_SIZE = 10;

document.addEventListener('DOMContentLoaded', function () {
    // Set default month/year
    const now = new Date();
    currentMonth = now.toLocaleString('default', { month: 'long' });
    currentYear = now.getFullYear();

    setupYearDropdowns();
    setupMonthFilter();

    document.getElementById('employeeForm')?.addEventListener('submit', handleEmployeeSubmit);
    document.getElementById('employeeRosterList')?.addEventListener('click', handleEmployeeRosterAction);
    document.getElementById('payrollForm')?.addEventListener('submit', handlePayrollAdjustmentSubmit);
    document.getElementById('paymentForm')?.addEventListener('submit', handlePaymentSubmit);
    syncPayrollExpenses();
    loadPayroll();
    loadPayrollSummary();
});

function setupYearDropdowns() {
    const year = new Date().getFullYear();
    const years = [year - 1, year, year + 1];
    ['yearFilter', 'payYear'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = years.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('');
    });
}

function setupMonthFilter() {
    const monthEl = document.getElementById('monthFilter');
    if (monthEl) {
        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const curMonth = new Date().toLocaleString('default', { month: 'long' });
        months.forEach(m => {
            const opt = monthEl.querySelector(`option[value="${m}"]`);
            if (opt && m === curMonth) opt.selected = true;
        });
    }
    const monthFormEl = document.getElementById('month');
    if (monthFormEl) {
        const curMonth = new Date().toLocaleString('default', { month: 'long' });
        const opt = monthFormEl.querySelector(`option[value="${curMonth}"]`);
        if (opt) opt.selected = true;
    }
}

// ==========================================================================
// Load & Render
// ==========================================================================
async function syncPayrollExpenses() {
    try {
        const response = await fetch('/api/payroll/sync-expenses', { method: 'POST' });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not sync payroll expenses.');
        if (data.syncedCount > 0) {
            showToast(`${data.syncedCount} existing payroll payment(s) added to Expenses.`, 'success');
        }
    } catch (error) {
        console.error('Error syncing payroll expenses:', error);
        showToast('Could not sync payroll payments to Expenses. Please try again.', 'error');
    }
}

async function loadPayroll() {
    const tbody = document.getElementById('payrollTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const month = document.getElementById('monthFilter')?.value || '';
        const year = document.getElementById('yearFilter')?.value || currentYear;
        const status = document.getElementById('statusFilter')?.value || '';
        const search = document.getElementById('employeeSearch')?.value?.trim() || '';

        let url = `/api/payroll?limit=1000`;
        if (month) url += `&month=${encodeURIComponent(month)}`;
        if (year) url += `&year=${year}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
            showError('Failed to load payroll records.');
            return;
        }

        let records = data.records || [];

        // Client-side search filter
        if (search) {
            records = records.filter(r =>
                (r.employeeName || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.employeeId || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.designation || '').toLowerCase().includes(search.toLowerCase())
            );
        }

        renderPayrollTable(records);

        const countEl = document.getElementById('payrollCount');
        if (countEl) countEl.textContent = `Total: ${records.length}`;

        // Summary
        loadPayrollSummary();
    } catch (err) {
        console.error('Error loading payroll:', err);
        showError('Network error loading payroll.');
    }
}

function payrollFigures(record) {
    const salary = Number(record.salary || 0);
    const bonus = Number(record.bonus || 0);
    const deduction = Number(record.deduction || 0);
    const paid = Number(record.paidAmount || 0);
    const advance = Number(record.advance || 0);
    const net = Number(record.netPayable || Math.max(0, salary + bonus - deduction));
    const storedDue = Number(record.dueSalary || 0);
    return { net, paid, advance, due: storedDue || Math.max(0, net - paid - advance) };
}

function renderPayrollTable(records) {
    const tbody = document.getElementById('payrollTableBody');
    if (!tbody) return;

    currentPayrollRecords = Array.isArray(records) ? records : [];
    currentPayrollPage = 1;

    renderPayrollPage();
}

function renderPayrollPage() {
    const tbody = document.getElementById('payrollTableBody');
    const footer = document.getElementById('payrollTotalFooter');
    const pagination = document.getElementById('payrollPagination');
    if (!tbody) return;
    const records = currentPayrollRecords;
    const pageCount = Math.max(1, Math.ceil(records.length / PAYROLL_PAGE_SIZE));
    currentPayrollPage = Math.min(currentPayrollPage, pageCount);

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">
            <div style="padding:30px;color:var(--text-muted);">
                <i class="fas fa-inbox" style="font-size:2rem;opacity:0.4;display:block;margin-bottom:8px;"></i>
                No payroll records for this period yet. Add employees, then prepare this month's payroll.
            </div></td></tr>`;
        if (footer) footer.style.display = 'none';
        if (pagination) { pagination.hidden = true; pagination.innerHTML = ''; }
        return;
    }

    const totSalary = records.reduce((s, r) => s + Number(r.salary || 0), 0);
    const totPaid = records.reduce((s, r) => s + Number(r.paidAmount || 0) + Number(r.advance || 0), 0);
    const totDue = records.reduce((s, r) => s + payrollFigures(r).due, 0);
    const totNet = records.reduce((s, r) => s + payrollFigures(r).net, 0);

    const visibleRecords = records.slice((currentPayrollPage - 1) * PAYROLL_PAGE_SIZE, currentPayrollPage * PAYROLL_PAGE_SIZE);
    tbody.innerHTML = visibleRecords.map(r => {
        const figures = payrollFigures(r);
        const statusLabel = r.status || (figures.due > 0 ? (figures.paid + figures.advance > 0 ? 'Partial' : 'Pending') : 'Paid');
        const st = statusLabel.toLowerCase();
        return `<tr>
            <td data-label="Employee">
                <span class="payroll-employee-name">${escHtml(r.employeeName)}</span>
                <span class="payroll-employee-meta">${escHtml(r.employeeId)}${r.designation ? ` · ${escHtml(r.designation)}` : ''}</span>
                <details class="payroll-breakdown">
                    <summary>Pay breakdown</summary>
                    <div class="payroll-breakdown-content">
                        <span>Advance <strong>${formatCurrency(figures.advance)}</strong></span>
                        <span>Bonus <strong>${formatCurrency(r.bonus || 0)}</strong></span>
                        <span>Deduction <strong>${formatCurrency(r.deduction || 0)}</strong></span>
                        <span>Method <strong>${escHtml(r.paymentMethod || '-')}</strong></span>
                    </div>
                </details>
            </td>
            <td data-label="Salary">${formatCurrency(r.salary)}</td>
            <td data-label="Paid" style="color:#059669;font-weight:700;">${formatCurrency(figures.paid + figures.advance)}</td>
            <td data-label="Due" style="color:#dc2626;font-weight:700;">${formatCurrency(figures.due)}</td>
            <td data-label="Net Payable" style="font-weight:800;color:#1e40af;">${formatCurrency(figures.net)}</td>
            <td data-label="Status"><span class="status-badge ${st}">${escHtml(statusLabel)}</span></td>
            <td data-label="Actions">
                <div class="payroll-row-actions">
                    <button class="btn btn-sm btn-secondary" onclick="editRecord('${r._id}')" title="Adjust payroll" aria-label="Adjust payroll"><i class="fas fa-sliders-h"></i></button>
                    ${figures.due > 0 ? `<button class="btn btn-sm btn-success" onclick="openPaymentModal('${r._id}')" title="Record payment" aria-label="Record payment"><i class="fas fa-money-bill-wave"></i></button>` : ''}
                    <details class="payroll-action-more">
                        <summary title="More actions" aria-label="More actions"><i class="fas fa-ellipsis-v"></i></summary>
                        <div class="payroll-actions-menu">
                            <button onclick="openPaymentHistory('${r._id}'); this.closest('details').open=false"><i class="fas fa-history"></i> Payment history</button>
                            <button onclick="printPayslip('${r._id}'); this.closest('details').open=false"><i class="fas fa-file-alt"></i> Print payslip</button>
                            <button class="danger" onclick="this.closest('details').open=false; deleteRecord('${r._id}')"><i class="fas fa-trash"></i> Delete payroll</button>
                        </div>
                    </details>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (footer) {
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.flexWrap = 'wrap';
        footer.style.gap = '12px';
        footer.innerHTML = `
            <span>Records: <strong>${records.length}</strong></span>
            <span>Total Salary: <strong>${formatCurrency(totSalary)}</strong></span>
            <span style="color:#059669;">Total Paid: <strong>${formatCurrency(totPaid)}</strong></span>
            <span style="color:#dc2626;">Total Due: <strong>${formatCurrency(totDue)}</strong></span>
            <span style="color:#1e40af;">Total Net: <strong>${formatCurrency(totNet)}</strong></span>
        `;
    }

    if (pagination) {
        const start = (currentPayrollPage - 1) * PAYROLL_PAGE_SIZE + 1;
        const end = Math.min(currentPayrollPage * PAYROLL_PAGE_SIZE, records.length);
        pagination.hidden = pageCount <= 1;
        pagination.innerHTML = `<span>Showing ${start}–${end} of ${records.length} employees</span>
            <div class="payroll-pagination-controls">
                <button type="button" onclick="changePayrollPage(${currentPayrollPage - 1})" aria-label="Previous page" ${currentPayrollPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                <span>Page ${currentPayrollPage} of ${pageCount}</span>
                <button type="button" onclick="changePayrollPage(${currentPayrollPage + 1})" aria-label="Next page" ${currentPayrollPage === pageCount ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>`;
    }
}

function changePayrollPage(page) {
    const pageCount = Math.ceil(currentPayrollRecords.length / PAYROLL_PAGE_SIZE);
    if (page < 1 || page > pageCount) return;
    currentPayrollPage = page;
    renderPayrollPage();
}

// ==========================================================================
// Summary Cards
// ==========================================================================
async function loadPayrollSummary() {
    try {
        const month = document.getElementById('monthFilter')?.value || currentMonth;
        const year = document.getElementById('yearFilter')?.value || currentYear;
        const res = await fetch(`/api/payroll/summary?month=${encodeURIComponent(month)}&year=${year}`);
        const data = await res.json();
        if (!data.success) return;

        setEl('totalEmployees', data.totalEmployees || 0);
        setEl('totalSalary', formatCurrency(data.totalSalary || 0));
        setEl('totalPaid', formatCurrency(data.totalPaid || 0));
        setEl('totalDue', formatCurrency(data.totalDue || 0));
        setEl('paidCount', data.paidCount || 0);
        setEl('pendingCount', data.pendingCount || 0);
    } catch (err) { console.error('Error loading payroll summary:', err); }
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ==========================================================================
// Form
// ==========================================================================
function calculateNet() {
    const salary = parseFloat(document.getElementById('salary')?.value || 0);
    const bonus = parseFloat(document.getElementById('bonus')?.value || 0);
    const deduction = parseFloat(document.getElementById('deduction')?.value || 0);
    const advance = parseFloat(document.getElementById('advance')?.value || 0);
    const net = Math.max(0, salary + bonus - deduction);
    const due = Math.max(0, net - editingPayrollPaid - advance);
    const display = document.getElementById('netPayableDisplay');
    if (display) display.textContent = `${formatCurrency(net)} · Due ${formatCurrency(due)}`;
}

async function handleEmployeeSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving employee…'; }
    try {
        const res = await fetch('/api/payroll/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                employeeId: document.getElementById('employeeId').value.trim(),
                employeeName: document.getElementById('employeeName').value.trim(),
                designation: document.getElementById('designation').value.trim(),
                monthlySalary: Number(document.getElementById('monthlySalary').value)
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not add employee.');
        showToast('Employee added. Prepare payroll for the selected month to include them.', 'success');
        closeEmployeeModal();
    } catch (err) {
        showToast(err.message || 'Network error. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Save Employee'; }
    }
}

async function openEmployeeRosterModal() {
    document.getElementById('employeeRosterModal')?.classList.add('active');
    await loadEmployeeRoster();
}

function closeEmployeeRosterModal() {
    document.getElementById('employeeRosterModal')?.classList.remove('active');
}

async function loadEmployeeRoster() {
    const list = document.getElementById('employeeRosterList');
    if (!list) return;
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading employees…</div>';
    try {
        const response = await fetch('/api/payroll/employees?includeInactive=true');
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load employees.');
        const employees = data.employees || [];
        if (!employees.length) {
            list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;">No employee profiles yet. Use <strong>Add Employee</strong> to get started.</div>';
            return;
        }
        list.innerHTML = `<div style="display:grid;gap:10px;">${employees.map(employee => {
            const active = employee.isActive !== false;
            const id = escHtml(employee.employeeId || '');
            const employeeIdAttribute = encodeURIComponent(employee.employeeId || '');
            const employeeNameAttribute = encodeURIComponent(employee.name || '');
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;flex-wrap:wrap;">
                <div style="min-width:180px;flex:1;"><div style="font-weight:700;color:#172033;">${escHtml(employee.name || 'Unnamed employee')}</div><div style="font-size:12px;color:#64748b;margin-top:4px;">${id} · ${escHtml(employee.designation || '—')} · ${formatCurrency(employee.salary || 0)} / month</div></div>
                <span style="padding:4px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${active ? '#dcfce7' : '#f1f5f9'};color:${active ? '#15803d' : '#64748b'};">${active ? 'ACTIVE' : 'INACTIVE'}</span>
                <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
                    ${active
                        ? `<button type="button" class="btn btn-sm btn-secondary" data-employee-action="remove" data-employee-id="${employeeIdAttribute}" data-employee-name="${employeeNameAttribute}" style="white-space:nowrap;"><i class="fas fa-user-minus"></i> Remove</button>`
                        : `<button type="button" class="btn btn-sm btn-secondary" data-employee-action="restore" data-employee-id="${employeeIdAttribute}" data-employee-name="${employeeNameAttribute}" style="white-space:nowrap;"><i class="fas fa-undo"></i> Restore</button>`}
                    <button type="button" class="btn btn-sm btn-danger" data-employee-action="delete" data-employee-id="${employeeIdAttribute}" data-employee-name="${employeeNameAttribute}" style="white-space:nowrap;"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>`;
        }).join('')}</div>`;
    } catch (error) {
        list.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border-radius:10px;">${escHtml(error.message || 'Could not load employees.')}</div>`;
    }
}

async function handleEmployeeRosterAction(event) {
    const button = event.target.closest('[data-employee-action]');
    if (!button) return;
    const action = button.dataset.employeeAction;
    let employeeId = '';
    let employeeName = '';
    try {
        employeeId = decodeURIComponent(button.dataset.employeeId || '');
        employeeName = decodeURIComponent(button.dataset.employeeName || '') || employeeId;
    } catch (_) { showToast('Employee details could not be read. Refresh the list and try again.', 'error'); return; }
    if (!employeeId) return;

    if (action === 'remove' && !confirm(`Remove ${employeeName} from the active employee roster? Their profile and all past payroll/payment records will be kept.`)) return;
    if (action === 'restore' && !confirm(`Restore ${employeeName} to the active employee roster? They can be included when preparing future payroll.`)) return;
    if (action === 'delete' && !confirm(`Permanently delete the employee profile for ${employeeName}? This is only possible when no payroll or payment history exists.`)) return;

    button.disabled = true;
    try {
        const encodedEmployeeId = encodeURIComponent(employeeId);
        const url = action === 'remove'
            ? `/api/payroll/employees/${encodedEmployeeId}`
            : action === 'delete'
                ? `/api/payroll/employees/${encodedEmployeeId}/permanent`
                : `/api/payroll/employees/${encodedEmployeeId}/status`;
        const response = await fetch(url, {
            method: action === 'restore' ? 'PATCH' : 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            ...(action === 'restore' ? { body: JSON.stringify({ isActive: true }) } : {})
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not update employee.');
        showToast(data.message || 'Employee roster updated.', 'success');
        await loadEmployeeRoster();
        await Promise.all([loadPayroll(), loadPayrollSummary()]);
    } catch (error) {
        showToast(error.message || 'Could not update employee.', 'error');
        button.disabled = false;
    }
}

async function prepareMonthlyPayroll() {
    const month = document.getElementById('monthFilter')?.value || currentMonth;
    const year = Number(document.getElementById('yearFilter')?.value || currentYear);
    const button = document.getElementById('preparePayrollBtn');
    const original = button?.innerHTML;
    if (!confirm(`Prepare ${month} ${year} payroll for active employees? Existing payroll records will be kept.`)) return;
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…'; }
    try {
        const response = await fetch('/api/payroll/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, year })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not prepare payroll.');
        if (!data.totalEmployees) {
            showToast('Add at least one employee before preparing payroll.', 'info');
            return;
        }
        showToast(data.createdCount ? `Payroll prepared for ${data.createdCount} employee(s).` : 'Payroll is already prepared for all active employees.', 'success');
        await loadPayroll();
    } catch (error) {
        showToast(error.message || 'Could not prepare payroll.', 'error');
    } finally {
        if (button) { button.disabled = false; button.innerHTML = original; }
    }
}

async function handlePayrollAdjustmentSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    const salary = Number(document.getElementById('salary').value || 0);
    const bonus = Number(document.getElementById('bonus').value || 0);
    const deduction = Number(document.getElementById('deduction').value || 0);
    const advance = Number(document.getElementById('advance').value || 0);
    const netPayable = Math.max(0, salary + bonus - deduction);
    const paidAmount = editingPayrollPaid;
    const dueSalary = Math.max(0, netPayable - paidAmount - advance);
    if (paidAmount + advance > netPayable) {
        showToast('Net payable cannot be less than payments already recorded.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Save Changes'; }
        return;
    }
    const status = dueSalary === 0 ? 'Paid' : (paidAmount + advance > 0 ? 'Partial' : 'Pending');
    try {
        const id = document.getElementById('payrollId').value;
        const response = await fetch(`/api/payroll/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ salary, bonus, deduction, advance, netPayable, dueSalary, status, notes: document.getElementById('adjustmentNotes').value.trim() })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not update payroll.');
        closeModal();
        showToast('Payroll updated.', 'success');
        await loadPayroll();
    } catch (error) {
        showToast(error.message || 'Could not update payroll.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Save Changes'; }
    }
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!currentPayrollId) return;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
        const response = await fetch(`/api/payroll/${currentPayrollId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: Number(document.getElementById('paymentAmount').value),
                paymentDate: document.getElementById('paymentDate').value,
                paymentMethod: document.getElementById('paymentMethod').value,
                reference: document.getElementById('paymentReference').value.trim(),
                notes: document.getElementById('paymentNotes').value.trim()
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not record payment.');
        closePaymentModal();
        showToast('Payment recorded and added to Expenses.', 'success');
        await loadPayroll();
    } catch (error) {
        showToast(error.message || 'Could not record payment.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Save Payment'; }
    }
}

async function editRecord(id) {
    try {
        const res = await fetch(`/api/payroll/${id}`);
        const data = await res.json();
        if (!res.ok || !data.success) { showToast('Could not load record.', 'error'); return; }
        const r = data.record;

        document.getElementById('payrollId').value = r._id;
        document.getElementById('salary').value = r.salary;
        document.getElementById('bonus').value = r.bonus || 0;
        document.getElementById('deduction').value = r.deduction || 0;
        document.getElementById('advance').value = r.advance || 0;
        document.getElementById('adjustmentNotes').value = r.notes || '';
        editingPayrollPaid = Number(r.paidAmount || 0);
        calculateNet();
        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-sliders-h"></i> Adjust Payroll · ${escHtml(r.employeeName)} · ${escHtml(r.month)} ${escHtml(r.year)}`;
        openModal();
    } catch (err) { showToast('Error loading record.', 'error'); }
}

async function openPaymentModal(id) {
    try {
        const response = await fetch(`/api/payroll/${id}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not load payroll record.');
        const record = data.record;
        const figures = payrollFigures(record);
        if (figures.due <= 0) { showToast('This payroll is already fully paid.', 'info'); return; }
        currentPayrollId = id;
        document.getElementById('paymentForm').reset();
        document.getElementById('paymentEmployeeInfo').innerHTML = `<strong>${escHtml(record.employeeName)}</strong> · ${escHtml(record.employeeId)} · ${escHtml(record.month)} ${escHtml(record.year)}`;
        document.getElementById('paymentDueDisplay').textContent = formatCurrency(figures.due);
        const amount = document.getElementById('paymentAmount');
        amount.max = figures.due.toFixed(2);
        amount.value = figures.due.toFixed(2);
        const date = new Date();
        document.getElementById('paymentDate').value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        document.getElementById('paymentMethod').value = 'Cash';
        document.getElementById('paymentModal').classList.add('active');
    } catch (error) { showToast(error.message || 'Could not open payment form.', 'error'); }
}

async function openPaymentHistory(id) {
    const content = document.getElementById('paymentHistoryContent');
    if (content) content.innerHTML = '<div class="text-center" style="padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading payment history…</div>';
    document.getElementById('paymentHistoryModal')?.classList.add('active');
    try {
        const [recordResponse, paymentResponse] = await Promise.all([
            fetch(`/api/payroll/${id}`),
            fetch(`/api/payroll/${id}/payments`)
        ]);
        const [recordData, paymentData] = await Promise.all([recordResponse.json(), paymentResponse.json()]);
        if (!recordResponse.ok || !recordData.success || !paymentResponse.ok || !paymentData.success) throw new Error('Could not load payment history.');
        const record = recordData.record;
        const payments = paymentData.payments || [];
        const figures = payrollFigures(record);
        const body = payments.length ? `<div class="table-responsive"><table class="data-table"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${payments.map(payment => `<tr><td>${escHtml(payment.payment_date || '-')}</td><td>${escHtml(payment.payment_method || '-')}</td><td>${escHtml(payment.reference || '-')}</td><td style="text-align:right;font-weight:700;">${formatCurrency(payment.amount)}</td></tr>`).join('')}</tbody></table></div>`
            : `<div style="padding:18px;text-align:center;color:var(--text-muted);background:#f8fafc;border-radius:10px;">No individual payment entries recorded yet. Paid total including advance: <strong>${formatCurrency(figures.paid + figures.advance)}</strong>.</div>`;
        content.innerHTML = `<div style="margin-bottom:14px;"><strong>${escHtml(record.employeeName)}</strong> · ${escHtml(record.month)} ${escHtml(record.year)}<div style="margin-top:5px;color:var(--text-muted);">Net payable ${formatCurrency(figures.net)} · Paid incl. advance ${formatCurrency(figures.paid + figures.advance)} · Due ${formatCurrency(figures.due)}</div></div>${body}`;
    } catch (error) {
        if (content) content.innerHTML = `<div style="color:#b91c1c;padding:16px;">${escHtml(error.message || 'Could not load payment history.')}</div>`;
    }
}

async function deleteRecord(id) {
    if (!confirm('Delete this payroll record? Its payment history and linked Payroll expense entries will also be deleted.')) return;
    try {
        const res = await fetch(`/api/payroll/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Could not delete payroll record.');
        showToast(data.message || 'Payroll record deleted.', 'success');
        await loadPayroll();
    } catch (err) { showToast(err.message || 'Error deleting record.', 'error'); }
}

// ==========================================================================
// Payslip Print
// ==========================================================================
async function printPayslip(id) {
    try {
        const res = await fetch(`/api/payroll/${id}`);
        const data = await res.json();
        if (!data.success) { showToast('Could not load payslip.', 'error'); return; }
        const r = data.record;

        let instituteName = 'EduSmart Coaching Center';
        try {
            const instRes = await fetch('/api/institute/public');
            const instData = await instRes.json();
            if (instData.success && instData.data?.name) instituteName = instData.data.name;
        } catch(e) {}

        const win = window.open('', '_blank', 'width=700,height=600');
        win.document.write(`<!DOCTYPE html><html><head><title>Payslip</title>
        <style>
            body{font-family:'Segoe UI',sans-serif;padding:30px;font-size:11pt;}
            .header{text-align:center;border-bottom:2px double #1e40af;padding-bottom:14px;margin-bottom:18px;}
            .header h2{color:#1e40af;font-size:14pt;}
            .title{font-size:11pt;font-weight:700;background:#eff6ff;padding:4px 10px;display:inline-block;margin-top:6px;}
            table{width:100%;border-collapse:collapse;margin:12px 0;}
            td{padding:8px 12px;border:1px solid #e5e7eb;font-size:10pt;}
            .lbl{font-weight:700;background:#f9fafb;width:140px;}
            .amount-row{background:#fef3c7;font-weight:700;font-size:12pt;}
            .signatures{display:flex;justify-content:space-between;margin-top:40px;}
            .sig{text-align:center;width:45%;}
            .sig-line{border-top:1px solid #374151;padding-top:6px;margin-top:40px;font-weight:600;font-size:9pt;}
            @media print{button{display:none;}}
        </style></head><body>
        <div class="header">
            <h2>${escHtml(instituteName)}</h2>
            <div class="title">SALARY PAYSLIP</div>
        </div>
        <table>
            <tr><td class="lbl">Employee ID</td><td>${escHtml(r.employeeId)}</td><td class="lbl">Name</td><td>${escHtml(r.employeeName)}</td></tr>
            <tr><td class="lbl">Designation</td><td>${escHtml(r.designation)}</td><td class="lbl">Period</td><td>${escHtml(r.month)} ${r.year}</td></tr>
            <tr><td class="lbl">Basic Salary</td><td>৳${(r.salary||0).toFixed(2)}</td><td class="lbl">Bonus</td><td>৳${(r.bonus||0).toFixed(2)}</td></tr>
            <tr><td class="lbl">Deduction</td><td>৳${(r.deduction||0).toFixed(2)}</td><td class="lbl">Advance</td><td>৳${(r.advance||0).toFixed(2)}</td></tr>
            <tr class="amount-row"><td class="lbl">Net Payable</td><td>৳${(r.netPayable||0).toFixed(2)}</td><td class="lbl">Paid Amount</td><td>৳${(r.paidAmount||0).toFixed(2)}</td></tr>
            <tr><td class="lbl">Due Salary</td><td style="color:#dc2626;font-weight:700;">৳${(r.dueSalary||0).toFixed(2)}</td><td class="lbl">Payment Method</td><td>${escHtml(r.paymentMethod||'-')}</td></tr>
            <tr><td class="lbl">Payment Date</td><td>${r.paymentDate||'-'}</td><td class="lbl">Status</td><td><strong>${escHtml(r.status||'-')}</strong></td></tr>
            ${r.notes ? `<tr><td class="lbl">Notes</td><td colspan="3">${escHtml(r.notes)}</td></tr>` : ''}
        </table>
        <div class="signatures">
            <div class="sig"><div class="sig-line">Employee Signature</div></div>
            <div class="sig"><div class="sig-line">Authorized Signature</div></div>
        </div>
        <br><button onclick="window.print()">🖨 Print</button>
        </body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 400);
    } catch (err) { showToast('Error generating payslip.', 'error'); }
}

async function printPayrollSummary() {
    try {
        const month = document.getElementById('monthFilter')?.value || currentMonth;
        const year = document.getElementById('yearFilter')?.value || currentYear;
        const pageSize = 1000;
        const params = new URLSearchParams({ month, year: String(year), page: '1', limit: String(pageSize) });
        const firstResponse = await fetch('/api/payroll?' + params.toString());
        const firstData = await firstResponse.json();
        if (!firstResponse.ok || !firstData.success) throw new Error(firstData.message || 'Could not load payroll records.');
        let records = firstData.records || [];
        const totalPages = Math.max(1, Number(firstData.totalPages) || 1);
        for (let page = 2; page <= totalPages; page++) {
            params.set('page', String(page));
            const response = await fetch('/api/payroll?' + params.toString());
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || 'Could not load all payroll records.');
            records = records.concat(data.records || []);
        }

        if (!records.length) {
            showToast('No payroll records found for the selected month.', 'info');
            return;
        }

        let institute = {};
        try {
            const instRes = await fetch('/api/institute/public');
            const instData = await instRes.json();
            if (instData.success && instData.data) institute = instData.data;
        } catch(e) {}

        const instituteName = institute.name || 'EduSmart Coaching Center';
        const safe = value => escHtml(value || '');
        const rows = records.map(r => `<tr>
            <td class="code">${safe(r.employeeId || '-')}</td><td>${safe(r.employeeName || '-')}</td>
            <td>${safe(r.designation || '-')}</td>
            <td class="num">${formatCurrency(r.salary)}</td>
            <td class="num paid">${formatCurrency(Number(r.paidAmount || 0) + Number(r.advance || 0))}</td>
            <td class="num due">${formatCurrency(r.dueSalary)}</td>
            <td class="num">${formatCurrency(r.netPayable)}</td>
            <td><span class="status ${String(r.status || '').toLowerCase() === 'paid' ? 'status-paid' : 'status-pending'}">${safe(r.status || '-')}</span></td>
        </tr>`).join('');

        const totSal = records.reduce((sum, record) => sum + Number(record.salary || 0), 0);
        const totPaid = records.reduce((sum, record) => sum + Number(record.paidAmount || 0) + Number(record.advance || 0), 0);
        const totDue = records.reduce((sum, record) => sum + Number(record.dueSalary || 0), 0);
        const totNet = records.reduce((sum, record) => sum + Number(record.netPayable || 0), 0);
        const paidCount = records.filter(record => String(record.status || '').toLowerCase() === 'paid').length;
        const pendingCount = records.length - paidCount;
        const generatedAt = new Date().toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
        const logo = institute.logo ? `<img class="brand-logo" src="${safe(institute.logo)}" alt="Institute logo">` : '';
        const contact = [institute.address, institute.phone, institute.email].filter(Boolean).map(safe).join(' <span>•</span> ');

        let printFrame = document.getElementById('payrollSummaryPrintFrame');
        if (printFrame) printFrame.remove();
        printFrame = document.createElement('iframe');
        printFrame.id = 'payrollSummaryPrintFrame';
        printFrame.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
        document.body.appendChild(printFrame);
        const printWindow = printFrame.contentWindow;
        const printDocument = printWindow.document;
        printDocument.open();
        printDocument.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Payroll Summary - ${safe(instituteName)}</title>
        <style>
            *{box-sizing:border-box}@page{size:A4 portrait;margin:12mm}
            body{font:9px/1.4 'Segoe UI',Arial,sans-serif;color:#1e293b;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
            .header{background:linear-gradient(120deg,#1e1b4b,#4f46e5);color:#fff;padding:17px 20px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:14px}
            .brand{display:flex;align-items:center;gap:11px;min-width:0}.brand-logo{width:48px;height:48px;object-fit:contain;background:#fff;border-radius:6px;padding:4px}
            .brand h1{font-size:17px;margin:0 0 3px;font-weight:800}.contact{font-size:8px;color:#e0e7ff}.title{text-align:right;flex-shrink:0}.title small{display:block;text-transform:uppercase;letter-spacing:1px;color:#c7d2fe;font-weight:700}.title strong{font-size:15px}
            .meta{display:flex;justify-content:space-between;gap:10px;margin:10px 0;padding:8px 11px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;color:#475569}
            .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:11px 0 14px}.card{padding:9px 11px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc}.card.paid-card{background:#ecfdf5;border-color:#a7f3d0}.card.due-card{background:#fef2f2;border-color:#fecaca}.label{font-size:7px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.4px}.value{font-size:13px;font-weight:800;margin-top:3px;color:#0f172a}.paid-card .value{color:#047857}.due-card .value{color:#b91c1c}
            table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.5px}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#4f46e5;color:#fff;text-align:left;padding:5px 3px;text-transform:uppercase;font-size:6.5px;letter-spacing:0}td{padding:4px 3px;border:1px solid #e2e8f0;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafc}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.paid{color:#047857}.due{color:#b91c1c}.code{font-family:Consolas,monospace;color:#4338ca;white-space:normal;overflow-wrap:anywhere}.status{display:inline-block;padding:2px 4px;border-radius:99px;font-size:6.5px;font-weight:700;white-space:normal}.status-paid{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}.status-pending{background:#fffbeb;color:#b45309;border:1px solid #fde68a}
            .total-row td{background:#eef2ff!important;color:#312e81;font-weight:800;border-top:1.5px solid #4f46e5}.signatures{display:flex;justify-content:space-between;gap:50px;margin:28px 24px 0}.signature{width:200px;border-top:1px solid #64748b;text-align:center;padding-top:5px;font-weight:700;color:#334155}.foot{display:flex;justify-content:space-between;margin-top:14px;padding-top:7px;border-top:1px solid #e2e8f0;color:#64748b;font-size:7px}
            @media print{.header,th,.card.paid-card,.card.due-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}.summary,.signatures{break-inside:avoid}}
        </style></head><body>
        <header class="header"><div class="brand">${logo}<div><h1>${safe(instituteName)}</h1>${contact ? `<div class="contact">${contact}</div>` : ''}</div></div><div class="title"><small>Human Resources &amp; Payroll</small><strong>Payroll Summary</strong></div></header>
        <div class="meta"><span><b>Payroll period:</b> ${safe(month)} ${safe(year)}</span><span><b>Generated:</b> ${safe(generatedAt)}</span></div>
        <section class="summary"><div class="card"><div class="label">Employees</div><div class="value">${records.length.toLocaleString('en-BD')}</div></div><div class="card"><div class="label">Total Salary</div><div class="value">${formatCurrency(totSal)}</div></div><div class="card paid-card"><div class="label">Total Paid · ${paidCount} paid</div><div class="value">${formatCurrency(totPaid)}</div></div><div class="card due-card"><div class="label">Total Due · ${pendingCount} pending</div><div class="value">${formatCurrency(totDue)}</div></div></section>
        <table><thead><tr><th style="width:10%">Employee ID</th><th style="width:17%">Employee</th><th style="width:15%">Designation</th><th style="width:12%;text-align:right">Salary</th><th style="width:12%;text-align:right">Paid + Advance</th><th style="width:12%;text-align:right">Due</th><th style="width:13%;text-align:right">Net Payable</th><th style="width:9%">Status</th></tr></thead><tbody>${rows}
        <tr class="total-row"><td colspan="3">TOTAL (${records.length} records)</td><td class="num">${formatCurrency(totSal)}</td><td class="num">${formatCurrency(totPaid)}</td><td class="num">${formatCurrency(totDue)}</td><td class="num">${formatCurrency(totNet)}</td><td></td></tr></tbody></table>
        <div class="signatures"><div class="signature">Prepared By</div><div class="signature">Approved By</div></div><footer class="foot"><span>${safe(instituteName)} · Payroll Summary</span><span>Printed on ${safe(generatedAt)}</span></footer>
        </body></html>`);
        printDocument.close();
        let printTriggered = false;
        const triggerPrint = () => {
            if (printTriggered) return;
            printTriggered = true;
            try { printWindow.focus(); printWindow.print(); }
            catch (error) { console.error('Payroll print error:', error); showToast('Could not open the print dialog.', 'error'); printFrame.remove(); }
        };
        printFrame.onload = () => setTimeout(triggerPrint, 250);
        setTimeout(() => {
            if (document.getElementById('payrollSummaryPrintFrame') && printFrame.contentDocument?.readyState === 'complete') triggerPrint();
        }, 300);
        printWindow.addEventListener('afterprint', () => printFrame?.remove(), { once: true });
    } catch (err) { console.error('Error printing payroll summary:', err); showToast(err.message || 'Error printing summary.', 'error'); }
}

// ==========================================================================
// Modal helpers
// ==========================================================================
function openModal() { document.getElementById('payrollModal')?.classList.add('active'); }

function closeModal() {
    document.getElementById('payrollModal')?.classList.remove('active');
    document.getElementById('payrollForm')?.reset();
    if (document.getElementById('payrollId')) document.getElementById('payrollId').value = '';
    editingPayrollPaid = 0;
    calculateNet();
}

function openAddEmployeeModal() {
    document.getElementById('employeeForm')?.reset();
    document.getElementById('employeeModal')?.classList.add('active');
}

function closeEmployeeModal() {
    document.getElementById('employeeModal')?.classList.remove('active');
    document.getElementById('employeeForm')?.reset();
}

function closePaymentModal() {
    document.getElementById('paymentModal')?.classList.remove('active');
    document.getElementById('paymentForm')?.reset();
    currentPayrollId = null;
}

function clearFilters() {
    const monthEl = document.getElementById('monthFilter');
    const curM = new Date().toLocaleString('default', { month: 'long' });
    if (monthEl) {
        const opt = monthEl.querySelector(`option[value="${curM}"]`);
        if (opt) opt.selected = true;
    }
    const yearEl = document.getElementById('yearFilter');
    if (yearEl) yearEl.value = new Date().getFullYear();
    const statusEl = document.getElementById('statusFilter');
    if (statusEl) statusEl.value = '';
    const searchEl = document.getElementById('employeeSearch');
    if (searchEl) searchEl.value = '';
    loadPayroll();
}

// ==========================================================================
// Utility
// ==========================================================================
function formatCurrency(amount) {
    return '৳' + parseFloat(amount || 0).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function escHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function showError(msg) {
    const tbody = document.getElementById('payrollTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">
        <div style="text-align:center;padding:30px;color:#dc2626;">
            <i class="fas fa-exclamation-triangle" style="font-size:2rem;display:block;margin-bottom:8px;"></i>
            <p>${escHtml(msg)}</p>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="loadPayroll()">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div></td></tr>`;
}

function showToast(msg, type = 'success') {
    if (typeof showNotification === 'function') { showNotification(msg, type); return; }
    let c = document.getElementById('toastContainer');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toastContainer';
        c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.style.cssText = `padding:12px 20px;border-radius:8px;color:white;font-weight:600;font-size:0.9rem;
        box-shadow:0 4px 15px rgba(0,0,0,0.2);min-width:250px;
        background:${type==='success'?'#059669':type==='error'?'#dc2626':'#3b82f6'};`;
    t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':'exclamation-circle'}"></i> ${escHtml(msg)}`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 3000);
}
