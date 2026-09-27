const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatExpense(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        expenseId: row.expense_id,
        date: row.date,
        time: row.time,
        month: row.month,
        year: row.year,
        category: row.category,
        subCategory: row.sub_category,
        paymentMethod: row.payment_method,
        vendor: row.vendor,
        branch: row.branch,
        amount: Number(row.amount || 0),
        description: row.description,
        receiptFile: row.receipt_file,
        status: row.status,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        rejectedBy: row.rejected_by,
        rejectedAt: row.rejected_at,
        rejectionReason: row.rejection_reason,
        voidReason: row.void_reason,
        auditLog: row.audit_log || [],
        incomeSource: row.income_source,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toExpenseRow(data) {
    const row = {};
    if (data.expenseId !== undefined) row.expense_id = data.expenseId;
    if (data.date !== undefined) row.date = String(data.date);
    if (data.time !== undefined) row.time = String(data.time || '12:00');
    if (data.month !== undefined) row.month = data.month;
    if (data.year !== undefined) row.year = Number(data.year);
    if (data.category !== undefined) row.category = data.category;
    if (data.subCategory !== undefined) row.sub_category = data.subCategory;
    if (data.paymentMethod !== undefined) row.payment_method = data.paymentMethod;
    if (data.vendor !== undefined) row.vendor = data.vendor;
    if (data.branch !== undefined) row.branch = data.branch;
    if (data.amount !== undefined) row.amount = Number(data.amount || 0);
    if (data.description !== undefined) row.description = data.description;
    if (data.receiptFile !== undefined) row.receipt_file = data.receiptFile;
    if (data.status !== undefined) row.status = data.status;
    if (data.approvedBy !== undefined) row.approved_by = data.approvedBy;
    if (data.approvedAt !== undefined) row.approved_at = data.approvedAt;
    if (data.rejectedBy !== undefined) row.rejected_by = data.rejectedBy;
    if (data.rejectedAt !== undefined) row.rejected_at = data.rejectedAt;
    if (data.rejectionReason !== undefined) row.rejection_reason = data.rejectionReason;
    if (data.voidReason !== undefined) row.void_reason = data.voidReason;
    if (data.incomeSource !== undefined) row.income_source = data.incomeSource;
    if (data.createdBy !== undefined) row.created_by = data.createdBy;
    return row;
}

// @route   GET /api/expenses
// @desc    Get all expenses with advanced filtering
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { 
            date, category, method, startDate, endDate, search, 
            page = 1, limit = 50,
            status, vendor, amountMin, amountMax,
            fromDate, toDate
        } = req.query;

        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('expenses').select('*', { count: 'exact' });

        if (date) query = query.eq('date', date);
        if (category && category !== 'all') query = query.eq('category', category);
        if (method && method !== 'all') query = query.eq('payment_method', method);
        if (status && status !== 'all') query = query.eq('status', status);
        if (vendor && vendor !== 'all') query = query.eq('vendor', vendor);

        if (fromDate && toDate) {
            query = query.gte('date', fromDate).lte('date', toDate);
        } else if (startDate && endDate) {
            query = query.gte('date', startDate).lte('date', endDate);
        }

        if (amountMin) query = query.gte('amount', parseFloat(amountMin));
        if (amountMax) query = query.lte('amount', parseFloat(amountMax));

        if (search) {
            const s = search.trim();
            query = query.or(`expense_id.ilike.%${s}%,vendor.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const expenses = (data || []).map(formatExpense);
        const total = count || 0;
        const totalFilteredAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        // Fetch distinct vendors
        const { data: vendorData } = await supabase.from('expenses').select('vendor').not('vendor', 'is', null);
        const vendors = [...new Set((vendorData || []).map(v => v.vendor).filter(Boolean))];

        res.json({
            success: true,
            expenses,
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal),
            totalFilteredAmount,
            vendors
        });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ success: false, message: 'Error fetching expenses', error: error.message });
    }
});

// @route   GET /api/expenses/summary
// @desc    Get expense KPI totals
// @access  Public
router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const toDateString = date => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const today = toDateString(now);
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthEnd = toDateString(new Date(nextMonth.getTime() - 86400000));

        const { data: allExpenses, error } = await supabase
            .from('expenses')
            .select('amount, date, status');

        if (error) throw error;

        let allTimeAmount = 0;
        let allTimeCount = (allExpenses || []).length;
        let thisMonthAmount = 0;
        let pendingCount = 0;
        let todayAmount = 0;
        let todayCount = 0;

        (allExpenses || []).forEach(e => {
            const amt = Number(e.amount || 0);
            allTimeAmount += amt;

            if (e.status === 'Pending Approval') {
                pendingCount++;
            }

            if (e.status === 'Approved') {
                if (e.date >= monthStart && e.date <= monthEnd) {
                    thisMonthAmount += amt;
                }
                if (e.date === today) {
                    todayAmount += amt;
                    todayCount++;
                }
            }
        });

        res.json({
            success: true,
            allTimeAmount,
            allTimeCount,
            thisMonthAmount,
            thisMonthLabel: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
            pendingCount,
            todayAmount,
            todayCount
        });
    } catch (error) {
        console.error('Error fetching expense summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching expense summary', error: error.message });
    }
});

// Category routes
function normalizeExpenseSubCategories(subCategories) {
    if (!Array.isArray(subCategories)) return [];

    function getSubCategoryName(item, depth = 0) {
        if (depth > 5 || item == null) return '';
        if (typeof item === 'string') {
            const text = item.trim();
            if (!text) return '';

            // Older rows may contain serialized JSON in a text array, e.g.
            // '{"name":"Electricity Bill"}'. Parse it before treating the
            // value as a plain subcategory label.
            if (text.startsWith('{') || text.startsWith('[') || text.startsWith('"')) {
                try {
                    const parsed = JSON.parse(text);
                    if (parsed !== text) return getSubCategoryName(parsed, depth + 1);
                } catch (_) {
                    // Keep malformed or ordinary text as its literal label.
                }
            }
            return text;
        }
        if (Array.isArray(item)) {
            return item.map(value => getSubCategoryName(value, depth + 1)).find(Boolean) || '';
        }
        if (typeof item === 'object') {
            const value = item.name ?? item.label ?? item.title ?? item.value
                ?? item.subCategory ?? item.sub_category ?? item.subcategory;
            return getSubCategoryName(value, depth + 1);
        }
        return String(item).trim();
    }

    return subCategories
        .map(item => getSubCategoryName(item))
        .filter(Boolean)
        .map(name => ({ name }));
}

router.get('/categories/all', async (req, res) => {
    try {
        const { data: categories, error } = await supabase
            .from('expense_categories')
            .select('*')
            .eq('status', 'Active')
            .order('name', { ascending: true });

        if (error) throw error;

        res.json({
            success: true,
            categories: (categories || []).map(c => ({
                _id: c.id,
                id: c.id,
                name: c.name,
                // Older category rows may store subcategories as strings (or
                // use a legacy label key); the frontend expects { name }.
                subCategories: normalizeExpenseSubCategories(c.sub_categories),
                status: c.status
            }))
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const { name, subCategories, status } = req.body;
        const newCategory = {
            name,
            sub_categories: subCategories || [],
            status: status || 'Active',
            created_at: new Date()
        };

        const { data, error } = await supabase
            .from('expense_categories')
            .insert(newCategory)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Category added successfully', category: data });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ success: false, message: 'Error creating category', error: error.message });
    }
});

router.put('/categories/:id', async (req, res) => {
    try {
        const { name, subCategories, status } = req.body;
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (subCategories !== undefined) updateData.sub_categories = subCategories;
        if (status !== undefined) updateData.status = status;

        const { data, error } = await supabase
            .from('expense_categories')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category updated successfully', category: data });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ success: false, message: 'Error updating category', error: error.message });
    }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('expense_categories').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ success: false, message: 'Error deleting category', error: error.message });
    }
});

// Single Expense
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('expenses').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('expense_id', idParam);
        }

        const { data, error } = await query.maybeSingle();
        if (error || !data) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, expense: formatExpense(data) });
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.status(500).json({ success: false, message: 'Error fetching expense', error: error.message });
    }
});

// Create Expense
router.post('/', async (req, res) => {
    try {
        const expenseData = req.body;

        const { count: expenseCount } = await supabase
            .from('expenses')
            .select('*', { count: 'exact', head: true });

        const expenseId = 'EXP-' + Date.now() + '-' + ((expenseCount || 0) + 1);

        if (!expenseData.month || !expenseData.year) {
            if (expenseData.date) {
                const dateObj = new Date(expenseData.date);
                if (!expenseData.month) expenseData.month = dateObj.toLocaleString('default', { month: 'long' });
                if (!expenseData.year) expenseData.year = dateObj.getFullYear();
            }
        }

        const newRow = toExpenseRow(expenseData);
        newRow.expense_id = expenseId;
        newRow.created_at = new Date();
        newRow.updated_at = new Date();

        const { data: savedExpense, error } = await supabase
            .from('expenses')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;

        // Log audit
        await supabase.from('audit_logs').insert({
            user: expenseData.createdBy || 'Admin',
            action: 'Expense Created',
            module: 'Expense',
            record_id: savedExpense.id,
            new_value: { amount: savedExpense.amount, category: savedExpense.category, status: savedExpense.status },
            description: `Expense ${expenseId} created for ${savedExpense.category} - ৳${savedExpense.amount}`
        });

        res.status(201).json({ 
            success: true, 
            message: 'Expense added successfully',
            expense: formatExpense(savedExpense)
        });
    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ success: false, message: 'Error creating expense', error: error.message });
    }
});

// Update Expense
router.put('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const updateData = toExpenseRow(req.body);

        if (updateData.date) {
            const dateObj = new Date(updateData.date);
            if (!updateData.month) updateData.month = dateObj.toLocaleString('default', { month: 'long' });
            if (!updateData.year) updateData.year = dateObj.getFullYear();
        }
        updateData.updated_at = new Date();

        let query = supabase.from('expenses').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('expense_id', idParam);
        }

        const { data: updatedExpense, error } = await query.select().single();
        if (error) throw error;
        if (!updatedExpense) return res.status(404).json({ success: false, message: 'Expense not found' });

        res.json({ 
            success: true, 
            message: 'Expense updated successfully',
            expense: formatExpense(updatedExpense)
        });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ success: false, message: 'Error updating expense', error: error.message });
    }
});

// Approve Expense
router.patch('/:id/approve', async (req, res) => {
    try {
        const idParam = req.params.id;
        const updateData = {
            status: 'Approved',
            approved_by: req.body.approvedBy || 'Admin',
            approved_at: new Date(),
            updated_at: new Date()
        };

        let query = supabase.from('expenses').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('expense_id', idParam);

        const { data: expense, error } = await query.select().single();
        if (error) throw error;
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

        res.json({ success: true, message: 'Expense approved successfully', expense: formatExpense(expense) });
    } catch (error) {
        console.error('Error approving expense:', error);
        res.status(500).json({ success: false, message: 'Error approving expense', error: error.message });
    }
});

// Reject Expense
router.patch('/:id/reject', async (req, res) => {
    try {
        const idParam = req.params.id;
        const { rejectedBy, rejectionReason } = req.body;
        const updateData = {
            status: 'Rejected',
            rejected_by: rejectedBy || 'Admin',
            rejected_at: new Date(),
            rejection_reason: rejectionReason || '',
            updated_at: new Date()
        };

        let query = supabase.from('expenses').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('expense_id', idParam);

        const { data: expense, error } = await query.select().single();
        if (error) throw error;
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

        res.json({ success: true, message: 'Expense rejected', expense: formatExpense(expense) });
    } catch (error) {
        console.error('Error rejecting expense:', error);
        res.status(500).json({ success: false, message: 'Error rejecting expense', error: error.message });
    }
});

// Delete Expense
router.delete('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        let lookup = supabase.from('expenses').select('*');
        if (isUuid) lookup = lookup.eq('id', idParam);
        else lookup = lookup.eq('expense_id', idParam);
        const { data: expense, error: lookupError } = await lookup.maybeSingle();
        if (lookupError) throw lookupError;
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });

        // Payroll expense IDs map one-to-one to payroll_payments records.
        // Remove the payment and recalculate its parent payroll record as well.
        if (typeof expense.expense_id === 'string' && expense.expense_id.startsWith('PAYROLL-')) {
            const paymentId = expense.expense_id.slice('PAYROLL-'.length);
            const { data: payment, error: paymentLookupError } = await supabase.from('payroll_payments')
                .select('*').eq('id', paymentId).maybeSingle();
            if (paymentLookupError) throw paymentLookupError;
            if (payment) {
                const { data: payroll, error: payrollLookupError } = await supabase.from('payroll')
                    .select('*').eq('id', payment.payroll_id).maybeSingle();
                if (payrollLookupError) throw payrollLookupError;

                const { error: paymentDeleteError } = await supabase.from('payroll_payments').delete().eq('id', payment.id);
                if (paymentDeleteError) throw paymentDeleteError;

                if (payroll) {
                    const { data: remainingPayments, error: remainingError } = await supabase.from('payroll_payments')
                        .select('amount, payment_date, payment_method').eq('payroll_id', payroll.id);
                    if (remainingError) throw remainingError;
                    const paidAmount = (remainingPayments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
                    const netPayable = Math.max(0, Number(payroll.salary || 0) + Number(payroll.bonus || 0) - Number(payroll.deduction || 0));
                    const advance = Number(payroll.advance || 0);
                    const dueSalary = Math.max(0, netPayable - paidAmount - advance);
                    const status = dueSalary === 0 ? 'Paid' : (paidAmount + advance > 0 ? 'Partial' : 'Pending');
                    const latestPayment = (remainingPayments || []).slice().sort((a, b) => String(b.payment_date || '').localeCompare(String(a.payment_date || '')))[0];
                    const { error: payrollUpdateError } = await supabase.from('payroll').update({
                        net_payable: netPayable,
                        paid_amount: paidAmount,
                        due_salary: dueSalary,
                        payment_date: latestPayment?.payment_date || null,
                        payment_method: latestPayment?.payment_method || null,
                        status,
                        updated_at: new Date().toISOString()
                    }).eq('id', payroll.id);
                    if (payrollUpdateError) throw payrollUpdateError;
                }
            }
        }

        const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expense.id);
        if (deleteError) throw deleteError;

        // Remove the expense's audit entries too, per the permanent-delete request.
        const { error: auditError } = await supabase.from('audit_logs').delete().eq('record_id', expense.id);
        if (auditError) throw auditError;

        res.json({ success: true, message: 'Expense and its linked records deleted successfully.' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ success: false, message: 'Error deleting expense', error: error.message });
    }
});

module.exports = router;
