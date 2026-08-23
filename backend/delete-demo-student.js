// Delete the demo student that's causing duplicate error
require('dotenv').config();
const mongoose = require('mongoose');
const UccStudent = require('./models/UccStudent');
const UccPayment = require('./models/UccPayment');
const UccDistribution = require('./models/UccDistribution');
const UccResult = require('./models/UccResult');
const UccBatch = require('./models/UccBatch');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

const STUDENT_ID_TO_DELETE = 'UCC-HUMN-262701';

async function deleteStudent() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Looking for student: ${STUDENT_ID_TO_DELETE}\n`);

    // Find the student
    const student = await UccStudent.findOne({ studentId: STUDENT_ID_TO_DELETE });

    if (!student) {
      console.log(`❌ Student not found with ID: ${STUDENT_ID_TO_DELETE}`);
      process.exit(0);
    }

    console.log('📋 Student Details:');
    console.log('═'.repeat(80));
    console.log(`Student ID: ${student.studentId}`);
    console.log(`Name: ${student.name}`);
    console.log(`Roll: ${student.roll}`);
    console.log(`Batch: ${student.batchName}`);
    console.log(`Phone: ${student.phone}`);
    console.log(`Created: ${student.createdAt}`);
    console.log('═'.repeat(80));

    // Check related records
    const payments = await UccPayment.countDocuments({ studentId: student._id });
    const distributions = await UccDistribution.countDocuments({ studentId: student._id });
    const results = await UccResult.countDocuments({ studentId: student._id });

    console.log('\n📊 Related Records:');
    console.log(`   - Payments: ${payments}`);
    console.log(`   - Distributions: ${distributions}`);
    console.log(`   - Exam Results: ${results}`);

    console.log('\n⚠️  WARNING: This student will be PERMANENTLY DELETED!');
    console.log('   This appears to be a demo/test entry.');
    console.log('   Deleting in 3 seconds...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🗑️  Deleting student and related records...\n');

    // Delete student
    const deletedStudent = await UccStudent.findByIdAndDelete(student._id);
    console.log(`✅ Deleted student: ${deletedStudent.studentId}`);

    // Delete related records
    if (payments > 0) {
      const deletedPayments = await UccPayment.deleteMany({ studentId: student._id });
      console.log(`✅ Deleted ${deletedPayments.deletedCount} payment record(s)`);
    }

    if (distributions > 0) {
      const deletedDistributions = await UccDistribution.deleteMany({ studentId: student._id });
      console.log(`✅ Deleted ${deletedDistributions.deletedCount} distribution record(s)`);
    }

    if (results > 0) {
      const deletedResults = await UccResult.deleteMany({ studentId: student._id });
      console.log(`✅ Deleted ${deletedResults.deletedCount} exam result(s)`);
    }

    // Update batch enrolled count if needed
    const batch = await UccBatch.findOne({ 
      batchName: { $regex: new RegExp(`^${student.batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (batch && batch.enrolledCount > 0) {
      batch.enrolledCount -= 1;
      await batch.save();
      console.log(`✅ Updated batch enrollment count: ${batch.batchName} (${batch.enrolledCount})`);
    }

    console.log('\n═'.repeat(80));
    console.log('✅ Student deleted successfully!');
    console.log(`   Student ID ${STUDENT_ID_TO_DELETE} is now free to use.`);
    console.log('═'.repeat(80));
    console.log('\n💡 You can now submit the admission form again.\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
deleteStudent();
