const mongoose = require('mongoose');
require('dotenv').config();
const UccStudent = require('./models/UccStudent');
const UccBatch = require('./models/UccBatch');

async function cleanupOrphanedStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all batches
    const batches = await UccBatch.find({}, 'batchName');
    const batchNames = batches.map(b => b.batchName.toLowerCase().trim());
    console.log(`\n📦 Found ${batches.length} batches in database`);

    // Get all students
    const students = await UccStudent.find({}, 'roll name batchName');
    console.log(`👥 Found ${students.length} students in database`);

    // Find orphaned students (students whose batch doesn't exist)
    const orphanedStudents = students.filter(s => {
      const studentBatchName = (s.batchName || '').toLowerCase().trim();
      return studentBatchName && !batchNames.includes(studentBatchName);
    });

    console.log(`\n⚠️  Found ${orphanedStudents.length} orphaned students:`);
    
    if (orphanedStudents.length > 0) {
      // Group by batch name
      const orphanedByBatch = {};
      orphanedStudents.forEach(s => {
        const batchName = s.batchName || 'Unknown';
        if (!orphanedByBatch[batchName]) {
          orphanedByBatch[batchName] = [];
        }
        orphanedByBatch[batchName].push(s);
      });

      console.log('\n📋 Orphaned students by batch:');
      Object.keys(orphanedByBatch).forEach(batchName => {
        console.log(`  ${batchName}: ${orphanedByBatch[batchName].length} students`);
        orphanedByBatch[batchName].slice(0, 3).forEach(s => {
          console.log(`    - Roll ${s.roll}: ${s.name}`);
        });
        if (orphanedByBatch[batchName].length > 3) {
          console.log(`    ... and ${orphanedByBatch[batchName].length - 3} more`);
        }
      });

      // Delete orphaned students
      const orphanedIds = orphanedStudents.map(s => s._id);
      const result = await UccStudent.deleteMany({ _id: { $in: orphanedIds } });
      
      console.log(`\n✅ Deleted ${result.deletedCount} orphaned students`);
    } else {
      console.log('✅ No orphaned students found!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanupOrphanedStudents();
