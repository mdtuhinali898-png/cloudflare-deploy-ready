const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const router = express.Router();
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET must be configured as a Worker secret.');
    return secret;
}

const normalizePhone = (value = '') => {
    let digits = String(value).replace(/\D/g, '');
    if (digits.startsWith('880') && digits.length === 13) digits = `0${digits.slice(3)}`;
    return digits;
};

function requireStudent(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try {
        req.studentSession = jwt.verify(token, getJwtSecret());
        next();
    } catch (_) {
        res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
    }
}

// ID + registered phone login
router.post('/login', async (req, res, next) => {
    try {
        const studentId = String(req.body.studentId || '').trim();
        const phone = normalizePhone(req.body.phone);
        if (!studentId || !phone) return res.status(400).json({ success: false, message: 'Student ID and phone number are required.' });

        const { data: student, error } = await supabase
            .from('students')
            .select('*')
            .ilike('student_id', studentId)
            .eq('status', 'Active')
            .maybeSingle();

        if (error || !student) {
            return res.status(401).json({ success: false, message: 'Student ID or registered phone number is not correct.' });
        }

        const studentPhone = normalizePhone(student.phone);
        const guardianPhone = normalizePhone(student.guardian_phone);

        if (studentPhone !== phone && guardianPhone !== phone) {
            return res.status(401).json({ success: false, message: 'Student ID or registered phone number is not correct.' });
        }

        const token = jwt.sign({ studentId: student.student_id, role: 'student' }, getJwtSecret(), { expiresIn: '8h' });
        res.json({ success: true, token, student: { name: student.name, studentId: student.student_id, batch: student.batch } });
    } catch (error) { next(error); }
});

router.get('/overview', requireStudent, async (req, res, next) => {
    try {
        const studentId = req.studentSession.studentId;

        const [
            { data: student },
            { data: resultsRaw },
            { data: paymentsRaw }
        ] = await Promise.all([
            supabase.from('students').select('*').ilike('student_id', studentId).maybeSingle(),
            supabase.from('results').select('*, exams(name, date, exam_type)').ilike('student_id', studentId).eq('status', 'published').order('created_at', { ascending: false }),
            supabase.from('payments').select('*').ilike('student_id', studentId).order('created_at', { ascending: false }).limit(12)
        ]);

        if (!student) return res.status(404).json({ success: false, message: 'Student profile was not found.' });

        const results = (resultsRaw || []).map(r => ({
            _id: r.id,
            id: r.id,
            studentId: r.student_id,
            totalMarks: Number(r.total_marks || 0),
            totalFullMarks: Number(r.total_full_marks || 0),
            percentage: Number(r.percentage || 0),
            grade: r.grade,
            gradePoint: Number(r.grade_point || 0),
            position: Number(r.position || 0),
            examId: r.exams ? {
                _id: r.exam_id,
                name: r.exams.name,
                date: r.exams.date,
                examType: r.exams.exam_type
            } : r.exam_id
        }));

        const payments = (paymentsRaw || []).map(p => ({
            _id: p.id,
            id: p.id,
            amount: Number(p.amount || 0),
            date: p.date,
            month: p.month,
            year: p.year,
            receiptNo: p.receipt_no,
            paymentMethod: p.payment_method,
            type: p.type
        }));

        const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
        const latestResult = results[0] || null;
        const averagePercentage = results.length ? results.reduce((sum, result) => sum + (result.percentage || 0), 0) / results.length : 0;

        const studentProfile = {
            _id: student.id,
            id: student.id,
            studentId: student.student_id,
            roll: student.roll,
            name: student.name,
            batch: student.batch,
            phone: student.phone,
            fee: Number(student.fee || 0),
            photo: student.photo,
            status: student.status
        };

        res.json({ success: true, student: studentProfile, results, payments, summary: { totalPaid, latestResult, averagePercentage, resultCount: results.length } });
    } catch (error) { next(error); }
});

module.exports = router;
