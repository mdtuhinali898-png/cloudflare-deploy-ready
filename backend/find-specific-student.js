// Find specific student by ID
require('dotenv').config();
const mongoose = require('mongoose');
const UccStudent = require('./models/UccStudent');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

const SEARCH_ID = 'UCC-HUMN-262701';

async function findStudent() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`🔍 Searching for Student ID: ${SEARCH_ID}\n`);

    // Exact match
    const exactMatch = await UccStudent.findOne({ studentId: SEARCH_ID });
    
    if (exactMatch) {
      console.log('✅ Found exact match:');
      console.log('═'.repeat(80));
      console.log(`Student ID: ${exactMatch.studentId}`);
      console.log(`Name: ${exactMatch.name}`);
      console.log(`Roll: ${exactMatch.roll}`);
      console.log(`Batch: ${exactMatch.batchName}`);
      console.log(`Program: ${exactMatch.program}`);
      console.log(`Phone: ${exactMatch.phone}`);
      console.log(`Course Fee: ৳${exactMatch.courseFee}`);
      console.log(`Total Paid: ৳${exactMatch.totalPaid}`);
      console.log(`Total Due: ৳${exactMatch.totalDue}`);
      console.log(`Status: ${exactMatch.status}`);
      console.log(`Created: ${exactMatch.createdAt}`);
      console.log(`Database _id: ${exactMatch._id}`);
      console.log('═'.repeat(80));
    } else {
      console.log(`❌ No student found with ID: ${SEARCH_ID}`);
    }

    // Search for similar IDs
    console.log('\n🔍 Searching for similar Student IDs...\n');
    const similarIds = await UccStudent.find({
      studentId: { $regex: /UCC-HUMN-262/, $options: 'i' }
    }).sort({ studentId: 1 });

    if (similarIds.length > 0) {
      console.log(`✅ Found ${similarIds.length} student(s) with similar IDs:`);
      console.log('─'.repeat(80));
      similarIds.forEach((student, idx) => {
        console.log(`${idx + 1}. ID: ${student.studentId} | Name: ${student.name} | Roll: ${student.roll} | Batch: ${student.batchName}`);
      });
      console.log('─'.repeat(80));
    } else {
      console.log('❌ No similar Student IDs found');
    }

    // Check all students in "Humnities BN 1" batch
    console.log('\n🔍 Checking all students in "Humnities BN 1" batch...\n');
    const batch1Students = await UccStudent.find({
      batchName: { $regex: /humnities bn 1/i }
    }).sort({ roll: 1 }).limit(5);

    if (batch1Students.length > 0) {
      console.log(`✅ Found ${batch1Students.length} student(s) (showing first 5):`);
      console.log('─'.repeat(80));
      batch1Students.forEach((student, idx) => {
        console.log(`${idx + 1}. ID: ${student.studentId} | Name: ${student.name} | Roll: ${student.roll}`);
      });
      console.log('─'.repeat(80));
      
      // Check max roll
      const allBatch1 = await UccStudent.find({
        batchName: { $regex: /humnities bn 1/i }
      }, { roll: 1 }).lean();
      
      let maxRoll = 0;
      allBatch1.forEach(s => {
        const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > maxRoll) maxRoll = num;
      });
      
      console.log(`\nMax Roll in batch: ${maxRoll}`);
      console.log(`Next Roll should be: ${(maxRoll + 1).toString().padStart(3, '0')}`);
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
findStudent();
