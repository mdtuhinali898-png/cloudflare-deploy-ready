const fs = require('fs');
const FILE = 'frontend/ucc/assets/js/mark-entry.js';
let c = fs.readFileSync(FILE, 'utf8');

/* =================  submitMarks update ================= */
const oldSubmit = `entryData.forEach(r => {
    results.push({
      examId:   currentExam.id,
      roll:     r.roll,
      name:     r.name,
      obtained: r.isAbsent ? 0 : Number(r.obtained),
      isAbsent: r.isAbsent,
      remarks:  r.remarks || ''
    });
  });`;

const newSubmit = `entryData.forEach(r => {
    results.push({
      examId:   currentExam.id,
      roll:     r.roll,
      name:     r.name,
      obtained: r.isAbsent ? 0 : Number(r.obtained),
      isAbsent: r.isAbsent,
      remarks:  r.remarks || '',
      correct:  r.correct !== undefined ? Number(r.correct) : null,
      wrong:    r.wrong !== undefined ? Number(r.wrong) : null,
      negRate:  r.negRate !== undefined ? Number(r.negRate) : 0.25
    });
  });`;

if (!c.includes(oldSubmit)) { console.error('ERR: submit pattern not found'); process.exit(1); }
c = c.replace(oldSubmit, newSubmit, 1);

/* =================  Add negGlobalRate declaration at top ================= */
const oldTop = `let negMarkingActive = false;\nlet negGlobalRate = 0.25;`;
const newTop = `let negMarkingActive = false;\nlet negGlobalRate = 0.25;\nlet negMode = 'global';`;

if (!c.includes(oldTop)) { console.error('ERR: neg top not found'); process.exit(1); }
c = c.replace(oldTop, newTop, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('submitMarks updated');