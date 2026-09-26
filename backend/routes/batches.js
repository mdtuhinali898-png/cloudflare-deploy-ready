const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatBatch(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        name: row.name,
        year: row.year,
        fee: Number(row.fee || 0),
        description: row.description || '',
        prefix: row.prefix || '',
        status: row.status || 'Active',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

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
        dob: row.dob,
        gender: row.gender,
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
        notes: row.notes,
        reference: row.reference,
        photo: row.photo,
        admissionDate: row.admission_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// @route   GET /api/batches
// @desc    Get all batches
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('batches')
            .select('*')
            .order('year', { ascending: false })
            .order('name', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: (data || []).map(formatBatch) });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: 'Error fetching batches', error: error.message });
    }
});

// @route   GET /api/batches/stats/overview
// @desc    Get batch statistics overview
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const [
            { count: totalBatches },
            { count: totalStudents },
            { data: activeStudents },
            { data: allPayments }
        ] = await Promise.all([
            supabase.from('batches').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('student_id, fee').eq('status', 'Active'),
            supabase.from('payments').select('student_id, amount, month')
        ]);

        const totalCollection = (allPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Calculate total due
        let totalDue = 0;
        const paymentsByStudent = new Map();
        (allPayments || []).forEach(p => {
            const list = paymentsByStudent.get(p.student_id) || [];
            list.push(p);
            paymentsByStudent.set(p.student_id, list);
        });

        for (const student of (activeStudents || [])) {
            const studentPayments = paymentsByStudent.get(student.student_id) || [];
            const paidMonths = new Set(studentPayments.map(p => p.month));
            const dueMonths = Math.max(0, 3 - paidMonths.size);
            const totalPaid = studentPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const totalStudentDue = (Number(student.fee || 0) * dueMonths) - totalPaid;
            totalDue += Math.max(0, totalStudentDue);
        }

        res.json({
            success: true,
            data: {
                totalBatches: totalBatches || 0,
                totalStudents: totalStudents || 0,
                totalCollection,
                totalDue
            }
        });
    } catch (error) {
        console.error('Error fetching batch stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch statistics', error: error.message });
    }
});

// @route   GET /api/batches/transfers/recent
// @desc    Get recent student transfers
// @access  Public
router.get('/transfers/recent', async (req, res) => {
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('name, student_id, batch, phone, notes, updated_at')
            .ilike('notes', '%[Batch Transfer]%')
            .order('updated_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        const transfers = [];
        (students || []).forEach(s => {
            const lines = (s.notes || '').split('\n').filter(l => l.includes('[Batch Transfer]'));
            lines.forEach(line => {
                transfers.push({
                    studentName: s.name,
                    currentStudentId: s.student_id,
                    currentBatch: s.batch,
                    phone: s.phone,
                    rawNote: line,
                    updatedAt: s.updated_at
                });
            });
        });

        res.json({ success: true, transfers: transfers.slice(0, 10) });
    } catch (error) {
        console.error('Error fetching recent transfers:', error);
        res.status(500).json({ success: false, message: 'Error fetching recent transfers' });
    }
});

// @route   GET /api/batches/:batchName/next-student-id
// @desc    Preview the next student ID using the current database count
router.get('/:batchName/next-student-id', async (req, res) => {
    try {
        const batchName = decodeURIComponent(req.params.batchName);
        const { data: batch, error: batchError } = await supabase
            .from('batches')
            .select('name, prefix')
            .eq('name', batchName)
            .single();
        if (batchError || !batch) return res.status(404).json({ success: false, message: 'Batch not found' });

        const { count, error: countError } = await supabase
            .from('students')
            .select('id', { count: 'exact', head: true })
            .eq('batch', batch.name);
        if (countError) throw countError;

        let prefix = batch.prefix || '';
        if (!prefix) {
            const words = batch.name.split(' ');
            if (words.length >= 2) {
                prefix = words[0].substring(0, Math.min(2, words[0].length)).toUpperCase() + words[words.length - 1].substring(2);
            } else {
                prefix = batch.name.substring(0, 3).toUpperCase();
            }
        }

        res.json({ success: true, studentId: `${prefix}${String((count || 0) + 1).padStart(3, '0')}` });
    } catch (error) {
        console.error('Error previewing next student ID:', error);
        res.status(500).json({ success: false, message: 'Could not get the next student ID.' });
    }
});

// @route   GET /api/batches/:batchName/students
// @desc    Get students in a specific batch
// @access  Public
router.get('/:batchName/students', async (req, res) => {
    try {
        const { batchName } = req.params;
        const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('batch', batchName)
            .order('student_id', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: (data || []).map(formatStudent) });
    } catch (error) {
        console.error('Error fetching batch students:', error);
        res.status(500).json({ success: false, message: 'Error fetching batch students', error: error.message });
    }
});

// @route   GET /api/batches/:id
// @desc    Get single batch by ID (UUID or fallback)
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('batches').select('*');

        // Check if valid UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) {
            query = query.eq('id', idParam);
        } else {
            query = query.eq('name', idParam);
        }

        const { data: batch, error } = await query.single();
        if (error || !batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        res.json({ success: true, data: formatBatch(batch) });
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
        const { data: existingBatch } = await supabase
            .from('batches')
            .select('id')
            .eq('name', name)
            .single();

        if (existingBatch) {
            return res.status(400).json({ success: false, message: 'Batch with this name already exists' });
        }
        
        const newBatch = {
            name,
            year: Number(year) || new Date().getFullYear(),
            fee: Number(fee) || 1500,
            description: description || '',
            status: status || 'Active',
            prefix: prefix || ''
        };

        const { data: savedBatch, error } = await supabase
            .from('batches')
            .insert(newBatch)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, data: formatBatch(savedBatch), message: 'Batch created successfully' });
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
        const idParam = req.params.id;
        const { name, year, fee, description, status, prefix } = req.body;
        
        // Fetch current batch
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        let findQuery = supabase.from('batches').select('*');
        if (isUuid) findQuery = findQuery.eq('id', idParam);
        else findQuery = findQuery.eq('name', idParam);

        const { data: batch } = await findQuery.single();
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        // Check if name is being changed to an existing batch name
        if (name && name !== batch.name) {
            const { data: nameConflict } = await supabase
                .from('batches')
                .select('id')
                .eq('name', name)
                .neq('id', batch.id)
                .single();

            if (nameConflict) {
                return res.status(400).json({ success: false, message: 'Batch with this name already exists' });
            }
        }
        
        const updatePayload = {
            name: name || batch.name,
            year: year !== undefined ? Number(year) : batch.year,
            fee: fee !== undefined ? Number(fee) : batch.fee,
            description: description !== undefined ? description : batch.description,
            status: status || batch.status,
            prefix: prefix !== undefined ? prefix : batch.prefix,
            updated_at: new Date()
        };
        
        const { data: updatedBatch, error } = await supabase
            .from('batches')
            .update(updatePayload)
            .eq('id', batch.id)
            .select()
            .single();

        if (error) throw error;

        // Auto-sync: batch fee change updates students' fee in that batch
        if (fee && Number(fee) > 0) {
            await supabase
                .from('students')
                .update({ fee: Number(fee), updated_at: new Date() })
                .eq('batch', updatedBatch.name);
        }

        res.json({ success: true, data: formatBatch(updatedBatch), message: 'Batch updated successfully' });
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
        const idParam = req.params.id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        let findQuery = supabase.from('batches').select('*');
        if (isUuid) findQuery = findQuery.eq('id', idParam);
        else findQuery = findQuery.eq('name', idParam);

        const { data: batch } = await findQuery.single();
        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }
        
        // Check if batch has students
        const { count: studentsCount } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('batch', batch.name);

        if (studentsCount && studentsCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete batch "${batch.name}" because it has ${studentsCount} students. Please reassign or remove students first.` 
            });
        }
        
        const { error } = await supabase.from('batches').delete().eq('id', batch.id);
        if (error) throw error;

        res.json({ success: true, message: 'Batch deleted successfully' });
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({ success: false, message: 'Error deleting batch', error: error.message });
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

        // Find student
        const { data: student } = await supabase
            .from('students')
            .select('*')
            .eq('student_id', String(studentId).trim())
            .single();

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (student.batch === targetBatch) {
            return res.status(400).json({ success: false, message: 'Student is already in this batch' });
        }

        // Check target batch
        const { data: batch } = await supabase
            .from('batches')
            .select('*')
            .eq('name', targetBatch)
            .single();

        if (!batch) {
            return res.status(404).json({ success: false, message: 'Target batch not found' });
        }

        const previousBatch = student.batch;
        const previousStudentId = student.student_id;

        // Generate new student ID for target batch
        const { count: batchCount, error: countError } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('batch', targetBatch);
        if (countError) throw countError;

        const nextNumber = (batchCount || 0) + 1;

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
        const newStudentId = `${prefix}${String(nextNumber).padStart(3, '0')}`;

        // Transfer note
        const transferNote = `[Batch Transfer] From "${previousBatch}" (ID: ${previousStudentId}) → To "${targetBatch}" (ID: ${newStudentId})${transferFee ? ` | Transfer Fee: ৳${transferFee}` : ''}${notes ? ` | Notes: ${notes}` : ''} | Date: ${new Date().toLocaleDateString('en-GB')}`;
        const updatedNotes = student.notes ? student.notes + '\n' + transferNote : transferNote;

        const updateData = {
            batch: targetBatch,
            student_id: newStudentId,
            notes: updatedNotes,
            updated_at: new Date()
        };

        if (batch.fee && Number(batch.fee) > 0) {
            updateData.fee = Number(batch.fee);
        }

        const { data: updatedStudent, error: updateErr } = await supabase
            .from('students')
            .update(updateData)
            .eq('id', student.id)
            .select()
            .single();

        if (updateErr) throw updateErr;

        // Cascade update related records (payments, results, dues)
        try {
            await supabase.from('payments').update({ student_id: newStudentId }).eq('student_id', previousStudentId);
            await supabase.from('results').update({ student_id: newStudentId, batch: targetBatch }).eq('student_id', previousStudentId);
            await supabase.from('dues').update({ student_id: newStudentId, batch: targetBatch }).eq('student_id', previousStudentId);
        } catch (cascadeErr) {
            console.warn('Notice: Cascaded transfer update warning:', cascadeErr.message);
        }

        res.json({
            success: true,
            message: `Student transferred successfully from "${previousBatch}" to "${targetBatch}"`,
            data: {
                student: formatStudent(updatedStudent),
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

module.exports = router;
