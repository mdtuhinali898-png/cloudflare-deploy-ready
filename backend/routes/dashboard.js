const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Lightweight in-memory cache (30s)
const cache = {
    stats: { data: null, expiry: 0 },
    dueStudents: { data: null, expiry: 0 },
    monthlyCollection: { data: null, expiry: 0 },
    batchWise: { data: null, expiry: 0 }
};
const CACHE_TTL = 30 * 1000;
let paymentsCache = { data: null, expiry: 0, pending: null };

async function getAllDashboardPayments() {
    if (paymentsCache.data && Date.now() < paymentsCache.expiry) return paymentsCache.data;
    if (paymentsCache.pending) return paymentsCache.pending;

    paymentsCache.pending = (async () => {
        const { count, error: countError } = await supabase
            .from('payments')
            .select('id', { count: 'exact', head: true });
        if (countError) throw countError;

        const pageSize = 1000;
        const pageCount = Math.ceil((count || 0) / pageSize);
        const pages = await Promise.all(Array.from({ length: pageCount }, (_, page) =>
            supabase.from('payments')
                .select('student_id, month, year, amount, type')
                .order('id', { ascending: true })
                .range(page * pageSize, (page + 1) * pageSize - 1)
        ));
        const failedPage = pages.find(page => page.error);
        if (failedPage) throw failedPage.error;

        const data = pages.flatMap(page => page.data || []);
        paymentsCache = { data, expiry: Date.now() + CACHE_TTL, pending: null };
        return data;
    })();

    try {
        return await paymentsCache.pending;
    } finally {
        if (paymentsCache.pending) paymentsCache.pending = null;
    }
}

async function getAllStudentBatches() {
    const { count, error: countError } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true });
    if (countError) throw countError;
    const pageSize = 1000;
    const pageCount = Math.ceil((count || 0) / pageSize);
    const pages = await Promise.all(Array.from({ length: pageCount }, (_, page) =>
        supabase.from('students').select('batch').order('id', { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1)
    ));
    const failedPage = pages.find(page => page.error);
    if (failedPage) throw failedPage.error;
    return pages.flatMap(page => page.data || []);
}

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Public
router.get('/stats', async (req, res) => {
    try {
        if (cache.stats.data && Date.now() < cache.stats.expiry) {
            return res.json(cache.stats.data);
        }

        const today = new Date().toISOString().split('T')[0];
        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [
            { count: totalStudents },
            { count: newAdmissions },
            { data: todayPayments },
            { data: monthPayments },
            { data: activeStudents },
            { data: allPayments }
        ] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
            supabase.from('payments').select('amount').eq('date', today),
            supabase.from('payments').select('amount').eq('month', currentMonthName).eq('year', currentYear),
            supabase.from('students').select('student_id, fee').eq('status', 'Active'),
            getAllDashboardPayments().then(data => ({ data }))
        ]);

        const todayCollection = (todayPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const monthlyIncome = (monthPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Index payments by student_id
        const paymentMap = {};
        (allPayments || []).forEach(p => {
            if (p.type === 'Admission') return;
            if (!paymentMap[p.student_id]) paymentMap[p.student_id] = [];
            paymentMap[p.student_id].push(p);
        });

        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const currentMonthIndex = new Date().getMonth();

        let dueCount = 0;
        for (const student of (activeStudents || [])) {
            const studentPayments = paymentMap[student.student_id] || [];
            let unpaidCount = 0;

            for (let i = 0; i < 12 && unpaidCount === 0; i++) {
                const monthIndex = (currentMonthIndex - i + 12) % 12;
                const monthName = months[monthIndex];
                const monthYear = monthIndex > currentMonthIndex ? currentYear - 1 : currentYear;

                const monthPaid = studentPayments
                    .filter(p => p.month === monthName && Number(p.year) === monthYear)
                    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

                if (monthPaid < (Number(student.fee) || 0)) unpaidCount++;
            }

            if (unpaidCount > 0) dueCount++;
        }

        const result = {
            success: true,
            totalStudents: totalStudents || 0,
            newAdmissions: newAdmissions || 0,
            todayCollection,
            todayPaymentsCount: (todayPayments || []).length,
            monthlyIncome,
            currentMonth: currentMonthName,
            dueStudentsCount: dueCount
        };
        cache.stats = { data: result, expiry: Date.now() + CACHE_TTL };
        res.json(result);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
});

// @route   GET /api/dashboard/recent-payments
// @desc    Get recent payments
// @access  Public
router.get('/recent-payments', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const { data: recentPayments, error } = await supabase
            .from('payments')
            .select('student_id, student_name, month, amount, status')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        const studentIds = [...new Set((recentPayments || []).map(p => p.student_id))];
        const { data: students } = await supabase
            .from('students')
            .select('student_id, batch')
            .in('student_id', studentIds);

        const studentMap = {};
        (students || []).forEach(s => { studentMap[s.student_id] = s; });

        const transformed = (recentPayments || []).map(p => ({
            id: p.student_id,
            name: p.student_name || 'Unknown',
            batch: studentMap[p.student_id]?.batch || 'N/A',
            month: p.month,
            amount: Number(p.amount || 0),
            status: p.status
        }));

        res.json(transformed);
    } catch (error) {
        console.error('Error fetching recent payments:', error);
        res.json([]);
    }
});

// @route   GET /api/dashboard/recent-admissions
// @desc    Get recent admissions
// @access  Public
router.get('/recent-admissions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const { data: recentAdmissions, error } = await supabase
            .from('students')
            .select('student_id, name, batch, admission_date')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json((recentAdmissions || []).map(s => ({
            id: s.student_id,
            name: s.name,
            batch: s.batch,
            date: s.admission_date ? new Date(s.admission_date).toLocaleDateString('en-GB') : 'N/A'
        })));
    } catch (error) {
        console.error('Error fetching recent admissions:', error);
        res.status(500).json({ success: false, message: 'Error fetching recent admissions' });
    }
});

// @route   GET /api/dashboard/due-students
// @desc    Get due students
// @access  Public
router.get('/due-students', async (req, res) => {
    try {
        if (cache.dueStudents.data && Date.now() < cache.dueStudents.expiry) {
            return res.json(cache.dueStudents.data);
        }

        const [
            { data: allStudents },
            { data: allPayments }
        ] = await Promise.all([
            supabase.from('students').select('student_id, name, fee').eq('status', 'Active'),
            getAllDashboardPayments().then(data => ({ data }))
        ]);

        const paymentMap = {};
        (allPayments || []).forEach(p => {
            if (p.type === 'Admission') return;
            if (!paymentMap[p.student_id]) paymentMap[p.student_id] = [];
            paymentMap[p.student_id].push(p);
        });

        const months = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const currentYear = new Date().getFullYear();
        const currentMonthIndex = new Date().getMonth();

        const dueStudents = [];

        for (const student of (allStudents || [])) {
            const studentPayments = paymentMap[student.student_id] || [];
            let unpaidCount = 0;
            let totalExpected = 0;
            let totalPaidAmount = 0;

            for (let i = 0; i < 12; i++) {
                const monthIndex = (currentMonthIndex - i + 12) % 12;
                const monthName = months[monthIndex];
                const monthYear = monthIndex > currentMonthIndex ? currentYear - 1 : currentYear;

                const monthPaid = studentPayments
                    .filter(p => p.month === monthName && Number(p.year) === monthYear)
                    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

                totalExpected += Number(student.fee || 0);
                totalPaidAmount += monthPaid;

                if (monthPaid < (Number(student.fee) || 0)) unpaidCount++;
            }

            if (unpaidCount > 0) {
                dueStudents.push({
                    id: student.student_id,
                    name: student.name,
                    due: `${unpaidCount} Month(s)`,
                    totalDue: Math.max(0, totalExpected - totalPaidAmount)
                });
            }
        }

        dueStudents.sort((a, b) => b.totalDue - a.totalDue);
        const result = dueStudents.slice(0, 10);
        cache.dueStudents = { data: result, expiry: Date.now() + CACHE_TTL };
        res.json(result);
    } catch (error) {
        console.error('Error fetching due students:', error);
        res.status(500).json({ success: false, message: 'Error fetching due students' });
    }
});

// @route   GET /api/dashboard/monthly-collection
// @desc    Get monthly collection data for charts
// @access  Public
router.get('/monthly-collection', async (req, res) => {
    try {
        if (cache.monthlyCollection.data && Date.now() < cache.monthlyCollection.expiry) {
            return res.json(cache.monthlyCollection.data);
        }

        const monthNameMap = {
            'January': 'Jan', 'February': 'Feb', 'March': 'Mar', 'April': 'Apr',
            'May': 'May', 'June': 'Jun', 'July': 'Jul', 'August': 'Aug',
            'September': 'Sep', 'October': 'Oct', 'November': 'Nov', 'December': 'Dec'
        };
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = { Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0, Jul: 0, Aug: 0, Sep: 0, Oct: 0, Nov: 0, Dec: 0 };

        const currentYear = new Date().getFullYear();
        const { data: payments, error } = await supabase
            .from('payments')
            .select('month, amount')
            .eq('year', currentYear);

        if (error) throw error;

        (payments || []).forEach(p => {
            const short = monthNameMap[p.month];
            if (short && monthlyData[short] !== undefined) {
                monthlyData[short] += Number(p.amount || 0);
            }
        });

        const result = { labels: months, data: Object.values(monthlyData) };
        cache.monthlyCollection = { data: result, expiry: Date.now() + CACHE_TTL };
        res.json(result);
    } catch (error) {
        console.error('Error fetching monthly collection:', error);
        res.status(500).json({ success: false, message: 'Error fetching monthly collection' });
    }
});

// @route   GET /api/dashboard/batch-wise
// @desc    Get batch-wise data for charts
// @access  Public
router.get('/batch-wise', async (req, res) => {
    try {
        if (cache.batchWise.data && Date.now() < cache.batchWise.expiry) {
            return res.json(cache.batchWise.data);
        }

        const [
            { data: batchesRaw, error: bErr },
            studentsRaw
        ] = await Promise.all([
            supabase.from('batches').select('name').order('name'),
            getAllStudentBatches()
        ]);

        if (bErr) throw bErr;

        const counts = {};
        (studentsRaw || []).forEach(s => {
            if (s.batch) {
                counts[s.batch] = (counts[s.batch] || 0) + 1;
            }
        });

        const batches = (batchesRaw || []).map(b => b.name);
        const labels = [];
        const data = [];

        batches.forEach(b => {
            labels.push(b);
            data.push(counts[b] || 0);
        });

        const result = { labels, data };
        cache.batchWise = { data: result, expiry: Date.now() + CACHE_TTL };
        res.json(result);
    } catch (error) {
        console.error('Error fetching batch-wise data:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch-wise data' });
    }
});

module.exports = router;
