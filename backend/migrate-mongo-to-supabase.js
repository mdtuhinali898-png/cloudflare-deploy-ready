const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const supabase = require('./config/supabase');

const MONGODB_URI = process.env.MONGODB_URI;

// Helper to batch insert into Supabase
async function batchInsert(table, rows, chunkSize = 150) {
    if (!rows || rows.length === 0) return 0;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from(table).upsert(chunk);
        if (error) {
            console.error(`❌ Error inserting into ${table} chunk ${i}-${i + chunk.length}:`, error.message);
            // Try one-by-one to save valid ones and catch the offending row
            for (const item of chunk) {
                const { error: singleErr } = await supabase.from(table).upsert(item);
                if (singleErr) {
                    console.error(`  ⚠️ Skipped row in ${table}:`, singleErr.message);
                } else {
                    inserted++;
                }
            }
        } else {
            inserted += chunk.length;
        }
    }
    return inserted;
}

async function runMigration() {
    console.log('🚀 Starting MongoDB to Supabase Migration...');
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB!\n');

    const db = mongoose.connection.db;

    try {
        // 1. Batches
        console.log('📦 1. Migrating Batches...');
        const mongoBatches = await db.collection('batches').find().toArray();
        const batchRows = mongoBatches.map(b => ({
            name: b.name,
            year: b.year || 2025,
            fee: b.fee || 0,
            description: b.description || '',
            prefix: b.prefix || '',
            status: b.status || 'Active',
            created_at: b.createdAt || new Date(),
            updated_at: b.updatedAt || new Date()
        }));
        const bCount = await batchInsert('batches', batchRows);
        console.log(`✅ Batches migrated: ${bCount}/${mongoBatches.length}`);

        // 2. Students
        console.log('\n🧑‍🎓 2. Migrating Students...');
        const mongoStudents = await db.collection('students').find().toArray();
        const studentRows = mongoStudents.map(s => ({
            student_id: String(s.studentId || '').trim(),
            roll: s.roll ? String(s.roll).trim() : null,
            name: s.name || '',
            guardian_name: s.guardianName || '',
            mother_name: s.motherName || '',
            dob: s.dob ? new Date(s.dob).toISOString().split('T')[0] : null,
            gender: s.gender || null,
            phone: s.phone ? String(s.phone).trim() : '',
            address: s.address || '',
            batch: s.batch || '',
            student_group: s.group || '',
            previous_school: s.previousSchool || '',
            guardian_phone: s.guardianPhone ? String(s.guardianPhone).trim() : '',
            fee: s.fee || 0,
            admission_fee: s.admissionFee || 0,
            start_month: s.startMonth || 'July',
            status: s.status || 'Active',
            notes: s.notes || '',
            reference: s.reference || '',
            photo: s.photo || '',
            admission_date: s.admissionDate || s.date || new Date(),
            created_at: s.createdAt || new Date(),
            updated_at: s.updatedAt || new Date()
        })).filter(s => s.student_id);
        const sCount = await batchInsert('students', studentRows);
        console.log(`✅ Students migrated: ${sCount}/${mongoStudents.length}`);

        // 3. Payments
        console.log('\n💳 3. Migrating Payments...');
        const mongoPayments = await db.collection('payments').find().toArray();
        const paymentRows = mongoPayments.map((p, idx) => ({
            receipt_no: p.receiptNo || `RCPT-LEGACY-${idx}-${Date.now()}`,
            student_id: String(p.studentId || '').trim(),
            student_name: p.studentName || '',
            month: p.month || '',
            year: p.year || (p.date ? new Date(p.date).getFullYear() : 2025),
            fee: p.fee || 0,
            monthly_fee: p.monthlyFee || 0,
            admission_fee: p.admissionFee || 0,
            discount: p.discount || 0,
            fine: p.fine || 0,
            amount: p.amount || 0,
            payment_method: p.paymentMethod || 'Cash',
            type: p.type || 'Monthly',
            status: p.status || 'Paid',
            remarks: p.remarks || '',
            date: p.date ? String(p.date) : new Date().toISOString().split('T')[0],
            created_at: p.createdAt || new Date(),
            updated_at: p.updatedAt || new Date()
        }));
        const pCount = await batchInsert('payments', paymentRows);
        console.log(`✅ Payments migrated: ${pCount}/${mongoPayments.length}`);

        // 4. Exams & Results
        console.log('\n📝 4. Migrating Exams & Results...');
        const mongoExams = await db.collection('exams').find().toArray();
        const examIdMap = new Map();

        for (const e of mongoExams) {
            const examRow = {
                name: e.name,
                exam_type: e.examType || 'monthly',
                question_type: e.questionType || 'mcq',
                date: e.date || new Date(),
                batch: e.batch,
                subjects: e.subjects || [],
                status: e.status || 'published',
                description: e.description || '',
                created_at: e.createdAt || new Date()
            };
            const { data, error } = await supabase.from('exams').insert(examRow).select('id').single();
            if (!error && data) {
                examIdMap.set(String(e._id), data.id);
            }
        }
        console.log(`✅ Exams migrated: ${examIdMap.size}/${mongoExams.length}`);

        const mongoResults = await db.collection('results').find().toArray();
        const resultRows = [];
        for (const r of mongoResults) {
            const mappedExamId = examIdMap.get(String(r.examId));
            if (mappedExamId) {
                resultRows.push({
                    exam_id: mappedExamId,
                    student_id: String(r.studentId),
                    student_name: r.studentName,
                    roll: r.roll ? String(r.roll) : '',
                    batch: r.batch,
                    subjects: r.subjects || [],
                    total_marks: r.totalMarks || 0,
                    total_full_marks: r.totalFullMarks || 0,
                    percentage: r.percentage || 0,
                    grade: r.grade || '',
                    grade_point: r.gradePoint || 0,
                    position: r.position || 0,
                    remarks: r.remarks || '',
                    status: r.status || 'draft',
                    created_at: r.createdAt || new Date()
                });
            }
        }
        const rCount = await batchInsert('results', resultRows);
        console.log(`✅ Results migrated: ${rCount}/${mongoResults.length}`);

        // 5. Books & Book Sales
        console.log('\n📚 5. Migrating Books & Book Sales...');
        const mongoBooks = await db.collection('books').find().toArray();
        const bookRows = mongoBooks.map(b => ({
            book_id: b.bookId,
            title: b.title,
            author: b.author || '',
            publisher: b.publisher || '',
            category: b.category || 'General',
            mrp_price: b.mrpPrice || 0,
            selling_price: b.sellingPrice || 0,
            discount_amount: b.discountAmount || 0,
            discount_percent: b.discountPercent || 0,
            stock_in: b.stockIn || 0,
            stock_sold: b.stockSold || 0,
            stock_current: b.stockCurrent || 0,
            low_stock_alert: b.lowStockAlert || 5,
            status: b.status || 'Available',
            stock_history: b.stockHistory || [],
            description: b.description || '',
            is_active: b.isActive !== false,
            created_by: b.createdBy || 'Admin',
            created_at: b.createdAt || new Date()
        }));
        await batchInsert('books', bookRows);

        const mongoBookSales = await db.collection('booksales').find().toArray();
        const bookSaleRows = mongoBookSales.map(bs => ({
            sale_id: bs.saleId,
            receipt_no: bs.receiptNo,
            sale_date: bs.saleDate || new Date().toISOString().split('T')[0],
            month: bs.month || '',
            year: bs.year || 2025,
            buyer_type: bs.buyerType || 'External',
            student_id: bs.studentId || '',
            buyer_name: bs.buyerName || '',
            buyer_phone: bs.buyerPhone || '',
            buyer_address: bs.buyerAddress || '',
            buyer_batch: bs.buyerBatch || '',
            items: bs.items || [],
            total_items: bs.totalItems || 0,
            gross_amount: bs.grossAmount || 0,
            total_discount: bs.totalDiscount || 0,
            net_amount: bs.netAmount || 0,
            payment_method: bs.paymentMethod || 'Cash',
            payment_status: bs.paymentStatus || 'Paid',
            remarks: bs.remarks || '',
            sold_by: bs.soldBy || 'Admin',
            created_at: bs.createdAt || new Date()
        }));
        await batchInsert('book_sales', bookSaleRows);
        console.log(`✅ Books (${mongoBooks.length}) & Book Sales (${mongoBookSales.length}) migrated.`);

        // 6. Expenses & Categories & Incomes
        console.log('\n💰 6. Migrating Expenses, Categories & Incomes...');
        const mongoCategories = await db.collection('expensecategories').find().toArray();
        const catRows = mongoCategories.map(c => ({
            name: c.name,
            sub_categories: c.subCategories || [],
            status: c.status || 'Active',
            created_at: c.createdAt || new Date()
        }));
        await batchInsert('expense_categories', catRows);

        const mongoExpenses = await db.collection('expenses').find().toArray();
        const expRows = mongoExpenses.map(e => ({
            expense_id: e.expenseId,
            date: e.date,
            time: e.time || '12:00',
            month: e.month,
            year: e.year,
            category: e.category,
            sub_category: e.subCategory,
            payment_method: e.paymentMethod || 'Cash',
            vendor: e.vendor || '',
            branch: e.branch || 'UCC Pabna Main',
            amount: e.amount || 0,
            description: e.description || '',
            receipt_file: e.receiptFile || '',
            status: e.status || 'Approved',
            approved_by: e.approvedBy || '',
            income_source: e.incomeSource || '',
            created_by: e.createdBy || 'Admin',
            created_at: e.createdAt || new Date()
        }));
        await batchInsert('expenses', expRows);

        const mongoIncomes = await db.collection('incomes').find().toArray();
        const incRows = mongoIncomes.map(i => ({
            income_id: i.incomeId,
            date: i.date,
            month: i.month,
            year: i.year,
            source: i.source,
            amount: i.amount || 0,
            payment_method: i.paymentMethod || 'Cash',
            description: i.description || '',
            received_from: i.receivedFrom || '',
            status: i.status || 'Active',
            created_by: i.createdBy || 'Admin',
            created_at: i.createdAt || new Date()
        }));
        await batchInsert('incomes', incRows);
        console.log(`✅ Expenses (${mongoExpenses.length}), Categories (${mongoCategories.length}) & Incomes (${mongoIncomes.length}) migrated.`);

        // 7. UCC Coaching Module
        console.log('\n🎓 7. Migrating UCC Coaching Data...');
        const mongoUccBatches = await db.collection('uccbatches').find().toArray();
        const uccBatchRows = mongoUccBatches.map(ub => ({
            batch_name: ub.batchName,
            batch_code: ub.batchCode || null,
            program: ub.program || 'Medical',
            year: ub.year || 2025,
            total_fee: ub.totalFee || 0,
            next_roll_number: ub.nextRollNumber || 1,
            status: ub.status || 'Active',
            created_at: ub.createdAt || new Date()
        }));
        await batchInsert('ucc_batches', uccBatchRows);
        console.log(`✅ UCC Batches migrated: ${mongoUccBatches.length}`);

        // Fetch inserted UCC batches from Supabase to map batch_id
        const { data: supaUccBatches } = await supabase.from('ucc_batches').select('id, batch_name');
        const uccBatchMap = new Map();
        (supaUccBatches || []).forEach(b => uccBatchMap.set(b.batch_name.toLowerCase(), b.id));

        const mongoUccStudents = await db.collection('uccstudents').find().toArray();
        const uccStudentRows = mongoUccStudents.map(us => ({
            student_id: String(us.studentId).trim(),
            roll: String(us.roll).trim(),
            name: us.name,
            phone: String(us.phone).trim(),
            guardian_name: us.guardianName || '',
            guardian_phone: us.guardianPhone ? String(us.guardianPhone).trim() : '',
            batch_id: uccBatchMap.get(String(us.batchName || '').toLowerCase()) || null,
            batch_name: us.batchName || '',
            program: us.program || 'Medical',
            branch: us.branch || 'Pabna',
            course_fee: us.courseFee || 0,
            discount_type: us.discountType || 'none',
            discount_value: us.discountValue || 0,
            discount_amount: us.discountAmount || 0,
            discount_reference: us.discountReference || '',
            final_fee: us.finalFee || 0,
            total_paid: us.totalPaid || 0,
            total_due: us.totalDue || 0,
            payment_status: us.paymentStatus || 'Unpaid',
            distribution_override: us.distributionOverride || false,
            override_approved_by: us.overrideApprovedBy || '',
            override_reason: us.overrideReason || '',
            email: us.email || '',
            address: us.address || '',
            photo: us.photo || '',
            notes: us.notes || '',
            status: us.status || 'Active',
            admission_date: us.admissionDate || new Date(),
            created_at: us.createdAt || new Date()
        }));
        const usCount = await batchInsert('ucc_students', uccStudentRows);
        console.log(`✅ UCC Students migrated: ${usCount}/${mongoUccStudents.length}`);

        // Fetch inserted UCC students to map student_id UUID
        const { data: supaUccStudents } = await supabase.from('ucc_students').select('id, student_id, roll');
        const uccStudentIdMap = new Map();
        (supaUccStudents || []).forEach(s => {
            uccStudentIdMap.set(s.student_id, s.id);
            uccStudentIdMap.set(s.roll, s.id);
        });

        const mongoUccPayments = await db.collection('uccpayments').find().toArray();
        const uccPaymentRows = [];
        for (const up of mongoUccPayments) {
            const mappedStudentUuid = uccStudentIdMap.get(String(up.studentRoll)) || uccStudentIdMap.get(String(up.studentId));
            if (mappedStudentUuid) {
                uccPaymentRows.push({
                    receipt_no: up.receiptNo,
                    student_id: mappedStudentUuid,
                    student_roll: String(up.studentRoll),
                    student_name: up.studentName || '',
                    batch_name: up.batchName || '',
                    amount: up.amount || 0,
                    payment_type: up.paymentType || 'Installment',
                    payment_method: up.paymentMethod || 'Cash',
                    transaction_id: up.transactionId || '',
                    previous_due: up.previousDue || 0,
                    current_due: up.currentDue || 0,
                    collector: up.collector || 'Admin',
                    remarks: up.remarks || '',
                    payment_date: up.paymentDate || new Date(),
                    created_at: up.createdAt || new Date()
                });
            }
        }
        const upCount = await batchInsert('ucc_payments', uccPaymentRows);
        console.log(`✅ UCC Payments migrated: ${upCount}/${mongoUccPayments.length}`);

        // UCC Materials
        const mongoUccMaterials = await db.collection('uccmaterials').find().toArray();
        const uccMatRows = mongoUccMaterials.map(m => ({
            code: m.code,
            title: m.title,
            program: m.program || 'Medical',
            total_quantity: m.totalQuantity || 0,
            distributed_quantity: m.distributedQuantity || 0,
            current_stock: m.currentStock || 0,
            min_fee_percentage: m.minFeePercentage || 0,
            status: m.status || 'Active',
            created_at: m.createdAt || new Date()
        }));
        await batchInsert('ucc_materials', uccMatRows);

        console.log('\n🎉 ALL MIGRATION COMPLETED SUCCESSFULLY!');
    } catch (err) {
        console.error('\n❌ Fatal Migration Error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('📦 MongoDB connection closed');
        process.exit(0);
    }
}

runMigration();
