const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabase');

// Helper to get all budgets from app_settings
async function getBudgetsStore() {
    const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'budgets')
        .maybeSingle();
    if (error) {
        console.error('Error reading budgets store:', error);
        return [];
    }
    return (data && Array.isArray(data.value)) ? data.value : [];
}

// Helper to save all budgets to app_settings
async function saveBudgetsStore(budgets) {
    const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'budgets', value: budgets, updated_at: new Date() }, { onConflict: 'key' });
    if (error) throw error;
}

// Helper to format budget item with both _id and id
function formatBudget(b) {
    const id = b.id || b._id || crypto.randomUUID();
    return {
        ...b,
        _id: id,
        id: id,
        amount: Number(b.amount || 0)
    };
}

// @route   GET /api/budgets
// @desc    Get all budgets with optional month/year filter
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { month, year } = req.query;
        let targetYear = parseInt(year) || new Date().getFullYear();
        let targetMonth = month || new Date().toLocaleString('default', { month: 'long' });

        const allBudgets = await getBudgetsStore();
        
        let filtered = allBudgets.map(formatBudget);
        if (month) filtered = filtered.filter(b => b.month === month);
        if (year) filtered = filtered.filter(b => Number(b.year) === targetYear);
        
        filtered.sort((a, b) => (a.category || '').localeCompare(b.category || ''));

        // Query approved expenses from Supabase
        const { data: expenses, error: expErr } = await supabase
            .from('expenses')
            .select('category, amount, month, year, status')
            .eq('month', targetMonth)
            .eq('year', targetYear)
            .eq('status', 'Approved');

        if (expErr) console.error('Error fetching expenses for budget:', expErr);

        const expenseByCategory = {};
        (expenses || []).forEach(e => {
            const cat = e.category || 'Other';
            if (!expenseByCategory[cat]) expenseByCategory[cat] = 0;
            expenseByCategory[cat] += Number(e.amount || 0);
        });

        const budgetWithUsage = filtered.map(b => {
            const currentExpense = expenseByCategory[b.category] || 0;
            const remaining = b.amount - currentExpense;
            const usedPercentage = b.amount > 0 ? (currentExpense / b.amount) * 100 : 0;

            let alert = 'normal';
            if (usedPercentage >= 100) alert = 'exceeded';
            else if (usedPercentage >= 90) alert = 'high';
            else if (usedPercentage >= 70) alert = 'warning';

            return {
                ...b,
                currentExpense,
                remaining: Math.max(0, remaining),
                usedPercentage: Math.round(usedPercentage * 100) / 100,
                alert
            };
        });

        res.json({ success: true, budgets: budgetWithUsage });
    } catch (error) {
        console.error('Error fetching budgets:', error);
        res.status(500).json({ success: false, message: 'Error fetching budgets', error: error.message });
    }
});

// @route   GET /api/budgets/summary
// @desc    Get budget summary with alerts
// @access  Public
router.get('/summary', async (req, res) => {
    try {
        const currentMonth = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();

        const allBudgets = await getBudgetsStore();
        const budgets = allBudgets
            .filter(b => b.month === currentMonth && Number(b.year) === currentYear)
            .map(formatBudget);

        const { data: expenses } = await supabase
            .from('expenses')
            .select('category, amount')
            .eq('month', currentMonth)
            .eq('year', currentYear)
            .eq('status', 'Approved');

        const expenseByCategory = {};
        (expenses || []).forEach(e => {
            const cat = e.category || 'Other';
            if (!expenseByCategory[cat]) expenseByCategory[cat] = 0;
            expenseByCategory[cat] += Number(e.amount || 0);
        });

        let totalBudget = 0;
        let totalExpense = 0;
        const alerts = [];

        budgets.forEach(b => {
            totalBudget += b.amount;
            const currentExpense = expenseByCategory[b.category] || 0;
            totalExpense += currentExpense;
            const pct = b.amount > 0 ? (currentExpense / b.amount) * 100 : 0;

            if (pct >= 100) {
                alerts.push({ category: b.category, level: 'danger', message: `${b.category} budget exceeded! (${Math.round(pct)}%)` });
            } else if (pct >= 90) {
                alerts.push({ category: b.category, level: 'warning', message: `${b.category} budget nearly full (${Math.round(pct)}%)` });
            } else if (pct >= 70) {
                alerts.push({ category: b.category, level: 'info', message: `${b.category} at ${Math.round(pct)}% usage` });
            }
        });

        res.json({
            success: true,
            totalBudget,
            totalExpense,
            remaining: Math.max(0, totalBudget - totalExpense),
            usagePercentage: totalBudget > 0 ? Math.round((totalExpense / totalBudget) * 100) : 0,
            budgetCount: budgets.length,
            alerts
        });
    } catch (error) {
        console.error('Error fetching budget summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching budget summary', error: error.message });
    }
});

// @route   POST /api/budgets
// @desc    Create or update budget
// @access  Public
router.post('/', async (req, res) => {
    try {
        const { category, amount, month, year, notes } = req.body;

        if (!category || amount === undefined || !month || !year) {
            return res.status(400).json({ success: false, message: 'Category, amount, month and year are required' });
        }

        const budgets = await getBudgetsStore();
        const existingIdx = budgets.findIndex(
            b => b.category === category && b.month === month && Number(b.year) === Number(year)
        );

        let savedBudget;
        if (existingIdx !== -1) {
            budgets[existingIdx] = {
                ...budgets[existingIdx],
                amount: Number(amount),
                notes: notes || '',
                isActive: true,
                updatedAt: new Date()
            };
            savedBudget = formatBudget(budgets[existingIdx]);
        } else {
            savedBudget = formatBudget({
                id: crypto.randomUUID(),
                category,
                amount: Number(amount),
                month,
                year: Number(year),
                notes: notes || '',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            budgets.push(savedBudget);
        }

        await saveBudgetsStore(budgets);
        res.json({ success: true, message: 'Budget saved successfully', budget: savedBudget });
    } catch (error) {
        console.error('Error saving budget:', error);
        res.status(500).json({ success: false, message: 'Error saving budget', error: error.message });
    }
});

// @route   PUT /api/budgets/:id
// @desc    Update budget
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const budgets = await getBudgetsStore();
        const idx = budgets.findIndex(b => (b.id === id || b._id === id));

        if (idx === -1) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }

        budgets[idx] = {
            ...budgets[idx],
            ...req.body,
            id: budgets[idx].id || id,
            _id: budgets[idx]._id || id,
            updatedAt: new Date()
        };

        await saveBudgetsStore(budgets);
        res.json({ success: true, message: 'Budget updated successfully', budget: formatBudget(budgets[idx]) });
    } catch (error) {
        console.error('Error updating budget:', error);
        res.status(500).json({ success: false, message: 'Error updating budget', error: error.message });
    }
});

// @route   DELETE /api/budgets/:id
// @desc    Delete budget
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let budgets = await getBudgetsStore();
        const initialLen = budgets.length;
        budgets = budgets.filter(b => b.id !== id && b._id !== id);

        if (budgets.length === initialLen) {
            return res.status(404).json({ success: false, message: 'Budget not found' });
        }

        await saveBudgetsStore(budgets);
        res.json({ success: true, message: 'Budget deleted successfully' });
    } catch (error) {
        console.error('Error deleting budget:', error);
        res.status(500).json({ success: false, message: 'Error deleting budget', error: error.message });
    }
});

module.exports = router;