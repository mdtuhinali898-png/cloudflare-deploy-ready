const fs = require('fs');

/* ============================================================
   FIX 1: frontend/ucc/assets/js/mark-entry.js
   Sort students by roll ascending (numeric-aware)
   ============================================================ */
let p1 = 'frontend/ucc/assets/js/mark-entry.js';
let c1 = fs.readFileSync(p1, 'utf8');

const old1 = `      if (data.success && data.students) {
        return data.students.map(s => ({
          roll: s.roll,
          name: s.name,
          _id: s._id
        }));
      }`;
const new1 = `      if (data.success && data.students) {
        return data.students
          .map(s => ({
            roll: s.roll,
            name: s.name,
            _id: s._id
          }))
          .sort((a, b) => {
            const na = parseInt(String(a.roll).replace(/[^0-9]/g, ''), 10) || 0;
            const nb = parseInt(String(b.roll).replace(/[^0-9]/g, ''), 10) || 0;
            return na - nb;
          });
      }`;
if (!c1.includes(old1)) { console.error('FIX 1: Pattern not found'); process.exit(1); }
c1 = c1.replace(old1, new1, 1);

fs.writeFileSync(p1, c1, 'utf8');
console.log('FIX 1 applied: mark-entry.js');

/* ============================================================
   FIX 2: backend/routes/ucc.js
   GET /students — sort by roll ascending instead of createdAt desc
   ============================================================ */
let p2 = 'backend/routes/ucc.js';
let c2 = fs.readFileSync(p2, 'utf8');

const old2 = "    const students = await UccStudent.find(query).sort({ createdAt: -1 });\n    res.json({ success: true, count: students.length, students });";
const new2 = "    const students = await UccStudent.find(query).sort({ roll: 1 });\n    res.json({ success: true, count: students.length, students });";
if (!c2.includes(old2)) { console.error('FIX 2: Pattern not found'); process.exit(1); }
c2 = c2.replace(old2, new2, 1);

fs.writeFileSync(p2, c2, 'utf8');
console.log('FIX 2 applied: backend/routes/ucc.js');


