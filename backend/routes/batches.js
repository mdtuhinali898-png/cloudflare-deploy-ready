const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const Student = require('../models/Student');
const Payment = require('../models/Payment');
const Result = require('../models/Result');
const Due = require('../models/Due');

// @route   GET /api/batches
// @desc    Get all batches
// @access  Public
router.get('/', async (req, res) => {
    try {
        const batches = await Batch.find().sort({ year: -1, name: 1 });
        res.json({ success: true, data: batches });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: 'Error fetching batches', error: error.message });
    }
});

// @route   GET /api/batches/:id
// @desc    Get single batch by ID
// @access  Public
router.get('/:id([a-fA-F0-9]{24})', async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        res.json({ success: true, data: batch });
    } catch (error) {
        console.error('Error fetching batch:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch', error: error.message });
    }
});

// @route   POST /api/batches
// @desc    Create new batch
// @access  Public
router.post('/', async (req, res) => {
    try {
        const { name, year, fee, description, status, prefix } = req.body;
        
        // Check if batch already exists
        const existingBatch = await Batch.findOne({ name });
        if (existingBatch) {
            return res.status(400).json({ success: false, message: 'Batch with this name already exists' });
        }
        
        const batch = new Batch({
            name,
            year,
            fee: fee || 1500,
            description,
            status: status || 'Active',
            prefix: prefix || ''
        });
        
        const savedBatch = await batch.save();
        res.status(201).json({ success: true, data: savedBatch, message: 'Batch created successfully' });
    } catch (error) {
        console.error('Error creating batch:', error);
        res.status(500).json({ success: false, message: 'Error creating batch', error: error.message });
    }
});

// @route   PUT /api/batches/:id
// @desc    Update batch
// @access  Public
router.put('/:id', async (req, res) => {
    try {
        const { name, year, fee, description, status, prefix } = req.body;
        
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        // Check if name is being changed to an existing batch name
        if (name !== batch.name) {
            const existingBatch = await Batch.findOne({ name });
            if (existingBatch) {
                return res.status(400).json({ success: false, message: 'Batch with this name already exists' });
            }
        }
        
        batch.name = name;
        batch.year = year;
        batch.fee = fee || 1500;
        batch.description = description;
        batch.status = status;
        batch.prefix = prefix || '';
        
        const updatedBatch = await batch.save();

        // ── Auto-sync: batch fee পরিবর্তন হলে সেই batch-এর সব student-এর fee update ──
        if (fee && fee > 0) {
            await Student.updateMany(
                { batch: updatedBatch.name },
                { $set: { fee: updatedBatch.fee } }
            );
        }

        res.json({ success: true, data: updatedBatch, message: 'Batch updated successfully' });
    } catch (error) {
        console.error('Error updating batch:', error);
        res.status(500).json({ success: false, message: 'Error updating batch', error: error.message });
    }
});

// @route   DELETE /api/batches/:id
// @desc    Delete batch
// @access  Public
router.delete('/:id', async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        // Check if batch has students
        const studentsCount = await Student.countDocuments({ batch: batch.name });
        if (studentsCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete batch "${batch.name}" because it has ${studentsCount} students. Please reassign or remove students first.` 
            });
        }
        
        await Batch.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Batch deleted successfully' });
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({ success: false, message: 'Error deleting batch', error: error.message });
    }
});

// @route   GET /api/batches/stats/overview
// @desc    Get batch statistics overview
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const batches = await Batch.find();
        const totalBatches = batches.length;
        
        const totalStudents = await Student.countDocuments();
        
        // Calculate total collection and due
        const allPayments = await Payment.find();
        const totalCollection = allPayments.reduce((sum, p) => sum + p.amount, 0);
        
        // Calculate total due
        let totalDue = 0;
        const allStudents = await Student.find({ status: 'Active' });
        
        for (const student of allStudents) {
            const studentPayments = allPayments.filter(p => p.studentId === student.studentId);
            const paidMonths = new Set(studentPayments.map(p => p.month));
            const dueMonths = Math.max(0, 3 - paidMonths.size);
            const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0);
            const totalStudentDue = (student.fee * dueMonths) - totalPaid;
            totalDue += Math.max(0, totalStudentDue);
        }
        
        res.json({
            success: true,
            data: {
                totalBatches,
                totalStudents,
                totalCollection,
                totalDue
            }
        });
    } catch (error) {
        console.error('Error fetching batch stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch statistics', error: error.message });
    }
});

// @route   POST /api/batches/transfer
// @desc    Transfer a student from one batch to another
// @access  Public
router.post('/transfer', async (req, res) => {
    try {
        const { studentId, targetBatch, transferFee, notes } = req.body;

        if (!studentId || !targetBatch) {
            return res.status(400).json({ success: false, message: 'Student ID and target batch are required' });
        }

        // Find the student
        const student = await Student.findOne({ studentId });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.batch === targetBatch) {
            return res.status(400).json({ success: false, message: 'Student is already in this batch' });
        }

        // Check if target batch exists
        const batch = await Batch.findOne({ name: targetBatch });
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Target batch not found' });
        }

        const previousBatch = student.batch;
        const previousStudentId = student.studentId;

        // Generate new student ID for target batch using batch's stored prefix
        const batchCount = await Student.countDocuments({ 
            batch: targetBatch,
            _id: { $ne: student._id } // exclude current student
        });
        const nextNumber = batchCount + 1;

        // Use the batch's stored prefix, or generate from batch name as fallback
        let prefix = batch.prefix || '';
        if (!prefix) {
            const words = targetBatch.split(' ');
            if (words.length >= 2) {
                const firstPart = words[0].substring(0, Math.min(2, words[0].length)).toUpperCase();
                const lastPart = words[words.length - 1].substring(2);
                prefix = firstPart + lastPart;
            } else {
                prefix = targetBatch.substring(0, 3).toUpperCase();
            }
        }
        const newStudentId = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

        // Update the student's batch and studentId
        student.batch = targetBatch;
        student.studentId = newStudentId;
        
        // Update fee if target batch has a different fee
        if (batch.fee && batch.fee > 0) {
            student.fee = batch.fee;
        }
        
        // Add transfer note
        const transferNote = `[Batch Transfer] From "${previousBatch}" (ID: ${previousStudentId}) → To "${targetBatch}" (ID: ${newStudentId})${transferFee ? ` | Transfer Fee: ৳${transferFee}` : ''}${notes ? ` | Notes: ${notes}` : ''} | Date: ${new Date().toLocaleDateString('en-GB')}`;
        student.notes = student.notes 
            ? student.notes + '\n' + transferNote 
            : transferNote;

        await student.save();

        // Cascade update related records so history is never lost
        try {
            await Payment.updateMany(
                { studentId: previousStudentId },
                { $set: { studentId: newStudentId } }
            );
            await Result.updateMany(
                { studentId: previousStudentId },
                { $set: { studentId: newStudentId, batch: targetBatch } }
            );
            await Due.updateMany(
                { studentId: previousStudentId },
                { $set: { studentId: newStudentId, batch: targetBatch } }
            );
        } catch (cascadeErr) {
            console.warn('Notice: Cascaded transfer update had a partial issue:', cascadeErr.message);
        }

        res.json({
            success: true,
            message: `Student transferred successfully from "${previousBatch}" to "${targetBatch}"`,
            data: {
                student,
                previousBatch,
                previousStudentId,
                newStudentId,
                targetBatch,
                transferFee: transferFee || 0
            }
        });
    } catch (error) {
        console.error('Error transferring student:', error);
        res.status(500).json({ success: false, message: 'Error transferring student', error: error.message });
    }
});

// @route   GET /api/batches/transfers/recent
// @desc    Get recent student transfers
// @access  Public
router.get('/transfers/recent', async (req, res) => {
    try {
        const students = await Student.find({
            notes: { $regex: '\\[Batch Transfer\\]' }
        })
        .select('name studentId batch phone notes updatedAt')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean();

        const transfers = [];
        students.forEach(s => {
            const lines = (s.notes || '').split('\n').filter(l => l.includes('[Batch Transfer]'));
            lines.forEach(line => {
                transfers.push({
                    studentName: s.name,
                    currentStudentId: s.studentId,
                    currentBatch: s.batch,
                    phone: s.phone,
                    rawNote: line,
                    updatedAt: s.updatedAt
                });
            });
        });

        res.json({ success: true, transfers: transfers.slice(0, 10) });
    } catch (error) {
        console.error('Error fetching recent transfers:', error);
        res.status(500).json({ success: false, message: 'Error fetching recent transfers' });
    }
});

// @route   GET /api/batches/:batchName/students
// @desc    Get students in a specific batch
// @access  Public
router.get('/:batchName/students', async (req, res) => {
    try {
        const { batchName } = req.params;
        const students = await Student.find({ batch: batchName }).sort({ studentId: 1 });
        res.json({ success: true, data: students });
    } catch (error) {
        console.error('Error fetching batch students:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch students', error: error.message });
    }
});

module.exports = router;
