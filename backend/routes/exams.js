const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatExam(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        name: row.name,
        examType: row.exam_type,
        questionType: row.question_type,
        date: row.date,
        batch: row.batch,
        subjects: row.subjects || [],
        status: row.status,
        description: row.description || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function validateSubjectMarks(subjects, questionType) {
    if (!['mcq', 'cq', 'both'].includes(questionType)) {
        return 'Please select MCQ, CQ, or both as the question format';
    }

    for (const subject of subjects) {
        const fullMark = Number(subject.fullMark);
        const mcqMark = Number(subject.mcqMark || 0);
        const cqMark = Number(subject.cqMark || 0);

        if (!subject.name || !Number.isFinite(fullMark) || fullMark < 1 || mcqMark < 0 || cqMark < 0) {
            return 'Each subject needs a valid name and mark';
        }
        if (questionType === 'mcq' && (mcqMark !== fullMark || cqMark !== 0)) {
            return `${subject.name}: MCQ mark must equal the full mark`;
        }
        if (questionType === 'cq' && (cqMark !== fullMark || mcqMark !== 0)) {
            return `${subject.name}: CQ mark must equal the full mark`;
        }
        if (questionType === 'both' && (mcqMark < 1 || cqMark < 1 || mcqMark + cqMark !== fullMark)) {
            return `${subject.name}: MCQ and CQ marks must add up to the full mark`;
        }
    }
    return null;
}

// GET /api/exams/stats/overview - Get exam statistics (must be before /:id)
router.get('/stats/overview', async (req, res) => {
    try {
        const [
            { count: total },
            { count: published },
            { count: draft }
        ] = await Promise.all([
            supabase.from('exams').select('*', { count: 'exact', head: true }),
            supabase.from('exams').select('*', { count: 'exact', head: true }).eq('status', 'published'),
            supabase.from('exams').select('*', { count: 'exact', head: true }).eq('status', 'draft')
        ]);

        res.json({
            success: true,
            data: {
                total: total || 0,
                published: published || 0,
                draft: draft || 0
            }
        });
    } catch (error) {
        console.error('Error fetching exam stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
    }
});

// GET /api/exams - Get all exams with filters
router.get('/', async (req, res) => {
    try {
        const { batch, status, examType, page = 1, limit = 50 } = req.query;
        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('exams').select('*', { count: 'exact' });

        if (batch && batch !== 'all') query = query.eq('batch', batch);
        if (status && status !== 'all') query = query.eq('status', status);
        if (examType && examType !== 'all') query = query.eq('exam_type', examType);

        query = query.order('date', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count || 0;
        res.json({
            success: true,
            data: (data || []).map(formatExam),
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal)
        });
    } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch exams', error: error.message });
    }
});

// GET /api/exams/:id - Get single exam
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const { data: exam, error } = await supabase
            .from('exams')
            .select('*')
            .eq('id', idParam)
            .maybeSingle();

        if (error || !exam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        res.json({ success: true, data: formatExam(exam) });
    } catch (error) {
        console.error('Error fetching exam:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch exam', error: error.message });
    }
});

// POST /api/exams - Create new exam
router.post('/', async (req, res) => {
    try {
        const { name, examType, questionType = 'mcq', date, batch, subjects, description } = req.body;

        if (!name || !date || !batch || !subjects || subjects.length === 0) {
            return res.status(400).json({ success: false, message: 'Name, date, batch, and subjects are required' });
        }
        const subjectError = validateSubjectMarks(subjects, questionType);
        if (subjectError) return res.status(400).json({ success: false, message: subjectError });

        const newRow = {
            name,
            exam_type: examType || 'monthly',
            question_type: questionType,
            date: new Date(date),
            batch,
            subjects,
            description: description || '',
            status: 'draft',
            created_at: new Date(),
            updated_at: new Date()
        };

        const { data: savedExam, error } = await supabase
            .from('exams')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, data: formatExam(savedExam), message: 'Exam created successfully' });
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).json({ success: false, message: 'Failed to create exam', error: error.message });
    }
});

// PUT /api/exams/:id - Update exam
router.put('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const { name, examType, questionType, date, batch, subjects, description, status } = req.body;

        const { data: currentExam } = await supabase
            .from('exams')
            .select('*')
            .eq('id', idParam)
            .maybeSingle();

        if (!currentExam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }

        const updateData = { updated_at: new Date() };
        if (name) updateData.name = name;
        if (examType) updateData.exam_type = examType;
        if (date) updateData.date = new Date(date);
        if (batch) updateData.batch = batch;

        const effectiveQuestionType = questionType || currentExam.question_type || 'mcq';
        if (subjects) {
            const subjectError = validateSubjectMarks(subjects, effectiveQuestionType);
            if (subjectError) return res.status(400).json({ success: false, message: subjectError });
            updateData.subjects = subjects;
        }
        if (questionType) {
            if (!['mcq', 'cq', 'both'].includes(questionType)) {
                return res.status(400).json({ success: false, message: 'Invalid question format' });
            }
            updateData.question_type = questionType;
        }
        if (description !== undefined) updateData.description = description;
        if (status) updateData.status = status;

        const { data: updatedExam, error } = await supabase
            .from('exams')
            .update(updateData)
            .eq('id', idParam)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data: formatExam(updatedExam), message: 'Exam updated successfully' });
    } catch (error) {
        console.error('Error updating exam:', error);
        res.status(500).json({ success: false, message: 'Failed to update exam', error: error.message });
    }
});

// DELETE /api/exams/:id - Delete exam and its results
router.delete('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const { error } = await supabase.from('exams').delete().eq('id', idParam);
        if (error) throw error;

        res.json({ success: true, message: 'Exam and associated results deleted successfully' });
    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ success: false, message: 'Failed to delete exam', error: error.message });
    }
});

module.exports = router;
