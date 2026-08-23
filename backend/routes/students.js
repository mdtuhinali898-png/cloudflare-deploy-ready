const express = require('express');
const router = express.Router();
const Student = require('../models/Student');

// @route   GET /api/students
// @desc    Get all students with pagination, filtering, and search
// @access  Public
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const batch = req.query.batch;
        const status = req.query.status;
        const search = req.query.search;
        
        // Build query
        let query = {};
        
        if (batch && batch !== 'all') {
            query.batch = batch;
        }
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { studentId: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { reference: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Execute query with pagination (allow large limits for reports)
        const limitValue = limit > 1000 ? 10000 : limit;
        const students = await Student.find(query)
            .sort({ createdAt: -1 })
            .limit(limitValue)
            .skip((page - 1) * limitValue);
        
        const total = await Student.countDocuments(query);
        const totalPages = Math.ceil(total / limitValue);
        
        res.json({
            success: true,
            students,
            total,
            page,
            totalPages
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, message: 'Error fetching students', error: error.message });
    }
});

// @route   GET /api/students/stats
// @desc    Get student statistics (must be before /:id route)
// @access  Public
router.get('/stats', async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const activeStudents = await Student.countDocuments({ status: 'Active' });
        const inactiveStudents = await Student.countDocuments({ status: 'Inactive' });
        
        // Count new admissions (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newAdmissions = await Student.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });
        
        res.json({
            total: totalStudents,
            active: activeStudents,
            inactive: inactiveStudents,
            newAdmission: newAdmissions
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
});

// @route   GET /api/students/stats/overview
// @desc    Get student statistics (alternative route, must be before /:id)
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const activeStudents = await Student.countDocuments({ status: 'Active' });
        const inactiveStudents = await Student.countDocuments({ status: 'Inactive' });
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newAdmissions = await Student.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });
        
        res.json({
            total: totalStudents,
            active: activeStudents,
            inactive: inactiveStudents,
            newAdmission: newAdmissions
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
});

// @route   GET /api/students/batches/list
// @desc    Get all unique batches (must be before /:id)
// @access  Public
router.get('/batches/list', async (req, res) => {
    try {
        const batches = await Student.distinct('batch');
        res.json({ success: true, batches });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: 'Error fetching batches', error: error.message });
    }
});

// @route   GET /api/students/:id
// @desc    Get single student by ID (case-insensitive)
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        // Case-insensitive exact match first
        let student = await Student.findOne({
            studentId: { $regex: `^${req.params.id}$`, $options: 'i' }
        });

        // Fallback: search by name or phone
        if (!student) {
            student = await Student.findOne({
                $or: [
                    { studentId: { $regex: req.params.id, $options: 'i' } },
                    { name:      { $regex: req.params.id, $options: 'i' } },
                    { phone:     { $regex: req.params.id, $options: 'i' } }
                ]
            });
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({ success: true, student });
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ success: false, message: 'Error fetching student', error: error.message });
    }
});

// @route   POST /api/students
// @desc    Create new student
// @access  Public
router.post('/', async (req, res) => {
    try {
        const studentData = req.body;
        
        // Check if student ID already exists
        const existingStudent = await Student.findOne({ studentId: studentData.studentId });
        if (existingStudent) {
            return res.status(400).json({ 
                success: false, 
                message: `Student with ID ${studentData.studentId} already exists` 
            });
        }
        
        // Create new student
        const student = new Student(studentData);
        await student.save();
        
        res.status(201).json({ 
            success: true, 
            message: 'Student added successfully',
            student 
        });
    } catch (error) {
        console.error('Error creating student:', error);
        res.status(500).json({ success: false, message: 'Error creating student', error: error.message });
    }
});

// @route   PUT /api/students/:id
// @desc    Update student
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        let query = { studentId: req.params.id };
        if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { $or: [{ _id: req.params.id }, { studentId: req.params.id }] };
        }

        // Check if student exists
        const existingStudent = await Student.findOne(query);
        if (!existingStudent) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // If studentId is being updated, check that it doesn't conflict with another student
        if (req.body.studentId && req.body.studentId !== existingStudent.studentId) {
            const conflict = await Student.findOne({ studentId: req.body.studentId, _id: { $ne: existingStudent._id } });
            if (conflict) {
                return res.status(400).json({ success: false, message: `Student ID ${req.body.studentId} is already in use by another student.` });
            }
        }

        const student = await Student.findByIdAndUpdate(
            existingStudent._id,
            req.body,
            { new: true, runValidators: true }
        );
        
        res.json({ 
            success: true, 
            message: 'Student updated successfully',
            student 
        });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({ success: false, message: 'Error updating student', error: error.message });
    }
});

// @route   DELETE /api/students/:id
// @desc    Delete student
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ studentId: req.params.id });
        
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Student deleted successfully' 
        });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ success: false, message: 'Error deleting student', error: error.message });
    }
});

module.exports = router;