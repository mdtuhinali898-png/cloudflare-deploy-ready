const fs = require('fs');
const FILE = 'frontend/ucc/assets/js/merit-list.js';
let c = fs.readFileSync(FILE, 'utf8');

/* Update renderTable body row to include Correct/Wrong columns */
const oldRow = `    return \`<tr class="${rowCls}">
      <td class="tc"><span class="ml-rank ${rankCls}">${rankLabel}</span></td>
      <td>
        <div class="ml-student-cell">
          <span class="ml-student-name">${r.name}</span>
          <span class="ml-student-roll">Roll ${r.roll}</span>
        </div>
      </td>
      <td class="tc">
        <span class="${marksCls}">${r.isAbsent ? '—' : r.obtained}</span>
        <span class="ml-marks-total"> / ${exam.total}</span>
      </td>
      <td class="tc">
        <div class="ml-pct-cell">
          <span class="ml-pct-text">${r.isAbsent ? '—' : pct+'%'}</span>
          <div class="ml-pct-bar"><div class="ml-pct-fill ${pctBarCls}" style="width:${pct}%;"></div></div>
        </div>
      </td>
      <td class="tc"><span class="ml-grade ${mlGradeClass(r.grade)}">${r.grade}</span></td>
      <td class="tc">${statusHtml}</td>
    \`\`;`;

const newRow = `    return \`<tr class="${rowCls}">
      <td class="tc"><span class="ml-rank ${rankCls}">${rankLabel}</span></td>
      <td>
        <div class="ml-student-cell">
          <span class="ml-student-name">${r.name}</span>
          <span class="ml-student-roll">Roll ${r.roll}</span>
        </div>
      </td>
      <td class="tc">
        <span class="${marksCls}">${r.isAbsent ? '—' : r.obtained}</span>
        <span class="ml-marks-total"> / ${exam.total}</span>
      </td>
      <td class="tc">
        <div>
          <span class="ml-pct-text" style="font-weight:700;color:#4f46e5;">${r.correct !== undefined ? r.correct : '—'}</span>
        </div>
      </td>
      <td class="tc">
        <div>
          <span class="ml-pct-text" style="font-weight:700;color:#dc2626;">${r.wrong !== undefined ? r.wrong : '—'}</span>
        </div>
      </td>
      <td class="tc">
        <div class="ml-pct-cell">
          <span class="ml-pct-text">${r.isAbsent ? '—' : pct+'%'}</span>
          <div class="ml-pct-bar"><div class="ml-pct-fill ${pctBarCls}" style="width:${pct}%;"></div></div>
        </div>
      </td>
      <td class="tc"><span class="ml-grade ${mlGradeClass(r.grade)}">${r.grade}</span></td>
      <td class="tc">${statusHtml}</td>
    \`\`;`;

if (!c.includes(oldRow)) { console.error('ERR: row pattern not found'); process.exit(1); }
c = c.replace(oldRow, newRow, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('merit-list.js renderTable updated');