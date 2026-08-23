// Script to create Humanities BN 2 batch if it doesn't exist
require('dotenv').config();
const mongoose = require('mongoose');
const UccBatch = require('./models/UccBatch');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

async function createHumanitiesBatch() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if Humanities BN 2 batch already exists
    const existingBatch = await UccBatch.findOne({ 
      batchName: { $regex: /^Humanities BN 2$/i }
    });

    if (existingBatch) {
      console.log('✅ Humanities BN 2 batch already exists:');
      console.log(`   - Batch Code: ${existingBatch.batchCode}`);
      console.log(`   - Batch Name: ${existingBatch.batchName}`);
      console.log(`   - Program: ${existingBatch.program}`);
      console.log(`   - Base Fee: ৳${existingBatch.baseFee}`);
      console.log(`   - Enrolled Count: ${existingBatch.enrolledCount}`);
      console.log(`   - Next Roll Number: ${existingBatch.nextRollNumber}`);
    } else {
      console.log('📝 Creating Humanities BN 2 batch...');
      
      const newBatch = new UccBatch({
        batchCode: 'HUM-BN2-2026',
        batchName: 'Humanities BN 2',
        program: 'Humanities',
        baseFee: 12000,
        capacity: 60,
        enrolledCount: 0,
        nextRollNumber: 1,
        status: 'Active'
      });

      await newBatch.save();
      
      console.log('✅ Humanities BN 2 batch created successfully:');
      console.log(`   - Batch Code: ${newBatch.batchCode}`);
      console.log(`   - Batch Name: ${newBatch.batchName}`);
      console.log(`   - Program: ${newBatch.program}`);
      console.log(`   - Base Fee: ৳${newBatch.baseFee}`);
      console.log(`   - Capacity: ${newBatch.capacity}`);
      console.log(`   - Next Roll Number: ${newBatch.nextRollNumber}`);
    }

    // Also check for other Humanities batches
    console.log('\n📊 Checking all Humanities batches...');
    const allHumanitiesBatches = await UccBatch.find({
      $or: [
        { program: { $regex: /humanities/i } },
        { batchName: { $regex: /humanities/i } }
      ]
    }).sort({ batchName: 1 });

    if (allHumanitiesBatches.length > 0) {
      console.log(`✅ Found ${allHumanitiesBatches.length} Humanities batch(es):`);
      allHumanitiesBatches.forEach(batch => {
        console.log(`   - ${batch.batchName} (${batch.batchCode}) - Enrolled: ${batch.enrolledCount}/${batch.capacity}`);
      });
    } else {
      console.log('⚠️  No other Humanities batches found');
    }

    console.log('\n✅ Script completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
createHumanitiesBatch();
