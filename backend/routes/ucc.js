const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../config/supabase');

const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());

// =================================================================
// 🛠️ HELPERS & FORMATTERS FOR 100% SCHEMA COMPATIBILITY
// =================================================================

function formatUccStudent(s) {
    if (!s) return null;
    return {
        _id: s.id,
        id: s.id,
        studentId: s.student_id,
        roll: s.roll,
        name: s.name,
        phone: s.phone,
        guardianName: s.guardian_name || '',
        guardianPhone: s.guardian_phone || '',
        batchId: s.batch_id,
        batchName: s.batch_name,
        program: s.program || 'Medical',
        branch: s.branch || 'Pabna',
        courseFee: Number(s.course_fee || 0),
        discountType: s.discount_type || 'none',
        discountValue: Number(s.discount_value || 0),
        discountAmount: Number(s.discount_amount || 0),
        discountReference: s.discount_reference || '',
        finalFee: Number(s.final_fee || 0),
        totalPaid: Number(s.total_paid || 0),
        totalDue: Number(s.total_due || 0),
        paymentStatus: s.payment_status || 'Unpaid',
        distributionOverride: !!s.distribution_override,
        overrideApprovedBy: s.override_approved_by || '',
        overrideReason: s.override_reason || '',
        email: s.email || '',
        address: s.address || '',
        photo: s.photo || '',
        notes: s.notes || '',
        status: s.status || 'Active',
        admissionDate: s.admission_date,
        createdAt: s.created_at,
        updatedAt: s.updated_at
    };
}

function formatUccPayment(p) {
    if (!p) return null;
    return {
        _id: p.id,
        id: p.id,
        receiptNo: p.receipt_no,
        studentId: p.student_id,
        studentRoll: p.student_roll,
        studentName: p.student_name,
        batchName: p.batch_name,
        amount: Number(p.amount || 0),
        paymentType: p.payment_type || 'Installment',
        paymentMethod: p.payment_method || 'Cash',
        transactionId: p.transaction_id || '',
        previousDue: Number(p.previous_due || 0),
        currentDue: Number(p.current_due || 0),
        collector: p.collector || 'Admin',
        remarks: p.remarks || '',
        paymentDate: p.payment_date,
        createdAt: p.created_at,
        updatedAt: p.updated_at
    };
}

function formatUccBatch(b, enrolledCount = 0) {
    if (!b) return null;
    return {
        _id: b.id,
        id: b.id,
        batchName: b.batch_name,
        name: b.batch_name,
        batchCode: b.batch_code || '',
        program: b.program || 'Medical',
        year: b.year || 2026,
        baseFee: Number(b.total_fee || 15000),
        courseFee: Number(b.total_fee || 15000),
        totalFee: Number(b.total_fee || 15000),
        nextRollNumber: Number(b.next_roll_number || 1),
        enrolledCount: enrolledCount,
        capacity: 60,
        status: b.status || 'Active',
        createdAt: b.created_at,
        updatedAt: b.updated_at
    };
}

function formatUccMaterial(m) {
    if (!m) return null;
    const stock = Number(m.current_stock ?? m.total_quantity ?? 0);
    const distributed = Number(m.distributed_quantity || 0);
    const total = Number(m.total_quantity ?? (stock + distributed));
    return {
        _id: m.id,
        id: m.id,
        materialCode: m.code || '',
        code: m.code || '',
        title: m.title,
        program: m.program || 'All',
        scope: 'all',
        applicableProgram: m.program || '',
        applicableBatches: [],
        stockQuantity: stock,
        currentStock: stock,
        totalReceived: total,
        distributedCount: distributed,
        paymentThreshold: Number(m.min_fee_percentage || 0),
        status: m.status || (stock === 0 ? 'Out of Stock' : (stock <= 5 ? 'Low Stock' : 'Available')),
        stockHistory: [],
        createdAt: m.created_at,
        updatedAt: m.updated_at
    };
}

function formatUccDistribution(d) {
    if (!d) return null;
    return {
        _id: d.id,
        id: d.id,
        voucherNo: d.voucher_no,
        studentId: d.student_id,
        studentRoll: d.student_roll,
        studentName: d.student_name,
        batchName: d.batch_name || '',
        materialId: d.material_id,
        materialTitle: d.material_title,
        materialName: d.material_title,
        materialCode: d.material_code,
        quantity: Number(d.quantity || 1),
        items: [{
            materialId: d.material_id,
            materialName: d.material_title,
            materialCode: d.material_code,
            quantity: Number(d.quantity || 1)
        }],
        issuedBy: d.distributed_by || 'Admin',
        distributedBy: d.distributed_by || 'Admin',
        issuedDate: d.distribution_date,
        distributionDate: d.distribution_date,
        status: d.status || 'Delivered',
        remarks: d.remarks || '',
        createdAt: d.created_at,
        updatedAt: d.updated_at
    };
}

function formatUccExam(e) {
    if (!e) return null;
    return {
        _id: e.id,
        id: e.id,
        examCode: e.name,
        title: e.name,
        name: e.name,
        batchName: e.batch_name,
        examDate: e.exam_date,
        totalMarks: Number(e.total_marks || 100),
        status: e.status || 'Scheduled',
        createdAt: e.created_at
    };
}

function formatUccResult(r) {
    if (!r) return null;
    return {
        _id: r.id,
        id: r.id,
        examId: r.exam_id,
        studentId: r.student_id,
        studentRoll: r.student_roll,
        studentName: r.student_name,
        marksObtained: Number(r.marks_obtained || 0),
        totalObtained: Number(r.marks_obtained || 0),
        totalMarks: Number(r.total_marks || 100),
        percentage: Number(r.percentage || 0),
        meritPosition: Number(r.position || 0),
        position: Number(r.position || 0),
        status: Number(r.marks_obtained || 0) > 0 ? 'Pass' : 'Fail',
        createdAt: r.created_at
    };
}

function formatUccExpense(e) {
    if (!e) return null;
    return {
        _id: e.id,
        id: e.id,
        expenseId: e.voucher_no,
        voucherNo: e.voucher_no,
        category: e.category,
        amount: Number(e.amount || 0),
        expenseDate: e.expense_date,
        date: e.expense_date,
        paymentMethod: e.payment_method || 'Cash',
        paidTo: e.paid_to || '',
        vendor: e.paid_to || '',
        purpose: e.purpose || '',
        description: e.purpose || '',
        status: 'Approved',
        createdBy: e.created_by || 'Admin',
        createdAt: e.created_at
    };
}

// Student Lookup Helper by UUID, Student ID, or Roll
async function findStudent(idOrRoll) {
    if (!idOrRoll) return null;
    const trimmed = String(idOrRoll).trim();

    if (isUUID(trimmed)) {
        const { data } = await supabase.from('ucc_students').select('*').eq('id', trimmed).maybeSingle();
        if (data) return data;
    }

    const { data: bySid } = await supabase.from('ucc_students').select('*').ilike('student_id', trimmed).maybeSingle();
    if (bySid) return bySid;

    const { data: byRoll } = await supabase.from('ucc_students').select('*').eq('roll', trimmed).maybeSingle();
    return byRoll || null;
}

// Batch Lookup Helper
async function findBatch(batchNameOrCode) {
    if (!batchNameOrCode) return null;
    const trimmed = String(batchNameOrCode).trim();

    if (isUUID(trimmed)) {
        const { data } = await supabase.from('ucc_batches').select('*').eq('id', trimmed).maybeSingle();
        if (data) return data;
    }

    const { data: byName } = await supabase.from('ucc_batches').select('*').ilike('batch_name', trimmed).maybeSingle();
    if (byName) return byName;

    const { data: byCode } = await supabase.from('ucc_batches').select('*').ilike('batch_code', trimmed).maybeSingle();
    return byCode || null;
}

// Helper to generate unique receipt numbers
async function generateReceiptNo() {
    const year = new Date().getFullYear();
    const { count } = await supabase.from('ucc_payments').select('*', { count: 'exact', head: true });
    let attempts = 0;
    while (attempts < 100) {
        const nextNum = ((count || 0) + 1 + attempts).toString().padStart(4, '0');
        const receiptNo = `UCC-REC-${year}-${nextNum}`;
        const { data } = await supabase.from('ucc_payments').select('id').eq('receipt_no', receiptNo).maybeSingle();
        if (!data) return receiptNo;
        attempts++;
    }
    return `UCC-REC-${year}-${Date.now().toString().slice(-6)}`;
}

// Helper to generate unique voucher numbers
async function generateVoucherNo() {
    const year = new Date().getFullYear();
    const { count } = await supabase.from('ucc_distributions').select('*', { count: 'exact', head: true });
    let attempts = 0;
    while (attempts < 100) {
        const nextNum = ((count || 0) + 1 + attempts).toString().padStart(4, '0');
        const voucherNo = `UCC-VOU-${year}-${nextNum}`;
        const { data } = await supabase.from('ucc_distributions').select('id').eq('voucher_no', voucherNo).maybeSingle();
        if (!data) return voucherNo;
        attempts++;
    }
    return `UCC-VOU-${year}-${Date.now().toString().slice(-6)}`;
}

// =================================================================
// 🎓 1. ADMISSION & STUDENT CREATION
// =================================================================

// Get Next Available Roll for Batch
router.get('/admission/next-roll/:batchName', async (req, res) => {
    try {
        const batchName = decodeURIComponent(req.params.batchName);
        const batch = await findBatch(batchName);

        const { data: students, error: sErr } = await supabase
            .from('ucc_students')
            .select('roll')
            .ilike('batch_name', batch ? batch.batch_name : batchName);

        if (sErr) throw sErr;

        let maxRoll = 0;
        for (const s of (students || [])) {
            const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
            if (!isNaN(num) && num > maxRoll) maxRoll = num;
        }

        const nextRoll = Math.max(maxRoll + 1, (batch ? batch.next_roll_number : 1) || 1);
        res.json({ success: true, nextRoll, batchName, studentCount: (students || []).length });
    } catch (error) {
        console.error('[NEXT-ROLL ERROR]', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admission API (New Student Registration + First Payment)
router.post('/admission', async (req, res) => {
    try {
        const {
            name, phone, guardianPhone, guardianName, batchName, program,
            courseFee, discountType, discountValue, discountReference,
            initialPayment, paymentMethod, transactionId, collector
        } = req.body;

        if (!name || !phone || !batchName) {
            return res.status(400).json({ success: false, message: 'Name, Phone, and Batch are required' });
        }

        const batch = await findBatch(batchName);
        const canonicalBatchName = batch ? batch.batch_name : batchName;

        let rollNum = 1;
        let userRollInput = req.body.roll || req.body.customRoll;

        if (userRollInput !== undefined && userRollInput !== null && String(userRollInput).trim() !== '') {
            const parsed = parseInt(String(userRollInput).trim(), 10);
            if (!isNaN(parsed) && parsed > 0) {
                rollNum = parsed;
            }
        } else {
            const { data: students } = await supabase
                .from('ucc_students')
                .select('roll')
                .ilike('batch_name', canonicalBatchName);

            let maxRoll = 0;
            for (const s of (students || [])) {
                const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
                if (!isNaN(num) && num > maxRoll) maxRoll = num;
            }
            rollNum = Math.max(maxRoll + 1, (batch ? batch.next_roll_number : 1) || 1);
        }

        const fee = Number(courseFee) || (batch ? Number(batch.total_fee) : 15000);
        let discountAmt = 0;
        const discVal = Number(discountValue) || 0;

        if (discountType === 'percentage') {
            discountAmt = Math.round((fee * discVal) / 100);
        } else if (discountType === 'fixed') {
            discountAmt = discVal;
        }

        const finalFee = Math.max(0, fee - discountAmt);
        const initialPaid = Number(initialPayment) || 0;
        const totalDue = Math.max(0, finalFee - initialPaid);

        let paymentStatus = 'Unpaid';
        if (totalDue === 0 && finalFee > 0) {
            paymentStatus = 'Full Paid';
        } else if (initialPaid > 0) {
            paymentStatus = 'Partial Paid';
        }

        const formattedRoll = String(userRollInput || rollNum).trim().padStart(3, '0');

        // Check roll duplicate in this batch
        const { data: existingRoll } = await supabase
            .from('ucc_students')
            .select('name, roll')
            .ilike('batch_name', canonicalBatchName)
            .eq('roll', formattedRoll)
            .maybeSingle();

        if (existingRoll) {
            const { data: allBatchStudents } = await supabase
                .from('ucc_students')
                .select('roll')
                .ilike('batch_name', canonicalBatchName);

            let maxRoll = 0;
            for (const s of (allBatchStudents || [])) {
                const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
                if (!isNaN(num) && num > maxRoll) maxRoll = num;
            }
            const nextAvailableRoll = (maxRoll + 1).toString().padStart(3, '0');

            return res.status(400).json({
                success: false,
                message: `Roll number ${formattedRoll} is already assigned to ${existingRoll.name} in ${canonicalBatchName}. Please use roll ${nextAvailableRoll} or higher.`,
                suggestedRoll: nextAvailableRoll
            });
        }

        let batchPrefix = 'GEN';
        if (batch && batch.batch_code) {
            batchPrefix = batch.batch_code.replace(/[-\s]/g, '').substring(0, 6).toUpperCase();
        } else {
            batchPrefix = canonicalBatchName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
        }

        let studentId = `UCC-${batchPrefix}-${formattedRoll}`;
        let idCounter = 1;
        while (true) {
            const { data: dupCheck } = await supabase.from('ucc_students').select('id').eq('student_id', studentId).maybeSingle();
            if (!dupCheck) break;
            studentId = `UCC-${batchPrefix}-${formattedRoll}-${idCounter}`;
            idCounter++;
            if (idCounter > 50) {
                studentId = `UCC-${batchPrefix}-${formattedRoll}-${Date.now().toString().slice(-4)}`;
                break;
            }
        }

        const newStudentRow = {
            student_id: studentId,
            roll: formattedRoll,
            name,
            phone,
            guardian_name: guardianName || '',
            guardian_phone: guardianPhone || '',
            batch_id: batch ? batch.id : null,
            batch_name: canonicalBatchName,
            program: program || (batch ? batch.program : 'Medical'),
            branch: 'Pabna',
            course_fee: fee,
            discount_type: discountType || 'none',
            discount_value: discVal,
            discount_amount: discountAmt,
            discount_reference: discountReference || '',
            final_fee: finalFee,
            total_paid: initialPaid,
            total_due: totalDue,
            payment_status: paymentStatus,
            admission_date: new Date()
        };

        const { data: insertedStudent, error: studErr } = await supabase
            .from('ucc_students')
            .insert(newStudentRow)
            .select()
            .single();

        if (studErr) throw studErr;

        // Update batch next roll number
        if (batch) {
            const numericRoll = parseInt(formattedRoll, 10);
            const updatedNextRoll = Math.max(Number(batch.next_roll_number || 1), (isNaN(numericRoll) ? 1 : numericRoll) + 1);
            await supabase
                .from('ucc_batches')
                .update({ next_roll_number: updatedNextRoll })
                .eq('id', batch.id);
        }

        // Create Initial Payment Receipt if initial payment > 0
        let receipt = null;
        if (initialPaid > 0) {
            const receiptNo = await generateReceiptNo();
            const paymentRow = {
                receipt_no: receiptNo,
                student_id: insertedStudent.id,
                student_roll: insertedStudent.roll,
                student_name: insertedStudent.name,
                batch_name: insertedStudent.batch_name,
                amount: initialPaid,
                payment_type: 'Admission',
                payment_method: paymentMethod || 'Cash',
                transaction_id: transactionId || '',
                previous_due: finalFee,
                current_due: totalDue,
                collector: collector || 'Admin',
                payment_date: new Date()
            };

            const { data: insertedPayment, error: payErr } = await supabase
                .from('ucc_payments')
                .insert(paymentRow)
                .select()
                .single();

            if (payErr) console.error('Error inserting initial payment:', payErr);
            receipt = formatUccPayment(insertedPayment);
        }

        res.status(201).json({
            success: true,
            message: 'Student admitted successfully',
            student: formatUccStudent(insertedStudent),
            receipt
        });
    } catch (error) {
        console.error('Error in /admission:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 👥 2. STUDENTS LIST & PROFILE
// =================================================================

// Get Students List with Search & Filters
router.get('/students', async (req, res) => {
    try {
        const { search, batch, status, paymentStatus } = req.query;
        let query = supabase.from('ucc_students').select('*');

        if (status) query = query.eq('status', status);
        if (paymentStatus) query = query.eq('payment_status', paymentStatus);
        if (batch) query = query.ilike('batch_name', batch);

        if (search) {
            const s = search.trim();
            query = query.or(`name.ilike.%${s}%,student_id.ilike.%${s}%,roll.ilike.%${s}%,phone.ilike.%${s}%,guardian_phone.ilike.%${s}%`);
        }

        query = query.order('roll', { ascending: true });
        const { data: students, error } = await query;
        if (error) throw error;

        const formatted = (students || []).map(formatUccStudent);
        res.json({ success: true, count: formatted.length, students: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single Student Profile with Full Financial & Distribution History
router.get('/students/:id', async (req, res) => {
    try {
        const student = await findStudent(req.params.id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const [paymentsRes, distRes, resultsRes] = await Promise.all([
            supabase.from('ucc_payments').select('*').eq('student_id', student.id).order('payment_date', { ascending: false }),
            supabase.from('ucc_distributions').select('*').eq('student_id', student.id).order('distribution_date', { ascending: false }),
            supabase.from('ucc_results').select('*').eq('student_id', student.id).order('created_at', { ascending: false })
        ]);

        res.json({
            success: true,
            student: formatUccStudent(student),
            payments: (paymentsRes.data || []).map(formatUccPayment),
            distributions: (distRes.data || []).map(formatUccDistribution),
            results: (resultsRes.data || []).map(formatUccResult)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Material Distribution Override Permission for Student
router.put('/students/:id/override', async (req, res) => {
    try {
        const student = await findStudent(req.params.id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const { distributionOverride, overrideApprovedBy, overrideReason } = req.body;
        const { data: updated, error } = await supabase
            .from('ucc_students')
            .update({
                distribution_override: !!distributionOverride,
                override_approved_by: overrideApprovedBy || '',
                override_reason: overrideReason || '',
                updated_at: new Date()
            })
            .eq('id', student.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, student: formatUccStudent(updated) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update UCC Student (Full Profile Edit)
router.put('/students/:id', async (req, res) => {
    try {
        const currentStudent = await findStudent(req.params.id);
        if (!currentStudent) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const {
            roll, name, phone, guardianName, guardianPhone, batchName, program, branch,
            courseFee, discountType, discountValue, discountReference, status, notes, address, email, photo
        } = req.body;

        const updateData = { updated_at: new Date() };

        if (roll && roll !== currentStudent.roll) {
            const { data: existingRoll } = await supabase
                .from('ucc_students')
                .select('id, name')
                .ilike('batch_name', batchName || currentStudent.batch_name)
                .eq('roll', roll)
                .neq('id', currentStudent.id)
                .maybeSingle();

            if (existingRoll) {
                return res.status(400).json({ success: false, message: `Roll ${roll} is already assigned to another student (${existingRoll.name}).` });
            }
            updateData.roll = roll;
        }

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (guardianName !== undefined) updateData.guardian_name = guardianName;
        if (guardianPhone !== undefined) updateData.guardian_phone = guardianPhone;
        if (program) updateData.program = program;
        if (branch) updateData.branch = branch;
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;
        if (address !== undefined) updateData.address = address;
        if (email !== undefined) updateData.email = email;
        if (photo !== undefined) updateData.photo = photo;

        if (batchName && batchName !== currentStudent.batch_name) {
            updateData.batch_name = batchName;
            const bDoc = await findBatch(batchName);
            if (bDoc) updateData.batch_id = bDoc.id;
        }

        if (courseFee !== undefined || discountType !== undefined || discountValue !== undefined) {
            const fee = courseFee !== undefined ? Number(courseFee) : Number(currentStudent.course_fee || 0);
            const dType = discountType !== undefined ? discountType : (currentStudent.discount_type || 'none');
            const dVal = discountValue !== undefined ? Number(discountValue) : Number(currentStudent.discount_value || 0);

            let discountAmt = 0;
            if (dType === 'percentage') {
                discountAmt = Math.round((fee * dVal) / 100);
            } else if (dType === 'fixed') {
                discountAmt = dVal;
            }

            const finalFee = Math.max(0, fee - discountAmt);
            const totalPaid = Number(currentStudent.total_paid || 0);
            const totalDue = Math.max(0, finalFee - totalPaid);

            let paymentStatus = 'Unpaid';
            if (totalDue === 0 && finalFee > 0) {
                paymentStatus = 'Full Paid';
            } else if (totalPaid > 0) {
                paymentStatus = 'Partial Paid';
            }

            updateData.course_fee = fee;
            updateData.discount_type = dType;
            updateData.discount_value = dVal;
            updateData.discount_amount = discountAmt;
            if (discountReference !== undefined) updateData.discount_reference = discountReference;
            updateData.final_fee = finalFee;
            updateData.total_due = totalDue;
            updateData.payment_status = paymentStatus;
        } else if (discountReference !== undefined) {
            updateData.discount_reference = discountReference;
        }

        const { data: updated, error } = await supabase
            .from('ucc_students')
            .update(updateData)
            .eq('id', currentStudent.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Student profile updated successfully',
            student: formatUccStudent(updated)
        });
    } catch (error) {
        console.error('Error updating UCC student:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Toggle UCC Student Status
router.patch('/students/:id/status', async (req, res) => {
    try {
        const student = await findStudent(req.params.id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const newStatus = req.body.status || (student.status === 'Active' ? 'Inactive' : 'Active');
        const { data: updated, error } = await supabase
            .from('ucc_students')
            .update({ status: newStatus, updated_at: new Date() })
            .eq('id', student.id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: `Student status changed to ${newStatus}`,
            status: newStatus,
            student: formatUccStudent(updated)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Student (for Batch-wise Report edit modal)
router.patch('/students/:roll', async (req, res) => {
    try {
        const student = await findStudent(req.params.roll);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const { name, phone, guardianPhone, fee, batchId } = req.body;
        const updateData = { updated_at: new Date() };

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (guardianPhone !== undefined) updateData.guardian_phone = guardianPhone;
        if (fee !== undefined) {
            const numFee = Number(fee);
            updateData.final_fee = numFee;
            updateData.course_fee = numFee;
            updateData.total_due = Math.max(0, numFee - Number(student.total_paid || 0));
        }
        if (batchId) {
            const batch = await findBatch(batchId);
            if (batch) {
                updateData.batch_id = batch.id;
                updateData.batch_name = batch.batch_name;
            }
        }

        const { data: updated, error } = await supabase
            .from('ucc_students')
            .update(updateData)
            .eq('id', student.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, student: formatUccStudent(updated) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete UCC Student (with cascading records cleanup)
router.delete('/students/:id', async (req, res) => {
    try {
        const student = await findStudent(req.params.id);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        await Promise.all([
            supabase.from('ucc_payments').delete().eq('student_id', student.id),
            supabase.from('ucc_distributions').delete().eq('student_id', student.id),
            supabase.from('ucc_results').delete().eq('student_id', student.id)
        ]);

        const { error } = await supabase.from('ucc_students').delete().eq('id', student.id);
        if (error) throw error;

        res.json({
            success: true,
            message: `Student ${student.name} (Roll: ${student.roll}) deleted successfully.`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 💰 3. PAYMENTS & DAILY STATEMENT
// =================================================================

// Collect Installment Payment
router.post('/payments', async (req, res) => {
    try {
        const { studentId, amount, paymentMethod, transactionId, collector, remarks, additionalDiscount } = req.body;

        const student = await findStudent(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const payAmount = Number(amount);
        if (isNaN(payAmount) || payAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid payment amount' });
        }

        const addDisc = Number(additionalDiscount) || 0;
        let newDiscountAmt = Number(student.discount_amount || 0);
        let newFinalFee = Number(student.final_fee || 0);

        if (addDisc > 0) {
            newDiscountAmt += addDisc;
            newFinalFee = Math.max(0, Number(student.course_fee || 0) - newDiscountAmt);
        }

        const previousDue = Number(student.total_due || 0);
        const currentDue = Math.max(0, previousDue - payAmount - addDisc);
        const newTotalPaid = Number(student.total_paid || 0) + payAmount;

        let paymentStatus = 'Unpaid';
        if (currentDue === 0) {
            paymentStatus = 'Full Paid';
        } else if (newTotalPaid > 0) {
            paymentStatus = 'Partial Paid';
        }

        // Update Student Ledger
        const { data: updatedStudent, error: studErr } = await supabase
            .from('ucc_students')
            .update({
                total_paid: newTotalPaid,
                total_due: currentDue,
                payment_status: paymentStatus,
                discount_amount: newDiscountAmt,
                final_fee: newFinalFee,
                updated_at: new Date()
            })
            .eq('id', student.id)
            .select()
            .single();

        if (studErr) throw studErr;

        // Create Payment Receipt
        const receiptNo = await generateReceiptNo();
        const paymentRow = {
            receipt_no: receiptNo,
            student_id: student.id,
            student_roll: student.roll,
            student_name: student.name,
            batch_name: student.batch_name,
            amount: payAmount,
            payment_type: 'Installment',
            payment_method: paymentMethod || 'Cash',
            transaction_id: transactionId || '',
            previous_due: previousDue,
            current_due: currentDue,
            collector: collector || 'Admin',
            remarks: remarks || (addDisc > 0 ? `Additional discount: ৳${addDisc}` : ''),
            payment_date: new Date()
        };

        const { data: payment, error: payErr } = await supabase
            .from('ucc_payments')
            .insert(paymentRow)
            .select()
            .single();

        if (payErr) throw payErr;

        res.status(201).json({
            success: true,
            message: 'Payment collected successfully',
            payment: formatUccPayment(payment),
            student: formatUccStudent(updatedStudent)
        });
    } catch (error) {
        console.error('Error in /payments:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Payment Receipt by Receipt Number
router.get('/payments/receipt/:receiptNo', async (req, res) => {
    try {
        let receiptParam = (req.params.receiptNo || '').trim();

        let { data: payment } = await supabase
            .from('ucc_payments')
            .select('*')
            .ilike('receipt_no', receiptParam)
            .maybeSingle();

        if (!payment && receiptParam.includes('UCC-')) {
            const student = await findStudent(receiptParam);
            if (student) {
                const { data: latestPay } = await supabase
                    .from('ucc_payments')
                    .select('*')
                    .eq('student_id', student.id)
                    .order('payment_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                payment = latestPay;
            }
        }

        if (!payment && req.query.roll) {
            const { data: byRoll } = await supabase
                .from('ucc_payments')
                .select('*')
                .eq('student_roll', req.query.roll)
                .order('payment_date', { ascending: false })
                .limit(1)
                .maybeSingle();
            payment = byRoll;
        }

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Receipt not found' });
        }

        let student = await findStudent(payment.student_id);
        if (!student && payment.student_roll) {
            student = await findStudent(payment.student_roll);
        }

        // Fetch full payment history for this student
        let history = [];
        if (student) {
            const { data: hList } = await supabase
                .from('ucc_payments')
                .select('*')
                .eq('student_id', student.id)
                .order('payment_date', { ascending: true });
            history = hList || [];
        } else if (payment.student_roll) {
            const { data: hList } = await supabase
                .from('ucc_payments')
                .select('*')
                .eq('student_roll', payment.student_roll)
                .order('payment_date', { ascending: true });
            history = hList || [];
        }

        const targetBatchName = (student && student.batch_name) || payment.batch_name || '';
        let batchBaseFee = 0;
        if (targetBatchName) {
            const bDoc = await findBatch(targetBatchName);
            if (bDoc && bDoc.total_fee) batchBaseFee = Number(bDoc.total_fee);
        }

        let courseFee = batchBaseFee || (student && Number(student.course_fee) > 0 ? Number(student.course_fee) : 0);
        if (!courseFee && student) {
            courseFee = Number(student.total_paid || 0) + Number(student.total_due || 0) + Number(student.discount_amount || 0);
        }
        if (!courseFee) {
            const historyTotal = history.reduce((sum, h) => sum + Number(h.amount || 0), 0);
            courseFee = (historyTotal > 0 ? historyTotal : Number(payment.amount || 0)) + Number(payment.current_due || 0);
        }

        const discountAmount = student ? Number(student.discount_amount || 0) : 0;
        const finalFee = student ? (Number(student.final_fee) || (courseFee - discountAmount)) : (courseFee - discountAmount);

        const installmentSum = history
            .filter(h => !h.payment_type || !h.payment_type.toLowerCase().includes('admission'))
            .reduce((sum, h) => sum + Number(h.amount || 0), 0);

        const totalDue = student ? Number(student.total_due || 0) : Number(payment.current_due ?? Math.max(0, finalFee - installmentSum));
        const totalPaid = Math.max(0, finalFee - totalDue);

        const hasAdmission = history.some(h => (h.payment_type && h.payment_type.toLowerCase().includes('admission')));
        if (!hasAdmission) {
            const initialPaidAmt = Math.max(0, finalFee - totalDue - installmentSum);
            if (initialPaidAmt > 0) {
                history.unshift({
                    receipt_no: `UCC-ADM-${student ? student.roll : payment.student_roll}`,
                    payment_date: (student && student.admission_date) || payment.payment_date,
                    payment_type: 'Admission',
                    payment_method: 'Cash',
                    amount: initialPaidAmt,
                    transaction_id: ''
                });
            }
        }

        res.json({
            success: true,
            payment: {
                receiptNo: payment.receipt_no,
                date: payment.payment_date,
                paymentMethod: payment.payment_method,
                amount: Number(payment.amount || 0),
                paymentType: payment.payment_type,
                previousDue: Number(payment.previous_due || 0),
                currentDue: Number(payment.current_due || 0),
                transactionId: payment.transaction_id || '',
                collector: payment.collector || 'Admin',
                studentRoll: payment.student_roll,
                studentName: payment.student_name,
                batchName: targetBatchName,
                totalFee: courseFee,
                discount: discountAmount,
                finalFee: finalFee,
                paid: Number(payment.amount || 0),
                totalPaid: totalPaid,
                due: totalDue,
                status: totalDue === 0 ? 'Paid' : 'Partial'
            },
            student: student ? {
                roll: student.roll,
                name: student.name,
                guardian: student.guardian_name || student.guardian_phone || '',
                batch: student.batch_name,
                phone: student.phone,
                status: student.status,
                courseFee: courseFee,
                discountAmount: discountAmount,
                finalFee: finalFee,
                totalPaid: totalPaid,
                totalDue: totalDue
            } : {
                roll: payment.student_roll,
                name: payment.student_name,
                guardian: '',
                batch: targetBatchName,
                phone: '',
                status: 'Active',
                courseFee: courseFee,
                discountAmount: discountAmount,
                finalFee: finalFee,
                totalPaid: totalPaid,
                totalDue: totalDue
            },
            history: history.map(h => ({
                receiptNo: h.receipt_no,
                date: h.payment_date,
                type: h.payment_type,
                method: h.payment_method,
                amount: Number(h.amount || 0),
                trxId: h.transaction_id || ''
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Daily Collection Statement Report
router.get('/payments/daily-statement', async (req, res) => {
    try {
        const { startDate, endDate, collector, paymentMethod } = req.query;
        let query = supabase.from('ucc_payments').select('*');

        if (startDate || endDate) {
            if (startDate) query = query.gte('payment_date', new Date(startDate).toISOString());
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query = query.lte('payment_date', end.toISOString());
            }
        } else {
            const startToday = new Date();
            startToday.setHours(0, 0, 0, 0);
            const endToday = new Date();
            endToday.setHours(23, 59, 59, 999);
            query = query.gte('payment_date', startToday.toISOString()).lte('payment_date', endToday.toISOString());
        }

        if (collector) query = query.eq('collector', collector);
        if (paymentMethod) query = query.eq('payment_method', paymentMethod);

        query = query.order('payment_date', { ascending: false });
        const { data: payments, error } = await query;
        if (error) throw error;

        const totalCollected = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

        res.json({
            success: true,
            summary: {
                totalCollected,
                transactionCount: (payments || []).length
            },
            payments: (payments || []).map(formatUccPayment)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 📚 4. MATERIAL INVENTORY & DISTRIBUTION
// =================================================================

// Get All Materials Catalog
router.get('/materials', async (req, res) => {
    try {
        const { data: materials, error } = await supabase
            .from('ucc_materials')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        const formatted = (materials || []).map(formatUccMaterial);
        res.json({ success: true, count: formatted.length, materials: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add New Material to Catalog
router.post('/materials', async (req, res) => {
    try {
        const { materialCode, title, program, stockQuantity, paymentThreshold } = req.body;
        const qty = Number(stockQuantity) || 100;
        const matRow = {
            code: materialCode || `MAT-${Date.now().toString().slice(-4)}`,
            title,
            program: program || 'Medical',
            total_quantity: qty,
            distributed_quantity: 0,
            current_stock: qty,
            min_fee_percentage: Number(paymentThreshold) || 0,
            status: 'Available'
        };

        const { data: inserted, error } = await supabase
            .from('ucc_materials')
            .insert(matRow)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, material: formatUccMaterial(inserted) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Material
router.delete('/materials/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('ucc_materials').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true, message: 'Material deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Material
router.put('/materials/:id', async (req, res) => {
    try {
        const { title, program, stockQuantity, paymentThreshold, status } = req.body;
        const updateData = { updated_at: new Date() };

        if (title) updateData.title = title;
        if (program) updateData.program = program;
        if (stockQuantity !== undefined) {
            updateData.current_stock = Number(stockQuantity);
        }
        if (paymentThreshold !== undefined) updateData.min_fee_percentage = Number(paymentThreshold);
        if (status) updateData.status = status;

        const { data: updated, error } = await supabase
            .from('ucc_materials')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, material: formatUccMaterial(updated) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Add Stock Entry (Restock)
router.post('/materials/:id/stock', async (req, res) => {
    try {
        const { quantity } = req.body;
        const qty = Number(quantity);
        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
        }

        const { data: material, error: fErr } = await supabase
            .from('ucc_materials')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (fErr || !material) return res.status(404).json({ success: false, message: 'Material not found' });

        const newStock = Number(material.current_stock || 0) + qty;
        const newTotal = Number(material.total_quantity || 0) + qty;
        const status = newStock === 0 ? 'Out of Stock' : (newStock <= 5 ? 'Low Stock' : 'Available');

        const { data: updated, error: uErr } = await supabase
            .from('ucc_materials')
            .update({ current_stock: newStock, total_quantity: newTotal, status, updated_at: new Date() })
            .eq('id', material.id)
            .select()
            .single();

        if (uErr) throw uErr;

        res.json({
            success: true,
            message: `${qty} units added to stock`,
            stockQuantity: updated.current_stock,
            totalReceived: updated.total_quantity,
            distributedCount: updated.distributed_quantity,
            status: updated.status
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Stock History for a Material
router.get('/materials/:id/stock', async (req, res) => {
    try {
        const { data: material, error } = await supabase
            .from('ucc_materials')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !material) return res.status(404).json({ success: false, message: 'Material not found' });

        res.json({
            success: true,
            title: material.title,
            currentStock: material.current_stock,
            stockQuantity: material.current_stock,
            totalReceived: material.total_quantity || 0,
            distributedCount: material.distributed_quantity || 0,
            status: material.status,
            history: []
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Check Student Eligibility for Material Distribution
router.get('/distribution/check-eligibility/:studentId', async (req, res) => {
    try {
        const student = await findStudent(req.params.studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const [distRes, matRes] = await Promise.all([
            supabase.from('ucc_distributions').select('material_id').eq('student_id', student.id),
            supabase.from('ucc_materials').select('*')
        ]);

        const issuedItemIds = (distRes.data || []).map(d => String(d.material_id)).filter(Boolean);
        const eligibleMaterialIds = (matRes.data || []).map(m => String(m.id));

        res.json({
            success: true,
            student: formatUccStudent(student),
            isEligible: Number(student.total_due || 0) === 0 || student.distribution_override === true,
            hasDue: Number(student.total_due || 0) > 0,
            distributionOverride: !!student.distribution_override,
            issuedItemIds,
            eligibleMaterialIds
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Issue Material Voucher
router.post('/distribution/issue', async (req, res) => {
    try {
        const { studentId, items, hasOverride, overrideReason, issuedBy } = req.body;

        const student = await findStudent(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (!items || !items.length) {
            return res.status(400).json({ success: false, message: 'No items selected for distribution' });
        }

        const voucherNo = await generateVoucherNo();
        const distRows = [];

        for (const item of items) {
            let matTitle = item.materialName || item.title || 'Study Material';
            let matCode = item.materialCode || item.code || '';

            if (item.materialId && isUUID(item.materialId)) {
                const { data: mData } = await supabase.from('ucc_materials').select('*').eq('id', item.materialId).maybeSingle();
                if (mData) {
                    matTitle = mData.title;
                    matCode = mData.code || '';
                    const newStock = Math.max(0, Number(mData.current_stock || 0) - 1);
                    const newDist = Number(mData.distributed_quantity || 0) + 1;
                    const status = newStock === 0 ? 'Out of Stock' : (newStock <= 5 ? 'Low Stock' : 'Available');
                    await supabase.from('ucc_materials').update({
                        current_stock: newStock,
                        distributed_quantity: newDist,
                        status
                    }).eq('id', mData.id);
                }
            }

            distRows.push({
                voucher_no: voucherNo,
                student_id: student.id,
                student_roll: student.roll,
                student_name: student.name,
                material_id: (item.materialId && isUUID(item.materialId)) ? item.materialId : null,
                material_title: matTitle,
                material_code: matCode,
                quantity: Number(item.quantity || 1),
                distributed_by: issuedBy || 'Admin',
                distribution_date: new Date(),
                status: 'Delivered',
                remarks: overrideReason || ''
            });
        }

        const { data: insertedList, error: dErr } = await supabase
            .from('ucc_distributions')
            .insert(distRows)
            .select();

        if (dErr) throw dErr;

        res.status(201).json({
            success: true,
            message: 'Materials issued successfully',
            distribution: formatUccDistribution(insertedList ? insertedList[0] : null)
        });
    } catch (error) {
        console.error('Error in /distribution/issue:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 📑 5. BATCHES
// =================================================================

// Get Batches
router.get('/batches', async (req, res) => {
    try {
        const { data: batches, error } = await supabase
            .from('ucc_batches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get student counts per batch
        const { data: students } = await supabase.from('ucc_students').select('batch_name');
        const countMap = {};
        (students || []).forEach(s => {
            const b = (s.batch_name || '').toLowerCase().trim();
            countMap[b] = (countMap[b] || 0) + 1;
        });

        const formatted = (batches || []).map(b => formatUccBatch(b, countMap[(b.batch_name || '').toLowerCase().trim()] || 0));
        res.json({ success: true, count: formatted.length, batches: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create Batch
router.post('/batches', async (req, res) => {
    try {
        const { batchCode, batchName, program, baseFee, nextRollNumber, startingRollNumber } = req.body;
        const initialRoll = Number(nextRollNumber || startingRollNumber) || 1;

        const row = {
            batch_code: batchCode || `BAT-${Date.now().toString().slice(-4)}`,
            batch_name: batchName,
            program: program || 'Medical',
            year: new Date().getFullYear(),
            total_fee: Number(baseFee) || 15000,
            next_roll_number: initialRoll,
            status: 'Active'
        };

        const { data: batch, error } = await supabase
            .from('ucc_batches')
            .insert(row)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, batch: formatUccBatch(batch, 0) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Batch
router.put('/batches/:id', async (req, res) => {
    try {
        const { batchCode, batchName, program, baseFee, status, nextRollNumber, startingRollNumber } = req.body;
        const updateData = { updated_at: new Date() };

        if (batchCode) updateData.batch_code = batchCode;
        if (batchName) updateData.batch_name = batchName;
        if (program) updateData.program = program;
        if (baseFee !== undefined) updateData.total_fee = Number(baseFee);
        if (status) updateData.status = status;
        if (nextRollNumber !== undefined || startingRollNumber !== undefined) {
            updateData.next_roll_number = Number(nextRollNumber || startingRollNumber) || 1;
        }

        const { data: batch, error } = await supabase
            .from('ucc_batches')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, batch: formatUccBatch(batch) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Batch (CASCADE: Deletes batch + all students + payments + results + distributions)
router.delete('/batches/:id', async (req, res) => {
    try {
        const { data: batch } = await supabase.from('ucc_batches').select('*').eq('id', req.params.id).maybeSingle();
        if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

        const batchName = batch.batch_name;

        // 1. Find all students in this batch
        const { data: students } = await supabase
            .from('ucc_students')
            .select('id')
            .ilike('batch_name', batchName);

        const studentIds = (students || []).map(s => s.id);

        if (studentIds.length > 0) {
            await Promise.all([
                supabase.from('ucc_payments').delete().in('student_id', studentIds),
                supabase.from('ucc_distributions').delete().in('student_id', studentIds),
                supabase.from('ucc_results').delete().in('student_id', studentIds)
            ]);
            await supabase.from('ucc_students').delete().in('id', studentIds);
        }

        await supabase.from('ucc_batches').delete().eq('id', batch.id);

        res.json({
            success: true,
            message: `Batch "${batchName}" and all related data deleted successfully`,
            deleted: { batch: batchName, students: studentIds.length }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 📝 6. EXAMS & RESULTS
// =================================================================

// Get All Exams
router.get('/exams', async (req, res) => {
    try {
        const { data: exams, error } = await supabase
            .from('ucc_exams')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        const formatted = (exams || []).map(formatUccExam);
        res.json({ success: true, count: formatted.length, exams: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single Exam
router.get('/exams/:id', async (req, res) => {
    try {
        const { data: exam, error } = await supabase
            .from('ucc_exams')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !exam) return res.status(404).json({ success: false, message: 'Exam not found' });
        res.json({ success: true, exam: formatUccExam(exam) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create Exam
router.post('/exams', async (req, res) => {
    try {
        const { title, name, batchName, totalMarks, examDate, status } = req.body;
        const examRow = {
            name: title || name || `Exam ${new Date().toLocaleDateString()}`,
            batch_name: batchName || 'All',
            exam_date: examDate ? new Date(examDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            total_marks: Number(totalMarks) || 100,
            status: status || 'Scheduled'
        };

        const { data: exam, error } = await supabase
            .from('ucc_exams')
            .insert(examRow)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, exam: formatUccExam(exam) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Exam
router.put('/exams/:id', async (req, res) => {
    try {
        const { title, name, batchName, totalMarks, examDate, status } = req.body;
        const updateData = {};

        if (title || name) updateData.name = title || name;
        if (batchName) updateData.batch_name = batchName;
        if (totalMarks !== undefined) updateData.total_marks = Number(totalMarks);
        if (examDate) updateData.exam_date = new Date(examDate).toISOString().split('T')[0];
        if (status) updateData.status = status;

        const { data: exam, error } = await supabase
            .from('ucc_exams')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, exam: formatUccExam(exam) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Exam
router.delete('/exams/:id', async (req, res) => {
    try {
        await supabase.from('ucc_results').delete().eq('exam_id', req.params.id);
        const { error } = await supabase.from('ucc_exams').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Exam deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Entry Marks & Automatically Calculate Merit List Positions
router.post('/results/mark-entry', async (req, res) => {
    try {
        const { examId, markEntries } = req.body;
        const { data: exam } = await supabase.from('ucc_exams').select('*').eq('id', examId).maybeSingle();
        if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

        for (const entry of (markEntries || [])) {
            const student = await findStudent(entry.studentId);
            if (student) {
                const isAbsent = entry.status === 'Absent';
                const obtained = isAbsent ? 0 : Number(entry.totalObtained || 0);
                const total = Number(exam.total_marks || 100);
                const percentage = isAbsent ? 0 : Math.round((obtained / total) * 100);

                // Upsert result row
                const resRow = {
                    exam_id: exam.id,
                    student_id: student.id,
                    student_roll: student.roll,
                    student_name: student.name,
                    marks_obtained: obtained,
                    total_marks: total,
                    percentage: percentage,
                    position: 0
                };

                const { data: existing } = await supabase
                    .from('ucc_results')
                    .select('id')
                    .eq('exam_id', exam.id)
                    .eq('student_id', student.id)
                    .maybeSingle();

                if (existing) {
                    await supabase.from('ucc_results').update(resRow).eq('id', existing.id);
                } else {
                    await supabase.from('ucc_results').insert(resRow);
                }
            }
        }

        // Fetch all results for exam to calculate dense ranking
        const { data: allResults } = await supabase
            .from('ucc_results')
            .select('*')
            .eq('exam_id', exam.id);

        const list = allResults || [];
        const present = list.filter(r => Number(r.marks_obtained || 0) > 0).sort((a, b) => Number(b.marks_obtained) - Number(a.marks_obtained));
        const absent = list.filter(r => Number(r.marks_obtained || 0) <= 0);

        let rank = 1;
        for (let idx = 0; idx < present.length; idx++) {
            const item = present[idx];
            let assignedRank = rank;
            if (idx > 0 && Number(item.marks_obtained) === Number(present[idx - 1].marks_obtained)) {
                assignedRank = present[idx - 1].position;
            } else {
                rank++;
            }
            item.position = assignedRank;
            await supabase.from('ucc_results').update({ position: assignedRank }).eq('id', item.id);
        }

        for (const item of absent) {
            await supabase.from('ucc_results').update({ position: 0 }).eq('id', item.id);
        }

        res.json({ success: true, message: 'Marks saved and Merit List generated successfully', count: list.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Merit List for an Exam
router.get('/results/merit-list/:examId', async (req, res) => {
    try {
        const { data: exam } = await supabase.from('ucc_exams').select('*').eq('id', req.params.examId).maybeSingle();
        if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

        const { data: results, error } = await supabase
            .from('ucc_results')
            .select('*')
            .eq('exam_id', exam.id)
            .order('position', { ascending: true });

        if (error) throw error;

        // Fetch student phones
        const studentIds = (results || []).map(r => r.student_id);
        const { data: students } = await supabase.from('ucc_students').select('id, phone, guardian_phone').in('id', studentIds);
        const phoneMap = new Map((students || []).map(s => [s.id, s]));

        const meritList = (results || []).map(r => {
            const sInfo = phoneMap.get(r.student_id) || {};
            return {
                ...formatUccResult(r),
                studentId: {
                    _id: r.student_id,
                    phone: sInfo.phone || '',
                    guardianPhone: sInfo.guardian_phone || ''
                }
            };
        });

        res.json({ success: true, exam: formatUccExam(exam), meritList });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 📊 7. REPORTS & ANALYTICS
// =================================================================

router.get('/reports', async (req, res) => {
    try {
        const { from, to, batch, method } = req.query;

        let sQuery = supabase.from('ucc_students').select('*').order('roll', { ascending: true });
        if (batch && batch !== 'all') sQuery = sQuery.ilike('batch_name', batch);
        const { data: students } = await sQuery;

        let pQuery = supabase.from('ucc_payments').select('*').order('payment_date', { ascending: false });
        if (from) pQuery = pQuery.gte('payment_date', new Date(from).toISOString());
        if (to) {
            const end = new Date(to);
            end.setHours(23, 59, 59, 999);
            pQuery = pQuery.lte('payment_date', end.toISOString());
        }
        if (method && method !== 'all') pQuery = pQuery.eq('payment_method', method);
        if (batch && batch !== 'all') pQuery = pQuery.ilike('batch_name', batch);
        const { data: payments } = await pQuery;

        const [batchesRes, materialsRes, distRes] = await Promise.all([
            supabase.from('ucc_batches').select('*').order('created_at', { ascending: false }),
            supabase.from('ucc_materials').select('*').order('created_at', { ascending: false }),
            supabase.from('ucc_distributions').select('*').order('distribution_date', { ascending: false })
        ]);

        const allStudents = students || [];
        const allPayments = payments || [];
        const allBatches = batchesRes.data || [];
        const allMaterials = materialsRes.data || [];
        const allDistributions = distRes.data || [];

        // Material stats
        const materialStats = allMaterials.map(m => {
            const eligibleStudents = allStudents.filter(s => Number(s.total_due || 0) === 0 || s.distribution_override === true);
            const issuedCount = allDistributions.filter(d => d.material_id === m.id).reduce((sum, d) => sum + Number(d.quantity || 1), 0);
            return {
                _id: m.id,
                title: m.title,
                category: m.program || 'All',
                batch: 'All batches',
                limit: Number(m.min_fee_percentage || 0),
                eligible: eligibleStudents.length,
                issued: issuedCount,
                pending: Math.max(0, eligibleStudents.length - issuedCount),
                fulfillment: eligibleStudents.length ? Math.round(issuedCount / eligibleStudents.length * 100) : 0
            };
        });

        // Batch summary
        const batchSummary = allBatches.map(b => {
            const bStudents = allStudents.filter(s => (s.batch_name || '').toLowerCase() === (b.batch_name || '').toLowerCase());
            const totalFee = bStudents.reduce((sum, s) => sum + Number(s.final_fee || s.course_fee || 0), 0);
            const totalPaid = bStudents.reduce((sum, s) => sum + Number(s.total_paid || 0), 0);
            const totalDue = bStudents.reduce((sum, s) => sum + Number(s.total_due || 0), 0);
            const paidCount = bStudents.filter(s => Number(s.total_due || 0) === 0).length;
            const dueCount = bStudents.filter(s => Number(s.total_due || 0) > 0).length;
            const rate = totalFee > 0 ? Math.round(totalPaid / totalFee * 100) : 0;

            return {
                _id: b.id,
                id: b.id,
                name: b.batch_name,
                batchName: b.batch_name,
                batchCode: b.batch_code,
                category: b.program,
                program: b.program,
                session: b.year ? String(b.year) : '2026',
                capacity: 60,
                coordinator: '',
                startDate: '',
                endDate: '',
                admissionFee: 0,
                courseFee: Number(b.total_fee || 15000),
                baseFee: Number(b.total_fee || 15000),
                notes: '',
                status: b.status || 'Active',
                enrolledCount: bStudents.length,
                students: bStudents.length,
                totalFee,
                totalPaid,
                totalDue,
                paidCount,
                dueCount,
                rate
            };
        });

        // Student list
        const studentList = allStudents.map(s => {
            const sDist = allDistributions.filter(d => d.student_id === s.id);
            const matNames = sDist.map(d => d.material_title).filter(Boolean);
            return {
                _id: s.id,
                roll: s.roll,
                name: s.name,
                phone: s.phone,
                guardian: s.guardian_phone || '',
                guardianPhone: s.guardian_phone || '',
                batch: s.batch_name,
                batchName: s.batch_name,
                batchId: s.batch_id,
                fee: Number(s.final_fee || s.course_fee || 0),
                finalFee: Number(s.final_fee || s.course_fee || 0),
                paid: Number(s.total_paid || 0),
                totalPaid: Number(s.total_paid || 0),
                due: Number(s.total_due || 0),
                totalDue: Number(s.total_due || 0),
                paymentStatus: s.payment_status || 'Unpaid',
                status: s.status || 'Active',
                active: s.status === 'Active',
                materials: matNames,
                admissionDate: s.admission_date ? s.admission_date.split('T')[0] : ''
            };
        });

        // Transaction list
        const transactionList = allPayments.map(p => ({
            _id: p.id,
            date: p.payment_date ? p.payment_date.split('T')[0] : '',
            receipt: p.receipt_no,
            roll: p.student_roll,
            studentName: p.student_name,
            batch: p.batch_name,
            type: p.payment_type === 'Admission' ? 'Admission' : 'Payment',
            method: p.payment_method,
            amount: Number(p.amount || 0),
            collector: p.collector,
            transactionId: p.transaction_id || ''
        }));

        res.json({
            success: true,
            data: {
                students: studentList,
                transactions: transactionList,
                materials: materialStats,
                batches: batchSummary,
                distributions: allDistributions.map(d => ({
                    _id: d.id,
                    voucherNo: d.voucher_no,
                    studentId: d.student_id,
                    studentRoll: d.student_roll,
                    studentName: d.student_name,
                    batchName: d.batch_name,
                    items: [{ materialId: d.material_id, materialName: d.material_title, quantity: d.quantity }],
                    issuedBy: d.distributed_by,
                    issuedDate: d.distribution_date ? d.distribution_date.split('T')[0] : ''
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Single Student Ledger for Reports
router.get('/reports/students/:id', async (req, res) => {
    try {
        const student = await findStudent(req.params.id);
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const [pRes, dRes] = await Promise.all([
            supabase.from('ucc_payments').select('*').eq('student_id', student.id).order('payment_date', { ascending: false }),
            supabase.from('ucc_distributions').select('*').eq('student_id', student.id).order('distribution_date', { ascending: false })
        ]);

        const matNames = (dRes.data || []).map(d => d.material_title).filter(Boolean);

        res.json({
            success: true,
            student: {
                _id: student.id,
                roll: student.roll,
                name: student.name,
                phone: student.phone,
                guardianPhone: student.guardian_phone || '',
                batch: student.batch_name,
                batchName: student.batch_name,
                fee: Number(student.final_fee || student.course_fee || 0),
                paid: Number(student.total_paid || 0),
                due: Number(student.total_due || 0),
                paymentStatus: student.payment_status || 'Unpaid',
                materials: matNames
            },
            payments: (pRes.data || []).map(p => ({
                _id: p.id,
                date: p.payment_date ? p.payment_date.split('T')[0] : '',
                receipt: p.receipt_no,
                method: p.payment_method,
                amount: Number(p.amount || 0),
                type: p.payment_type
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// ⚙️ 8. SETTINGS
// =================================================================

router.get('/settings', async (req, res) => {
    try {
        const { data } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'ucc_settings')
            .maybeSingle();

        const defaultSettings = {
            branchName: 'UCC পাবনা শাখা',
            address: 'আব্দুল হামিদ রোড, পাবনা',
            contactPhone: '01712-345678',
            receiptHeaderTitle: 'UCC ADMISSION & COACHING CENTER - PABNA BRANCH',
            receiptFooterTerms: 'Fees once paid are non-refundable and non-transferable.'
        };

        res.json({ success: true, settings: data ? data.value : defaultSettings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .upsert({ key: 'ucc_settings', value: req.body, updated_at: new Date() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, settings: data.value });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 💸 9. UCC EXPENSES
// =================================================================

// GET /api/ucc/expenses
router.get('/expenses', async (req, res) => {
    try {
        const { category, method, search, date, startDate, endDate, limit = 50 } = req.query;
        let query = supabase.from('ucc_expenses').select('*');

        if (category && category !== 'all') query = query.eq('category', category);
        if (method && method !== 'all') query = query.eq('payment_method', method);
        if (date) query = query.eq('expense_date', date);
        if (startDate && endDate) query = query.gte('expense_date', startDate).lte('expense_date', endDate);

        if (search) {
            const s = search.trim();
            query = query.or(`voucher_no.ilike.%${s}%,purpose.ilike.%${s}%,paid_to.ilike.%${s}%,category.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false }).limit(Number(limit));
        const { data: expenses, error } = await query;
        if (error) throw error;

        const totalAmount = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const formatted = (expenses || []).map(formatUccExpense);

        res.json({ success: true, count: formatted.length, totalAmount, expenses: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/ucc/expenses/:id
router.get('/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let query = supabase.from('ucc_expenses').select('*');
        if (isUUID(id)) {
            query = query.eq('id', id);
        } else {
            query = query.eq('voucher_no', id);
        }
        const { data: expense, error } = await query.maybeSingle();
        if (error || !expense) return res.status(404).json({ success: false, message: 'Expense not found' });
        res.json({ success: true, expense: formatUccExpense(expense) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/ucc/expenses
router.post('/expenses', async (req, res) => {
    try {
        const { description, category, amount, paymentMethod, vendor, date, createdBy } = req.body;
        const count = await supabase.from('ucc_expenses').select('*', { count: 'exact', head: true });
        const voucherNo = 'UCC-EXP-' + Date.now().toString().slice(-6) + '-' + ((count.count || 0) + 1);

        const expRow = {
            voucher_no: voucherNo,
            category: category || 'Office',
            amount: Number(amount) || 0,
            expense_date: date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            payment_method: paymentMethod || 'Cash',
            paid_to: vendor || 'General Vendor',
            purpose: description || 'UCC Expense',
            created_by: createdBy || 'Admin'
        };

        const { data: inserted, error } = await supabase
            .from('ucc_expenses')
            .insert(expRow)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'UCC Expense saved', expense: formatUccExpense(inserted) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/ucc/expenses/:id
router.delete('/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let query = supabase.from('ucc_expenses').delete();
        if (isUUID(id)) {
            query = query.eq('id', id);
        } else {
            query = query.eq('voucher_no', id);
        }
        const { error } = await query;
        if (error) throw error;
        res.json({ success: true, message: 'UCC Expense deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =================================================================
// 🔄 10. BATCH TRANSFER & ROLLS
// =================================================================

// Get next available roll for a specific batch
router.get('/batches/:batchName/next-roll', async (req, res) => {
    try {
        const batchName = decodeURIComponent(req.params.batchName);
        const batch = await findBatch(batchName);

        const { data: students } = await supabase
            .from('ucc_students')
            .select('roll')
            .ilike('batch_name', batch ? batch.batch_name : batchName);

        let maxRoll = 0;
        (students || []).forEach(s => {
            const numericPart = String(s.roll || '').replace(/[^0-9]/g, '');
            const num = parseInt(numericPart, 10);
            if (!isNaN(num) && num > maxRoll) maxRoll = num;
        });

        let nextRollNumber = 1;
        if ((students || []).length > 0) {
            nextRollNumber = maxRoll + 1;
        } else if (batch && batch.next_roll_number) {
            nextRollNumber = Number(batch.next_roll_number);
        }

        const nextRoll = nextRollNumber.toString().padStart(3, '0');
        res.json({
            success: true,
            nextRoll: nextRoll,
            batchName: batchName,
            currentMaxRoll: maxRoll,
            studentCount: (students || []).length,
            batchNextRoll: batch?.next_roll_number || null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Batch Transfer API
router.post('/batch-transfer', async (req, res) => {
    try {
        const { studentId, targetBatchName, notes } = req.body;

        if (!studentId || !targetBatchName) {
            return res.status(400).json({ success: false, message: 'Student ID and Target Batch Name are required' });
        }

        const student = await findStudent(studentId);
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        if ((student.batch_name || '').toLowerCase().trim() === targetBatchName.toLowerCase().trim()) {
            return res.status(400).json({ success: false, message: 'Cannot transfer to the same batch' });
        }

        const targetBatch = await findBatch(targetBatchName);
        if (!targetBatch) {
            return res.status(404).json({ success: false, message: `Target batch "${targetBatchName}" not found.` });
        }

        const oldBatchName = student.batch_name;
        const oldRoll = student.roll;
        const oldStudentId = student.student_id;

        // Calculate next roll in target batch
        const { data: targetStudents } = await supabase
            .from('ucc_students')
            .select('roll')
            .ilike('batch_name', targetBatch.batch_name);

        let maxRoll = 0;
        (targetStudents || []).forEach(s => {
            const numericPart = String(s.roll || '').replace(/[^0-9]/g, '');
            const num = parseInt(numericPart, 10);
            if (!isNaN(num) && num > maxRoll) maxRoll = num;
        });

        const newRoll = (maxRoll + 1).toString().padStart(3, '0');
        const batchPrefix = targetBatch.batch_code
            ? targetBatch.batch_code.replace(/[-\s]/g, '').substring(0, 6).toUpperCase()
            : targetBatch.batch_name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
        const newStudentId = `UCC-${batchPrefix}-${newRoll}`;

        const transferNote = `\n[BATCH TRANSFER] ${new Date().toLocaleDateString('en-GB')} - From "${oldBatchName}" (Roll: ${oldRoll}, ID: ${oldStudentId}) → To "${targetBatch.batch_name}" (Roll: ${newRoll}, ID: ${newStudentId})${notes ? ` | Notes: ${notes}` : ''}`;
        const updatedNotes = (student.notes || '') + transferNote;

        // Update student record
        const { data: updatedStudent, error: studErr } = await supabase
            .from('ucc_students')
            .update({
                batch_id: targetBatch.id,
                batch_name: targetBatch.batch_name,
                program: targetBatch.program,
                roll: newRoll,
                student_id: newStudentId,
                notes: updatedNotes,
                updated_at: new Date()
            })
            .eq('id', student.id)
            .select()
            .single();

        if (studErr) throw studErr;

        // Increment target batch next roll
        await supabase
            .from('ucc_batches')
            .update({ next_roll_number: Number(newRoll) + 1 })
            .eq('id', targetBatch.id);

        // Update payments, distributions, and results
        await Promise.all([
            supabase.from('ucc_payments').update({ batch_name: targetBatch.batch_name, student_roll: newRoll }).eq('student_id', student.id),
            supabase.from('ucc_distributions').update({ batch_name: targetBatch.batch_name, student_roll: newRoll }).eq('student_id', student.id),
            supabase.from('ucc_results').update({ student_roll: newRoll }).eq('student_id', student.id)
        ]);

        res.json({
            success: true,
            message: `Student successfully transferred from "${oldBatchName}" to "${targetBatch.batch_name}"`,
            data: {
                student: formatUccStudent(updatedStudent),
                oldBatch: oldBatchName,
                newBatch: targetBatch.batch_name,
                oldRoll: oldRoll,
                newRoll: newRoll,
                oldStudentId: oldStudentId,
                newStudentId: newStudentId
            }
        });
    } catch (error) {
        console.error('Error in batch-transfer:', error);
        res.status(500).json({ success: false, message: 'Failed to transfer student: ' + error.message });
    }
});

module.exports = router;
