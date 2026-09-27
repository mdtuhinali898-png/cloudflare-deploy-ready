const express = require('express');
const router = express.Router();

async function fetchRangeInPages(query, start, end) {
    const rows = [];
    let count = 0;
    const pageSize = 1000;

    for (let offset = start; offset <= end; offset += pageSize) {
        const pageEnd = Math.min(offset + pageSize - 1, end);
        const { data, count: pageCount, error } = await query.range(offset, pageEnd);
        if (error) throw error;
        if (pageCount !== null && pageCount !== undefined) count = pageCount;
        rows.push(...(data || []));
        if (!data || data.length < pageEnd - offset + 1) break;
    }

    return { data: rows, count };
}
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

function toStudentRow(data) {
    const row = {};
    if (data.studentId !== undefined) row.student_id = String(data.studentId).trim();
    if (data.roll !== undefined) row.roll = data.roll ? String(data.roll).trim() : null;
    if (data.name !== undefined) row.name = data.name;
    if (data.guardianName !== undefined) row.guardian_name = data.guardianName;
    if (data.motherName !== undefined) row.mother_name = data.motherName;
    if (data.dob !== undefined) row.dob = data.dob || null;
    if (data.gender !== undefined) row.gender = data.gender;
    if (data.phone !== undefined) row.phone = data.phone ? String(data.phone).trim() : '';
    if (data.address !== undefined) row.address = data.address;
    if (data.batch !== undefined) row.batch = data.batch;
    if (data.group !== undefined) row.student_group = data.group;
    if (data.previousSchool !== undefined) row.previous_school = data.previousSchool;
    if (data.guardianPhone !== undefined) row.guardian_phone = data.guardianPhone ? String(data.guardianPhone).trim() : '';
    if (data.fee !== undefined) row.fee = Number(data.fee || 0);
    if (data.admissionFee !== undefined) row.admission_fee = Number(data.admissionFee || 0);
    if (data.startMonth !== undefined) row.start_month = data.startMonth;
    if (data.status !== undefined) row.status = data.status;
    if (data.notes !== undefined) row.notes = data.notes;
    if (data.reference !== undefined) row.reference = data.reference;
    if (data.photo !== undefined) row.photo = data.photo;
    if (data.admissionDate !== undefined) row.admission_date = data.admissionDate;
    return row;
}

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
        const directoryView = req.query.view === 'directory';
        const reportView = req.query.view === 'report';
        const includeCount = req.query.includeCount !== 'false';
        const selectColumns = directoryView
            ? 'id, student_id, roll, name, phone, batch, admission_date, fee, status, photo'
            : reportView
                ? 'id, student_id, name, phone, batch, fee, status'
                : '*';

        // Keep each request within the Supabase response cap; callers can use
        // page/totalPages to retrieve datasets of any size.
        const limitValue = Math.min(Math.max(1, limit), 1000);
        const offset = (page - 1) * limitValue;

        let query = supabase.from('students').select(selectColumns, includeCount ? { count: 'exact' } : undefined);

        if (batch && batch !== 'all') {
            query = query.eq('batch', batch);
        }

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        let exactStudents = [];
        if (search) {
            const cleanSearch = search.trim();

            // When searching on page 1, prioritize exact matches (student_id, roll, phone, or name)
            if (page === 1) {
                let exactQuery = supabase.from('students').select(selectColumns);
                if (batch && batch !== 'all') exactQuery = exactQuery.eq('batch', batch);
                if (status && status !== 'all') exactQuery = exactQuery.eq('status', status);
                exactQuery = exactQuery.or(`student_id.ilike.${cleanSearch},roll.ilike.${cleanSearch},phone.eq.${cleanSearch},name.ilike.${cleanSearch}`);
                const { data: exactRows, error: exactError } = await exactQuery.limit(limitValue);
                if (!exactError && exactRows && exactRows.length > 0) {
                    exactStudents = exactRows;
                }
            }

            query = query.or(`student_id.ilike.%${cleanSearch}%,roll.ilike.%${cleanSearch}%,name.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,reference.ilike.%${cleanSearch}%`);

            if (exactStudents.length > 0) {
                const exactIds = exactStudents.map(s => s.id);
                query = query.not('id', 'in', `(${exactIds.join(',')})`);
            }
        }

        if (search) {
            query = query.order('student_id', { ascending: true });
        } else if (batch && batch !== 'all') {
            query = query.order('student_id', { ascending: true });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        let data = [];
        let count = 0;

        if (search && exactStudents.length > 0) {
            const totalExact = exactStudents.length;
            if (page === 1) {
                const remainingLimit = Math.max(0, limitValue - totalExact);
                if (remainingLimit > 0) {
                    const res = await fetchRangeInPages(query, 0, remainingLimit - 1);
                    data = [...exactStudents, ...(res.data || [])];
                    count = includeCount ? (res.count || 0) + totalExact : null;
                } else {
                    const { count: c, error: cErr } = await query.range(0, 0);
                    if (cErr) throw cErr;
                    data = exactStudents.slice(0, limitValue);
                    count = includeCount ? (c || 0) + totalExact : null;
                }
            } else {
                const generalOffset = (page - 1) * limitValue - totalExact;
                const res = await fetchRangeInPages(query, generalOffset, generalOffset + limitValue - 1);
                data = res.data || [];
                count = includeCount ? (res.count || 0) + totalExact : null;
            }
        } else {
            const res = await fetchRangeInPages(query, offset, offset + limitValue - 1);
            data = res.data || [];
            count = includeCount ? (res.count || 0) : null;
        }

        const total = count ?? (includeCount ? data.length : null);
        const totalPages = includeCount ? Math.ceil(total / limitValue) : null;

        res.json({
            success: true,
            students: (data || []).map(formatStudent),
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
// @desc    Get student statistics
// @access  Public
router.get('/stats', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isoThirtyDaysAgo = thirtyDaysAgo.toISOString();

        const [
            { count: totalStudents },
            { count: activeStudents },
            { count: inactiveStudents },
            { count: newAdmissions }
        ] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Inactive'),
            supabase.from('students').select('*', { count: 'exact', head: true }).gte('created_at', isoThirtyDaysAgo)
        ]);

        res.json({
            total: totalStudents || 0,
            active: activeStudents || 0,
            inactive: inactiveStudents || 0,
            newAdmission: newAdmissions || 0
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
});

// @route   GET /api/students/stats/overview
// @desc    Get student statistics overview
// @access  Public
router.get('/stats/overview', async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isoThirtyDaysAgo = thirtyDaysAgo.toISOString();

        const [
            { count: totalStudents },
            { count: activeStudents },
            { count: inactiveStudents },
            { count: newAdmissions }
        ] = await Promise.all([
            supabase.from('students').select('*', { count: 'exact', head: true }),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'Inactive'),
            supabase.from('students').select('*', { count: 'exact', head: true }).gte('created_at', isoThirtyDaysAgo)
        ]);

        res.json({
            total: totalStudents || 0,
            active: activeStudents || 0,
            inactive: inactiveStudents || 0,
            newAdmission: newAdmissions || 0
        });
    } catch (error) {
        console.error('Error fetching stats overview:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
    }
});

// @route   GET /api/students/batches/list
// @desc    Get all unique batches
// @access  Public
router.get('/batches/list', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('batches')
            .select('name')
            .order('name');

        if (error) throw error;

        const uniqueBatches = (data || []).map(item => item.name).filter(Boolean);
        res.json({ success: true, batches: uniqueBatches });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ success: false, message: 'Error fetching batches', error: error.message });
    }
});

// @route   GET /api/students/:id
// @desc    Get single student by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const idParam = (req.params.id || '').trim();
        if (!idParam) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

        // 1. Exact match by student_id (case-insensitive)
        let { data: student } = await supabase
            .from('students')
            .select('*')
            .ilike('student_id', idParam)
            .maybeSingle();

        // 2. If UUID
        if (!student && isUuid) {
            const { data: byUuid } = await supabase
                .from('students')
                .select('*')
                .eq('id', idParam)
                .maybeSingle();
            student = byUuid;
        }

        // 3. Fallback by phone or name
        if (!student) {
            const { data: byPhoneOrName } = await supabase
                .from('students')
                .select('*')
                .or(`phone.eq.${idParam},name.ilike.${idParam}`)
                .limit(1);
            student = byPhoneOrName && byPhoneOrName[0];
        }

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({ success: true, student: formatStudent(student) });
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
        const studentId = String(studentData.studentId || '').trim();

        if (!studentId) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }

        // Check if student ID already exists
        const { data: existingStudent } = await supabase
            .from('students')
            .select('id')
            .ilike('student_id', studentId)
            .maybeSingle();

        if (existingStudent) {
            return res.status(400).json({ 
                success: false, 
                message: `Student with ID ${studentId} already exists` 
            });
        }

        const newRow = toStudentRow(studentData);
        newRow.created_at = new Date();
        newRow.updated_at = new Date();

        const { data: savedStudent, error } = await supabase
            .from('students')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ 
            success: true, 
            message: 'Student added successfully',
            student: formatStudent(savedStudent)
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
        const idParam = (req.params.id || '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

        // Find existing student
        let { data: existingStudent } = await supabase
            .from('students')
            .select('*')
            .ilike('student_id', idParam)
            .maybeSingle();

        if (!existingStudent && isUuid) {
            const { data: byUuid } = await supabase
                .from('students')
                .select('*')
                .eq('id', idParam)
                .maybeSingle();
            existingStudent = byUuid;
        }

        if (!existingStudent) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // If studentId changed, check conflict
        if (req.body.studentId && req.body.studentId !== existingStudent.student_id) {
            const { data: conflict } = await supabase
                .from('students')
                .select('id')
                .ilike('student_id', req.body.studentId)
                .neq('id', existingStudent.id)
                .maybeSingle();

            if (conflict) {
                return res.status(400).json({ success: false, message: `Student ID ${req.body.studentId} is already in use by another student.` });
            }
        }

        const updateData = toStudentRow(req.body);
        updateData.updated_at = new Date();

        const { data: updatedStudent, error } = await supabase
            .from('students')
            .update(updateData)
            .eq('id', existingStudent.id)
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Student updated successfully',
            student: formatStudent(updatedStudent)
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
        const idParam = (req.params.id || '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

        let studentQuery = supabase.from('students').select('id, student_id, roll');
        studentQuery = isUuid
            ? studentQuery.eq('id', idParam)
            : studentQuery.ilike('student_id', idParam);

        const { data: student, error: lookupError } = await studentQuery.maybeSingle();
        if (lookupError) throw lookupError;
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const rawKeys = [
            student.student_id,
            student.student_id ? String(student.student_id).toLowerCase() : null,
            student.student_id ? String(student.student_id).toUpperCase() : null,
            student.roll,
            student.roll ? String(student.roll).toLowerCase() : null,
            student.roll ? String(student.roll).toUpperCase() : null,
            student.id
        ].filter(Boolean).map(String);

        const studentKeys = [...new Set(rawKeys)];

        // Remove records keyed by either the public student ID, roll, or the database ID.
        // If any related table fails, keep the student row so the cleanup can be retried.
        const relatedDeletes = await Promise.all([
            supabase.from('payments').delete().in('student_id', studentKeys),
            supabase.from('results').delete().in('student_id', studentKeys),
            supabase.from('dues').delete().in('student_id', studentKeys),
            supabase.from('book_sales').delete().in('student_id', studentKeys)
        ]);
        const relatedErrors = relatedDeletes.map(result => result.error).filter(Boolean);
        if (relatedErrors.length) {
            throw new Error(`Could not remove all student-related records: ${relatedErrors.map(error => error.message).join('; ')}`);
        }

        const { error: deleteError } = await supabase
            .from('students')
            .delete()
            .eq('id', student.id);
        if (deleteError) throw deleteError;

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
