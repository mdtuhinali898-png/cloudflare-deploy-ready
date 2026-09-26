const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabase');

// Helper to get recurring expenses store from app_settings
async function getRecurringStore() {
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'recurring_expenses')
        .maybeSingle();
    if (error) {
        console.error('Error reading recurring_expenses store:', error);
        return [];
    }
    return (data && Array.isArray(data.value)) ? data.value : [];
}

// Helper to save recurring expenses store to app_settings
async function saveRecurringStore(list) {
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'recurring_expenses', value: list, updated_at: new Date() }, { onConflict: 'key' });
    if (error) throw error;
}

// Helper to format recurring expense item with both _id and id
function formatRecurring(item) {
    const id = item.id || item._id || crypto.randomUUID();
    return {
        ...item,
        _id: id,
        id: id,
        amount: Number(item.amount || 0),
        status: item.status || 'Active'
    };
}

// @route   GET /api/recurring-expenses
// @desc    Get all recurring expenses
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const all = await getRecurringStore();
        let list = all.map(formatRecurring);

        if (status) {
            list = list.filter(e => e.status === status);
        }

        list.sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0));
        res.json({ success: true, expenses: list });
    } catch (error) {
        console.error('Error fetching recurring expenses:', error);
        res.status(500).json({ success: false, message: 'Error fetching recurring expenses', error: error.message });
    }
});

// @route   GET /api/recurring-expenses/due
// @desc    Get recurring expenses due for generation
// @access  Public
router.get('/due', async (req, res) => {
    try {
        const now = new Date();
        const all = await getRecurringStore();
        const list = all
            .map(formatRecurring)
            .filter(e => e.status === 'Active' && e.nextDueDate && new Date(e.nextDueDate) <= now)
            .sort((a, b) => new Date(a.nextDueDate || 0) - new Date(b.nextDueDate || 0));

        res.json({ success: true, expenses: list, count: list.length });
    } catch (error) {
        console.error('Error fetching due recurring expenses:', error);
        res.status(500).json({ success: false, message: 'Error fetching due recurring expenses', error: error.message });
    }
});

// @route   POST /api/recurring-expenses
// @desc    Create recurring expense
// @access  Public
router.post('/', async (req, res) => {
    try {
        const list = await getRecurringStore();
        const id = crypto.randomUUID();
        const newItem = formatRecurring({
            ...req.body,
            id,
            _id: id,
            status: req.body.status || 'Active',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        list.push(newItem);
        await saveRecurringStore(list);
        res.status(201).json({ success: true, message: 'Recurring expense created successfully', expense: newItem });
    } catch (error) {
        console.error('Error creating recurring expense:', error);
        res.status(500).json({ success: false, message: 'Error creating recurring expense', error: error.message });
    }
});

// @route   POST /api/recurring-expenses/:id/generate
// @desc    Generate an expense from a recurring template
// @access  Public
router.post('/:id/generate', async (req, res) => {
    try {
        const { id } = req.params;
        const list = await getRecurringStore();
        const idx = list.findIndex(e => e.id === id || e._id === id);

        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'Recurring expense not found' });
        }

        const template = list[idx];
        if (template.status !== 'Active') {
            return res.status(400).json({ success: false, message: 'Recurring expense is not active' });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const monthName = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();

        // Count expenses in Supabase
        const { count, error: countErr } = await supabase
            .from('expenses')
            .select('*', { count: 'exact', head: true });

        const expenseCount = (count || 0) + 1;
        const expenseId = `REC-${Date.now()}-${expenseCount}`;

        // Insert into Supabase expenses
        const expenseRow = {
            expense_id: expenseId,
            date: dateStr,
            time: now.toTimeString().substring(0, 5),
            month: monthName,
            year: year,
            category: template.category,
            sub_category: template.subCategory || '',
            payment_method: template.paymentMethod || 'Cash',
            vendor: template.vendor || '',
            amount: Number(template.amount || 0),
            description: template.description || `Recurring: ${template.title}`,
            status: 'Pending Approval',
            created_by: 'System'
        };

        const { data: insertedExpense, error: insertErr } = await supabase
            .from('expenses')
            .insert(expenseRow)
            .select()
            .single();

        if (insertErr) throw insertErr;

        // Update next due date
        const nextDueDate = new Date(template.nextDueDate || now);
        switch (template.frequency) {
            case 'Weekly':
                nextDueDate.setDate(nextDueDate.getDate() + 7);
                break;
            case 'Monthly':
                nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                break;
            case 'Yearly':
                nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
                break;
            default:
                nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        }

        list[idx] = {
            ...template,
            lastGeneratedDate: now,
            nextDueDate: nextDueDate,
            updatedAt: now
        };

        await saveRecurringStore(list);

        const formattedExpense = {
            ...insertedExpense,
            _id: insertedExpense.id,
            expenseId: insertedExpense.expense_id,
            subCategory: insertedExpense.sub_category,
            paymentMethod: insertedExpense.payment_method,
            createdBy: insertedExpense.created_by
        };

        res.json({ success: true, message: 'Expense generated from recurring template', expense: formattedExpense });
    } catch (error) {
        console.error('Error generating recurring expense:', error);
        res.status(500).json({ success: false, message: 'Error generating recurring expense', error: error.message });
    }
});

// @route   PUT /api/recurring-expenses/:id
// @desc    Update recurring expense
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const list = await getRecurringStore();
        const idx = list.findIndex(e => e.id === id || e._id === id);

        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'Recurring expense not found' });
        }

        list[idx] = {
            ...list[idx],
            ...req.body,
            id: list[idx].id || id,
            _id: list[idx]._id || id,
            updatedAt: new Date()
        };

        await saveRecurringStore(list);
        res.json({ success: true, message: 'Recurring expense updated successfully', expense: formatRecurring(list[idx]) });
    } catch (error) {
        console.error('Error updating recurring expense:', error);
        res.status(500).json({ success: false, message: 'Error updating recurring expense', error: error.message });
    }
});

// @route   DELETE /api/recurring-expenses/:id
// @desc    Delete recurring expense
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let list = await getRecurringStore();
        const initialLen = list.length;
        list = list.filter(e => e.id !== id && e._id !== id);

        if (list.length === initialLen) {
            return res.status(404).json({ success: false, message: 'Recurring expense not found' });
        }

        await saveRecurringStore(list);
        res.json({ success: true, message: 'Recurring expense deleted successfully' });
    } catch (error) {
        console.error('Error deleting recurring expense:', error);
        res.status(500).json({ success: false, message: 'Error deleting recurring expense', error: error.message });
    }
});

module.exports = router;