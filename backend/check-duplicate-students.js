// Check for duplicate student IDs and rolls
require('dotenv').config();
const mongoose = require('mongoose');
const UccStudent = require('./models/UccStudent');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

async function checkDuplicates() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('🔍 Checking for duplicate Student IDs...\n');

    // Find duplicate student IDs
    const duplicateIds = await UccStudent.aggregate([
      {
        $group: {
          _id: '$studentId',
          count: { $sum: 1 },
          students: { $push: { id: '$_id', name: '$name', batch: '$batchName', roll: '$roll' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    if (duplicateIds.length === 0) {
      console.log('✅ No duplicate Student IDs found!\n');
    } else {
      console.log(`⚠️  Found ${duplicateIds.length} duplicate Student ID(s):\n`);
      console.log('═'.repeat(80));
      
      duplicateIds.forEach((dup, index) => {
        console.log(`\n${index + 1}. Student ID: ${dup._id} (${dup.count} duplicates)`);
        dup.students.forEach((student, idx) => {
          console.log(`   ${idx + 1}. Name: ${student.name} | Batch: ${student.batch} | Roll: ${student.roll} | DB ID: ${student.id}`);
        });
      });
      
      console.log('\n' + '═'.repeat(80));
    }

    // Find duplicate rolls within same batch
    console.log('\n🔍 Checking for duplicate Roll Numbers within batches...\n');

    const allStudents = await UccStudent.find({}).sort({ batchName: 1, roll: 1 });
    const batchRolls = {};
    const duplicateRolls = [];

    allStudents.forEach(student => {
      const key = `${student.batchName}-${student.roll}`;
      if (!batchRolls[key]) {
        batchRolls[key] = [];
      }
      batchRolls[key].push({
        id: student._id,
        studentId: student.studentId,
        name: student.name,
        batch: student.batchName,
        roll: student.roll
      });
    });

    Object.keys(batchRolls).forEach(key => {
      if (batchRolls[key].length > 1) {
        duplicateRolls.push({
          key,
          students: batchRolls[key]
        });
      }
    });

    if (duplicateRolls.length === 0) {
      console.log('✅ No duplicate Roll Numbers found within batches!\n');
    } else {
      console.log(`⚠️  Found ${duplicateRolls.length} duplicate Roll Number(s) within batches:\n`);
      console.log('═'.repeat(80));
      
      duplicateRolls.forEach((dup, index) => {
        const [batchName, roll] = dup.key.split('-');
        console.log(`\n${index + 1}. Batch: ${batchName} | Roll: ${roll} (${dup.students.length} duplicates)`);
        dup.students.forEach((student, idx) => {
          console.log(`   ${idx + 1}. Student ID: ${student.studentId} | Name: ${student.name} | DB ID: ${student.id}`);
        });
      });
      
      console.log('\n' + '═'.repeat(80));
    }

    // Summary
    console.log('\n📊 SUMMARY');
    console.log('─'.repeat(80));
    console.log(`Total Students: ${allStudents.length}`);
    console.log(`Duplicate Student IDs: ${duplicateIds.length}`);
    console.log(`Duplicate Roll Numbers: ${duplicateRolls.length}`);
    console.log('─'.repeat(80));

    if (duplicateIds.length > 0 || duplicateRolls.length > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log('   - Review the duplicate records above');
      console.log('   - Decide which records to keep and which to delete/modify');
      console.log('   - You can manually fix these in MongoDB or use a fix script');
      console.log('\n💡 TIP: The newest admission fix will prevent future duplicates.');
    } else {
      console.log('\n✅ Database is clean! No duplicates found.');
    }

    console.log('\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
checkDuplicates();
