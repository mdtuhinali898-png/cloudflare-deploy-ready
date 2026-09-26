const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatResult(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        examId: row.exam_id,
        studentId: row.student_id,
        studentName: row.student_name,
        roll: row.roll,
        batch: row.batch,
        subjects: row.subjects || [],
        totalMarks: Number(row.total_marks || 0),
        totalFullMarks: Number(row.total_full_marks || 0),
        percentage: Number(row.percentage || 0),
        grade: row.grade,
        gradePoint: Number(row.grade_point || 0),
        position: Number(row.position || 0),
        remarks: row.remarks || '',
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function calculateGrade(percentage) {
    if (percentage >= 90) return { grade: 'A+', gradePoint: 4.00 };
    if (percentage >= 80) return { grade: 'A', gradePoint: 3.75 };
    if (percentage >= 70) return { grade: 'A-', gradePoint: 3.50 };
    if (percentage >= 60) return { grade: 'B', gradePoint: 3.00 };
    if (percentage >= 50) return { grade: 'C', gradePoint: 2.00 };
    if (percentage >= 40) return { grade: 'D', gradePoint: 1.00 };
    return { grade: 'F', gradePoint: 0.00 };
}

function calculateResultSummary(subjects) {
    let totalMarks = 0;
    let totalFullMarks = 0;

    (subjects || []).forEach(sub => {
        totalMarks += Number(sub.mark || 0);
        totalFullMarks += Number(sub.fullMark || 0);
    });

    const percentage = totalFullMarks > 0 ? Math.round((totalMarks / totalFullMarks) * 100 * 100) / 100 : 0;
    const gradeInfo = calculateGrade(percentage);

    return {
        totalMarks,
        totalFullMarks,
        percentage,
        grade: gradeInfo.grade,
        gradePoint: gradeInfo.gradePoint
    };
}

async function calculatePositions(examId) {
    const { data: results, error } = await supabase
        .from('results')
        .select('id, percentage, total_marks, position')
        .eq('exam_id', examId)
        .order('percentage', { ascending: false })
        .order('total_marks', { ascending: false });

    if (error || !results || results.length === 0) return;

    let currentPos = 1;
    for (let i = 0; i < results.length; i++) {
        let pos = currentPos;
        if (i > 0 && 
            results[i].percentage === results[i-1].percentage && 
            results[i].total_marks === results[i-1].total_marks) {
            pos = results[i-1].position;
        } else {
            pos = currentPos;
            currentPos++;
        }
        results[i].position = pos;
        await supabase.from('results').update({ position: pos }).eq('id', results[i].id);
    }
}

// GET /api/results - Get all results with filters
router.get('/', async (req, res) => {
    try {
        const { examId, studentId, batch, status, page = 1, limit = 100 } = req.query;
        const limitVal = parseInt(limit) || 100;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('results').select('*', { count: 'exact' });

        if (examId) query = query.eq('exam_id', examId);
        if (studentId) query = query.eq('student_id', studentId);
        if (batch && batch !== 'all') query = query.eq('batch', batch);
        if (status && status !== 'all') query = query.eq('status', status);

        query = query.order('position', { ascending: true }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count || 0;
        res.json({
            success: true,
            data: (data || []).map(formatResult),
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal)
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch results', error: error.message });
    }
});

// GET /api/results/exam/:examId - Get all results for an exam
router.get('/exam/:examId', async (req, res) => {
    try {
        const { data: exam, error: examErr } = await supabase
            .from('exams')
            .select('*')
            .eq('id', req.params.examId)
            .maybeSingle();

        if (examErr || !exam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }

        const [
            { data: results },
            { data: students }
        ] = await Promise.all([
            supabase.from('results').select('*').eq('exam_id', req.params.examId).order('position', { ascending: true }),
            supabase.from('students').select('id, student_id, name, roll, batch, phone').eq('batch', exam.batch).eq('status', 'Active').order('roll', { ascending: true })
        ]);

        res.json({
            success: true,
            exam: {
                _id: exam.id,
                id: exam.id,
                name: exam.name,
                examType: exam.exam_type,
                questionType: exam.question_type,
                date: exam.date,
                batch: exam.batch,
                subjects: exam.subjects || [],
                status: exam.status,
                description: exam.description
            },
            results: (results || []).map(formatResult),
            students: (students || []).map(s => ({
                _id: s.id,
                studentId: s.student_id,
                name: s.name,
                roll: s.roll,
                batch: s.batch,
                phone: s.phone
            }))
        });
    } catch (error) {
        console.error('Error fetching exam results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch exam results', error: error.message });
    }
});

// GET /api/results/student/:studentId - Get all results for a student
router.get('/student/:studentId', async (req, res) => {
    try {
        const { data: results, error } = await supabase
            .from('results')
            .select('*, exams(name, exam_type, date, batch)')
            .eq('student_id', req.params.studentId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted = (results || []).map(r => ({
            ...formatResult(r),
            examId: r.exams ? {
                _id: r.exam_id,
                name: r.exams.name,
                examType: r.exams.exam_type,
                date: r.exams.date,
                batch: r.exams.batch
            } : r.exam_id
        }));

        res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student results', error: error.message });
    }
});

// POST /api/results/save-all - Bulk save results for an exam
router.post('/save-all', async (req, res) => {
    try {
        const { examId, studentResults } = req.body;

        if (!examId || !studentResults || !Array.isArray(studentResults)) {
            return res.status(400).json({ success: false, message: 'examId and studentResults array are required' });
        }

        const { data: exam } = await supabase.from('exams').select('*').eq('id', examId).maybeSingle();
        if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

        const savedResults = [];
        const errors = [];

        for (let i = 0; i < studentResults.length; i++) {
            const sr = studentResults[i];
            try {
                if (!sr.studentId || !sr.subjects || !Array.isArray(sr.subjects)) {
                    errors.push({ index: i, studentId: sr.studentId, message: 'Invalid data format' });
                    continue;
                }

                const summary = calculateResultSummary(sr.subjects);

                const resultRow = {
                    exam_id: examId,
                    student_id: String(sr.studentId).trim(),
                    student_name: sr.studentName || '',
                    roll: sr.roll ? String(sr.roll) : '',
                    batch: exam.batch,
                    subjects: sr.subjects,
                    total_marks: summary.totalMarks,
                    total_full_marks: summary.totalFullMarks,
                    percentage: summary.percentage,
                    grade: summary.grade,
                    grade_point: summary.gradePoint,
                    remarks: sr.remarks || '',
                    status: sr.status || 'draft',
                    updated_at: new Date()
                };

                const { data: saved, error } = await supabase
                    .from('results')
                    .upsert(resultRow, { onConflict: 'exam_id, student_id' })
                    .select()
                    .single();

                if (error) throw error;
                savedResults.push(formatResult(saved));
            } catch (err) {
                errors.push({ index: i, studentId: sr.studentId, message: err.message });
            }
        }

        // Calculate positions
        await calculatePositions(examId);

        const { count: totalStudents } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('batch', exam.batch)
            .eq('status', 'Active');

        res.json({
            success: true,
            message: `Saved ${savedResults.length} results${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
            data: {
                saved: savedResults.length,
                errors,
                totalStudents: totalStudents || 0,
                savedResults
            }
        });
    } catch (error) {
        console.error('Error saving results:', error);
        res.status(500).json({ success: false, message: 'Failed to save results', error: error.message });
    }
});

// PUT /api/results/:id - Update single result
router.put('/:id', async (req, res) => {
    try {
        const { subjects, remarks, status } = req.body;
        const updateData = { updated_at: new Date() };

        if (subjects) {
            const summary = calculateResultSummary(subjects);
            updateData.subjects = subjects;
            updateData.total_marks = summary.totalMarks;
            updateData.total_full_marks = summary.totalFullMarks;
            updateData.percentage = summary.percentage;
            updateData.grade = summary.grade;
            updateData.grade_point = summary.gradePoint;
        }
        if (remarks !== undefined) updateData.remarks = remarks;
        if (status) updateData.status = status;

        const { data: result, error } = await supabase
            .from('results')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error || !result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        if (status === 'published') {
            await calculatePositions(result.exam_id);
        }

        res.json({ success: true, data: formatResult(result), message: 'Result updated successfully' });
    } catch (error) {
        console.error('Error updating result:', error);
        res.status(500).json({ success: false, message: 'Failed to update result', error: error.message });
    }
});

// POST /api/results/publish/:examId - Publish all results for an exam
router.post('/publish/:examId', async (req, res) => {
    try {
        await calculatePositions(req.params.examId);

        const { error: rErr } = await supabase
            .from('results')
            .update({ status: 'published', updated_at: new Date() })
            .eq('exam_id', req.params.examId);

        if (rErr) throw rErr;

        await supabase
            .from('exams')
            .update({ status: 'published', updated_at: new Date() })
            .eq('id', req.params.examId);

        res.json({ success: true, message: 'Published results successfully' });
    } catch (error) {
        console.error('Error publishing results:', error);
        res.status(500).json({ success: false, message: 'Failed to publish results', error: error.message });
    }
});

// POST /api/results/draft/:examId - Revert all results to draft for an exam
router.post('/draft/:examId', async (req, res) => {
    try {
        const { error: rErr } = await supabase
            .from('results')
            .update({ status: 'draft', position: 0, updated_at: new Date() })
            .eq('exam_id', req.params.examId);

        if (rErr) throw rErr;

        await supabase
            .from('exams')
            .update({ status: 'draft', updated_at: new Date() })
            .eq('id', req.params.examId);

        res.json({ success: true, message: 'Reverted results to draft' });
    } catch (error) {
        console.error('Error reverting results:', error);
        res.status(500).json({ success: false, message: 'Failed to revert results', error: error.message });
    }
});

// GET /api/results/leaderboard/:examId - Top performers
router.get('/leaderboard/:examId', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const [
            { data: results },
            { data: exam }
        ] = await Promise.all([
            supabase
                .from('results')
                .select('student_id, student_name, roll, total_marks, total_full_marks, percentage, grade, position, batch')
                .eq('exam_id', req.params.examId)
                .eq('status', 'published')
                .order('position', { ascending: true })
                .limit(parseInt(limit)),
            supabase.from('exams').select('name, exam_type, date').eq('id', req.params.examId).maybeSingle()
        ]);

        res.json({
            success: true,
            exam,
            leaderboard: (results || []).map(r => ({
                studentId: r.student_id,
                studentName: r.student_name,
                roll: r.roll,
                totalMarks: Number(r.total_marks),
                totalFullMarks: Number(r.total_full_marks),
                percentage: Number(r.percentage),
                grade: r.grade,
                position: Number(r.position),
                batch: r.batch
            }))
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch leaderboard', error: error.message });
    }
});

// POST /api/results/public/verify - Public result view with verification
router.post('/public/verify', async (req, res) => {
    try {
        const { studentId, phone } = req.body;
        if (!studentId || !phone) {
            return res.status(400).json({ success: false, message: 'Student ID and phone are required' });
        }

        const cleanPhone = phone.trim();
        const cleanId = studentId.trim();

        // Verify student identity
        const { data: student } = await supabase
            .from('students')
            .select('*')
            .ilike('student_id', cleanId)
            .or(`phone.eq.${cleanPhone},guardian_phone.eq.${cleanPhone}`)
            .maybeSingle();

        if (!student) {
            return res.status(404).json({ success: false, message: 'No matching record found. Please check your Student ID and Phone number.' });
        }

        const { data: resultsRaw } = await supabase
            .from('results')
            .select('*, exams(name, exam_type, date, batch, subjects)')
            .eq('student_id', cleanId)
            .eq('status', 'published')
            .order('created_at', { ascending: false });

        if (!resultsRaw || resultsRaw.length === 0) {
            return res.json({
                success: true,
                student: {
                    studentId: student.student_id,
                    name: student.name,
                    roll: student.roll,
                    batch: student.batch,
                    phone: student.phone,
                    guardianName: student.guardian_name,
                    photo: student.photo
                },
                results: [],
                message: 'No published results found for this student.'
            });
        }

        const results = (resultsRaw || []).map(r => ({
            ...formatResult(r),
            examId: r.exams ? {
                _id: r.exam_id,
                name: r.exams.name,
                examType: r.exams.exam_type,
                date: r.exams.date,
                batch: r.exams.batch,
                subjects: r.exams.subjects || []
            } : r.exam_id
        }));

        res.json({
            success: true,
            student: {
                studentId: student.student_id,
                name: student.name,
                roll: student.roll,
                batch: student.batch,
                phone: student.phone,
                guardianName: student.guardian_name,
                guardianPhone: student.guardian_phone,
                photo: student.photo
            },
            results
        });
    } catch (error) {
        console.error('Error verifying result:', error);
        res.status(500).json({ success: false, message: 'Failed to verify result', error: error.message });
    }
});

module.exports = router;