const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function getDateRange(query) {
    const { period, startDate, endDate } = query;
    const now  = new Date();
    const today = now.toISOString().split('T')[0];
    let fromDate, toDate = today;

    switch (period) {
        case 'today':     fromDate = today; break;
        case 'week':      { const w = new Date(now); w.setDate(w.getDate()-7); fromDate = w.toISOString().split('T')[0]; break; }
        case 'month':     fromDate = today.slice(0,8)+'01'; break;
        case 'lastMonth': {
            const f = new Date(now.getFullYear(), now.getMonth()-1, 1);
            const l = new Date(now.getFullYear(), now.getMonth(), 0);
            fromDate = f.toISOString().split('T')[0];
            toDate   = l.toISOString().split('T')[0];
            break;
        }
        case 'year':   fromDate = now.getFullYear()+'-01-01'; break;
        case 'custom': fromDate = startDate || today.slice(0,8)+'01'; toDate = endDate || today; break;
        default:       fromDate = today.slice(0,8)+'01';
    }
    return { fromDate, toDate };
}

async function getActiveBookIncomes({ fromDate, toDate, month, year } = {}) {
    let query = supabase
        .from('incomes')
        .select('income_id, source, amount, date, month, year, payment_method, description, received_from, created_at')
        .eq('source', 'Books')
        .eq('status', 'Active');
    if (fromDate) query = query.gte('date', fromDate);
    if (toDate) query = query.lte('date', toDate);
    if (month) query = query.eq('month', month);
    if (year) query = query.eq('year', year);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

function formatBookIncomeForPrint(income) {
    return {
        receiptNo: (income.description || '').replace(/^Book Sale:\s*/i, '') || income.income_id,
        date: income.date,
        studentName: income.received_from || 'Book Sale',
        month: income.month,
        year: income.year,
        paymentMethod: income.payment_method || 'Cash',
        payment_method: income.payment_method || 'Cash',
        amount: Number(income.amount || 0),
        source: 'Books'
    };
}

let paymentsCache = { data: null, expiry: 0 };
async function getAllPayments(selectCols = 'student_id, student_name, amount, date, month, year, payment_method, type, created_at') {
    if (paymentsCache.data && Date.now() < paymentsCache.expiry) {
        return paymentsCache.data;
    }
    const { count, error: countErr } = await supabase.from('payments').select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;
    const numPages = Math.ceil((count || 0) / 1000) || 1;
    const res = await Promise.all(
        Array.from({ length: numPages }, (_, i) =>
            supabase.from('payments')
                .select(selectCols)
                .order('created_at', { ascending: false })
                .range(i * 1000, (i + 1) * 1000 - 1)
        )
    );
    const data = res.flatMap(r => r.data || []);
    paymentsCache = { data, expiry: Date.now() + 15000 };
    return data;
}

// ─── GET /api/finance/overview ────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const [
            allPayments,
            { data: allExpenses },
            allBookIncomes
        ] = await Promise.all([
            getAllPayments('student_id, student_name, amount, date, month, year, payment_method, type, created_at'),
            supabase.from('expenses').select('amount, date, month, year, status').eq('status', 'Approved'),
            getActiveBookIncomes()
        ]);

        let todayC = 0, todayE = 0;
        let monthC = 0, monthE = 0;
        let weekC = 0, weekE = 0;
        let yearC = 0, yearE = 0;
        let totC = 0, totE = 0;
        const incomeBySource = {};

        (allPayments || []).forEach(p => {
            const amt = Number(p.amount || 0);
            totC += amt;
            if (p.date === today) todayC += amt;
            if (p.date >= weekAgoStr && p.date <= today) weekC += amt;
            if (p.month === currentMonthName && Number(p.year) === currentYear) monthC += amt;
            if (Number(p.year) === currentYear) yearC += amt;

            const lbl = p.type === 'Admission' ? 'Admission Fee' : 'Monthly Student Fee';
            incomeBySource[lbl] = (incomeBySource[lbl] || 0) + amt;
        });

        allBookIncomes.forEach(income => {
            const amt = Number(income.amount || 0);
            totC += amt;
            if (income.date === today) todayC += amt;
            if (income.date >= weekAgoStr && income.date <= today) weekC += amt;
            if (income.month === currentMonthName && Number(income.year) === currentYear) monthC += amt;
            if (Number(income.year) === currentYear) yearC += amt;
            incomeBySource[income.source] = (incomeBySource[income.source] || 0) + amt;
        });

        (allExpenses || []).forEach(e => {
            const amt = Number(e.amount || 0);
            totE += amt;
            if (e.date === today) todayE += amt;
            if (e.date >= weekAgoStr && e.date <= today) weekE += amt;
            if (e.month === currentMonthName && Number(e.year) === currentYear) monthE += amt;
            if (Number(e.year) === currentYear) yearE += amt;
        });

        res.json({
            success: true,
            today:   { collection: todayC, expense: todayE, net: todayC-todayE, netType: todayC-todayE>=0?'Profit':'Loss' },
            weekly:  { collection: weekC,  expense: weekE,  net: weekC-weekE,   netType: weekC-weekE>=0?'Profit':'Loss'  },
            monthly: { collection: monthC, expense: monthE, net: monthC-monthE, netType: monthC-monthE>=0?'Profit':'Loss'},
            yearly:  { collection: yearC,  expense: yearE,  net: yearC-yearE,   netType: yearC-yearE>=0?'Profit':'Loss'  },
            total:   { collection: totC,   expense: totE,   net: totC-totE,     netType: totC-totE>=0?'Profit':'Loss'    },
            incomeBySource
        });
    } catch (err) {
        console.error('overview error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/finance/dashboard ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        const { period, startDate, endDate, month } = req.query;
        const { fromDate, toDate } = getDateRange({ period, startDate, endDate });

        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();
        const today = new Date().toISOString().split('T')[0];
        const selectedMonth = month || '';

        const [
            allPayments,
            { data: allExpenses },
            { data: activeStudents },
            allBookIncomes
        ] = await Promise.all([
            getAllPayments('student_id, student_name, amount, date, month, year, payment_method, type, created_at'),
            supabase.from('expenses').select('expense_id, category, amount, date, month, year, payment_method, status, income_source, created_at').eq('status', 'Approved'),
            supabase.from('students').select('student_id, name, phone, batch, fee').eq('status', 'Active'),
            getActiveBookIncomes()
        ]);

        let rangeIncome = 0, rangePaymentCount = 0;
        let rangeExpense = 0, rangeExpenseCount = 0;
        let todayCollection = 0, todayExpense = 0;
        let monthlyCollection = 0, monthlyExpense = 0;
        let totalCollection = 0, totalExpense = 0;

        const payM = {}, expM = {};
        const incomeBySource = {};
        const pMap = {};

        (allPayments || []).forEach(p => {
            const amt = Number(p.amount || 0);
            totalCollection += amt;

            if (p.date >= fromDate && p.date <= toDate) {
                rangeIncome += amt;
                rangePaymentCount++;
            }
            if (p.date === today) todayCollection += amt;
            if (p.month === currentMonthName && Number(p.year) === currentYear) monthlyCollection += amt;

            const m = p.payment_method || 'Cash';
            payM[m] = (payM[m] || 0) + amt;

            const lbl = p.type === 'Admission' ? 'Admission Fee' : 'Monthly Student Fee';
            incomeBySource[lbl] = (incomeBySource[lbl] || 0) + amt;

            if (Number(p.year) === currentYear && p.type !== 'Admission') {
                if (!pMap[p.student_id]) pMap[p.student_id] = {};
                pMap[p.student_id][p.month] = (pMap[p.student_id][p.month] || 0) + amt;
            }
        });

        allBookIncomes.forEach(income => {
            const amt = Number(income.amount || 0);
            totalCollection += amt;
            if (income.date >= fromDate && income.date <= toDate) {
                rangeIncome += amt;
                rangePaymentCount++;
            }
            if (income.date === today) todayCollection += amt;
            if (income.month === currentMonthName && Number(income.year) === currentYear) monthlyCollection += amt;

            const method = income.payment_method || 'Cash';
            payM[method] = (payM[method] || 0) + amt;
            incomeBySource[income.source] = (incomeBySource[income.source] || 0) + amt;
        });

        (allExpenses || []).forEach(e => {
            const amt = Number(e.amount || 0);
            totalExpense += amt;

            if (e.date >= fromDate && e.date <= toDate) {
                rangeExpense += amt;
                rangeExpenseCount++;
            }
            if (e.date === today) todayExpense += amt;
            if (e.month === currentMonthName && Number(e.year) === currentYear) monthlyExpense += amt;

            const m = e.payment_method || 'Cash';
            expM[m] = (expM[m] || 0) + amt;

            if (e.income_source) {
                incomeBySource[e.income_source] = (incomeBySource[e.income_source] || 0) + amt;
            }
        });

        const gP = (...methods) => methods.reduce((s, x) => s + (payM[x] || 0), 0);
        const gE = (...methods) => methods.reduce((s, x) => s + (expM[x] || 0), 0);

        const cashInHand   = gP('Cash') - gE('Cash');
        const bankBalance  = gP('Bank Transfer','Bank','Cheque') - gE('Bank','Cheque');
        const bKashBalance = gP('bKash') - gE('bKash');
        const nagadBalance = gP('Nagad') - gE('Nagad');
        const otherBalance = gP('Rocket','Card') - gE('Rocket','Card');
        const totalAvailableBalance = cashInHand + bankBalance + bKashBalance + nagadBalance + otherBalance;

        // Due summary
        const currentMonthIndex = new Date().getMonth();
        const monthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
        const monthsElapsed = monthNames.slice(0, currentMonthIndex + 1);
        const targetMonths = selectedMonth ? [selectedMonth] : monthsElapsed;

        let totalOutstandingFee = 0;
        const studentWiseDue = [];
        const batchWiseDue = {};

        (activeStudents || []).forEach(s => {
            const fee = Number(s.fee || 0);
            if (fee <= 0) return;
            const sPays = pMap[s.student_id] || {};

            let due = 0;
            const unpaidMonths = [];
            targetMonths.forEach(m => {
                const paid = sPays[m] || 0;
                if (paid === 0) {
                    due += fee;
                    unpaidMonths.push({ month: m, due: fee });
                }
            });

            if (due > 0) {
                totalOutstandingFee += due;
                studentWiseDue.push({ studentId: s.student_id, name: s.name, phone: s.phone, batch: s.batch, fee, due, unpaidMonths });
                if (!batchWiseDue[s.batch]) batchWiseDue[s.batch] = { total: 0, count: 0 };
                batchWiseDue[s.batch].total += due;
                batchWiseDue[s.batch].count += 1;
            }
        });

        studentWiseDue.sort((a,b) => b.due - a.due);
        const topDueStudents = studentWiseDue.slice(0, 5);
        const overdueCount = studentWiseDue.length;
        const todayExpectedCollection = studentWiseDue.slice(0, 20).reduce((s, x) => s + x.fee, 0);
        const batchWiseDueArray = Object.entries(batchWiseDue).map(([batch, d]) => ({ batch, total: d.total, count: d.count }));

        // Recent items
        const recentPayments = (allPayments || [])
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
            .map(p => ({
                studentId: p.student_id,
                studentName: p.student_name,
                amount: p.amount,
                date: p.date,
                paymentMethod: p.payment_method,
                createdAt: p.created_at
            }));

        const recentBookIncomes = allBookIncomes.map(income => ({
            studentName: income.received_from || 'Book Sale',
            receiptNo: (income.description || '').replace(/^Book Sale:\s*/i, '') || income.income_id,
            amount: Number(income.amount || 0),
            date: income.date,
            paymentMethod: income.payment_method,
            createdAt: income.created_at
        }));
        const recentIncome = [...recentPayments, ...recentBookIncomes]
            .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
            .slice(0, 5);

        const recentExpenses = (allExpenses || [])
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
            .map(e => ({
                expenseId: e.expense_id,
                category: e.category,
                amount: e.amount,
                date: e.date,
                paymentMethod: e.payment_method
            }));

        res.json({
            success: true,
            range: {
                fromDate, toDate, income: rangeIncome, expense: rangeExpense,
                net: rangeIncome - rangeExpense, netType: rangeIncome - rangeExpense >= 0 ? 'Profit' : 'Loss',
                paymentCount: rangePaymentCount, expenseCount: rangeExpenseCount
            },
            todayCollection, todayExpense, todayNet: todayCollection - todayExpense,
            todayNetType: todayCollection - todayExpense >= 0 ? 'Profit' : 'Loss',
            monthlyCollection, monthlyExpense, monthlyNet: monthlyCollection - monthlyExpense,
            monthlyNetType: monthlyCollection - monthlyExpense >= 0 ? 'Profit' : 'Loss',
            totalCollection, totalExpense, totalNet: totalCollection - totalExpense,
            totalNetType: totalCollection - totalExpense >= 0 ? 'Profit' : 'Loss',
            balances: { cashInHand, bankBalance, bKashBalance, nagadBalance, otherBalance, totalAvailableBalance },
            incomeBySource,
            dueSummary: { totalOutstandingFee, todayExpectedCollection, overdueCount, totalStudentsWithDue: overdueCount, topDueStudents, batchWiseDue: batchWiseDueArray },
            recentExpenses, recentPayments: recentIncome
        });
    } catch (err) {
        console.error('dashboard error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/finance/graph-data ─────────────────────────────────────────────
router.get('/graph-data', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

        const allPayments = await getAllPayments('month, amount, payment_method, date, type, year');
        const [
            { data: yearExpenses },
            { data: allExpenses },
            allBookIncomes
        ] = await Promise.all([
            supabase.from('expenses').select('month, amount, category, date').eq('year', currentYear).eq('status', 'Approved'),
            supabase.from('expenses').select('payment_method, amount, date').eq('status', 'Approved'),
            getActiveBookIncomes()
        ]);
        const yearPayments = allPayments.filter(p => Number(p.year) === currentYear);

        const payMap = {}, expMap = {};
        const catMap = {};
        const methodMap = {};
        const incSrcMap = {};

        (yearPayments || []).forEach(p => {
            const amt = Number(p.amount || 0);
            payMap[p.month] = (payMap[p.month] || 0) + amt;

            const lbl = p.type === 'Admission' ? 'Admission Fee' : 'Monthly Student Fee';
            incSrcMap[lbl] = (incSrcMap[lbl] || 0) + amt;
        });

        allBookIncomes.forEach(income => {
            const amt = Number(income.amount || 0);
            if (Number(income.year) === currentYear) {
                payMap[income.month] = (payMap[income.month] || 0) + amt;
                incSrcMap[income.source] = (incSrcMap[income.source] || 0) + amt;
            }
        });

        (yearExpenses || []).forEach(e => {
            const amt = Number(e.amount || 0);
            expMap[e.month] = (expMap[e.month] || 0) + amt;
            catMap[e.category] = (catMap[e.category] || 0) + amt;
        });

        (allPayments || []).forEach(p => {
            const amt = Number(p.amount || 0);
            const m = p.payment_method || 'Cash';
            const cur = methodMap[m] || { method: m, total: 0, count: 0 };
            cur.total += amt;
            cur.count += 1;
            methodMap[m] = cur;
        });

        allBookIncomes.forEach(income => {
            const amt = Number(income.amount || 0);
            const method = income.payment_method || 'Cash';
            const cur = methodMap[method] || { method, total: 0, count: 0 };
            cur.total += amt;
            cur.count += 1;
            methodMap[method] = cur;
        });

        const monthlyData = months.map(m => ({
            month: m.slice(0,3),
            fullMonth: m,
            income: payMap[m] || 0,
            expense: expMap[m] || 0
        }));

        const categoryData = Object.entries(catMap).map(([category, total]) => ({ category, total })).sort((a,b) => b.total - a.total);
        const incomeSourceData = Object.entries(incSrcMap).map(([source, total]) => ({ source, total }));

        // 30 days trend
        const trendPayMap = {}, trendExpMap = {};
        (allPayments || []).forEach(p => {
            if (p.date) trendPayMap[p.date] = (trendPayMap[p.date] || 0) + Number(p.amount || 0);
        });
        allBookIncomes.forEach(income => {
            if (income.date) trendPayMap[income.date] = (trendPayMap[income.date] || 0) + Number(income.amount || 0);
        });
        (allExpenses || []).forEach(e => {
            if (e.date) trendExpMap[e.date] = (trendExpMap[e.date] || 0) + Number(e.amount || 0);
        });

        const today = new Date();
        const buildTrend = (days) => Array.from({ length: days }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - (days - 1 - i));
            const ds = d.toISOString().split('T')[0];
            return {
                date: ds,
                income: trendPayMap[ds] || 0,
                expense: trendExpMap[ds] || 0,
                label: days === 7
                    ? d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' })
                    : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
            };
        });

        res.json({
            success: true,
            monthlyData,
            categoryData,
            methodData: Object.values(methodMap),
            incomeSourceData,
            trend: { last7Days: buildTrend(7), last30Days: buildTrend(30) }
        });
    } catch (err) {
        console.error('graph-data error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/finance/income-sources ─────────────────────────────────────────
router.get('/income-sources', async (req, res) => {
    try {
        const { period, startDate, endDate } = req.query;
        const { fromDate, toDate } = getDateRange({ period, startDate, endDate });

        const [
            { data: payments },
            { data: expenses }
        ] = await Promise.all([
            supabase.from('payments').select('type, amount').gte('date', fromDate).lte('date', toDate),
            supabase.from('expenses').select('income_source, amount').gte('date', fromDate).lte('date', toDate).eq('status', 'Approved')
        ]);

        const srcMap = {};
        (payments || []).forEach(s => {
            const lbl = s.type === 'Admission' ? 'Admission Fee' : 'Monthly Student Fee';
            srcMap[lbl] = (srcMap[lbl] || 0) + Number(s.amount || 0);
        });

        (expenses || []).forEach(s => {
            if (s.income_source) {
                srcMap[s.income_source] = (srcMap[s.income_source] || 0) + Number(s.amount || 0);
            }
        });

        const totalIncome = Object.values(srcMap).reduce((a,b) => a+b, 0);
        res.json({
            success: true,
            incomeBySource: Object.entries(srcMap).map(([source, total]) => ({
                source, total, percentage: totalIncome > 0 ? Math.round((total/totalIncome)*100) : 0
            })),
            totalIncome, fromDate, toDate
        });
    } catch (err) {
        console.error('income-sources error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/finance/due-summary ────────────────────────────────────────────
router.get('/due-summary', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const currentMonthIndex = new Date().getMonth();
        const monthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
        const monthsElapsed = monthNames.slice(0, currentMonthIndex + 1);

        const selectedMonth = req.query.month || '';
        const targetMonths = selectedMonth ? [selectedMonth] : monthsElapsed;

        const [
            { data: activeStudents },
            allPayments
        ] = await Promise.all([
            supabase.from('students').select('student_id, name, phone, batch, fee').eq('status', 'Active'),
            getAllPayments('student_id, amount, month, year, type')
        ]);

        const pMap = {};
        (allPayments || []).forEach(p => {
            if (p.type === 'Admission') return;
            if (!pMap[p.student_id]) pMap[p.student_id] = {};
            pMap[p.student_id][p.month] = (pMap[p.student_id][p.month] || 0) + Number(p.amount || 0);
        });

        let totalOutstandingFee = 0;
        const studentWiseDue = [];
        const batchWiseDue = {};

        (activeStudents || []).forEach(s => {
            const fee = Number(s.fee || 0);
            if (fee <= 0) return;
            const sPays = pMap[s.student_id] || {};

            let due = 0;
            const unpaidMonths = [];
            targetMonths.forEach(m => {
                const paid = sPays[m] || 0;
                if (paid === 0) {
                    due += fee;
                    unpaidMonths.push({ month: m, due: fee });
                }
            });

            if (due > 0) {
                totalOutstandingFee += due;
                studentWiseDue.push({ studentId: s.student_id, name: s.name, phone: s.phone, batch: s.batch, fee, due, unpaidMonths });
                if (!batchWiseDue[s.batch]) batchWiseDue[s.batch] = { total: 0, count: 0 };
                batchWiseDue[s.batch].total += due;
                batchWiseDue[s.batch].count += 1;
            }
        });

        studentWiseDue.sort((a,b) => b.due - a.due);

        res.json({
            success: true,
            selectedMonth: selectedMonth || null,
            totalOutstandingFee,
            todayExpectedCollection: studentWiseDue.slice(0,20).reduce((s,x) => s + x.fee, 0),
            overdueCount: studentWiseDue.length,
            topDueStudents: studentWiseDue.slice(0,5),
            batchWiseDue: Object.entries(batchWiseDue).map(([batch, d]) => ({ batch, total: d.total, count: d.count })),
            totalStudentsWithDue: studentWiseDue.length
        });
    } catch (err) {
        console.error('due-summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/finance/balances ────────────────────────────────────────────────
router.get('/balances', async (req, res) => {
    try {
        const [
            payments,
            { data: expenses }
        ] = await Promise.all([
            getAllPayments('payment_method, amount'),
            supabase.from('expenses').select('payment_method, amount').eq('status', 'Approved')
        ]);

        const pMap = {}, eMap = {};
        (payments || []).forEach(p => {
            const m = p.payment_method || 'Cash';
            pMap[m] = (pMap[m] || 0) + Number(p.amount || 0);
        });

        (expenses || []).forEach(e => {
            const m = e.payment_method || 'Cash';
            eMap[m] = (eMap[m] || 0) + Number(e.amount || 0);
        });

        const gP = (...m) => m.reduce((s,x) => s + (pMap[x] || 0), 0);
        const gE = (...m) => m.reduce((s,x) => s + (eMap[x] || 0), 0);

        const cashInHand   = gP('Cash') - gE('Cash');
        const bankBalance  = gP('Bank Transfer','Bank','Cheque') - gE('Bank','Cheque');
        const bKashBalance = gP('bKash') - gE('bKash');
        const nagadBalance = gP('Nagad') - gE('Nagad');
        const otherBalance = gP('Rocket','Card') - gE('Rocket','Card');

        res.json({
            success: true,
            cashInHand,
            bankBalance,
            bKashBalance,
            nagadBalance,
            otherBalance,
            totalAvailableBalance: cashInHand + bankBalance + bKashBalance + nagadBalance + otherBalance,
            lastUpdated: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/daily-summary', async (req, res) => {
    try {
        const targetDate = req.query.date || new Date().toISOString().split('T')[0];
        const [
            { data: payments },
            { data: expenses },
            bookIncomes
        ] = await Promise.all([
            supabase.from('payments').select('*').eq('date', targetDate),
            supabase.from('expenses').select('*').eq('date', targetDate).eq('status', 'Approved'),
            getActiveBookIncomes({ fromDate: targetDate, toDate: targetDate })
        ]);

        const reportPayments = [...(payments || []), ...bookIncomes.map(formatBookIncomeForPrint)];
        const totalCollection = reportPayments.reduce((s,p) => s + Number(p.amount || 0), 0);
        const totalExpense    = (expenses || []).reduce((s,e) => s + Number(e.amount || 0), 0);
        const net = totalCollection - totalExpense;

        const collectionByMethod = {}, expenseByCategory = {};
        reportPayments.forEach(p => {
            const m = p.payment_method || 'Cash';
            collectionByMethod[m] = (collectionByMethod[m] || 0) + Number(p.amount || 0);
        });
        (expenses || []).forEach(e => {
            expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount || 0);
        });

        res.json({
            success: true,
            date: targetDate,
            totalCollection,
            totalExpense,
            net,
            netType: net >= 0 ? 'Profit' : 'Loss',
            totalStudents: (payments || []).length,
            totalExpenseEntries: (expenses || []).length,
            collectionByMethod,
            expenseByCategory,
            payments: reportPayments,
            expenses: expenses || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/reports/monthly', async (req, res) => {
    try {
        const targetMonth = req.query.month || new Date().toLocaleString('default', { month: 'long' });
        const targetYear  = parseInt(req.query.year) || new Date().getFullYear();

        const [
            { data: payments },
            { data: expenses },
            bookIncomes
        ] = await Promise.all([
            supabase.from('payments').select('*').eq('month', targetMonth).eq('year', targetYear),
            supabase.from('expenses').select('*').eq('month', targetMonth).eq('year', targetYear).eq('status', 'Approved'),
            getActiveBookIncomes({ month: targetMonth, year: targetYear })
        ]);

        const reportPayments = [...(payments || []), ...bookIncomes.map(formatBookIncomeForPrint)];
        const totalCollection = reportPayments.reduce((s,p) => s + Number(p.amount || 0), 0);
        const totalExpense    = (expenses || []).reduce((s,e) => s + Number(e.amount || 0), 0);
        const net = totalCollection - totalExpense;

        res.json({
            success: true,
            month: targetMonth,
            year: targetYear,
            totalCollection,
            totalExpense,
            net,
            netType: net >= 0 ? 'Profit' : 'Loss',
            payments: reportPayments,
            expenses: expenses || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/reports/date-range', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate required' });

        const [
            { data: payments },
            { data: expenses },
            bookIncomes
        ] = await Promise.all([
            supabase.from('payments').select('*').gte('date', startDate).lte('date', endDate),
            supabase.from('expenses').select('*').gte('date', startDate).lte('date', endDate).eq('status', 'Approved'),
            getActiveBookIncomes({ fromDate: startDate, toDate: endDate })
        ]);

        const reportPayments = [...(payments || []), ...bookIncomes.map(formatBookIncomeForPrint)];
        const totalCollection = reportPayments.reduce((s,p) => s + Number(p.amount || 0), 0);
        const totalExpense    = (expenses || []).reduce((s,e) => s + Number(e.amount || 0), 0);
        const net = totalCollection - totalExpense;

        res.json({
            success: true,
            startDate,
            endDate,
            totalCollection,
            totalExpense,
            net,
            netType: net >= 0 ? 'Profit' : 'Loss',
            payments: reportPayments,
            expenses: expenses || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/reports/income', async (req, res) => {
    try {
        const { startDate, endDate, source } = req.query;
        let query = supabase.from('payments').select('*').order('date', { ascending: false });
        if (startDate && endDate) query = query.gte('date', startDate).lte('date', endDate);

        const [{ data: payments, error }, bookIncomes] = await Promise.all([
            query,
            getActiveBookIncomes({ fromDate: startDate, toDate: endDate })
        ]);
        if (error) throw error;

        const normalizedBookIncomes = bookIncomes.map(formatBookIncomeForPrint);
        const filtered = source === 'Books'
            ? normalizedBookIncomes
            : source && source !== 'all'
                ? (payments || []).filter(p => (p.type === 'Admission' ? 'Admission Fee' : 'Monthly Student Fee') === source)
                : [...(payments || []), ...normalizedBookIncomes];

        res.json({
            success: true,
            payments: filtered,
            totalIncome: filtered.reduce((s,p) => s + Number(p.amount || 0), 0),
            count: filtered.length,
            startDate: startDate || 'All',
            endDate: endDate || 'All'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/reports/expense', async (req, res) => {
    try {
        const { startDate, endDate, category, status } = req.query;
        let query = supabase.from('expenses').select('*').order('date', { ascending: false });

        if (status && status !== 'all') query = query.eq('status', status);
        else query = query.eq('status', 'Approved');

        if (startDate && endDate) query = query.gte('date', startDate).lte('date', endDate);
        if (category && category !== 'all') query = query.eq('category', category);

        const { data: expenses, error } = await query;
        if (error) throw error;

        const byCategory = {};
        (expenses || []).forEach(e => {
            byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount || 0);
        });

        res.json({
            success: true,
            expenses: expenses || [],
            totalExpense: (expenses || []).reduce((s,e) => s + Number(e.amount || 0), 0),
            count: (expenses || []).length,
            byCategory,
            startDate: startDate || 'All',
            endDate: endDate || 'All'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
