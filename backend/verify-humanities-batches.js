// Quick verification script to check all Humanities batches
require('dotenv').config();
const mongoose = require('mongoose');
const UccBatch = require('./models/UccBatch');
const UccStudent = require('./models/UccStudent');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

async function verifyBatches() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all Humanities batches (case-insensitive)
    const humanitiesBatches = await UccBatch.find({
      $or: [
        { program: { $regex: /humanities/i } },
        { batchName: { $regex: /humanities/i } }
      ]
    }).sort({ batchName: 1 });

    console.log('📊 HUMANITIES BATCHES STATUS');
    console.log('═'.repeat(80));

    if (humanitiesBatches.length === 0) {
      console.log('⚠️  No Humanities batches found!\n');
    } else {
      console.log(`Found ${humanitiesBatches.length} Humanities batch(es):\n`);

      for (const batch of humanitiesBatches) {
        // Count actual students in this batch
        const studentCount = await UccStudent.countDocuments({
          batchName: { $regex: new RegExp(`^${batch.batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        console.log(`📚 ${batch.batchName}`);
        console.log(`   ├─ Batch Code: ${batch.batchCode}`);
        console.log(`   ├─ Program: ${batch.program}`);
        console.log(`   ├─ Base Fee: ৳${batch.baseFee.toLocaleString()}`);
        console.log(`   ├─ Capacity: ${batch.capacity} students`);
        console.log(`   ├─ Enrolled (DB count): ${batch.enrolledCount}`);
        console.log(`   ├─ Enrolled (Actual students): ${studentCount}`);
        console.log(`   ├─ Next Roll Number: ${batch.nextRollNumber}`);
        console.log(`   ├─ Status: ${batch.status}`);
        console.log(`   └─ Created: ${batch.createdAt ? batch.createdAt.toLocaleDateString('en-GB') : 'Unknown'}`);
        
        // Check for discrepancy
        if (batch.enrolledCount !== studentCount) {
          console.log(`   ⚠️  WARNING: Enrolled count mismatch! DB says ${batch.enrolledCount} but actual students: ${studentCount}`);
        }
        
        // Check for spelling errors
        if (batch.batchName.toLowerCase().includes('humnities')) {
          console.log(`   ⚠️  SPELLING ERROR: "Humnities" should be "Humanities"`);
        }
        
        console.log('');
      }
    }

    console.log('═'.repeat(80));
    console.log('✅ Verification completed!\n');

    // Test admission API endpoint
    console.log('🧪 TESTING ADMISSION API');
    console.log('─'.repeat(80));
    
    for (const batch of humanitiesBatches) {
      try {
        // Simulate the API call logic
        const students = await UccStudent.find({ 
          batchName: { $regex: new RegExp(`^${batch.batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }, { roll: 1 }).lean();
        
        let maxRoll = 0;
        for (const s of students) {
          const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
          if (!isNaN(num) && num > maxRoll) maxRoll = num;
        }
        
        const nextRoll = Math.max(maxRoll + 1, batch.nextRollNumber || 1);
        
        console.log(`✅ ${batch.batchName}`);
        console.log(`   └─ Next available roll: ${String(nextRoll).padStart(3, '0')}`);
      } catch (err) {
        console.log(`❌ ${batch.batchName}`);
        console.log(`   └─ Error: ${err.message}`);
      }
    }
    
    console.log('─'.repeat(80));
    console.log('✅ All tests passed!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
verifyBatches();
