const fs = require('fs');

/* ============================================================
   FIX 1: backend/models/UccResult.js
   Add correctAnswer, wrongAnswer, negativeMarkPerWrong fields
   ============================================================ */
let p1 = 'backend/models/UccResult.js';
let c1 = fs.readFileSync(p1, 'utf8');

const old1 = `  subjectMarks: [{
    subjectName: String,
    marksObtained: Number
  }],
  
  totalObtained: { type: Number, required: true, default: 0 },`;
const new1 = `  subjectMarks: [{
    subjectName: String,
    marksObtained: Number
  }],
  
  correctAnswer: { type: Number, default: null },
  wrongAnswer: { type: Number, default: null },
  negativeMarkPerWrong: { type: Number, default: null },
  
  totalObtained: { type: Number, required: true, default: 0 },`;
if (!c1.includes(old1)) { console.error('FIX 1: Pattern not found'); process.exit(1); }
c1 = c1.replace(old1, new1, 1);
fs.writeFileSync(p1, c1, 'utf8');
console.log('FIX 1 applied: UccResult.js');

/* ============================================================
   FIX 2: UccExam.js — add negative marking config
   ============================================================ */
let p2 = 'backend/models/UccExam.js';
let c2 = fs.readFileSync(p2, 'utf8');

const old2 = `  totalMarks: { type: Number, required: true, default: 100 },
  subjects: [{`;
const new2 = `  totalMarks: { type: Number, required: true, default: 100 },
  negativeMarking: { type: Boolean, default: false },
  negativeMarkPerWrong: { type: Number, default: 0.25 },
  subjects: [{`;
if (!c2.includes(old2)) { console.error('FIX 2: Pattern not found'); process.exit(1); }
c2 = c2.replace(old2, new2, 1);
fs.writeFileSync(p2, c2, 'utf8');
console.log('FIX 2 applied: UccExam.js');

console.log('ALL MODEL FIXES APPLIED');