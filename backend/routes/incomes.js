const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatIncome(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        incomeId: row.income_id,
        date: row.date,
        month: row.month,
        year: row.year,
        source: row.source,
        amount: Number(row.amount || 0),
        paymentMethod: row.payment_method,
        description: row.description,
        receivedFrom: row.received_from,
        status: row.status,
        voidReason: row.void_reason,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toIncomeRow(data) {
    const row = {};
    if (data.incomeId !== undefined) row.income_id = data.incomeId;
    if (data.date !== undefined) row.date = String(data.date);
    if (data.month !== undefined) row.month = data.month;
    if (data.year !== undefined) row.year = Number(data.year);
    if (data.source !== undefined) row.source = data.source;
    if (data.amount !== undefined) row.amount = Number(data.amount || 0);
    if (data.paymentMethod !== undefined) row.payment_method = data.paymentMethod;
    if (data.description !== undefined) row.description = data.description;
    if (data.receivedFrom !== undefined) row.received_from = data.receivedFrom;
    if (data.status !== undefined) row.status = data.status;
    if (data.voidReason !== undefined) row.void_reason = data.voidReason;
    if (data.createdBy !== undefined) row.created_by = data.createdBy;
    return row;
}

// @route   GET /api/incomes
// @desc    Get all incomes with filtering
// @access  Public
router.get('/', async (req, res) => {
    try {
        const {
            source, method, status,
            fromDate, toDate, startDate, endDate,
            search, page = 1, limit = 50
        } = req.query;

        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('incomes').select('*', { count: 'exact' });

        if (source && source !== 'all') query = query.eq('source', source);
        if (method && method !== 'all') query = query.eq('payment_method', method);
        if (status && status !== 'all') query = query.eq('status', status);

        const df = fromDate || startDate;
        const dt = toDate || endDate;
        if (df && dt) query = query.gte('date', df).lte('date', dt);
        else if (df) query = query.gte('date', df);
        else if (dt) query = query.lte('date', dt);

        if (search) {
            const s = search.trim();
            query = query.or(`income_id.ilike.%${s}%,received_from.ilike.%${s}%,description.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const incomes = (data || []).map(formatIncome);
        const total = count || 0;
        const totalFilteredAmount = incomes.reduce((sum, i) => sum + Number(i.amount || 0), 0);

        res.json({
            success: true,
            incomes,
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal),
            totalFilteredAmount
        });
    } catch (error) {
        console.error('Error fetching incomes:', error);
        res.status(500).json({ success: false, message: 'Error fetching incomes', error: error.message });
    }
});

// @route   GET /api/incomes/summary
// @desc    Get income summary by source
// @access  Public
router.get('/summary', async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        let query = supabase.from('incomes').select('source, payment_method, amount, date').eq('status', 'Active');
        if (fromDate && toDate) query = query.gte('date', fromDate).lte('date', toDate);

        const { data, error } = await query;
        if (error) throw error;

        const sourceMap = new Map();
        const methodMap = new Map();
        let totalIncome = 0;

        (data || []).forEach(row => {
            const amt = Number(row.amount || 0);
            totalIncome += amt;

            // Source
            const s = row.source || 'Other';
            const curS = sourceMap.get(s) || { source: s, total: 0, count: 0 };
            curS.total += amt;
            curS.count += 1;
            sourceMap.set(s, curS);

            // Method
            const m = row.payment_method || 'Cash';
            const curM = methodMap.get(m) || { method: m, total: 0, count: 0 };
            curM.total += amt;
            curM.count += 1;
            methodMap.set(m, curM);
        });

        res.json({
            success: true,
            bySource: Array.from(sourceMap.values()).sort((a, b) => b.total - a.total),
            byMethod: Array.from(methodMap.values()).sort((a, b) => b.total - a.total),
            totalIncome
        });
    } catch (error) {
        console.error('Error fetching income summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching income summary', error: error.message });
    }
});

// @route   GET /api/incomes/:id
// @desc    Get single income
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('incomes').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('income_id', idParam);

        const { data, error } = await query.maybeSingle();
        if (error || !data) return res.status(404).json({ success: false, message: 'Income record not found' });
        res.json({ success: true, income: formatIncome(data) });
    } catch (error) {
        console.error('Error fetching income:', error);
        res.status(500).json({ success: false, message: 'Error fetching income', error: error.message });
    }
});

// @route   POST /api/incomes
// @desc    Create income record
// @access  Public
router.post('/', async (req, res) => {
    try {
        const incomeData = req.body;

        const { count: incomeCount } = await supabase
            .from('incomes')
            .select('*', { count: 'exact', head: true });

        const incomeId = 'INC-' + Date.now() + '-' + ((incomeCount || 0) + 1);

        if (incomeData.date && (!incomeData.month || !incomeData.year)) {
            const d = new Date(incomeData.date + 'T00:00:00');
            if (!incomeData.month) incomeData.month = d.toLocaleString('default', { month: 'long' });
            if (!incomeData.year) incomeData.year = d.getFullYear();
        }

        const newRow = toIncomeRow(incomeData);
        newRow.income_id = incomeId;
        newRow.created_at = new Date();
        newRow.updated_at = new Date();

        const { data: savedIncome, error } = await supabase
            .from('incomes')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;

        // Audit log
        await supabase.from('audit_logs').insert({
            user: incomeData.createdBy || 'Admin',
            action: 'Income Created',
            module: 'Income',
            record_id: savedIncome.id,
            new_value: { amount: savedIncome.amount, source: savedIncome.source },
            description: `Income record ${incomeId} created for ${savedIncome.source} - ৳${savedIncome.amount}`
        });

        res.status(201).json({ 
            success: true, 
            message: 'Income record created successfully',
            income: formatIncome(savedIncome)
        });
    } catch (error) {
        console.error('Error creating income:', error);
        res.status(500).json({ success: false, message: 'Error creating income', error: error.message });
    }
});

// @route   PUT /api/incomes/:id
// @desc    Update income record
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const updateData = toIncomeRow(req.body);

        if (updateData.date) {
            const d = new Date(updateData.date + 'T00:00:00');
            if (!updateData.month) updateData.month = d.toLocaleString('default', { month: 'long' });
            if (!updateData.year) updateData.year = d.getFullYear();
        }
        updateData.updated_at = new Date();

        let query = supabase.from('incomes').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('income_id', idParam);

        const { data: updatedIncome, error } = await query.select().single();
        if (error) throw error;
        if (!updatedIncome) return res.status(404).json({ success: false, message: 'Income record not found' });

        res.json({ 
            success: true, 
            message: 'Income record updated successfully',
            income: formatIncome(updatedIncome)
        });
    } catch (error) {
        console.error('Error updating income:', error);
        res.status(500).json({ success: false, message: 'Error updating income', error: error.message });
    }
});

// @route   PATCH /api/incomes/:id/void
// @desc    Void an income record
// @access  Public
router.patch('/:id/void', async (req, res) => {
    try {
        const idParam = req.params.id;
        const { voidReason } = req.body;
        const updateData = {
            status: 'Voided',
            void_reason: voidReason || '',
            updated_at: new Date()
        };

        let query = supabase.from('incomes').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('income_id', idParam);

        const { data: income, error } = await query.select().single();
        if (error) throw error;
        if (!income) return res.status(404).json({ success: false, message: 'Income record not found' });

        res.json({ success: true, message: 'Income record voided', income: formatIncome(income) });
    } catch (error) {
        console.error('Error voiding income:', error);
        res.status(500).json({ success: false, message: 'Error voiding income', error: error.message });
    }
});

// @route   DELETE /api/incomes/:id
// @desc    Hard delete income record
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('incomes').delete();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('income_id', idParam);

        const { error } = await query;
        if (error) throw error;

        res.json({ success: true, message: 'Income record deleted successfully' });
    } catch (error) {
        console.error('Error deleting income:', error);
        res.status(500).json({ success: false, message: 'Error deleting income', error: error.message });
    }
});

module.exports = router;
