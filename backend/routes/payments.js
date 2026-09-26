const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatStudent(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        studentId: row.student_id,
        roll: row.roll,
        name: row.name,
        guardianName: row.guardian_name,
        motherName: row.mother_name,
        phone: row.phone,
        address: row.address,
        batch: row.batch,
        group: row.student_group,
        previousSchool: row.previous_school,
        guardianPhone: row.guardian_phone,
        fee: Number(row.fee || 0),
        admissionFee: Number(row.admission_fee || 0),
        startMonth: row.start_month,
        status: row.status,
        photo: row.photo
    };
}

function formatPayment(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        receiptNo: row.receipt_no,
        studentId: row.student_id,
        studentName: row.student_name,
        month: row.month,
        year: row.year,
        fee: Number(row.fee || 0),
        monthlyFee: Number(row.monthly_fee || 0),
        admissionFee: Number(row.admission_fee || 0),
        discount: Number(row.discount || 0),
        fine: Number(row.fine || 0),
        amount: Number(row.amount || 0),
        paymentMethod: row.payment_method,
        type: row.type || 'Monthly',
        status: row.status || 'Paid',
        remarks: row.remarks || '',
        date: row.date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toPaymentRow(data) {
    const row = {};
    if (data.receiptNo !== undefined) row.receipt_no = data.receiptNo;
    if (data.studentId !== undefined) row.student_id = String(data.studentId).trim();
    if (data.studentName !== undefined) row.student_name = data.studentName;
    if (data.month !== undefined) row.month = data.month;
    if (data.year !== undefined) row.year = Number(data.year);
    if (data.fee !== undefined) row.fee = Number(data.fee || 0);
    if (data.monthlyFee !== undefined) row.monthly_fee = Number(data.monthlyFee || 0);
    if (data.admissionFee !== undefined) row.admission_fee = Number(data.admissionFee || 0);
    if (data.discount !== undefined) row.discount = Number(data.discount || 0);
    if (data.fine !== undefined) row.fine = Number(data.fine || 0);
    if (data.amount !== undefined) row.amount = Number(data.amount || 0);
    if (data.paymentMethod !== undefined) row.payment_method = data.paymentMethod;
    if (data.type !== undefined) row.type = data.type;
    if (data.status !== undefined) row.status = data.status;
    if (data.remarks !== undefined) row.remarks = data.remarks;
    if (data.date !== undefined) row.date = String(data.date);
    return row;
}

// @route   GET /api/payments
// @desc    Get all payments with filtering
// @access  Public
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 1000;
        const month = req.query.month;
        const method = req.query.method;
        const status = req.query.status;
        const studentId = req.query.studentId;

        let query = supabase
            .from('payments')
            .select('*')
            .order('created_at', { ascending: false });

        if (month && month !== 'all') query = query.eq('month', month);
        if (method && method !== 'all') query = query.eq('payment_method', method);
        if (status && status !== 'all') query = query.eq('status', status);
        if (studentId) query = query.eq('student_id', studentId.trim());

        // PostgREST may cap a single response at 1,000 rows. Read larger
        // requests in pages so reports can receive the full requested range.
        const data = [];
        const pageSize = 1000;
        for (let offset = 0; offset < limit; offset += pageSize) {
            const end = Math.min(offset + pageSize - 1, limit - 1);
            const { data: page, error } = await query.range(offset, end);
            if (error) throw error;
            data.push(...(page || []));
            if (!page || page.length < end - offset + 1) break;
        }

        const payments = data.map(formatPayment);
        res.json({
            success: true,
            payments,
            total: payments.length
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, message: 'Error fetching payments', error: error.message });
    }
});

// @route   GET /api/payments/receipt/:receiptNo
// @desc    Get single payment by receipt number
// @access  Public
router.get('/receipt/:receiptNo', async (req, res) => {
    try {
        const receiptNo = (req.params.receiptNo || '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptNo);

        let { data: payment } = await supabase
            .from('payments')
            .select('*')
            .ilike('receipt_no', receiptNo)
            .maybeSingle();

        if (!payment && isUuid) {
            const { data: byId } = await supabase
                .from('payments')
                .select('*')
                .eq('id', receiptNo)
                .maybeSingle();
            payment = byId;
        }

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        res.json({ success: true, payment: formatPayment(payment) });
    } catch (error) {
        console.error('Error fetching payment by receipt:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment', error: error.message });
    }
});

// @route   GET /api/payments/stats/overview
// @desc    Get payment statistics
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();

        const [
            { data: todayPayments },
            { data: monthPayments },
            { count: totalPayments },
            { data: allPaymentMethods }
        ] = await Promise.all([
            supabase.from('payments').select('amount').eq('date', today),
            supabase.from('payments').select('amount').eq('month', currentMonthName).eq('year', currentYear),
            supabase.from('payments').select('*', { count: 'exact', head: true }),
            supabase.from('payments').select('payment_method, amount')
        ]);

        const todayCollection = (todayPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const monthlyIncome = (monthPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Group by payment method
        const methodMap = new Map();
        (allPaymentMethods || []).forEach(p => {
            const m = p.payment_method || 'Cash';
            const cur = methodMap.get(m) || { _id: m, count: 0, total: 0 };
            cur.count += 1;
            cur.total += Number(p.amount || 0);
            methodMap.set(m, cur);
        });
        const methodStats = Array.from(methodMap.values());

        res.json({
            success: true,
            todayCollection,
            todayPaymentsCount: (todayPayments || []).length,
            monthlyIncome,
            totalPayments: totalPayments || 0,
            methodStats
        });
    } catch (error) {
        console.error('Error fetching payment stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment statistics', error: error.message });
    }
});

// @route   GET /api/payments/student/:studentId
// @desc    Get all payments for a specific student
// @access  Public
router.get('/student/:studentId', async (req, res) => {
    try {
        const studentId = (req.params.studentId || '').trim();
        const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('student_id', studentId)
            .order('date', { ascending: false });

        if (error) throw error;
        const payments = (data || []).map(formatPayment);

        res.json({
            success: true,
            payments,
            total: payments.length
        });
    } catch (error) {
        console.error('Error fetching student payments:', error);
        res.status(500).json({ success: false, message: 'Error fetching student payments', error: error.message });
    }
});

// @route   GET /api/payments/student/:studentId/monthly-status
// @desc    Get 12-month payment status for a student
// @access  Public
router.get('/student/:studentId/monthly-status', async (req, res) => {
    try {
        const studentId = (req.params.studentId || '').trim();

        // Find student
        const { data: student } = await supabase
            .from('students')
            .select('*')
            .ilike('student_id', studentId)
            .maybeSingle();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const { data: paymentsRaw } = await supabase
            .from('payments')
            .select('*')
            .eq('student_id', student.student_id)
            .order('date', { ascending: false });

        const payments = (paymentsRaw || []).map(formatPayment);
        const currentYear = new Date().getFullYear();

        const months = [
            { name: 'January', num: 1 },
            { name: 'February', num: 2 },
            { name: 'March', num: 3 },
            { name: 'April', num: 4 },
            { name: 'May', num: 5 },
            { name: 'June', num: 6 },
            { name: 'July', num: 7 },
            { name: 'August', num: 8 },
            { name: 'September', num: 9 },
            { name: 'October', num: 10 },
            { name: 'November', num: 11 },
            { name: 'December', num: 12 }
        ];

        const currentMonthIndex = new Date().getMonth();
        const monthlyStatus = months.map((month, idx) => {
            let monthYear = currentYear;
            if (idx > currentMonthIndex) {
                monthYear = currentYear - 1;
            }

            const monthPayments = payments.filter(p =>
                p.type !== 'Admission' && p.month === month.name && Number(p.year) === monthYear
            );

            if (monthPayments.length === 0) {
                return {
                    month: month.name,
                    monthNum: month.num,
                    status: 'Unpaid',
                    amount: 0,
                    paidDate: null,
                    receiptNo: null
                };
            }

            const latestPayment = monthPayments[0];
            const totalPaid = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const fee = Number(student.fee || 0);

            let status = 'Due';
            if (totalPaid > 0) {
                status = 'Paid';
            }

            return {
                month: month.name,
                monthNum: month.num,
                status,
                amount: totalPaid,
                fee,
                paidDate: latestPayment.date,
                receiptNo: latestPayment.receiptNo,
                paymentMethod: latestPayment.paymentMethod
            };
        });

        const paidMonths = monthlyStatus.filter(m => m.status === 'Paid').length;
        const partialMonths = monthlyStatus.filter(m => m.status === 'Partial').length;
        const unpaidMonths = monthlyStatus.filter(m => m.status === 'Unpaid').length;
        const totalPaidAmount = monthlyStatus.reduce((sum, m) => sum + m.amount, 0);
        const totalExpected = Number(student.fee || 0) * 12;
        const totalDue = Math.max(0, totalExpected - totalPaidAmount);

        res.json({
            success: true,
            student: {
                studentId: student.student_id,
                name: student.name,
                batch: student.batch,
                fee: Number(student.fee || 0),
                phone: student.phone,
                guardianName: student.guardian_name,
                photo: student.photo,
                status: student.status
            },
            monthlyStatus,
            statistics: {
                totalExpected,
                totalPaid: totalPaidAmount,
                totalDue,
                paidMonths,
                partialMonths,
                unpaidMonths,
                collectionRate: totalExpected > 0 ? ((totalPaidAmount / totalExpected) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        console.error('Error fetching monthly status:', error);
        res.status(500).json({ success: false, message: 'Error fetching monthly payment status', error: error.message });
    }
});

// @route   GET /api/payments/batch-monthly-status
// @desc    Get batch-wise monthly payment status
// @access  Public
router.get('/batch-monthly-status', async (req, res) => {
    try {
        const { batch, month, year } = req.query;

        if (!batch || !month || !year) {
            return res.status(400).json({ success: false, message: 'Batch, month and year are required' });
        }

        const { data: studentsRaw, error: studentErr } = await supabase
            .from('students')
            .select('*')
            .eq('batch', batch)
            .ilike('status', 'active');

        if (studentErr) throw studentErr;

        const students = (studentsRaw || []).map(formatStudent);
        const studentIds = students.map(s => s.studentId).filter(Boolean);

        let allStudentPayments = [];
        if (studentIds.length > 0) {
            const { data: allStudentPaymentsRaw, error: payErr } = await supabase
                .from('payments')
                .select('*')
                .in('student_id', studentIds);

            if (payErr) throw payErr;
            allStudentPayments = (allStudentPaymentsRaw || []).map(formatPayment);
        }

        const monthIndex = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const getMonthIndex = value => monthIndex.findIndex(name => name.toLowerCase() === String(value || '').trim().toLowerCase());
        const selectedMonthIndex = getMonthIndex(month);
        const selectedYear = Number(year);

        const paymentMatchesPeriod = payment => {
            const paymentMonthIndex = getMonthIndex(payment.month);
            const paymentYear = Number(payment.year);
            if (paymentMonthIndex === selectedMonthIndex && paymentYear === selectedYear) return true;

            if ((!payment.month || !payment.year) && payment.date) {
                const date = new Date(`${payment.date}T00:00:00`);
                return !Number.isNaN(date.getTime()) && date.getMonth() === selectedMonthIndex && date.getFullYear() === selectedYear;
            }
            return false;
        };

        const payments = allStudentPayments.filter(payment => payment.type !== 'Admission' && paymentMatchesPeriod(payment));
        const paymentsByStudent = new Map();
        payments.forEach(payment => {
            const current = paymentsByStudent.get(payment.studentId) || [];
            current.push(payment);
            paymentsByStudent.set(payment.studentId, current);
        });

        const lastPaymentByStudent = new Map();
        allStudentPayments
            .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')))
            .filter(payment => payment.type !== 'Admission')
            .forEach(payment => {
                if (!lastPaymentByStudent.has(payment.studentId)) lastPaymentByStudent.set(payment.studentId, payment);
            });

        const paidStudents = [];
        const unpaidStudents = [];

        for (const student of students) {
            const studentPayments = paymentsByStudent.get(student.studentId) || [];
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const monthlyFee = student.fee || 0;

            if (studentPayments.length > 0 && totalPaid > 0) {
                const lastPayment = studentPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
                paidStudents.push({
                    id: student.studentId,
                    name: student.name,
                    phone: student.phone,
                    paidAmount: totalPaid,
                    paymentDate: lastPayment.date,
                    receiptNo: lastPayment.receiptNo,
                    method: lastPayment.paymentMethod
                });
            } else {
                const lastPayment = lastPaymentByStudent.get(student.studentId);
                unpaidStudents.push({
                    id: student.studentId,
                    name: student.name,
                    phone: student.phone,
                    dueAmount: monthlyFee,
                    lastPaymentDate: lastPayment ? lastPayment.date : 'N/A'
                });
            }
        }

        const totalStudents = students.length;
        const paidCount = paidStudents.length;
        const unpaidCount = unpaidStudents.length;
        const collectionRate = totalStudents > 0 ? ((paidCount / totalStudents) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            totalStudents,
            paidCount,
            unpaidCount,
            collectionRate,
            paidStudents,
            unpaidStudents
        });
    } catch (error) {
        console.error('Error fetching batch monthly status:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch monthly status', error: error.message });
    }
});

// @route   GET /api/payments/batch-payment-status
// @desc    Get a selected batch's payment status across one or more months
// @access  Public
router.get('/batch-payment-status', async (req, res) => {
    try {
        const { batch, year } = req.query;
        const validMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const selectedMonths = String(req.query.months || '')
            .split(',')
            .map(m => m.trim())
            .filter(m => validMonths.includes(m))
            .filter((m, idx, arr) => arr.indexOf(m) === idx)
            .sort((a, b) => validMonths.indexOf(a) - validMonths.indexOf(b));

        if (!batch || !year || selectedMonths.length === 0) {
            return res.status(400).json({ success: false, message: 'Batch, year and at least one month are required' });
        }

        const { data: studentsRaw, error: studentErr } = await supabase
            .from('students')
            .select('student_id, name, batch, fee, phone')
            .eq('batch', batch);

        if (studentErr) throw studentErr;

        const students = (studentsRaw || []).map(formatStudent);
        const studentIds = students.map(s => s.studentId).filter(Boolean);

        let payments = [];
        if (studentIds.length > 0) {
            const { data: paymentsRaw, error: payErr } = await supabase
                .from('payments')
                .select('*')
                .in('student_id', studentIds);

            if (payErr) throw payErr;
            payments = (paymentsRaw || []).map(formatPayment);
        }
        const selectedYear = Number(year);

        const paymentsByStudent = new Map();
        payments.filter(payment => payment.type !== 'Admission').forEach(payment => {
            const list = paymentsByStudent.get(payment.studentId) || [];
            list.push(payment);
            paymentsByStudent.set(payment.studentId, list);
        });

        const reportStudents = students.map(student => {
            const studentPayments = paymentsByStudent.get(student.studentId) || [];
            const monthlyStatus = {};
            selectedMonths.forEach(month => {
                const paidAmount = studentPayments
                    .filter(payment => {
                        const paymentMonth = payment.month || (payment.date ? validMonths[new Date(`${payment.date}T00:00:00`).getMonth()] : null);
                        const paymentYear = payment.year || (payment.date ? new Date(`${payment.date}T00:00:00`).getFullYear() : null);
                        return String(paymentMonth).toLowerCase() === month.toLowerCase() && Number(paymentYear) === selectedYear;
                    })
                    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                monthlyStatus[month] = paidAmount > 0 ? 'Paid' : 'Unpaid';
            });
            return { id: student.studentId, name: student.name, batch: student.batch, fee: student.fee || 0, monthlyStatus };
        }).sort((first, second) => String(first.id || '').localeCompare(String(second.id || ''), undefined, { numeric: true, sensitivity: 'base' }));

        res.json({ success: true, batch, year: selectedYear, months: selectedMonths, students: reportStudents });
    } catch (error) {
        console.error('Error fetching batch payment status:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch payment status', error: error.message });
    }
});

// @route   POST /api/payments
// @desc    Create new payment
// @access  Public
router.post('/', async (req, res) => {
    try {
        const paymentData = req.body;

        // Auto-calculate month and year from date if not provided
        if (!paymentData.month || !paymentData.year) {
            if (paymentData.date) {
                const dateObj = new Date(paymentData.date);
                if (!paymentData.month) {
                    paymentData.month = dateObj.toLocaleString('default', { month: 'long' });
                }
                if (!paymentData.year) {
                    paymentData.year = dateObj.getFullYear();
                }
            }
        }

        // Generate receipt number
        const { count: receiptCount } = await supabase
            .from('payments')
            .select('*', { count: 'exact', head: true });

        const receiptNo = 'RCPT-' + Date.now() + '-' + ((receiptCount || 0) + 1);

        const newRow = toPaymentRow(paymentData);
        newRow.receipt_no = receiptNo;
        newRow.created_at = new Date();
        newRow.updated_at = new Date();

        const { data: savedPayment, error } = await supabase
            .from('payments')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ 
            success: true, 
            message: 'Payment added successfully',
            payment: formatPayment(savedPayment),
            receiptNo
        });
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ success: false, message: 'Error creating payment', error: error.message });
    }
});

// @route   PUT /api/payments/:id
// @desc    Update payment
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const updateData = toPaymentRow(req.body);

        if (updateData.date) {
            const dateObj = new Date(updateData.date);
            if (!updateData.month) updateData.month = dateObj.toLocaleString('default', { month: 'long' });
            if (!updateData.year) updateData.year = dateObj.getFullYear();
        }
        updateData.updated_at = new Date();

        let query = supabase.from('payments').update(updateData);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('receipt_no', idParam);
        }

        const { data: updatedPayment, error } = await query.select().single();
        if (error) throw error;

        if (!updatedPayment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        res.json({ 
            success: true, 
            message: 'Payment updated successfully',
            payment: formatPayment(updatedPayment)
        });
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ success: false, message: 'Error updating payment', error: error.message });
    }
});

// @route   DELETE /api/payments/:id
// @desc    Delete payment
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('payments').delete();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('receipt_no', idParam);
        }

        const { error } = await query;
        if (error) throw error;

        res.json({ success: true, message: 'Payment deleted successfully' });
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ success: false, message: 'Error deleting payment', error: error.message });
    }
});

// @route   GET /api/payments/:id
// @desc    Get single payment by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('payments').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('receipt_no', idParam);
        }

        const { data: payment, error } = await query.maybeSingle();
        if (error || !payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }

        res.json({ success: true, payment: formatPayment(payment) });
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment', error: error.message });
    }
});

module.exports = router;
