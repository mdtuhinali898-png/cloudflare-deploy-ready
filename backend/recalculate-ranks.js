// Script to recalculate all exam positions using dense ranking (1,2,2,3 not 1,2,2,4)
require('dotenv').config();
const mongoose = require('mongoose');
const Result = require('./models/Result');
const Exam = require('./models/Exam');

async function recalculateAllPositions() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const exams = await Exam.find({});
    console.log(`Found ${exams.length} exams to process`);

    let fixed = 0;

    for (const exam of exams) {
        const results = await Result.find({ examId: exam._id }).sort({ percentage: -1, totalMarks: -1 });
        if (results.length === 0) continue;

        let currentPos = 1;
        for (let i = 0; i < results.length; i++) {
            let newPos;
            if (i > 0 &&
                results[i].percentage === results[i - 1].percentage &&
                results[i].totalMarks === results[i - 1].totalMarks) {
                newPos = results[i - 1].position; // tie → same rank
            } else {
                newPos = currentPos;
                currentPos++;
            }

            if (results[i].position !== newPos) {
                results[i].position = newPos;
                await results[i].save();
                fixed++;
            }
        }

        // Print sample for this exam
        const sample = results.slice(0, 5).map(r => `${r.studentName}(${r.totalMarks}→rank${r.position})`).join(', ');
        console.log(`Exam: "${exam.name}" | ${results.length} students | Sample: ${sample}`);
    }

    console.log(`\nDone! Fixed ${fixed} result(s).`);
    await mongoose.disconnect();
}

recalculateAllPositions().catch(err => {
    console.error(err);
    process.exit(1);
});
