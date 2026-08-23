const fs = require('fs');
const FILE = 'backend/routes/ucc.js';
let c = fs.readFileSync(FILE, 'utf8');

/* =================  Update mark entry to save correct/wrong/negRate ================= */
const oldUpdate = `        await UccResult.findOneAndUpdate(
          { examId: exam._id, studentId: student._id },
          {
            studentRoll: student.roll,
            studentName: student.name,
            batchName: student.batchName,
            subjectMarks: entry.subjectMarks || [],
            totalObtained: entry.totalObtained,
            percentage,
            status: entry.totalObtained >= ((exam.subjects && exam.subjects.length && exam.subjects[0].passMarks) ? exam.subjects[0].passMarks : 40) ? 'Pass' : 'Fail'
          },
          { upsert: true, new: true }
        );`;

const newUpdate = `        await UccResult.findOneAndUpdate(
          { examId: exam._id, studentId: student._id },
          {
            studentRoll: student.roll,
            studentName: student.name,
            batchName: student.batchName,
            subjectMarks: entry.subjectMarks || [],
            totalObtained: entry.totalObtained,
            percentage,
            correct: entry.correct !== undefined ? entry.correct : null,
            wrong: entry.wrong !== undefined ? entry.wrong : null,
            negativeMarkPerWrong: entry.negRate !== undefined ? entry.negRate : (exam.negativeMarkPerWrong || 0.25),
            status: entry.totalObtained >= ((exam.subjects && exam.subjects.length && exam.subjects[0].passMarks) ? exam.subjects[0].passMarks : 40) ? 'Pass' : 'Fail'
          },
          { upsert: true, new: true }
        );`;

if (!c.includes(oldUpdate)) { console.error('ERR: mark entry update pattern not found'); process.exit(1); }
c = c.replace(oldUpdate, newUpdate, 1);

/* =================  Also update subjectMarks to include correct/wrong from mark entry ================= */
const oldSubj = `        subjectMarks: entry.subjectMarks || [],`;
const newSubj = `        subjectMarks: entry.subjectMarks || [],\n            correctEntry: entry.correct !== undefined ? entry.correct : null,\n            wrongEntry: entry.wrong !== undefined ? entry.wrong : null,`;

if (!c.includes(oldSubj)) { console.error('ERR: subject marks pattern not found'); process.exit(1); }
c = c.replace(oldSubj, newSubj, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('backend routes updated');