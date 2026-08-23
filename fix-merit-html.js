const fs = require('fs');
const FILE = 'frontend/ucc/merit-list.html';
let c = fs.readFileSync(FILE, 'utf8');

/* Replace table header - exact match from file content */
const oldHeadStart = `          <tr>
            <th class="ml-th-pos">Rank</th>
            <th>Student</th>
            <th class="ml-th-marks">Marks</th>
            <th class="ml-th-pct">Percentage</th>
            <th class="ml-th-grade">Grade</th>
            <th class="ml-th-status">Status</th>`;

const newHeadStart = `          <tr>
            <th class="ml-th-pos">Rank</th>
            <th>Student</th>
            <th class="ml-th-marks">Marks</th>
            <th class="ml-th-correct">Correct</th>
            <th class="ml-th-wrong">Wrong</th>
            <th class="ml-th-pct">Percentage</th>
            <th class="ml-th-grade">Grade</th>
            <th class="ml-th-status">Status`;

if (!c.includes(oldHeadStart)) { console.error('ERR: header start not found'); process.exit(1); }
c = c.replace(oldHeadStart, newHeadStart, 1);

/* Replace table body row - exact match */
const oldBodyRow = `      return \`<tr class="${rowCls}">
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

const newBodyRow = `      return \`<tr class="${rowCls}">
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

if (!c.includes(oldBodyRow)) { console.error('ERR: body row not found'); process.exit(1); }
c = c.replace(oldBodyRow, newBodyRow, 1);

/* Replace table footer - exact match */
const oldFootStart = `      <tr>
      <td colspan="2" style="text-align:right;color:#374151;font-size:12px;">
        <i class="fas fa-chart-line" style="color:#4f46e5;margin-right:4px;"></i> Class Average
      </td>
      <td class="tc" style="color:#4f46e5;font-size:15px;">${avg}</td>
      <td class="tc">
        <div class="ml-pct-cell">
          <span class="ml-pct-text" style="color:#4f46e5;">${avgPct}%</span>
          <div class="ml-pct-bar"><div class="ml-pct-fill good" style="width:${avgPct}%;"></div></div>
        </div>
      </td>
      <td></td>
      <td></td>`;

const newFootStart = `      <tr>
      <td colspan="2" style="text-align:right;color:#374151;font-size:12px;">
        <i class="fas fa-chart-line" style="color:#4f46e5;margin-right:4px;"></i> Class Average
      </td>
      <td class="tc" style="color:#4f46e5;font-size:15px;">${avg}</td>
      <td class="tc">
        <div>
          <span style="font-weight:700;color:#4f46e5;">${avg !== undefined ? avg : '—'}</span>
        </div>
      </td>
      <td class="tc">
        <div>
          <span style="font-weight:700;color:#dc2626;">Avg Wrong: ${(active.reduce((s,r)=> (r.wrong||0) + s, 0)/active.length||0)}</span>
        </div>
      </td>
      <td></td>
      <td></td>`;

if (!c.includes(oldFootStart)) { console.error('ERR: footer start not found'); process.exit(1); }
c = c.replace(oldFootStart, newFootStart, 1);

fs.writeFileSync(FILE, c, 'utf8');
console.log('merit-list.html updated');