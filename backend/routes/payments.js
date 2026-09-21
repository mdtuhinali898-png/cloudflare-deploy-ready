const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Student = require('../models/Student');

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
        
        // Build query
        let query = {};
        
        if (month && month !== 'all') {
            query.month = month;
        }
        
        if (method && method !== 'all') {
            query.paymentMethod = method;
        }
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (studentId) {
            query.studentId = studentId;
        }
        
        // Execute query
        const payments = await Payment.find(query)
            .sort({ createdAt: -1 })
            .limit(limit);
        
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
        let payment = await Payment.findOne({ 
            receiptNo: { $regex: `^${req.params.receiptNo.trim()}$`, $options: 'i' } 
        });
        
        if (!payment && req.params.receiptNo.match(/^[0-9a-fA-F]{24}$/)) {
            payment = await Payment.findById(req.params.receiptNo);
        }
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        res.json({ success: true, payment });
    } catch (error) {
        console.error('Error fetching payment by receipt:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment', error: error.message });
    }
});

// @route   GET /api/payments/:id
// @desc    Get single payment by ID
// @access  Public
router.get('/:id([a-fA-F0-9]{24})', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        res.json({ success: true, payment });
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment', error: error.message });
    }
});

// @route   POST /api/payments
// @desc    Create new payment
// @access  Public
router.post('/', async (req, res) => {
    try {
        const paymentData = req.body;
        
        // Generate receipt number
        const receiptCount = await Payment.countDocuments();
        const receiptNo = 'RCPT-' + Date.now() + '-' + (receiptCount + 1);
        
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
        
        // Create payment with receipt number
        const payment = new Payment({
            ...paymentData,
            receiptNo
        });
        
        await payment.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'Payment added successfully',
            payment,
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
        const updateData = { ...req.body };
        
        // Auto-calculate month and year from date if date is updated
        if (updateData.date) {
            const dateObj = new Date(updateData.date);
            if (!updateData.month) {
                updateData.month = dateObj.toLocaleString('default', { month: 'long' });
            }
            if (!updateData.year) {
                updateData.year = dateObj.getFullYear();
            }
        }
        
        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Payment updated successfully',
            payment 
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
        const payment = await Payment.findByIdAndDelete(req.params.id);
        
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Payment deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ success: false, message: 'Error deleting payment', error: error.message });
    }
});

// @route   GET /api/payments/student/:studentId
// @desc    Get all payments for a specific student
// @access  Public
router.get('/student/:studentId', async (req, res) => {
    try {
        const payments = await Payment.find({ studentId: req.params.studentId })
            .sort({ date: -1 });
        
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

// @route   GET /api/payments/stats/overview
// @desc    Get payment statistics
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();
        
        // Today's collection
        const todayPayments = await Payment.find({ date: today });
        const todayCollection = todayPayments.reduce((sum, p) => sum + p.amount, 0);
        
        // This month's collection (month is stored as string like "July")
        const monthPayments = await Payment.find({ month: currentMonthName, year: currentYear });
        const monthlyIncome = monthPayments.reduce((sum, p) => sum + p.amount, 0);
        
        // Total payments count
        const totalPayments = await Payment.countDocuments();
        
        // Payment method breakdown
        const methodStats = await Payment.aggregate([
            {
                $group: {
                    _id: '$paymentMethod',
                    count: { $sum: 1 },
                    total: { $sum: '$amount' }
                }
            }
        ]);
        
        res.json({
            success: true,
            todayCollection,
            todayPaymentsCount: todayPayments.length,
            monthlyIncome,
            totalPayments,
            methodStats
        });
    } catch (error) {
        console.error('Error fetching payment stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching payment statistics', error: error.message });
    }
});

// @route   GET /api/payments/batch-monthly-status
// @desc    Get batch-wise monthly payment status
// @access  Public
router.get('/batch-monthly-status', async (req, res) => {
    try {
        const { batch, month, year } = req.query;
        
        if (!batch || !month || !year) {
            return res.status(400).json({ 
                success: false, 
                message: 'Batch, month and year are required' 
            });
        }
        
        // Get all students in the batch
        const students = await Student.find({ batch, status: 'Active' }).lean();
        
        // A payment does not have to store its batch. The student's batch is
        // authoritative, which also makes historic payments report correctly.
        // Older data used MongoDB's document ID while new payments use the
        // readable Student ID. Accept both so no historical payment is lost.
        const studentByAnyId = new Map();
        students.forEach(student => {
            [student.studentId, String(student._id), student.id]
                .filter(Boolean)
                .forEach(id => studentByAnyId.set(String(id), student));
        });
        const studentIds = [...studentByAnyId.keys()];
        const allStudentPayments = await Payment.find({ studentId: { $in: studentIds } }).lean();

        const monthIndex = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const getMonthIndex = value => monthIndex.findIndex(name => name.toLowerCase() === String(value || '').trim().toLowerCase());
        const selectedMonthIndex = getMonthIndex(month);
        const selectedYear = Number(year);
        const paymentMatchesPeriod = payment => {
            const paymentMonthIndex = getMonthIndex(payment.month);
            const paymentYear = Number(payment.year);
            if (paymentMonthIndex === selectedMonthIndex && paymentYear === selectedYear) return true;

            // Some old payments have no month/year. Use their payment date as
            // a safe fallback instead of incorrectly showing them as unpaid.
            if ((!payment.month || !payment.year) && payment.date) {
                const date = new Date(`${payment.date}T00:00:00`);
                return !Number.isNaN(date.getTime()) && date.getMonth() === selectedMonthIndex && date.getFullYear() === selectedYear;
            }
            return false;
        };
        const payments = allStudentPayments.filter(paymentMatchesPeriod);
        const paymentsByStudent = new Map();
        payments.forEach(payment => {
            const student = studentByAnyId.get(String(payment.studentId));
            if (!student) return;
            const current = paymentsByStudent.get(student.studentId) || [];
            current.push(payment);
            paymentsByStudent.set(student.studentId, current);
        });
        const lastPaymentByStudent = new Map();
        allStudentPayments
            .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')) || new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
            .forEach(payment => {
                const student = studentByAnyId.get(String(payment.studentId));
                if (student && !lastPaymentByStudent.has(student.studentId)) lastPaymentByStudent.set(student.studentId, payment);
            });
        
        // Calculate paid and unpaid students
        const paidStudents = [];
        const unpaidStudents = [];
        
        for (const student of students) {
            const studentPayments = paymentsByStudent.get(student.studentId) || [];
            const totalPaid = studentPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const monthlyFee = student.fee || 0;
            
            // Paid = any payment received (even partial counts as paid;
            // only students with ZERO payment for this month are Due)
            if (studentPayments.length > 0 && totalPaid > 0) {
                // Paid student
                const lastPayment = studentPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
                paidStudents.push({
                    id: student.studentId || student.id,
                    name: student.name,
                    phone: student.phone,
                    paidAmount: totalPaid,
                    paymentDate: lastPayment.date,
                    receiptNo: lastPayment.receiptNo,
                    method: lastPayment.paymentMethod || lastPayment.method
                });
            } else {
                // Unpaid/Due student (no payment at all for this month)
                const lastPayment = lastPaymentByStudent.get(student.studentId);
                
                unpaidStudents.push({
                    id: student.studentId || student.id,
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
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching batch monthly status', 
            error: error.message 
        });
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
            .map(month => month.trim())
            .filter(month => validMonths.includes(month))
            .filter((month, index, months) => months.indexOf(month) === index)
            .sort((first, second) => validMonths.indexOf(first) - validMonths.indexOf(second));

        if (!batch || !year || selectedMonths.length === 0) {
            return res.status(400).json({ success: false, message: 'Batch, year and at least one month are required' });
        }

        // The batch report must include every student in the selected batch;
        // payment status is still calculated from each student's actual fee.
        const students = await Student.find({ batch })
            .select('studentId name batch fee phone _id')
            .lean();
        const studentByAnyId = new Map();
        students.forEach(student => {
            [student.studentId, String(student._id), student.id]
                .filter(Boolean)
                .forEach(id => studentByAnyId.set(String(id), student));
        });
        const payments = await Payment.find({ studentId: { $in: [...studentByAnyId.keys()] } }).lean();
        const selectedYear = Number(year);
        const monthFromDate = payment => {
            if (!payment.date) return null;
            const date = new Date(`${payment.date}T00:00:00`);
            return Number.isNaN(date.getTime()) ? null : validMonths[date.getMonth()];
        };
        const yearFromDate = payment => {
            if (!payment.date) return null;
            const date = new Date(`${payment.date}T00:00:00`);
            return Number.isNaN(date.getTime()) ? null : date.getFullYear();
        };

        const paymentsByStudent = new Map();
        payments.forEach(payment => {
            const student = studentByAnyId.get(String(payment.studentId));
            if (!student) return;
            const list = paymentsByStudent.get(student.studentId) || [];
            list.push(payment);
            paymentsByStudent.set(student.studentId, list);
        });

        const reportStudents = students.map(student => {
            const studentPayments = paymentsByStudent.get(student.studentId) || [];
            const monthlyStatus = {};
            selectedMonths.forEach(month => {
                const paidAmount = studentPayments
                    .filter(payment => {
                        const paymentMonth = payment.month || monthFromDate(payment);
                        const paymentYear = payment.year || yearFromDate(payment);
                        return String(paymentMonth).toLowerCase() === month.toLowerCase() && Number(paymentYear) === selectedYear;
                    })
                    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                monthlyStatus[month] = paidAmount > 0 ? 'Paid' : 'Unpaid';
            });
            return { id: student.studentId, name: student.name, batch: student.batch, fee: student.fee || 0, monthlyStatus };
        }).sort((first, second) => String(first.id || '').localeCompare(
            String(second.id || ''),
            undefined,
            { numeric: true, sensitivity: 'base' }
        ));

        res.json({ success: true, batch, year: selectedYear, months: selectedMonths, students: reportStudents });
    } catch (error) {
        console.error('Error fetching batch payment status:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch payment status', error: error.message });
    }
});

// @route   GET /api/payments/student/:studentId/monthly-status
// @desc    Get 12-month payment status for a student
// @access  Public
router.get('/student/:studentId/monthly-status', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Find student
        const student = await Student.findOne({ studentId });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        // Find all payments for this student
        const payments = await Payment.find({ studentId }).sort({ date: -1 });
        
        // Get current year or student's admission year
        const currentYear = new Date().getFullYear();
        
        // Define month mappings
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
        
        // Build monthly status for last 12 months
        // Calculate correct order: starting from 12 months ago to current month
        const currentMonthIndex = new Date().getMonth(); // 0=January, 11=December
        const monthlyStatus = months.map((month, idx) => {
            // Determine correct year for this month in a 12-month cycle
            // Month goes from Jan(0) to Dec(11)
            // If this month's index is ahead of current month, it belongs to previous year
            let monthYear = currentYear;
            if (idx > currentMonthIndex) {
                monthYear = currentYear - 1;
            }
            
            // Check if payment exists for this specific month and year
            const monthPayments = payments.filter(p => 
                p.month === month.name && p.year === monthYear
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
            
            // Get the latest payment for this month
            const latestPayment = monthPayments[0];
            const totalPaid = monthPayments.reduce((sum, p) => sum + p.amount, 0);
            const fee = student.fee || 0;
            
            let status = 'Due';
            if (totalPaid > 0) {
                status = 'Paid';
            }
            
            return {
                month: month.name,
                monthNum: month.num,
                status,
                amount: totalPaid,
                fee: fee,
                paidDate: latestPayment.date,
                receiptNo: latestPayment.receiptNo,
                paymentMethod: latestPayment.paymentMethod
            };
        });
        
        // Calculate statistics
        const paidMonths = monthlyStatus.filter(m => m.status === 'Paid').length;
        const partialMonths = monthlyStatus.filter(m => m.status === 'Partial').length;
        const unpaidMonths = monthlyStatus.filter(m => m.status === 'Unpaid').length;
        const totalPaidAmount = monthlyStatus.reduce((sum, m) => sum + m.amount, 0);
        const totalExpected = student.fee * 12;
        const totalDue = Math.max(0, totalExpected - totalPaidAmount);
        
        res.json({
            success: true,
            student: {
                studentId: student.studentId,
                name: student.name,
                batch: student.batch,
                fee: student.fee,
                phone: student.phone,
                guardianName: student.guardianName,
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

module.exports = router;
