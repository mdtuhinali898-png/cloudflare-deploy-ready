const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Exam = require('../models/Exam');
const Student = require('../models/Student');

// Helper function to calculate grade
function calculateGrade(percentage) {
    if (percentage >= 90) return { grade: 'A+', gradePoint: 4.00 };
    if (percentage >= 80) return { grade: 'A', gradePoint: 3.75 };
    if (percentage >= 70) return { grade: 'A-', gradePoint: 3.50 };
    if (percentage >= 60) return { grade: 'B', gradePoint: 3.00 };
    if (percentage >= 50) return { grade: 'C', gradePoint: 2.00 };
    if (percentage >= 40) return { grade: 'D', gradePoint: 1.00 };
    return { grade: 'F', gradePoint: 0.00 };
}

// Helper to calculate result summary
function calculateResultSummary(subjects) {
    let totalMarks = 0;
    let totalFullMarks = 0;
    
    subjects.forEach(sub => {
        totalMarks += sub.mark;
        totalFullMarks += sub.fullMark;
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

// GET /api/results - Get all results with filters
router.get('/', async (req, res) => {
    try {
        const { examId, studentId, batch, status, page = 1, limit = 100 } = req.query;
        const query = {};
        
        if (examId) query.examId = examId;
        if (studentId) query.studentId = studentId;
        if (batch && batch !== 'all') query.batch = batch;
        if (status && status !== 'all') query.status = status;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [results, total] = await Promise.all([
            Result.find(query)
                .sort({ examId: -1, position: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Result.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            data: results,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch results', error: error.message });
    }
});

// GET /api/results/exam/:examId - Get all results for an exam (populated for admin marksheet)
router.get('/exam/:examId', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.examId);
        if (!exam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        const results = await Result.find({ examId: req.params.examId })
            .sort({ position: 1 });
        
        // Get all students in this batch
        const students = await Student.find({ batch: exam.batch, status: 'Active' })
            .sort({ roll: 1 })
            .select('studentId name roll batch phone');
        
        res.json({
            success: true,
            exam,
            results,
            students
        });
    } catch (error) {
        console.error('Error fetching exam results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch exam results', error: error.message });
    }
});

// GET /api/results/student/:studentId - Get all results for a student (for progress tracking)
router.get('/student/:studentId', async (req, res) => {
    try {
        const results = await Result.find({ 
            studentId: req.params.studentId,
            status: 'published'
        })
        .sort({ createdAt: -1 })
        .populate('examId', 'name examType date batch');
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error fetching student results:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch student results', error: error.message });
    }
});

// POST /api/results/save-all - Save/update all results for an exam (spreadsheet-style bulk save)
router.post('/save-all', async (req, res) => {
    try {
        const { examId, studentResults } = req.body;
        
        if (!examId || !studentResults || !Array.isArray(studentResults)) {
            return res.status(400).json({ success: false, message: 'examId and studentResults array are required' });
        }
        
        const exam = await Exam.findById(examId);
        if (!exam) {
            return res.status(404).json({ success: false, message: 'Exam not found' });
        }
        
        const savedResults = [];
        const errors = [];
        
        for (let i = 0; i < studentResults.length; i++) {
            const sr = studentResults[i];
            try {
                if (!sr.studentId || !sr.subjects || !Array.isArray(sr.subjects)) {
                    errors.push({ index: i, studentId: sr.studentId, message: 'Invalid data format' });
                    continue;
                }
                
                // Validate subject count matches exam subjects
                if (sr.subjects.length !== exam.subjects.length) {
                    errors.push({ index: i, studentId: sr.studentId, message: 'Subject count mismatch' });
                    continue;
                }
                
                // Calculate summary
                const summary = calculateResultSummary(sr.subjects);
                
                const resultData = {
                    examId,
                    studentId: sr.studentId,
                    studentName: sr.studentName || '',
                    roll: sr.roll || '',
                    batch: exam.batch,
                    subjects: sr.subjects,
                    totalMarks: summary.totalMarks,
                    totalFullMarks: summary.totalFullMarks,
                    percentage: summary.percentage,
                    grade: summary.grade,
                    gradePoint: summary.gradePoint,
                    remarks: sr.remarks || '',
                    status: sr.status || 'draft'
                };
                
                // Upsert - update if exists, create if not
                const saved = await Result.findOneAndUpdate(
                    { examId, studentId: sr.studentId },
                    { $set: resultData },
                    { upsert: true, new: true, runValidators: true }
                );
                
                savedResults.push(saved);
            } catch (err) {
                errors.push({ index: i, studentId: sr.studentId, message: err.message });
            }
        }
        
        // Calculate positions
        await calculatePositions(examId);
        
        const totalStudents = exam.batch ? await Student.countDocuments({ batch: exam.batch, status: 'Active' }) : 0;
        
        res.json({
            success: true,
            message: `Saved ${savedResults.length} results${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
            data: {
                saved: savedResults.length,
                errors,
                totalStudents,
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
        const updateData = {};
        
        if (subjects) {
            // Recalculate summary
            const summary = calculateResultSummary(subjects);
            updateData.subjects = subjects;
            updateData.totalMarks = summary.totalMarks;
            updateData.totalFullMarks = summary.totalFullMarks;
            updateData.percentage = summary.percentage;
            updateData.grade = summary.grade;
            updateData.gradePoint = summary.gradePoint;
        }
        if (remarks !== undefined) updateData.remarks = remarks;
        if (status) updateData.status = status;
        
        const result = await Result.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        );
        
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }
        
        // Recalculate positions if status changed to published
        if (status === 'published') {
            await calculatePositions(result.examId);
        }
        
        res.json({ success: true, data: result, message: 'Result updated successfully' });
    } catch (error) {
        console.error('Error updating result:', error);
        res.status(500).json({ success: false, message: 'Failed to update result', error: error.message });
    }
});

// POST /api/results/publish/:examId - Publish all results for an exam
router.post('/publish/:examId', async (req, res) => {
    try {
        await calculatePositions(req.params.examId);
        
        const result = await Result.updateMany(
            { examId: req.params.examId },
            { $set: { status: 'published' } }
        );
        
        await Exam.findByIdAndUpdate(req.params.examId, { $set: { status: 'published' } });
        
        res.json({
            success: true,
            message: `Published ${result.modifiedCount} results`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error publishing results:', error);
        res.status(500).json({ success: false, message: 'Failed to publish results', error: error.message });
    }
});

// POST /api/results/draft/:examId - Revert all results to draft for an exam
router.post('/draft/:examId', async (req, res) => {
    try {
        const result = await Result.updateMany(
            { examId: req.params.examId },
            { $set: { status: 'draft', position: 0 } }
        );
        
        await Exam.findByIdAndUpdate(req.params.examId, { $set: { status: 'draft' } });
        
        res.json({
            success: true,
            message: `Reverted ${result.modifiedCount} results to draft`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Error reverting results:', error);
        res.status(500).json({ success: false, message: 'Failed to revert results', error: error.message });
    }
});

// GET /api/results/leaderboard/:examId - Top performers
router.get('/leaderboard/:examId', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const results = await Result.find({ 
            examId: req.params.examId,
            status: 'published'
        })
        .sort({ position: 1 })
        .limit(parseInt(limit))
        .select('studentId studentName roll totalMarks totalFullMarks percentage grade position batch');
        
        const exam = await Exam.findById(req.params.examId).select('name examType date');
        
        res.json({
            success: true,
            exam,
            leaderboard: results
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch leaderboard', error: error.message });
    }
});

// GET /api/results/student/:studentId/comparison - Compare student with batch average
router.get('/student/:studentId/comparison', async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.studentId });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        const results = await Result.find({
            studentId: req.params.studentId,
            status: 'published'
        })
        .sort({ createdAt: -1 })
        .populate('examId', 'name examType date');
        
        // Get batch averages for each exam
        const comparisonData = await Promise.all(results.map(async (result) => {
            const batchResults = await Result.find({
                examId: result.examId,
                status: 'published'
            });
            
            const avgPercentage = batchResults.length > 0
                ? Math.round(batchResults.reduce((sum, r) => sum + r.percentage, 0) / batchResults.length * 100) / 100
                : 0;
            
            return {
                examId: result.examId,
                examName: result.examId?.name || 'Unknown',
                examDate: result.examId?.date,
                examType: result.examId?.examType,
                studentPercentage: result.percentage,
                studentGrade: result.grade,
                studentPosition: result.position,
                batchAverage: avgPercentage,
                totalStudents: batchResults.length
            };
        }));
        
        res.json({
            success: true,
            student: { studentId: student.studentId, name: student.name, batch: student.batch },
            comparison: comparisonData
        });
    } catch (error) {
        console.error('Error fetching comparison:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch comparison', error: error.message });
    }
});

// GET /api/results/public/:studentId - Public result view (with verification)
router.post('/public/verify', async (req, res) => {
    try {
        const { studentId, phone } = req.body;
        
        if (!studentId || !phone) {
            return res.status(400).json({ success: false, message: 'Student ID and phone are required' });
        }
        
        // Verify student identity
        const student = await Student.findOne({ 
            studentId: studentId.trim(),
            $or: [
                { phone: phone.trim() },
                { guardianPhone: phone.trim() }
            ]
        });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'No matching record found. Please check your Student ID and Phone number.' });
        }
        
        // Get published results
        const results = await Result.find({
            studentId,
            status: 'published'
        })
        .sort({ createdAt: -1 })
        .populate('examId', 'name examType date batch subjects');
        
        if (results.length === 0) {
            return res.json({
                success: true,
                student: {
                    studentId: student.studentId,
                    name: student.name,
                    roll: student.roll,
                    batch: student.batch,
                    phone: student.phone,
                    guardianName: student.guardianName,
                    photo: student.photo
                },
                results: [],
                message: 'No published results found for this student.'
            });
        }
        
        // Get batch average for comparison
        const resultsWithComparison = await Promise.all(results.map(async (result) => {
            const batchResults = await Result.find({
                examId: result.examId,
                status: 'published'
            });
            
            const avgPercentage = batchResults.length > 0
                ? Math.round(batchResults.reduce((sum, r) => sum + r.percentage, 0) / batchResults.length * 100) / 100
                : 0;
            
            return {
                ...result.toObject(),
                batchAverage: avgPercentage,
                totalParticipants: batchResults.length
            };
        }));
        
        res.json({
            success: true,
            student: {
                studentId: student.studentId,
                name: student.name,
                roll: student.roll,
                batch: student.batch,
                phone: student.phone,
                guardianName: student.guardianName,
                guardianPhone: student.guardianPhone,
                photo: student.photo
            },
            results: resultsWithComparison
        });
    } catch (error) {
        console.error('Error verifying result:', error);
        res.status(500).json({ success: false, message: 'Failed to verify result', error: error.message });
    }
});

// Helper: Calculate positions for all results in an exam
async function calculatePositions(examId) {
    const results = await Result.find({ examId }).sort({ percentage: -1, totalMarks: -1 });
    
    let currentPos = 1;
    for (let i = 0; i < results.length; i++) {
        // Dense ranking: same score = same position, next gets consecutive rank (1,2,2,3 not 1,2,2,4)
        if (i > 0 && 
            results[i].percentage === results[i-1].percentage && 
            results[i].totalMarks === results[i-1].totalMarks) {
            results[i].position = results[i-1].position;
            // currentPos does NOT increment on tie
        } else {
            results[i].position = currentPos;
            currentPos++;
        }
        await results[i].save();
    }
}

module.exports = router;