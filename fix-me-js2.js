const fs = require('fs');
const FILE = 'frontend/ucc/assets/js/mark-entry.js';
let c = fs.readFileSync(FILE, 'utf8');

const INC = '\\n';
const TICK = '`';

/* Escaped pattern to match in mark-entry.js */
const oldTable =
  '          oninput="onMarkInput(' + '${i}' + ',this)"\n' +
  '          onkeydown="handleKey(event,' + '${i}' + ',\'mark\')"\n' +
  '        >\n' +
  '      </td>\n' +
  '      <td>\n' +
  '        <label class="me-absent-wrap">';

const newTable =
  '          oninput="onMarkInput(' + '${i}' + ',this)"\n' +
  '          onkeydown="handleKey(event,' + '${i}' + ',\'mark\')"\n' +
  '        >\n' +
  '      </td>\n' +
  '      <td>\n' +
  '        <input type="number" id="cor-' + '${i}' + '" class="me-neg-input"\n' +
  '          value="' + '${r.isAbsent?\'\':((r.correct!==undefined&&r.correct!==null)?r.correct:\'\')}' + '"\n' +
  '          min="0" max="' + '${currentExam.total}' + '" placeholder="—"\n' +
  '          ' + '${r.isAbsent?\'disabled\':negDisabled}' + '\n' +
  '          oninput="onNegInput(' + '${i}' + ',\'correct\',this)">\n' +
  '      </td>\n' +
  '      <td>\n' +
  '        <input type="number" id="wrg-' + '${i}' + '" class="me-neg-input"\n' +
  '          value="' + '${r.isAbsent?\'\':((r.wrong!==undefined&&r.wrong!==null)?r.wrong:\'\')}' + '"\n' +
  '          min="0" max="' + '${currentExam.total}' + '" placeholder="—"\n' +
  '          ' + '${r.isAbsent?\'disabled\':negDisabled}' + '\n' +
  '          oninput="onNegInput(' + '${i}' + ',\'wrong\',this)">\n' +
  '      </td>\n' +
  '      <td>\n' +
  '        <span id="neg-calc-' + '${i}' + '" style="font-weight:800;font-size:13px;">—</span>\n' +
  '      </td>\n' +
  '      <td>\n' +
  '        <label class="me-absent-wrap">';

if (!c.includes(oldTable)) { console.error('ERR: table pattern not found'); process.exit(1); }
c = c.replace(oldTable, newTable, 1);

/* Add negDisabled variable at start of renderEntryTable */
const oldStart = 'function renderEntryTable() {\n' +
  '  const tbody = $(\'meTableBody\');\n' +
  '  tbody.innerHTML = entryData.map((r, i) => {';
const newStart = 'function renderEntryTable() {\n' +
  '  const negOn = negMarkingActive;\n' +
  '  const negDisabled = negOn ? \'\' : \'disabled\';\n' +
  '  const tbody = $(\'meTableBody\');\n' +
  '  tbody.innerHTML = entryData.map((r, i) => {';

if (!c.includes(oldStart)) { console.error('ERR: renderEntryTable start not found'); process.exit(1); }
c = c.replace(oldStart, newStart, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('renderEntryTable updated');