const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatPayroll(row) {
    if (!row) return null;
    const salary = Number(row.salary || 0);
    const paidAmount = Number(row.paid_amount || 0);
    const advance = Number(row.advance || 0);
    const bonus = Number(row.bonus || 0);
    const deduction = Number(row.deduction || 0);
    const calculatedNet = Math.max(0, salary + bonus - deduction);
    const netPayable = Number(row.net_payable || calculatedNet);
    const dueSalary = Number(row.due_salary || Math.max(0, netPayable - paidAmount - advance));
    const status = dueSalary <= 0 ? 'Paid' : (paidAmount + advance > 0 ? 'Partial' : (row.status || 'Pending'));
    return {
        _id: row.id,
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        designation: row.designation,
        salary,
        paidAmount,
        dueSalary,
        advance,
        bonus,
        deduction,
        netPayable,
        month: row.month,
        year: row.year,
        paymentDate: row.payment_date,
        paymentMethod: row.payment_method,
        status,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toPayrollRow(data) {
    const row = {};
    if (data.employeeId !== undefined) row.employee_id = data.employeeId;
    if (data.employeeName !== undefined) row.employee_name = data.employeeName;
    if (data.designation !== undefined) row.designation = data.designation;
    if (data.salary !== undefined) row.salary = Number(data.salary || 0);
    if (data.paidAmount !== undefined) row.paid_amount = Number(data.paidAmount || 0);
    if (data.dueSalary !== undefined) row.due_salary = Number(data.dueSalary || 0);
    if (data.advance !== undefined) row.advance = Number(data.advance || 0);
    if (data.bonus !== undefined) row.bonus = Number(data.bonus || 0);
    if (data.deduction !== undefined) row.deduction = Number(data.deduction || 0);
    if (data.netPayable !== undefined) row.net_payable = Number(data.netPayable || 0);
    if (data.month !== undefined) row.month = data.month;
    if (data.year !== undefined) row.year = Number(data.year);
    if (data.paymentDate !== undefined) row.payment_date = data.paymentDate;
    if (data.paymentMethod !== undefined) row.payment_method = data.paymentMethod;
    if (data.status !== undefined) row.status = data.status;
    if (data.notes !== undefined) row.notes = data.notes;
    if (data.createdBy !== undefined) row.created_by = data.createdBy;
    return row;
}

function payrollExpenseId(payment) {
    return `PAYROLL-${payment.id}`;
}

function toPayrollExpenseRow(payment, payroll) {
    const paymentDate = String(payment.payment_date || new Date().toISOString().slice(0, 10));
    const paymentDay = new Date(`${paymentDate}T00:00:00Z`);
    const employeeName = payroll?.employee_name || payment.employee_id || 'Employee';
    const monthYear = payroll?.month && payroll?.year ? `${payroll.month} ${payroll.year}` : `${paymentDay.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${paymentDay.getUTCFullYear()}`;
    const description = `Salary payment to ${employeeName} for ${monthYear}${payment.reference ? ` · Ref: ${payment.reference}` : ''}`;
    return {
        expense_id: payrollExpenseId(payment),
        date: paymentDate,
        time: payment.created_at ? new Date(payment.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '12:00',
        month: paymentDay.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
        year: paymentDay.getUTCFullYear(),
        category: 'Payroll',
        sub_category: 'Salary',
        payment_method: payment.payment_method || null,
        vendor: employeeName,
        branch: payroll?.branch || null,
        amount: Number(payment.amount || 0),
        description,
        status: 'Approved',
        approved_by: 'Payroll System',
        approved_at: payment.created_at || new Date().toISOString(),
        created_by: 'Payroll System',
        created_at: payment.created_at || new Date().toISOString(),
        updated_at: payment.created_at || new Date().toISOString()
    };
}

async function ensurePayrollExpenseCategory() {
    try {
        const { data, error } = await supabase.from('expense_categories').select('id').ilike('name', 'Payroll').limit(1);
        if (error) throw error;
        if (!data?.length) {
            const { error: insertError } = await supabase.from('expense_categories').insert({
                name: 'Payroll',
                sub_categories: ['Salary'],
                status: 'Active',
                created_at: new Date().toISOString()
            });
            if (insertError) throw insertError;
        }
    } catch (error) {
        // The expense itself remains useful even if optional category setup fails.
        console.warn('Could not ensure the Payroll expense category:', error.message);
    }
}

async function ensurePayrollPaymentExpense(payment, payroll) {
    const expenseId = payrollExpenseId(payment);
    const { data: existing, error: lookupError } = await supabase.from('expenses').select('id, expense_id')
        .eq('expense_id', expenseId).limit(1).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return { expense: existing, created: false };

    const row = toPayrollExpenseRow(payment, payroll);
    const { data: expense, error } = await supabase.from('expenses').insert(row).select().single();
    if (error) throw error;

    // Match the audit trail created by manual expense entry; audit failure should not
    // undo a successfully recorded salary payment and its expense.
    await supabase.from('audit_logs').insert({
        user: 'Payroll System',
        action: 'Expense Created',
        module: 'Expense',
        record_id: expense.id,
        new_value: { amount: expense.amount, category: expense.category, status: expense.status },
        description: `Payroll expense ${expenseId} created for ${expense.vendor} - ৳${expense.amount}`
    });
    return { expense, created: true };
}

async function deletePayrollPaymentExpense(payment) {
    const { error } = await supabase.from('expenses').delete().eq('expense_id', payrollExpenseId(payment));
    if (error) console.error('Could not roll back payroll expense:', error);
}

// @route   GET /api/payroll
// @desc    Get all payroll records with filtering
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { month, year, status, employeeId, page = 1, limit = 50 } = req.query;
        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('payroll').select('*', { count: 'exact' });

        if (month) query = query.eq('month', month);
        if (year) query = query.eq('year', parseInt(year));
        if (status) query = query.eq('status', status);
        if (employeeId) query = query.eq('employee_id', employeeId);

        query = query.order('created_at', { ascending: false }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count || 0;
        res.json({
            success: true,
            records: (data || []).map(formatPayroll),
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal)
        });
    } catch (error) {
        console.error('Error fetching payroll records:', error);
        res.status(500).json({ success: false, message: 'Error fetching payroll records', error: error.message });
    }
});

// @route   GET /api/payroll/summary
// @desc    Get payroll summary
// @access  Public
router.get('/summary', async (req, res) => {
    try {
        const { month, year } = req.query;
        const targetMonth = month || new Date().toLocaleString('default', { month: 'long' });
        const targetYear = parseInt(year) || new Date().getFullYear();

        const { data: records, error } = await supabase
            .from('payroll')
            .select('*')
            .eq('month', targetMonth)
            .eq('year', targetYear);

        if (error) throw error;

        const recs = (records || []).map(formatPayroll);

        const totalSalary = recs.reduce((sum, r) => sum + r.salary, 0);
        const totalPaid = recs.reduce((sum, r) => sum + r.paidAmount + r.advance, 0);
        const totalDue = recs.reduce((sum, r) => sum + r.dueSalary, 0);
        const totalAdvance = recs.reduce((sum, r) => sum + r.advance, 0);
        const totalBonus = recs.reduce((sum, r) => sum + r.bonus, 0);
        const totalDeduction = recs.reduce((sum, r) => sum + r.deduction, 0);
        const totalNetPayable = recs.reduce((sum, r) => sum + r.netPayable, 0);
        const paidCount = recs.filter(r => r.status === 'Paid').length;
        const pendingCount = recs.filter(r => r.status === 'Pending' || r.status === 'Partial').length;

        res.json({
            success: true,
            month: targetMonth,
            year: targetYear,
            totalEmployees: recs.length,
            totalSalary,
            totalPaid,
            totalDue,
            totalAdvance,
            totalBonus,
            totalDeduction,
            totalNetPayable,
            paidCount,
            pendingCount
        });
    } catch (error) {
        console.error('Error fetching payroll summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching payroll summary', error: error.message });
    }
});

// @route   GET /api/payroll/employees
// @desc    Get the reusable payroll employee roster
// @access  Public
router.get('/employees', async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        let query = supabase.from('payroll_employees').select('*');
        if (!includeInactive) query = query.eq('is_active', true);
        const { data, error } = await query.order('employee_name', { ascending: true });

        if (error) throw error;
        res.json({ success: true, employees: (data || []).map(row => ({
            employeeId: row.employee_id,
            name: row.employee_name,
            designation: row.designation,
            salary: Number(row.monthly_salary || 0),
            isActive: row.is_active
        })) });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ success: false, message: 'Error fetching employees', error: error.message });
    }
});

// @route   POST /api/payroll/employees
// @desc    Add an employee to the reusable payroll roster
router.post('/employees', async (req, res) => {
    try {
        const employeeId = String(req.body.employeeId || '').trim();
        const employeeName = String(req.body.employeeName || '').trim();
        const designation = String(req.body.designation || '').trim();
        const monthlySalary = Number(req.body.monthlySalary);
        if (!employeeId || !employeeName || !designation || !Number.isFinite(monthlySalary) || monthlySalary < 0) {
            return res.status(400).json({ success: false, message: 'Employee ID, name, designation and a valid monthly salary are required.' });
        }

        const { data, error } = await supabase.from('payroll_employees').insert({
            employee_id: employeeId,
            employee_name: employeeName,
            designation,
            monthly_salary: monthlySalary,
            is_active: true,
            updated_at: new Date().toISOString()
        }).select().single();
        if (error) throw error;
        res.status(201).json({ success: true, message: 'Employee added successfully.', employee: data });
    } catch (error) {
        console.error('Error adding payroll employee:', error);
        const duplicate = error.code === '23505';
        res.status(duplicate ? 409 : 500).json({
            success: false,
            message: duplicate ? 'This employee ID is already in the payroll roster.' : 'Error adding employee.',
            error: error.message
        });
    }
});

// @route   DELETE /api/payroll/employees/:employeeId/permanent
// @desc    Permanently delete a profile only when it has no payroll or payment history
router.delete('/employees/:employeeId/permanent', async (req, res) => {
    try {
        const employeeId = String(req.params.employeeId || '').trim();
        if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID is required.' });

        const { data: employee, error: employeeError } = await supabase.from('payroll_employees')
            .select('*').eq('employee_id', employeeId).maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

        const [{ data: payrollRows, error: payrollError }, { data: paymentRows, error: paymentsError }] = await Promise.all([
            supabase.from('payroll').select('id').eq('employee_id', employeeId).limit(1),
            supabase.from('payroll_payments').select('id').eq('employee_id', employeeId).limit(1)
        ]);
        if (payrollError) throw payrollError;
        if (paymentsError) throw paymentsError;

        const hasHistory = Boolean(payrollRows?.length || paymentRows?.length);
        if (hasHistory) {
            return res.status(409).json({ success: false, message: `${employee.employee_name} has payroll history. Use Remove to deactivate the profile and keep past records safe.` });
        }

        const { error } = await supabase.from('payroll_employees').delete().eq('employee_id', employeeId);
        if (error) throw error;
        res.json({ success: true, message: `${employee.employee_name} was permanently deleted.` });
    } catch (error) {
        console.error('Error permanently deleting payroll employee:', error);
        res.status(500).json({ success: false, message: 'Could not permanently delete employee.', error: error.message });
    }
});

// @route   DELETE /api/payroll/employees/:employeeId
// @desc    Remove an employee from the active roster without deleting profile/history
router.delete('/employees/:employeeId', async (req, res) => {
    try {
        const employeeId = String(req.params.employeeId || '').trim();
        if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        const { data: employee, error: employeeError } = await supabase.from('payroll_employees')
            .select('employee_name').eq('employee_id', employeeId).maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });
        const { error } = await supabase.from('payroll_employees')
            .update({ is_active: false, updated_at: new Date().toISOString() }).eq('employee_id', employeeId);
        if (error) throw error;
        res.json({ success: true, message: `${employee.employee_name} was removed from the active roster. Past payroll and payment records are preserved.` });
    } catch (error) {
        console.error('Error removing payroll employee:', error);
        res.status(500).json({ success: false, message: 'Could not remove employee.', error: error.message });
    }
});

// @route   PATCH /api/payroll/employees/:employeeId/status
// @desc    Restore a deactivated payroll employee
router.patch('/employees/:employeeId/status', async (req, res) => {
    try {
        const employeeId = String(req.params.employeeId || '').trim();
        if (!employeeId || req.body.isActive !== true) {
            return res.status(400).json({ success: false, message: 'A valid employee ID and active status are required.' });
        }
        const { data, error } = await supabase.from('payroll_employees')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('employee_id', employeeId).select('employee_id').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: 'Employee not found.' });
        res.json({ success: true, message: 'Employee restored to the active payroll roster.' });
    } catch (error) {
        console.error('Error restoring payroll employee:', error);
        res.status(500).json({ success: false, message: 'Could not restore employee.', error: error.message });
    }
});

// @route   POST /api/payroll/prepare
// @desc    Create monthly payroll entries for every active employee
router.post('/prepare', async (req, res) => {
    try {
        const month = String(req.body.month || '').trim();
        const year = Number(req.body.year);
        if (!month || !Number.isInteger(year)) {
            return res.status(400).json({ success: false, message: 'A valid payroll month and year are required.' });
        }

        const [{ data: employees, error: employeeError }, { data: existing, error: existingError }] = await Promise.all([
            supabase.from('payroll_employees').select('*').eq('is_active', true),
            supabase.from('payroll').select('employee_id').eq('month', month).eq('year', year)
        ]);
        if (employeeError) throw employeeError;
        if (existingError) throw existingError;
        const existingIds = new Set((existing || []).map(row => String(row.employee_id).toLowerCase()));
        const timestamp = new Date().toISOString();
        const rows = (employees || []).filter(employee => !existingIds.has(String(employee.employee_id).toLowerCase())).map(employee => {
            const salary = Number(employee.monthly_salary || 0);
            return {
                employee_id: employee.employee_id,
                employee_name: employee.employee_name,
                designation: employee.designation,
                salary,
                paid_amount: 0,
                due_salary: salary,
                advance: 0,
                bonus: 0,
                deduction: 0,
                net_payable: salary,
                month,
                year,
                payment_method: 'Cash',
                status: 'Pending',
                created_by: 'Admin',
                created_at: timestamp,
                updated_at: timestamp
            };
        });

        let created = [];
        if (rows.length) {
            const { data, error } = await supabase.from('payroll').insert(rows).select();
            if (error) throw error;
            created = (data || []).map(formatPayroll);
        }
        res.json({ success: true, createdCount: created.length, totalEmployees: (employees || []).length, records: created });
    } catch (error) {
        console.error('Error preparing monthly payroll:', error);
        res.status(500).json({ success: false, message: 'Could not prepare payroll for this month.', error: error.message });
    }
});

// @route   GET /api/payroll/:id/payments
// @desc    Get the payment history for one monthly payroll record
router.get('/:id/payments', async (req, res) => {
    try {
        const { data, error } = await supabase.from('payroll_payments').select('*')
            .eq('payroll_id', req.params.id).order('payment_date', { ascending: false });
        if (error) throw error;
        res.json({ success: true, payments: data || [] });
    } catch (error) {
        console.error('Error loading payroll payment history:', error);
        res.status(500).json({ success: false, message: 'Could not load payment history.', error: error.message });
    }
});

// @route   POST /api/payroll/sync-expenses
// @desc    Backfill payroll payment expenses without creating duplicates
router.post('/sync-expenses', async (req, res) => {
    try {
        const payments = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase.from('payroll_payments').select('*')
                .order('created_at', { ascending: true }).range(offset, offset + pageSize - 1);
            if (error) throw error;
            payments.push(...(data || []));
            if (!data || data.length < pageSize) break;
        }

        if (!payments.length) return res.json({ success: true, syncedCount: 0, totalPayments: 0 });
        await ensurePayrollExpenseCategory();

        const payrollById = new Map();
        const payrollIds = [...new Set(payments.map(payment => String(payment.payroll_id || '')).filter(Boolean))];
        for (let i = 0; i < payrollIds.length; i += 100) {
            const { data, error } = await supabase.from('payroll').select('id, employee_name, employee_id, month, year')
                .in('id', payrollIds.slice(i, i + 100));
            if (error) throw error;
            (data || []).forEach(row => payrollById.set(String(row.id), row));
        }

        const existingExpenseIds = new Set();
        const expenseIds = payments.map(payrollExpenseId);
        for (let i = 0; i < expenseIds.length; i += 100) {
            const { data, error } = await supabase.from('expenses').select('expense_id')
                .in('expense_id', expenseIds.slice(i, i + 100));
            if (error) throw error;
            (data || []).forEach(row => existingExpenseIds.add(row.expense_id));
        }

        const missing = payments.filter(payment => !existingExpenseIds.has(payrollExpenseId(payment)))
            .map(payment => toPayrollExpenseRow(payment, payrollById.get(String(payment.payroll_id))));
        for (let i = 0; i < missing.length; i += 100) {
            const { data, error } = await supabase.from('expenses').insert(missing.slice(i, i + 100))
                .select('id, expense_id, amount, category, status, vendor');
            if (error) throw error;
            const auditRows = (data || []).map(expense => ({
                user: 'Payroll System',
                action: 'Expense Created',
                module: 'Expense',
                record_id: expense.id,
                new_value: { amount: expense.amount, category: expense.category, status: expense.status },
                description: `Payroll expense ${expense.expense_id} created for ${expense.vendor} - ৳${expense.amount}`
            }));
            if (auditRows.length) await supabase.from('audit_logs').insert(auditRows);
        }

        res.json({ success: true, syncedCount: missing.length, totalPayments: payments.length });
    } catch (error) {
        console.error('Error syncing payroll expenses:', error);
        res.status(500).json({ success: false, message: 'Could not sync payroll payments to expenses.', error: error.message });
    }
});

// @route   POST /api/payroll/:id/payments
// @desc    Record a salary payment and update the monthly balance
router.post('/:id/payments', async (req, res) => {
    try {
        const amount = Number(req.body.amount);
        const paymentDate = String(req.body.paymentDate || '').trim();
        const paymentMethod = String(req.body.paymentMethod || '').trim();
        const parsedDate = new Date(`${paymentDate}T00:00:00Z`);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === paymentDate;
        const allowedMethods = ['Cash', 'Bank', 'bKash', 'Nagad', 'Rocket', 'Card', 'Cheque'];
        if (!Number.isFinite(amount) || amount <= 0 || !validDate || !allowedMethods.includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Enter a valid payment amount, date and method.' });
        }

        const { data: payroll, error: payrollError } = await supabase.from('payroll').select('*').eq('id', req.params.id).single();
        if (payrollError) throw payrollError;
        const netPayable = Math.max(0, Number(payroll.salary || 0) + Number(payroll.bonus || 0) - Number(payroll.deduction || 0));
        const paidBefore = Number(payroll.paid_amount || 0);
        const advance = Number(payroll.advance || 0);
        const dueBefore = Math.max(0, netPayable - paidBefore - advance);
        if (amount > dueBefore) {
            return res.status(400).json({ success: false, message: `Payment is more than the remaining due of ৳${dueBefore.toFixed(2)}.` });
        }

        const payment = {
            payroll_id: String(payroll.id),
            employee_id: payroll.employee_id,
            amount,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            reference: String(req.body.reference || '').trim() || null,
            notes: String(req.body.notes || '').trim() || null
        };
        const { data: savedPayment, error: paymentError } = await supabase.from('payroll_payments').insert(payment).select().single();
        if (paymentError) throw paymentError;

        await ensurePayrollExpenseCategory();
        let expenseResult;
        try {
            expenseResult = await ensurePayrollPaymentExpense(savedPayment, payroll);
        } catch (expenseError) {
            await supabase.from('payroll_payments').delete().eq('id', savedPayment.id);
            throw expenseError;
        }

        const paidAmount = paidBefore + amount;
        const dueSalary = Math.max(0, netPayable - paidAmount - advance);
        const status = dueSalary === 0 ? 'Paid' : (paidAmount + advance > 0 ? 'Partial' : 'Pending');
        const { data: updated, error: updateError } = await supabase.from('payroll').update({
            net_payable: netPayable,
            paid_amount: paidAmount,
            due_salary: dueSalary,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            status,
            updated_at: new Date().toISOString()
        }).eq('id', req.params.id).select().single();
        if (updateError) {
            if (expenseResult?.created) await deletePayrollPaymentExpense(savedPayment);
            await supabase.from('payroll_payments').delete().eq('id', savedPayment.id);
            throw updateError;
        }
        res.status(201).json({ success: true, payment: savedPayment, expenseId: expenseResult?.expense?.expense_id, record: formatPayroll(updated) });
    } catch (error) {
        console.error('Error recording payroll payment:', error);
        res.status(500).json({ success: false, message: 'Could not record the payment.', error: error.message });
    }
});

// @route   GET /api/payroll/:id
// @desc    Get single payroll record by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('payroll').select('*').eq('id', req.params.id).maybeSingle();
        if (error || !data) return res.status(404).json({ success: false, message: 'Record not found' });
        res.json({ success: true, record: formatPayroll(data) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching record', error: error.message });
    }
});

// @route   POST /api/payroll
// @desc    Create new payroll record
// @access  Public
router.post('/', async (req, res) => {
    try {
        const row = toPayrollRow(req.body);
        row.created_at = new Date();
        row.updated_at = new Date();

        const { data: saved, error } = await supabase.from('payroll').insert(row).select().single();
        if (error) throw error;

        res.status(201).json({ success: true, message: 'Payroll record created', record: formatPayroll(saved) });
    } catch (error) {
        console.error('Error creating payroll record:', error);
        res.status(500).json({ success: false, message: 'Error creating record', error: error.message });
    }
});

// @route   PUT /api/payroll/:id
// @desc    Update payroll record
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const row = toPayrollRow(req.body);
        row.updated_at = new Date();

        const { data: updated, error } = await supabase.from('payroll').update(row).eq('id', req.params.id).select().single();
        if (error) throw error;
        if (!updated) return res.status(404).json({ success: false, message: 'Record not found' });

        res.json({ success: true, message: 'Payroll record updated', record: formatPayroll(updated) });
    } catch (error) {
        console.error('Error updating payroll record:', error);
        res.status(500).json({ success: false, message: 'Error updating record', error: error.message });
    }
});

// @route   DELETE /api/payroll/:id
// @desc    Delete payroll record
// @access  Public
router.delete('/:id', async (req, res) => {
    let payrollRecord = null;
    let paymentRows = [];
    let linkedExpenses = [];
    let payrollDeleted = false;
    let paymentsDeleted = false;
    let expensesDeleted = false;
    try {
        const { data: existingRecord, error: payrollLookupError } = await supabase.from('payroll').select('*')
            .eq('id', req.params.id).maybeSingle();
        if (payrollLookupError) throw payrollLookupError;
        if (!existingRecord) return res.status(404).json({ success: false, message: 'Payroll record not found.' });
        payrollRecord = existingRecord;

        const { data: existingPayments, error: paymentsLookupError } = await supabase.from('payroll_payments').select('*')
            .eq('payroll_id', req.params.id);
        if (paymentsLookupError) throw paymentsLookupError;
        paymentRows = existingPayments || [];

        const linkedExpenseIds = paymentRows.map(payrollExpenseId);
        if (linkedExpenseIds.length) {
            const { data: existingExpenses, error: expensesLookupError } = await supabase.from('expenses').select('*')
                .in('expense_id', linkedExpenseIds);
            if (expensesLookupError) throw expensesLookupError;
            linkedExpenses = existingExpenses || [];
        }

        const { data: deletedRecord, error: payrollDeleteError } = await supabase.from('payroll').delete()
            .eq('id', req.params.id).select('id').maybeSingle();
        if (payrollDeleteError) throw payrollDeleteError;
        if (!deletedRecord) return res.status(404).json({ success: false, message: 'Payroll record not found.' });
        payrollDeleted = true;

        if (paymentRows.length) {
            const { error } = await supabase.from('payroll_payments').delete().eq('payroll_id', req.params.id);
            if (error) throw error;
            paymentsDeleted = true;
        }
        if (linkedExpenses.length) {
            const { error } = await supabase.from('expenses').delete().in('id', linkedExpenses.map(expense => expense.id));
            if (error) throw error;
            expensesDeleted = true;
        }

        res.json({
            success: true,
            deletedPayments: paymentRows.length,
            deletedExpenses: linkedExpenses.length,
            message: linkedExpenses.length
                ? `Payroll record and ${linkedExpenses.length} linked expense(s) deleted.`
                : 'Payroll record deleted.'
        });
    } catch (error) {
        const rollbackErrors = [];
        if (expensesDeleted && linkedExpenses.length) {
            const { error: rollbackError } = await supabase.from('expenses').insert(linkedExpenses);
            if (rollbackError) rollbackErrors.push(rollbackError.message);
        }
        if (paymentsDeleted && paymentRows.length) {
            const { error: rollbackError } = await supabase.from('payroll_payments').insert(paymentRows);
            if (rollbackError) rollbackErrors.push(rollbackError.message);
        }
        if (payrollDeleted && payrollRecord) {
            const { error: rollbackError } = await supabase.from('payroll').insert(payrollRecord);
            if (rollbackError) rollbackErrors.push(rollbackError.message);
        }
        if (rollbackErrors.length) console.error('Payroll delete rollback was incomplete:', rollbackErrors);
        console.error('Error deleting payroll record and linked expenses:', error);
        res.status(500).json({ success: false, message: 'Error deleting record', error: error.message });
    }
});

module.exports = router;
