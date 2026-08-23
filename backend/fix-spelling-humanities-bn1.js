// Optional script to fix the spelling of "Humnities BN 1" to "Humanities BN 1"
require('dotenv').config();
const mongoose = require('mongoose');
const UccBatch = require('./models/UccBatch');
const UccStudent = require('./models/UccStudent');
const UccPayment = require('./models/UccPayment');
const UccDistribution = require('./models/UccDistribution');
const UccResult = require('./models/UccResult');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student-management';

const OLD_NAME = 'Humnities BN 1';
const NEW_NAME = 'Humanities BN 1';

async function fixSpelling() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('🔍 Searching for batch with incorrect spelling...');
    const batch = await UccBatch.findOne({ batchName: OLD_NAME });

    if (!batch) {
      console.log('❌ Batch "Humnities BN 1" not found. Maybe it was already fixed?');
      process.exit(0);
    }

    console.log(`✅ Found batch: ${batch.batchName}`);
    console.log(`   ├─ Batch Code: ${batch.batchCode}`);
    console.log(`   ├─ Enrolled: ${batch.enrolledCount}`);
    console.log(`   └─ Capacity: ${batch.capacity}\n`);

    // Count affected records
    const studentCount = await UccStudent.countDocuments({ batchName: OLD_NAME });
    const paymentCount = await UccPayment.countDocuments({ batchName: OLD_NAME });
    const distributionCount = await UccDistribution.countDocuments({ batchName: OLD_NAME });
    const resultCount = await UccResult.countDocuments({ batchName: OLD_NAME });

    console.log('📊 Records that will be updated:');
    console.log(`   ├─ Batch record: 1`);
    console.log(`   ├─ Students: ${studentCount}`);
    console.log(`   ├─ Payments: ${paymentCount}`);
    console.log(`   ├─ Distributions: ${distributionCount}`);
    console.log(`   └─ Results: ${resultCount}`);
    console.log(`   Total: ${1 + studentCount + paymentCount + distributionCount + resultCount} records\n`);

    console.log('⚠️  WARNING: This will update the database!');
    console.log(`   Old name: "${OLD_NAME}"`);
    console.log(`   New name: "${NEW_NAME}"\n`);

    // Ask for confirmation (if running interactively)
    console.log('Starting update in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n🔧 Updating records...\n');

    // 1. Update Batch
    batch.batchName = NEW_NAME;
    await batch.save();
    console.log('✅ Updated batch record');

    // 2. Update Students
    const studentsResult = await UccStudent.updateMany(
      { batchName: OLD_NAME },
      { $set: { batchName: NEW_NAME } }
    );
    console.log(`✅ Updated ${studentsResult.modifiedCount} student records`);

    // 3. Update Payments
    const paymentsResult = await UccPayment.updateMany(
      { batchName: OLD_NAME },
      { $set: { batchName: NEW_NAME } }
    );
    console.log(`✅ Updated ${paymentsResult.modifiedCount} payment records`);

    // 4. Update Distributions
    const distributionsResult = await UccDistribution.updateMany(
      { batchName: OLD_NAME },
      { $set: { batchName: NEW_NAME } }
    );
    console.log(`✅ Updated ${distributionsResult.modifiedCount} distribution records`);

    // 5. Update Results
    const resultsResult = await UccResult.updateMany(
      { batchName: OLD_NAME },
      { $set: { batchName: NEW_NAME } }
    );
    console.log(`✅ Updated ${resultsResult.modifiedCount} result records`);

    console.log('\n═'.repeat(80));
    console.log('✅ Spelling correction completed successfully!');
    console.log(`   "${OLD_NAME}" → "${NEW_NAME}"`);
    console.log('═'.repeat(80));

    // Verify the fix
    console.log('\n🔍 Verifying the fix...');
    const oldBatch = await UccBatch.findOne({ batchName: OLD_NAME });
    const newBatch = await UccBatch.findOne({ batchName: NEW_NAME });
    const oldStudents = await UccStudent.countDocuments({ batchName: OLD_NAME });
    const newStudents = await UccStudent.countDocuments({ batchName: NEW_NAME });

    console.log(`   Old name "${OLD_NAME}": ${oldBatch ? 'Still exists ❌' : 'Not found ✅'}`);
    console.log(`   New name "${NEW_NAME}": ${newBatch ? 'Found ✅' : 'Not found ❌'}`);
    console.log(`   Students with old name: ${oldStudents} ${oldStudents === 0 ? '✅' : '❌'}`);
    console.log(`   Students with new name: ${newStudents} ${newStudents === studentCount ? '✅' : '⚠️'}`);

    console.log('\n✅ All done!\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
fixSpelling();
