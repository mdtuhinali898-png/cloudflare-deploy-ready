// ==========================================================================
// EduSmart Expense Management - Complete JavaScript
// ==========================================================================

let allCategories = [];
let selectedExpenses = new Set();
let currentExpenseId = null;
let currentActionExpenseId = null;
let currentPage = 1;
const PAGE_SIZE = 20;

document.addEventListener('DOMContentLoaded', function () {
    // Set default date/time
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('date');
    if (el) el.value = today;
    const timeEl = document.getElementById('time');
    if (timeEl) timeEl.value = new Date().toTimeString().substring(0, 5);

    loadCategories();
    loadExpenses();

    const form = document.getElementById('expenseForm');
    if (form) form.addEventListener('submit', handleFormSubmit);
    const catForm = document.getElementById('categoryForm');
    if (catForm) catForm.addEventListener('submit', handleCategorySubmit);

    // Search on enter
    const searchEl = document.getElementById('searchInput');
    if (searchEl) searchEl.addEventListener('keypress', e => { if (e.key === 'Enter') loadExpenses(); });

    ['searchInput', 'categoryFilter', 'methodFilter', 'statusFilter', 'vendorFilter', 'fromDateFilter', 'toDateFilter', 'amountMinFilter', 'amountMaxFilter']
        .forEach(id => {
            const input = document.getElementById(id);
            input?.addEventListener('input', updateExpenseFilterSummary);
            input?.addEventListener('change', updateExpenseFilterSummary);
        });
    ['fromDateFilter', 'toDateFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', clearActiveExpenseDatePreset);
        document.getElementById(id)?.addEventListener('change', clearActiveExpenseDatePreset);
    });
    updateExpenseFilterSummary();
});

// ==========================================================================
// Category Loading
// ==========================================================================
async function loadCategories() {
    try {
        const response = await fetch('/api/expenses/categories/all');
        const data = await response.json();
        if (data.success) {
            allCategories = data.categories;
            const catSelect = document.getElementById('category');
            const filterCat = document.getElementById('categoryFilter');
            const opts = data.categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');
            if (catSelect) catSelect.innerHTML = '<option value="">Select Category</option>' + opts;
            if (filterCat) filterCat.innerHTML = '<option value="all">All Categories</option>' + opts;
        }
    } catch (err) { console.error('Error loading categories:', err); }
}

function loadSubCategories() {
    const catVal = document.getElementById('category')?.value;
    const subSel = document.getElementById('subCategory');
    if (!subSel) return;
    subSel.innerHTML = '<option value="">Select Sub Category</option>';
    if (!catVal) return;
    const cat = allCategories.find(c => c.name === catVal);
    if (cat && cat.subCategories) {
        cat.subCategories.forEach(s => {
            subSel.innerHTML += `<option value="${escHtml(s.name)}">${escHtml(s.name)}</option>`;
        });
    }
}

// ==========================================================================
// Load Expenses with full filtering
// ==========================================================================
async function loadExpenses(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('expenseTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = buildFilterParams();
        params.append('page', page);
        params.append('limit', PAGE_SIZE);

        const res = await fetch('/api/expenses?' + params.toString());
        const data = await res.json();

        if (!data.success) {
            showExpenseError('Failed to load expenses. ' + (data.message || ''));
            return;
        }

        renderExpenseTable(data.expenses);
        renderPagination(data.total, page, PAGE_SIZE);
        renderFilteredTotal(data.totalFilteredAmount, data.total);

        const countEl = document.getElementById('expenseCount');
        if (countEl) countEl.textContent = `Total: ${data.total}`;

        // Populate vendor filter
        if (data.vendors) {
            const vf = document.getElementById('vendorFilter');
            if (vf) {
                const cur = vf.value;
                vf.innerHTML = '<option value="all">All Vendors</option>' +
                    data.vendors.map(v => `<option value="${escHtml(v)}"${v === cur ? ' selected' : ''}>${escHtml(v)}</option>`).join('');
                vf.value = cur;
            }
        }
    } catch (err) {
        console.error('Error loading expenses:', err);
        showExpenseError('Network error loading expenses.');
    }
}

function buildFilterParams() {
    const params = new URLSearchParams();
    const search = document.getElementById('searchInput')?.value?.trim();
    const cat = document.getElementById('categoryFilter')?.value;
    const method = document.getElementById('methodFilter')?.value;
    const status = document.getElementById('statusFilter')?.value;
    const vendor = document.getElementById('vendorFilter')?.value;
    const fromDate = document.getElementById('fromDateFilter')?.value;
    const toDate = document.getElementById('toDateFilter')?.value;
    const amtMin = document.getElementById('amountMinFilter')?.value;
    const amtMax = document.getElementById('amountMaxFilter')?.value;

    if (search) params.append('search', search);
    if (cat && cat !== 'all') params.append('category', cat);
    if (method && method !== 'all') params.append('method', method);
    if (status && status !== 'all') params.append('status', status);
    if (vendor && vendor !== 'all') params.append('vendor', vendor);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    if (amtMin) params.append('amountMin', amtMin);
    if (amtMax) params.append('amountMax', amtMax);
    return params;
}

// ==========================================================================
// Render Table
// ==========================================================================
function renderExpenseTable(expenses) {
    const tbody = document.getElementById('expenseTableBody');
    if (!tbody) return;

    if (!expenses || expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">
            <div style="padding:30px;color:var(--text-muted);">
                <i class="fas fa-inbox" style="font-size:2rem;opacity:0.4;display:block;margin-bottom:8px;"></i>
                No expenses found for the selected filters.
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = expenses.map(e => {
        const statusClass = (e.status || '').toLowerCase().replace(' ', '-');
        const hasReceipt = !!e.receiptFile;
        const isSelected = selectedExpenses.has(e._id);
        return `<tr class="${isSelected ? 'selected' : ''}" data-id="${e._id}">
            <td><input type="checkbox" class="expense-cb" value="${e._id}" onchange="toggleSelect('${e._id}')" ${isSelected ? 'checked' : ''}></td>
            <td><strong>${escHtml(e.expenseId || '-')}</strong></td>
            <td>${e.date || '-'}<br><small class="text-muted">${e.time || ''}</small></td>
            <td><strong>${escHtml(e.category)}</strong>${e.subCategory ? `<br><small class="text-muted">${escHtml(e.subCategory)}</small>` : ''}</td>
            <td><strong style="color:#dc2626;">${formatCurrency(e.amount)}</strong></td>
            <td><span class="badge badge-info">${escHtml(e.paymentMethod)}</span></td>
            <td><span class="status-badge ${statusClass}">${escHtml(e.status || 'Approved')}</span></td>
            <td>${hasReceipt
                ? `<span class="receipt-badge has-receipt"><i class="fas fa-paperclip"></i> Attached</span>`
                : `<span class="receipt-badge no-receipt"><i class="fas fa-exclamation-triangle"></i> Missing</span>`}
            </td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-primary" onclick="editExpense('${e._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-info" onclick="viewVoucher('${e._id}')" title="Voucher"><i class="fas fa-file-invoice"></i></button>
                ${e.status !== 'Approved' && e.status !== 'Voided'
                    ? `<button class="btn btn-sm btn-success" onclick="openApproveModal('${e._id}')" title="Approve"><i class="fas fa-check"></i></button>`
                    : ''}
                ${e.status !== 'Rejected' && e.status !== 'Voided'
                    ? `<button class="btn btn-sm btn-warning" onclick="openRejectModal('${e._id}')" title="Reject"><i class="fas fa-times"></i></button>`
                    : ''}
                ${e.status !== 'Voided'
                    ? `<button class="btn btn-sm btn-secondary" onclick="openVoidModal('${e._id}')" title="Void"><i class="fas fa-ban"></i></button>`
                    : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteExpense('${e._id}')" title="Delete"><i class="fas fa-trash-alt"></i></button>
            </td>
        </tr>`;
    }).join('');

    updateBulkButtons();
}

function renderFilteredTotal(totalAmount, totalCount) {
    const c = document.getElementById('filteredTotalContainer');
    if (!c) return;
    c.innerHTML = `<div class="filtered-total">
        <span><i class="fas fa-list"></i> ${totalCount} records found</span>
        <span>Total Filtered Expenses: <strong>${formatCurrency(totalAmount || 0)}</strong></span>
    </div>`;
}

function renderPagination(total, page, limit) {
    const el = document.getElementById('pagination');
    if (!el) return;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= Math.min(totalPages, 10); i++) {
        html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'}" onclick="loadExpenses(${i})">${i}</button> `;
    }
    el.innerHTML = html;
}

// ==========================================================================
// Form Handlers
// ==========================================================================
async function handleFormSubmit(e) {
    e.preventDefault();

    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

    const id = document.getElementById('expenseId')?.value;
    const statusVal = document.getElementById('expenseStatus')?.value || 'Pending Approval';

    const formData = {
        date: document.getElementById('date')?.value,
        time: document.getElementById('time')?.value,
        category: document.getElementById('category')?.value,
        subCategory: document.getElementById('subCategory')?.value,
        paymentMethod: document.getElementById('paymentMethod')?.value,
        amount: parseFloat(document.getElementById('amount')?.value || 0),
        vendor: document.getElementById('vendor')?.value,
        description: document.getElementById('description')?.value,
        status: statusVal,
        createdBy: 'Admin'
    };

    // Receipt: base64 encode if file chosen
    const fileInput = document.getElementById('receiptFile');
    if (fileInput && fileInput.files[0]) {
        formData.receiptFile = await fileToBase64(fileInput.files[0]);
    }

    try {
        const url = id ? `/api/expenses/${id}` : '/api/expenses';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (data.success) {
            showToast(id ? 'Expense updated successfully!' : 'Expense added successfully!', 'success');
            closeModal();
            loadExpenses(currentPage);
        } else {
            showToast('Error: ' + (data.message || 'Unknown error'), 'error');
        }
    } catch (err) {
        console.error('Error saving expense:', err);
        showToast('Network error. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Save Expense'; }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==========================================================================
// Edit & Delete
// ==========================================================================
async function editExpense(id) {
    try {
        const res = await fetch(`/api/expenses/${id}`);
        const data = await res.json();
        if (!data.success) { showToast('Could not load expense.', 'error'); return; }
        const e = data.expense;

        document.getElementById('expenseId').value = e._id;
        document.getElementById('date').value = e.date;
        document.getElementById('time').value = e.time || '';
        document.getElementById('category').value = e.category;
        document.getElementById('amount').value = e.amount;
        document.getElementById('paymentMethod').value = e.paymentMethod;
        document.getElementById('vendor').value = e.vendor || '';
        document.getElementById('description').value = e.description || '';
        const statusEl = document.getElementById('expenseStatus');
        if (statusEl) statusEl.value = e.status || 'Pending Approval';

        await loadSubCategories();
        document.getElementById('subCategory').value = e.subCategory || '';

        if (e.receiptFile) {
            const preview = document.getElementById('receiptPreview');
            if (preview) {
                preview.innerHTML = `<a href="${e.receiptFile}" target="_blank" class="btn btn-sm btn-info"><i class="fas fa-eye"></i> View Receipt</a>`;
                preview.style.display = 'block';
            }
        }

        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Expense';
        openModal();
    } catch (err) {
        console.error('Error loading expense:', err);
        showToast('Error loading expense data.', 'error');
    }
}

async function deleteExpense(id) {
    if (!confirm('Permanently delete this expense? It will be removed from expense reports and dashboard totals. If it is a Payroll expense, its linked salary payment will also be removed and the payroll balance recalculated.')) return;
    try {
        const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Expense deleted.', 'success');
            loadExpenses(currentPage);
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) {
        showToast('Error deleting expense.', 'error');
    }
}

// ==========================================================================
// Approval / Reject / Void
// ==========================================================================
function openApproveModal(id) {
    currentActionExpenseId = id;
    const form = document.getElementById('approvalForm');
    const rejForm = document.getElementById('rejectionForm');
    const title = document.getElementById('approvalModalTitle');
    const info = document.getElementById('approvalExpenseInfo');
    const actionArea = document.getElementById('approvalActionArea');

    if (form) form.style.display = 'block';
    if (rejForm) rejForm.style.display = 'none';
    if (actionArea) actionArea.style.display = 'block';
    if (title) title.innerHTML = '<i class="fas fa-check-circle"></i> Approve Expense';
    if (info) info.textContent = `Approving expense ID: ${id}`;

    document.getElementById('approvalModal')?.classList.add('active');
}

function openRejectModal(id) {
    currentActionExpenseId = id;
    const form = document.getElementById('approvalForm');
    const rejForm = document.getElementById('rejectionForm');
    const title = document.getElementById('approvalModalTitle');
    const info = document.getElementById('approvalExpenseInfo');
    const actionArea = document.getElementById('approvalActionArea');

    if (form) form.style.display = 'block';
    if (rejForm) rejForm.style.display = 'block';
    if (actionArea) actionArea.style.display = 'none';
    if (title) title.innerHTML = '<i class="fas fa-times-circle"></i> Reject Expense';
    if (info) info.textContent = `Rejecting expense ID: ${id}`;

    document.getElementById('approvalModal')?.classList.add('active');
}

function openVoidModal(id) {
    currentActionExpenseId = id;
    document.getElementById('voidReason').value = '';
    document.getElementById('voidExpenseInfo').textContent = `Voiding expense: ${id}`;
    document.getElementById('voidModal')?.classList.add('active');
}

function closeApprovalModal() { document.getElementById('approvalModal')?.classList.remove('active'); }
function closeVoidModal() { document.getElementById('voidModal')?.classList.remove('active'); }

async function confirmApprove() {
    if (!currentActionExpenseId) return;
    try {
        const res = await fetch(`/api/expenses/${currentActionExpenseId}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approvedBy: document.getElementById('approvedBy')?.value || 'Admin' })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Expense approved successfully!', 'success');
            closeApprovalModal();
            loadExpenses(currentPage);
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) { showToast('Error approving expense.', 'error'); }
}

async function confirmReject() {
    const reason = document.getElementById('rejectionReason')?.value?.trim();
    if (!reason) { showToast('Please enter a rejection reason.', 'error'); return; }
    if (!currentActionExpenseId) return;
    try {
        const res = await fetch(`/api/expenses/${currentActionExpenseId}/reject`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rejectedBy: document.getElementById('rejectedBy')?.value || 'Admin',
                rejectionReason: reason
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Expense rejected.', 'success');
            closeApprovalModal();
            loadExpenses(currentPage);
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) { showToast('Error rejecting expense.', 'error'); }
}

async function confirmVoid() {
    const reason = document.getElementById('voidReason')?.value?.trim();
    if (!reason) { showToast('Please enter a void reason.', 'error'); return; }
    if (!currentActionExpenseId) return;
    try {
        const res = await fetch(`/api/expenses/${currentActionExpenseId}/void`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voidedBy: 'Admin', voidReason: reason })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Expense voided.', 'success');
            closeVoidModal();
            loadExpenses(currentPage);
        } else {
            showToast('Error: ' + data.message, 'error');
        }
    } catch (err) { showToast('Error voiding expense.', 'error'); }
}

// ==========================================================================
// Bulk Select & Actions
// ==========================================================================
function toggleSelect(id) {
    if (selectedExpenses.has(id)) selectedExpenses.delete(id);
    else selectedExpenses.add(id);
    updateBulkButtons();
    updateSelectedCount();
}

function toggleSelectAll() {
    const cbs = document.querySelectorAll('.expense-cb');
    const allChecked = [...cbs].every(cb => cb.checked);
    selectedExpenses.clear();
    cbs.forEach(cb => {
        cb.checked = !allChecked;
        if (!allChecked) selectedExpenses.add(cb.value);
    });
    const hdr = document.getElementById('selectAllHeader');
    if (hdr) hdr.checked = !allChecked;
    updateBulkButtons();
    updateSelectedCount();
}

function updateSelectedCount() {
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = `${selectedExpenses.size} selected`;
}

function updateBulkButtons() {
    const show = selectedExpenses.size > 0;
    const expBtn = document.getElementById('bulkExportBtn');
    const prntBtn = document.getElementById('bulkPrintBtn');
    if (expBtn) expBtn.style.display = show ? 'inline-flex' : 'none';
    if (prntBtn) prntBtn.style.display = show ? 'inline-flex' : 'none';
    updateSelectedCount();
}

async function bulkExport() {
    if (selectedExpenses.size === 0) { showToast('Please select at least one expense.', 'error'); return; }
    try {
        const res = await fetch('/api/expenses/bulk-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [...selectedExpenses] })
        });
        const data = await res.json();
        if (!data.success) { showToast('Export failed.', 'error'); return; }
        exportExpensesToCSV(data.expenses);
        showToast(`Exported ${data.count} expenses.`, 'success');
    } catch (err) { showToast('Error exporting.', 'error'); }
}

function exportExpensesToCSV(expenses) {
    const rows = ['Expense ID,Date,Category,Sub Category,Amount,Method,Vendor,Status,Description'];
    expenses.forEach(e => {
        rows.push([
            e.expenseId, e.date, e.category, e.subCategory || '',
            e.amount, e.paymentMethod, e.vendor || '', e.status, (e.description || '').replace(/,/g, ';')
        ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'expenses-export-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function bulkPrint() {
    if (selectedExpenses.size === 0) { showToast('Please select at least one expense.', 'error'); return; }
    try {
        const res = await fetch('/api/expenses/bulk-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [...selectedExpenses] })
        });
        const data = await res.json();
        if (!data.success) { showToast('Could not load expenses for print.', 'error'); return; }
        printExpenseList(data.expenses);
    } catch (err) { showToast('Error preparing print.', 'error'); }
}

// Print every expense matching the current Filter & Search selections.
async function printFilteredExpenseReport() {
    const button = document.getElementById('expenseReportPrintBtn');
    if (button?.disabled) return;
    const originalLabel = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing report…';
    }

    try {
        const params = buildFilterParams();
        const pageSize = 1000;
        params.set('page', '1');
        params.set('limit', String(pageSize));

        const firstResponse = await fetch('/api/expenses?' + params.toString());
        const firstData = await firstResponse.json();
        if (!firstResponse.ok || !firstData.success) {
            throw new Error(firstData.message || 'Could not load expenses for the report.');
        }

        let expenses = firstData.expenses || [];
        const totalPages = Math.max(1, Number(firstData.totalPages) || 1);
        for (let page = 2; page <= totalPages; page++) {
            params.set('page', String(page));
            const response = await fetch('/api/expenses?' + params.toString());
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Could not load all matching expenses.');
            }
            expenses = expenses.concat(data.expenses || []);
        }

        if (!expenses.length) {
            showToast('No expenses found for the selected filters.', 'info');
            return;
        }

        let institute = {};
        try {
            const response = await fetch('/api/institute/public');
            const data = await response.json();
            if (data.success && data.data) institute = data.data;
        } catch (_) {}

        printExpenseReport(expenses, firstData.total, institute);
    } catch (error) {
        console.error('Error preparing expense report:', error);
        showToast(error.message || 'Error preparing expense report.', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalLabel;
        }
    }
}

function printExpenseReport(expenses, totalRecords, institute = {}) {
    const esc = value => escHtml(value || '');
    const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const filters = [];
    const search = document.getElementById('searchInput')?.value?.trim();
    const category = document.getElementById('categoryFilter');
    const method = document.getElementById('methodFilter');
    const status = document.getElementById('statusFilter');
    const vendor = document.getElementById('vendorFilter');
    const fromDate = document.getElementById('fromDateFilter')?.value;
    const toDate = document.getElementById('toDateFilter')?.value;
    const minAmount = document.getElementById('amountMinFilter')?.value;
    const maxAmount = document.getElementById('amountMaxFilter')?.value;
    if (search) filters.push(`Search: ${search}`);
    if (category?.value && category.value !== 'all') filters.push(`Category: ${category.selectedOptions[0]?.textContent || category.value}`);
    if (method?.value && method.value !== 'all') filters.push(`Method: ${method.selectedOptions[0]?.textContent || method.value}`);
    if (status?.value && status.value !== 'all') filters.push(`Status: ${status.value}`);
    if (vendor?.value && vendor.value !== 'all') filters.push(`Vendor: ${vendor.value}`);
    if (fromDate || toDate) filters.push(`Date: ${fromDate || 'Any'} to ${toDate || 'Any'}`);
    if (minAmount || maxAmount) filters.push(`Amount: ${minAmount || '0'} to ${maxAmount || 'Any'}`);

    const generatedAt = new Date().toLocaleString('en-BD', { dateStyle: 'medium', timeStyle: 'short' });
    const instituteName = institute.name || 'EduSmart Coaching Center';
    const logo = institute.logo ? `<img class="brand-logo" src="${esc(institute.logo)}" alt="Institute logo">` : '';
    const contact = [institute.address, institute.phone, institute.email].filter(Boolean).map(esc).join(' <span>•</span> ');
    const rows = expenses.map(expense => `<tr>
        <td class="date">${esc(expense.date || '-')}</td>
        <td class="id">${esc(expense.expenseId || '-')}</td>
        <td>${esc(expense.category || '-')}</td>
        <td>${esc(expense.description || expense.subCategory || '-')}</td>
        <td>${esc(expense.vendor || '-')}</td>
        <td>${esc(expense.paymentMethod || '-')}</td>
        <td>${esc(expense.status || '-')}</td>
        <td class="amount">${formatCurrency(expense.amount)}</td>
    </tr>`).join('');
    let printFrame = document.getElementById('expenseReportPrintFrame');
    if (printFrame) printFrame.remove();
    printFrame = document.createElement('iframe');
    printFrame.id = 'expenseReportPrintFrame';
    printFrame.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(printFrame);
    const printWindow = printFrame.contentWindow;
    const printDocument = printWindow.document;

    printDocument.open();
    printDocument.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Expense Report - ${esc(instituteName)}</title>
    <style>
        *{box-sizing:border-box} @page{size:A4 portrait;margin:12mm}
        body{font:10px/1.45 'Segoe UI',Arial,sans-serif;color:#1e293b;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .header{background:linear-gradient(120deg,#1e1b4b,#4f46e5);color:#fff;padding:18px 22px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;gap:18px}
        .brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-logo{width:52px;height:52px;object-fit:contain;background:#fff;border-radius:7px;padding:4px}
        .brand h1{font-size:19px;margin:0 0 3px;font-weight:800}.contact{font-size:9px;color:#e0e7ff}.title{text-align:right;flex-shrink:0}.title small{display:block;text-transform:uppercase;letter-spacing:1px;color:#c7d2fe;font-weight:700}.title strong{font-size:16px}
        .meta{display:flex;justify-content:space-between;gap:10px;margin:12px 0;padding:9px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;color:#475569}.filters{margin:-4px 0 12px;color:#64748b;font-size:9px}
        .summary{display:flex;gap:10px;margin:12px 0 16px}.summary-card{flex:1;padding:10px 13px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc}.summary-card.total{background:#fef2f2;border-color:#fecaca}.label{font-size:8px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.5px}.value{font-size:15px;font-weight:800;margin-top:3px;color:#0f172a}.total .value{color:#b91c1c}
        table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#4f46e5;color:#fff;text-align:left;padding:7px 6px;text-transform:uppercase;font-size:7.5px;letter-spacing:.25px}td{padding:6px;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafc}.date,.id{white-space:nowrap}.id{font-family:Consolas,monospace;color:#4338ca}.amount{text-align:right;white-space:nowrap;font-weight:700}.foot{margin-top:18px;display:flex;justify-content:space-between;color:#64748b;font-size:8px}.signatures{display:flex;justify-content:space-between;gap:60px;margin:38px 24px 0}.signature{width:220px;border-top:1px solid #64748b;text-align:center;padding-top:5px;font-weight:700;color:#334155}
        @media print{.header,.summary-card.total,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}.header{break-inside:avoid}.summary{break-inside:avoid}}
    </style></head><body>
      <header class="header"><div class="brand">${logo}<div><h1>${esc(instituteName)}</h1>${contact ? `<div class="contact">${contact}</div>` : ''}</div></div><div class="title"><small>Financial Management</small><strong>Expense Report</strong></div></header>
      <div class="meta"><span><b>Report period:</b> ${fromDate || toDate ? `${esc(fromDate || 'All dates')} – ${esc(toDate || 'All dates')}` : 'All dates'}</span><span><b>Generated:</b> ${esc(generatedAt)}</span></div>
      ${filters.length ? `<div class="filters"><b>Applied filters:</b> ${filters.map(esc).join(' &nbsp;|&nbsp; ')}</div>` : ''}
      <section class="summary"><div class="summary-card"><div class="label">Expense Records</div><div class="value">${Number(totalRecords ?? expenses.length).toLocaleString('en-BD')}</div></div><div class="summary-card total"><div class="label">Total Expenses</div><div class="value">${formatCurrency(totalAmount)}</div></div></section>
      <table><thead><tr><th style="width:9%">Date</th><th style="width:12%">Expense ID</th><th style="width:12%">Category</th><th style="width:23%">Description</th><th style="width:14%">Vendor</th><th style="width:10%">Method</th><th style="width:10%">Status</th><th style="width:10%;text-align:right">Amount</th></tr></thead><tbody>${rows}<tr><td colspan="7" style="text-align:right;font-weight:800;background:#fef2f2">TOTAL (${expenses.length} records)</td><td class="amount" style="background:#fef2f2;color:#991b1b">${formatCurrency(totalAmount)}</td></tr></tbody></table>
      <div class="signatures"><div class="signature">Prepared By</div><div class="signature">Approved By</div></div><footer class="foot"><span>${esc(instituteName)} · Expense Report</span><span>Printed on ${esc(generatedAt)}</span></footer>
    </body></html>`);
    printDocument.close();
    let printTriggered = false;
    const triggerPrint = () => {
        if (printTriggered) return;
        printTriggered = true;
        try {
            printWindow.focus();
            printWindow.print();
        } catch (error) {
            console.error('Expense report print error:', error);
            showToast('Could not open the print dialog.', 'error');
            printFrame.remove();
        }
    };
    printFrame.onload = () => setTimeout(triggerPrint, 250);
    // about:blank iframes can finish loading before the onload handler is attached.
    setTimeout(() => {
        if (document.getElementById('expenseReportPrintFrame') && printFrame.contentDocument?.readyState === 'complete') triggerPrint();
    }, 300);
    printWindow.addEventListener('afterprint', () => printFrame?.remove(), { once: true });
}

// ===========================================================================
// Voucher
// ==========================================================================
async function viewVoucher(id) {
    try {
        const res = await fetch(`/api/expenses/${id}`);
        const data = await res.json();
        if (!data.success) { showToast('Could not load expense.', 'error'); return; }

        let instituteName = 'EduSmart Coaching Center';
        try {
            const instRes = await fetch('/api/institute/public');
            const instData = await instRes.json();
            if (instData.success && instData.data?.name) instituteName = instData.data.name;
        } catch(e) {}

        const e = data.expense;
        const voucherHtml = generateVoucherHTML(e, instituteName);
        const container = document.getElementById('voucherContent');
        if (container) container.innerHTML = voucherHtml;
        document.getElementById('voucherModal')?.classList.add('active');
    } catch (err) { showToast('Error loading voucher.', 'error'); }
}

function generateVoucherHTML(e, instituteName) {
    const formattedAmount = formatCurrency(e.amount || 0);
    const statusText = e.status || 'Approved';
    const isApproved = statusText.toLowerCase().includes('approved');
    const statusBg = isApproved ? '#ecfdf5' : '#fffbeb';
    const statusColor = isApproved ? '#059669' : '#b45309';
    const statusBorder = isApproved ? '#6ee7b7' : '#fde68a';
    const statusIcon = isApproved ? 'fa-check-circle' : 'fa-clock';

    return `
    <div class="voucher-container" id="printableVoucher" style="font-family:'Inter','Segoe UI',sans-serif; background:#fff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 10px 25px rgba(0,0,0,0.05);">
        <!-- Header -->
        <div class="voucher-header" style="background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff; padding:16px 20px; border-radius:8px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h2 style="margin:0; font-size:1.25rem; font-weight:800; color:#fff;"><i class="fas fa-graduation-cap"></i> ${escHtml(instituteName || 'EduSmart')}</h2>
                <div style="font-size:0.85rem; opacity:0.9; margin-top:4px;">ব্যয় ভাউচার / Expense Voucher</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; opacity:0.8;">Voucher No.</div>
                <div style="font-family:monospace; font-weight:700; font-size:0.95rem; background:rgba(255,255,255,0.2); padding:3px 10px; border-radius:4px; margin-top:2px;">${escHtml(e.expenseId || e.id || 'N/A')}</div>
            </div>
        </div>

        <!-- Details Table (Daily Statement Style) -->
        <div class="voucher-body" style="margin-bottom:20px;">
            <table class="details-table" style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; font-size:13px; font-family:'Inter','Segoe UI',sans-serif;">
                <thead>
                    <tr style="background:#4f46e5; color:#ffffff;">
                        <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border:1px solid #4338ca; width:40%;">ক্ষেত্র / Field</th>
                        <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; border:1px solid #4338ca; width:60%;">তথ্য / Details</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background:#ffffff;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">ভাউচার নম্বর / Voucher No.</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-family:monospace; font-weight:700; color:#4f46e5;">${escHtml(e.expenseId || e.id || 'N/A')}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">তারিখ / Date</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;">${e.date || '-'}</td>
                    </tr>
                    <tr style="background:#ffffff;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">বিস্তারিত / Purpose</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;">${escHtml(e.description || e.purpose || 'Untitled Expense')}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">বিভাগ / Category</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;"><span style="background:#eef2ff; color:#4f46e5; padding:3px 8px; border-radius:4px; font-weight:600; font-size:12px;">${escHtml(e.category || 'Office')}</span></td>
                    </tr>
                    <tr style="background:#ffffff;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">শাখা / Branch</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;">${escHtml(e.branch || instituteName || 'EduSmart')}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">প্রদানকারী / Vendor</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;">${escHtml(e.vendor || 'N/A')}</td>
                    </tr>
                    <tr style="background:#ffffff;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">পেমেন্ট পদ্ধতি / Payment Method</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#1e293b;"><i class="fas fa-money-bill-wave" style="color:#059669; margin-right:4px;"></i> ${escHtml(e.paymentMethod || 'Cash')}</td>
                    </tr>
                    <tr style="background:#f8fafc;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">খরচের পরিমাণ / Amount</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:800; color:#dc2626; font-size:1.05rem;">${formattedAmount}</td>
                    </tr>
                    <tr style="background:#ffffff;">
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#475569;">স্ট্যাটাস / Status</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0;"><span style="background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder}; padding:3px 10px; border-radius:20px; font-weight:700; font-size:11px; display:inline-flex; align-items:center; gap:4px;"><i class="fas ${statusIcon}"></i> ${escHtml(statusText)}</span></td>
                    </tr>
                    <tr style="background:#4f46e5; color:#ffffff; font-weight:800;">
                        <td style="padding:10px 12px; font-size:13px; text-transform:uppercase; letter-spacing:0.03em;">মোট পরিমাণ (Total)</td>
                        <td style="padding:10px 12px; font-size:1.1rem; color:#ffffff;">${formattedAmount}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Footer Signatures -->
        <div class="voucher-footer" style="margin-top:30px; display:flex; justify-content:space-between; padding-top:20px; border-top:1px dashed #cbd5e1;">
            <div style="text-align:center; width:45%;">
                <div style="border-top:1.5px solid #475569; margin-top:35px; padding-top:6px; font-weight:700; color:#334155; font-size:12px;">প্রস্তুতকারী / Prepared By</div>
            </div>
            <div style="text-align:center; width:45%;">
                <div style="border-top:1.5px solid #475569; margin-top:35px; padding-top:6px; font-weight:700; color:#334155; font-size:12px;">অনুমোদনকারী / Approved By</div>
            </div>
        </div>

        <!-- Action buttons -->
        <div class="no-print" style="margin-top:20px; text-align:right; display:flex; gap:8px; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="printVoucher()" style="background:#4f46e5; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:600; cursor:pointer;"><i class="fas fa-print"></i> Print</button>
            <button class="btn btn-secondary" onclick="closeVoucherModal()" style="background:#e2e8f0; color:#334155; border:none; padding:8px 16px; border-radius:6px; font-weight:600; cursor:pointer;"><i class="fas fa-times"></i> Close</button>
        </div>
    </div>`;
}

function printVoucher() {
    const source = document.getElementById('voucherContent');
    const printArea = document.getElementById('voucherPrintArea');
    if (!source || !printArea || !source.innerHTML.trim()) {
        showToast('Voucher is not ready to print.', 'error');
        return;
    }

    printArea.innerHTML = source.innerHTML;
    const printOnlyControls = printArea.querySelectorAll('.no-print');
    printOnlyControls.forEach(element => element.remove());
    printArea.style.display = 'block';

    const cleanup = () => {
        printArea.innerHTML = '';
        printArea.style.display = 'none';
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
}

function closeVoucherModal() { document.getElementById('voucherModal')?.classList.remove('active'); }

// ==========================================================================
// Print Expense List
// ==========================================================================
function printExpenseList(expenses) {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const rows = expenses.map(e => `<tr>
        <td>${escHtml(e.expenseId || '')}</td><td>${e.date}</td>
        <td>${escHtml(e.category)}</td><td style="text-align:right;font-weight:600;">৳${(e.amount||0).toFixed(2)}</td>
        <td>${escHtml(e.paymentMethod)}</td><td>${escHtml(e.status||'')}</td>
        <td>${escHtml(e.vendor||'-')}</td>
    </tr>`).join('');
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Expense List</title>
    <style>
        body{font-family:'Segoe UI',sans-serif;padding:20px;font-size:10pt;}
        h2{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:8px;}
        table{width:100%;border-collapse:collapse;margin-top:12px;}
        th{background:#1e40af;color:white;padding:6px 8px;text-align:left;font-size:9pt;}
        td{padding:5px 8px;border:1px solid #e5e7eb;}
        tr:nth-child(even){background:#f9fafb;}
        .total-row{background:#fef3c7;font-weight:700;}
        @media print{button{display:none;}}
    </style></head><body>
    <h2><i>Expense List</i></h2>
    <p>Generated: ${new Date().toLocaleDateString('en-BD')}</p>
    <table><thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Amount</th><th>Method</th><th>Status</th><th>Vendor</th></tr></thead>
    <tbody>${rows}
    <tr class="total-row"><td colspan="3">Total (${expenses.length} records)</td><td style="text-align:right;">৳${total.toFixed(2)}</td><td colspan="3"></td></tr>
    </tbody></table>
    <br><button onclick="window.print()">🖨 Print</button>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
}

// ==========================================================================
// Category Management
// ==========================================================================
async function loadCategoriesTable() {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
        const res = await fetch('/api/expenses/categories/all');
        const data = await res.json();
        if (data.success) {
            if (data.categories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding:20px;color:var(--text-muted);">No categories yet. Add your first category.</td></tr>';
                return;
            }
            tbody.innerHTML = data.categories.map(cat => `<tr>
                <td><strong>${escHtml(cat.name)}</strong></td>
                <td>${cat.subCategories.map(s => `<span class="badge badge-info" style="margin:2px;">${escHtml(s.name)}</span>`).join('') || '<span style="color:var(--text-muted);">None</span>'}</td>
                <td>${escHtml(cat.description || '-')}</td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" onclick="editCategory('${cat._id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat._id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#dc2626;">Failed to load categories.</td></tr>';
    }
}

function openCategoryModal() {
    document.getElementById('categoryForm')?.reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add Category';
    document.getElementById('categoryModal')?.classList.add('active');
}

function closeCategoryModal() { document.getElementById('categoryModal')?.classList.remove('active'); }

async function editCategory(id) {
    try {
        const res = await fetch('/api/expenses/categories/all');
        const data = await res.json();
        if (!data.success) return;
        const cat = data.categories.find(c => c._id === id);
        if (!cat) return;
        document.getElementById('categoryId').value = cat._id;
        document.getElementById('categoryName').value = cat.name;
        document.getElementById('categoryDescription').value = cat.description || '';
        document.getElementById('subCategoriesInput').value = cat.subCategories.map(s => s.name).join(', ');
        document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Category';
        document.getElementById('categoryModal')?.classList.add('active');
    } catch (err) { showToast('Error loading category.', 'error'); }
}

async function deleteCategory(id) {
    if (!confirm('Delete this category?')) return;
    try {
        const res = await fetch(`/api/expenses/categories/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) { showToast('Category deleted.', 'success'); loadCategoriesTable(); loadCategories(); }
        else showToast('Error: ' + data.message, 'error');
    } catch (err) { showToast('Error deleting category.', 'error'); }
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    const id = document.getElementById('categoryId').value;
    const subs = document.getElementById('subCategoriesInput').value.trim();
    const body = {
        name: document.getElementById('categoryName').value.trim(),
        description: document.getElementById('categoryDescription').value.trim(),
        subCategories: subs ? subs.split(',').map(s => ({ name: s.trim() })).filter(s => s.name) : []
    };
    try {
        const url = id ? `/api/expenses/categories/${id}` : '/api/expenses/categories';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (data.success) {
            showToast(id ? 'Category updated!' : 'Category added!', 'success');
            closeCategoryModal();
            loadCategoriesTable();
            loadCategories();
        } else showToast('Error: ' + data.message, 'error');
    } catch (err) { showToast('Error saving category.', 'error'); }
}

// ==========================================================================
// Modal helpers
// ==========================================================================
function openModal() { document.getElementById('expenseModal')?.classList.add('active'); }

function closeModal() {
    document.getElementById('expenseModal')?.classList.remove('active');
    resetForm();
}

function openAddModal() {
    resetForm();
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add Expense';
    openModal();
}

function resetForm() {
    document.getElementById('expenseForm')?.reset();
    const idEl = document.getElementById('expenseId');
    if (idEl) idEl.value = '';
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.value = today;
    const timeEl = document.getElementById('time');
    if (timeEl) timeEl.value = new Date().toTimeString().substring(0, 5);
    const preview = document.getElementById('receiptPreview');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    const statusEl = document.getElementById('expenseStatus');
    if (statusEl) statusEl.value = 'Pending Approval';
}

function clearFilters() {
    const ids = ['searchInput', 'fromDateFilter', 'toDateFilter', 'amountMinFilter', 'amountMaxFilter'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['categoryFilter', 'methodFilter', 'statusFilter', 'vendorFilter'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = 'all';
    });
    clearActiveExpenseDatePreset();
    updateExpenseFilterSummary();
    loadExpenses(1);
}

function applyExpenseDatePreset(preset) {
    const now = new Date();
    const asInputDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let from;
    let to;
    if (preset === 'today') {
        from = to = asInputDate(now);
    } else if (preset === 'thisMonth') {
        from = asInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
        to = asInputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (preset === 'lastMonth') {
        from = asInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        to = asInputDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else return;

    document.getElementById('fromDateFilter').value = from;
    document.getElementById('toDateFilter').value = to;
    document.querySelectorAll('.exp-date-preset').forEach(button => {
        button.classList.toggle('active', button.dataset.preset === preset);
    });
    updateExpenseFilterSummary();
    loadExpenses(1);
}

function clearActiveExpenseDatePreset() {
    document.querySelectorAll('.exp-date-preset.active').forEach(button => button.classList.remove('active'));
}

function toggleMoreExpenseFilters() {
    const panel = document.getElementById('moreExpenseFilters');
    const button = document.getElementById('moreFiltersToggle');
    if (!panel || !button) return;
    const isOpen = panel.classList.toggle('show');
    button.setAttribute('aria-expanded', String(isOpen));
    button.innerHTML = `<i class="fas fa-sliders-h"></i> ${isOpen ? 'Fewer filters' : 'More filters'}`;
}

function updateExpenseFilterSummary() {
    const active = [];
    const search = document.getElementById('searchInput')?.value?.trim();
    const category = document.getElementById('categoryFilter');
    const method = document.getElementById('methodFilter');
    const status = document.getElementById('statusFilter');
    const vendor = document.getElementById('vendorFilter');
    const fromDate = document.getElementById('fromDateFilter')?.value;
    const toDate = document.getElementById('toDateFilter')?.value;
    const minAmount = document.getElementById('amountMinFilter')?.value;
    const maxAmount = document.getElementById('amountMaxFilter')?.value;

    if (search) active.push(`Search: ${search}`);
    if (fromDate || toDate) active.push(`Date: ${fromDate || 'Any'} – ${toDate || 'Any'}`);
    if (category?.value && category.value !== 'all') active.push(`Category: ${category.selectedOptions[0]?.textContent || category.value}`);
    if (method?.value && method.value !== 'all') active.push(`Method: ${method.selectedOptions[0]?.textContent || method.value}`);
    if (status?.value && status.value !== 'all') active.push(`Status: ${status.value}`);
    if (vendor?.value && vendor.value !== 'all') active.push(`Vendor: ${vendor.selectedOptions[0]?.textContent || vendor.value}`);
    if (minAmount || maxAmount) active.push(`Amount: ${minAmount || '0'} – ${maxAmount || 'Any'}`);

    const badge = document.getElementById('filterBadge');
    if (badge) {
        badge.textContent = `${active.length} active`;
        badge.classList.toggle('visible', active.length > 0);
    }
    const summary = document.getElementById('activeFilterSummary');
    if (summary) {
        summary.innerHTML = active.map(item => `<span class="exp-filter-chip">${escHtml(item)}</span>`).join('')
            + (active.length ? '<button type="button" class="exp-filter-clear-link" onclick="clearFilters()">Clear all</button>' : '');
    }
}

// ==========================================================================
// Error state
// ==========================================================================
function showExpenseError(msg) {
    const tbody = document.getElementById('expenseTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9">
        <div style="text-align:center;padding:30px;color:#dc2626;">
            <i class="fas fa-exclamation-triangle" style="font-size:2rem;display:block;margin-bottom:8px;"></i>
            <p>${escHtml(msg)}</p>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="loadExpenses()">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div></td></tr>`;
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

function showToast(msg, type = 'success') {
    // Use existing notification system if available
    if (typeof showNotification === 'function') {
        showNotification(msg, type);
        return;
    }
    // Fallback: create a simple toast
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(toastContainer);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `padding:12px 20px;border-radius:8px;color:white;font-weight:600;font-size:0.9rem;
        box-shadow:0 4px 15px rgba(0,0,0,0.2);animation:fadeSlideIn 0.3s ease;min-width:250px;
        background:${type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#3b82f6'};`;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${escHtml(msg)}`;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}
