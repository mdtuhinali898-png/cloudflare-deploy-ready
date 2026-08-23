const fs = require('fs');

/* ============================================================
   FIX: frontend/ucc/mark-entry.html
   Add Negative Marking panel between stats and toolbar
   ============================================================ */
let p = 'frontend/ucc/mark-entry.html';
let c = fs.readFileSync(p, 'utf8');

const oldBlock = `    <!-- Toolbar -->
    <div class="me-toolbar">`;

const newBlock = `    <!-- Negative Marking Panel -->
    <div class="me-neg-panel" id="meNegPanel" style="display:none;">
      <div class="me-neg-panel-hdr">
        <div class="me-neg-hdr-icon"><i class="fas fa-balance-scale"></i></div>
        <div>
          <h4>Negative Marking System</h4>
          <p>Correct Answer থেকে Wrong Answer-এর জন্য নেগেটিভ কাটা হবে</p>
        </div>
        <label class="me-neg-toggle">
          <input type="checkbox" id="meNegEnabled" onchange="onNegEnabledChange(this)">
          <span class="me-neg-toggle-slider"></span>
          <span class="me-neg-toggle-label" id="meNegToggleLabel">Enabled</span>
        </label>
      </div>
      <div class="me-neg-body" id="meNegBody" style="display:none;">
        <div class="me-neg-config">
          <div class="me-neg-config-label">
            <i class="fas fa-minus-circle"></i>
            Negative Mark Per Wrong Answer:
          </div>
          <select id="meNegPerWrong" class="me-neg-select" onchange="onNegRateChange(this)">
            <option value="0.25">0.25</option>
            <option value="0.50">0.50</option>
            <option value="0.75">0.75</option>
            <option value="1.00">1.00</option>
          </select>
        </div>
        <p class="me-neg-info">
          <i class="fas fa-info-circle"></i>
          Marks = Correct Answer &minus; (Wrong Answer &times; Negative Mark)। সম্পূর্ণ student-দের জন্য একই মান প্রযোজ্য হবে।
        </p>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="me-toolbar">`;

if (!c.includes(oldBlock)) { console.error('HTML pattern not found'); process.exit(1); }
c = c.replace(oldBlock, newBlock, 1);

// Add Negative Marking button to toolbar (before সবাই Absent)
const oldBtn = `        <button class="btn btn-secondary btn-sm" onclick="markAllAbsent()">
          <i class="fas fa-user-slash"></i> সবাই Absent
        </button>`;
const newBtn = `        <button class="btn btn-secondary btn-sm" id="meNegBtn" onclick="toggleNegPanel()">
          <i class="fas fa-balance-scale"></i> Negative Marking
        </button>
        <button class="btn btn-secondary btn-sm" onclick="markAllAbsent()">
          <i class="fas fa-user-slash"></i> সবাই Absent
        </button>`;

if (!c.includes(oldBtn)) { console.error('HTML button pattern not found'); process.exit(1); }
c = c.replace(oldBtn, newBtn, 1);

// Add columns to table header: Correct, Wrong, Marks
const oldTh = `            <th style="width:160px;">Marks Obtained</th>
            <th style="width:110px;">Absent</th>`;
const newTh = `            <th style="width:160px;">Marks Obtained</th>
            <th style="width:110px;">Correct</th>
            <th style="width:110px;">Wrong</th>
            <th style="width:110px;">Absent</th>`;

if (!c.includes(oldTh)) { console.error('HTML th pattern not found'); process.exit(1); }
c = c.replace(oldTh, newTh, 1);

fs.writeFileSync(p, c, 'utf8');
console.log('FIX applied: mark-entry.html');