const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

// @route   GET /api/expenses
// @desc    Get all expenses with advanced filtering
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { 
            date, category, method, startDate, endDate, search, 
            sortBy = 'createdAt', sortOrder = 'desc', 
            page = 1, limit = 50,
            status, vendor, amountMin, amountMax,
            fromDate, toDate
        } = req.query;
        
        let query = {};

        if (date) query.date = date;
        if (category && category !== 'all') query.category = category;
        if (method && method !== 'all') query.paymentMethod = method;
        if (status && status !== 'all') query.status = status;
        if (vendor && vendor !== 'all') query.vendor = vendor;
        
        // Date range filtering
        if (fromDate && toDate) {
            query.date = { $gte: fromDate, $lte: toDate };
        } else if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        }
        
        // Amount range
        if (amountMin || amountMax) {
            query.amount = {};
            if (amountMin) query.amount.$gte = parseFloat(amountMin);
            if (amountMax) query.amount.$lte = parseFloat(amountMax);
        }
        
        // Search
        if (search) {
            query.$or = [
                { expenseId: { $regex: search, $options: 'i' } },
                { vendor: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }
        
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [expenses, total, filteredTotals, vendors] = await Promise.all([
            Expense.find(query)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit)),
            Expense.countDocuments(query),
            Expense.aggregate([
                { $match: query },
                { $group: { _id: null, totalFilteredAmount: { $sum: { $ifNull: ['$amount', 0] } } } }
            ]),
            Expense.distinct('vendor', { vendor: { $ne: '' } })
        ]);

        // Calculate the filtered total in MongoDB without loading every matching document.
        const totalFilteredAmount = filteredTotals[0]?.totalFilteredAmount || 0;
        
        res.json({
            success: true,
            expenses,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalFilteredAmount,
            vendors: vendors.filter(v => v)
        });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ success: false, message: 'Error fetching expenses', error: error.message });
    }
});

// @route   GET /api/expenses/summary
// @desc    Get expense KPI totals in one database request
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

        const [summary] = await Expense.aggregate([{
            $group: {
                _id: null,
                allTimeAmount: { $sum: { $ifNull: ['$amount', 0] } },
                allTimeCount: { $sum: 1 },
                thisMonthAmount: { $sum: { $cond: [
                    { $and: [
                        { $gte: ['$date', monthStart] },
                        { $lte: ['$date', monthEnd] },
                        { $eq: ['$status', 'Approved'] }
                    ] },
                    { $ifNull: ['$amount', 0] },
                    0
                ] } },
                pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'Pending Approval'] }, 1, 0] } },
                todayAmount: { $sum: { $cond: [
                    { $and: [{ $eq: ['$date', today] }, { $eq: ['$status', 'Approved'] }] },
                    { $ifNull: ['$amount', 0] },
                    0
                ] } },
                todayCount: { $sum: { $cond: [
                    { $and: [{ $eq: ['$date', today] }, { $eq: ['$status', 'Approved'] }] },
                    1,
                    0
                ] } }
            }
        }]);

        res.json({
            success: true,
            allTimeAmount: summary?.allTimeAmount || 0,
            allTimeCount: summary?.allTimeCount || 0,
            thisMonthAmount: summary?.thisMonthAmount || 0,
            thisMonthLabel: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
            pendingCount: summary?.pendingCount || 0,
            todayAmount: summary?.todayAmount || 0,
            todayCount: summary?.todayCount || 0
        });
    } catch (error) {
        console.error('Error fetching expense summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching expense summary', error: error.message });
    }
});

// ==========================================================================
// Category routes — MUST be declared BEFORE /:id and POST / wildcards
// ==========================================================================

router.get('/categories/all', async (req, res) => {
    try {
        const categories = await ExpenseCategory.find({ isActive: true }).sort({ name: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const category = new ExpenseCategory(req.body);
        await category.save();
        res.status(201).json({ success: true, message: 'Category added successfully', category });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ success: false, message: 'Error creating category', error: error.message });
    }
});

router.put('/categories/:id', async (req, res) => {
    try {
        const category = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category updated successfully', category });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ success: false, message: 'Error updating category', error: error.message });
    }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        const category = await ExpenseCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ success: false, message: 'Error deleting category', error: error.message });
    }
});

// @route   POST /api/expenses/bulk-export
// @desc    Get multiple expenses by IDs for bulk operations
// @access  Public
router.post('/bulk-export', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Expense IDs required' });
        }
        
        const expenses = await Expense.find({ _id: { $in: ids } }).sort({ date: -1 });
        const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
        
        res.json({ success: true, expenses, totalAmount, count: expenses.length });
    } catch (error) {
        console.error('Error in bulk export:', error);
        res.status(500).json({ success: false, message: 'Error in bulk export', error: error.message });
    }
});

// ==========================================================================
// Wildcard routes — AFTER specific named routes
// ==========================================================================

// @route   GET /api/expenses/:id
// @desc    Get single expense by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, expense });
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.status(500).json({ success: false, message: 'Error fetching expense', error: error.message });
    }
});

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Public
router.post('/', async (req, res) => {
    try {
        const expenseData = req.body;
        
        // Generate Expense ID
        const expenseCount = await Expense.countDocuments();
        const expenseId = 'EXP-' + Date.now() + '-' + (expenseCount + 1);
        
        // Auto-calculate month and year from date if not provided
        if (!expenseData.month || !expenseData.year) {
            if (expenseData.date) {
                const dateObj = new Date(expenseData.date);
                if (!expenseData.month) expenseData.month = dateObj.toLocaleString('default', { month: 'long' });
                if (!expenseData.year) expenseData.year = dateObj.getFullYear();
            }
        }
        
        const expense = new Expense({
            ...expenseData,
            expenseId
        });
        
        await expense.save();
        
        // Create audit log
        const auditLog = new AuditLog({
            user: expenseData.createdBy || 'Admin',
            action: 'Expense Created',
            module: 'Expense',
            recordId: expense._id.toString(),
            newValue: { amount: expense.amount, category: expense.category, status: expense.status },
            description: `Expense ${expenseId} created for ${expense.category} - ৳${expense.amount}`
        });
        await auditLog.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'Expense added successfully',
            expense 
        });
    } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ success: false, message: 'Error creating expense', error: error.message });
    }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const oldExpense = await Expense.findById(req.params.id);
        if (!oldExpense) return res.status(404).json({ success: false, message: 'Expense not found' });
        
        const updateData = { ...req.body };
        
        // Auto-calculate month and year from date if date is updated
        if (updateData.date) {
            const dateObj = new Date(updateData.date);
            if (!updateData.month) updateData.month = dateObj.toLocaleString('default', { month: 'long' });
            if (!updateData.year) updateData.year = dateObj.getFullYear();
        }
        
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        
        // Create audit log
        const auditLog = new AuditLog({
            user: updateData.createdBy || 'Admin',
            action: 'Expense Edited',
            module: 'Expense',
            recordId: expense._id.toString(),
            oldValue: { amount: oldExpense.amount, category: oldExpense.category, status: oldExpense.status },
            newValue: { amount: expense.amount, category: expense.category, status: expense.status },
            description: `Expense ${expense.expenseId} edited`
        });
        await auditLog.save();
        
        res.json({ 
            success: true, 
            message: 'Expense updated successfully',
            expense 
        });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ success: false, message: 'Error updating expense', error: error.message });
    }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete expense (use void instead)
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const expense = await Expense.findByIdAndDelete(req.params.id);
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ success: false, message: 'Error deleting expense', error: error.message });
    }
});

// @route   PATCH /api/expenses/:id/approve
// @desc    Approve expense
// @access  Public
router.patch('/:id/approve', async (req, res) => {
    try {
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'Approved',
                approvedBy: req.body.approvedBy || 'Admin',
                approvedAt: new Date()
            },
            { new: true }
        );
        
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        
        // Audit log
        const auditLog = new AuditLog({
            user: req.body.approvedBy || 'Admin',
            action: 'Expense Approved',
            module: 'Expense',
            recordId: expense._id.toString(),
            newValue: { status: 'Approved' },
            description: `Expense ${expense.expenseId} approved`
        });
        await auditLog.save();
        
        res.json({ success: true, message: 'Expense approved successfully', expense });
    } catch (error) {
        console.error('Error approving expense:', error);
        res.status(500).json({ success: false, message: 'Error approving expense', error: error.message });
    }
});

// @route   PATCH /api/expenses/:id/reject
// @desc    Reject expense
// @access  Public
router.patch('/:id/reject', async (req, res) => {
    try {
        const { rejectedBy, rejectionReason } = req.body;
        
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'Rejected',
                rejectedBy: rejectedBy || 'Admin',
                rejectedAt: new Date(),
                rejectionReason: rejectionReason || ''
            },
            { new: true }
        );
        
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        
        const auditLog = new AuditLog({
            user: rejectedBy || 'Admin',
            action: 'Expense Rejected',
            module: 'Expense',
            recordId: expense._id.toString(),
            newValue: { status: 'Rejected', reason: rejectionReason },
            description: `Expense ${expense.expenseId} rejected: ${rejectionReason || 'No reason given'}`
        });
        await auditLog.save();
        
        res.json({ success: true, message: 'Expense rejected', expense });
    } catch (error) {
        console.error('Error rejecting expense:', error);
        res.status(500).json({ success: false, message: 'Error rejecting expense', error: error.message });
    }
});

// @route   PATCH /api/expenses/:id/void
// @desc    Void expense
// @access  Public
router.patch('/:id/void', async (req, res) => {
    try {
        const { voidReason, voidedBy } = req.body;
        
        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'Voided',
                voidReason: voidReason || '',
                auditLog: [{
                    action: 'Expense Voided',
                    by: voidedBy || 'Admin',
                    at: new Date(),
                    note: voidReason || 'No reason specified'
                }]
            },
            { new: true }
        );
        
        if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        
        const auditLog = new AuditLog({
            user: voidedBy || 'Admin',
            action: 'Expense Voided',
            module: 'Expense',
            recordId: expense._id.toString(),
            oldValue: { status: expense.status },
            newValue: { status: 'Voided', reason: voidReason },
            description: `Expense ${expense.expenseId} voided: ${voidReason || 'No reason'}`
        });
        await auditLog.save();
        
        res.json({ success: true, message: 'Expense voided', expense });
    } catch (error) {
        console.error('Error voiding expense:', error);
        res.status(500).json({ success: false, message: 'Error voiding expense', error: error.message });
    }
});


module.exports = router;