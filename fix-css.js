const fs = require('fs');

/* ============================================================
   FIX: frontend/ucc/assets/css/mark-entry.css
   Add Negative Marking panel styles
   ============================================================ */
let p = 'frontend/ucc/assets/css/mark-entry.css';
let c = fs.readFileSync(p, 'utf8');

const newStyles = `
/* ── Negative Marking Panel ── */
.me-neg-panel {
  border: 2px solid #dbeafe;
  border-radius: 14px;
  margin: 14px 22px 0;
  overflow: hidden;
  background: #f8fafc;
}
.me-neg-panel-hdr {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #eff6ff, #e0e7ff);
  border-bottom: 1px solid #dbeafe;
}
.me-neg-hdr-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 17px;
  flex-shrink: 0;
}
.me-neg-panel-hdr h4 { margin: 0 0 2px; font-size: 15px; font-weight: 800; color: #1e1b4b; }
.me-neg-panel-hdr p  { margin: 0; font-size: 12px; color: #64748b; }
.me-neg-toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.me-neg-toggle input { display: none; }
.me-neg-toggle-slider {
  width: 42px;
  height: 22px;
  background: #cbd5e1;
  border-radius: 99px;
  position: relative;
  transition: .3s;
  flex-shrink: 0;
}
.me-neg-toggle-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: .3s;
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
}
.me-neg-toggle input:checked + .me-neg-toggle-slider {
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
}
.me-neg-toggle input:checked + .me-neg-toggle-slider::after {
  left: 23px;
}
.me-neg-toggle-label {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}
.me-neg-toggle input:checked ~ .me-neg-toggle-label {
  color: #4f46e5;
}
.me-neg-body {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.me-neg-config {
  display: flex;
  align-items: center;
  gap: 10px;
}
.me-neg-config-label {
  font-size: 13px;
  font-weight: 700;
  color: #1e1b4b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.me-neg-config-label i { color: #dc2626; }
.me-neg-select {
  padding: 7px 14px;
  border: 2px solid #4f46e5;
  border-radius: 10px;
  background: #fff;
  font-size: 14px;
  font-weight: 800;
  color: #4f46e5;
  outline: none;
  font-family: inherit;
  cursor: pointer;
  min-width: 90px;
}
.me-neg-info {
  margin: 0;
  font-size: 11.5px;
  color: #64748b;
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 6px 12px;
}
.me-neg-info i { color: #4f46e5; margin-right: 4px; }

/* Negative answer inputs */
.me-neg-input {
  width: 70px;
  padding: 8px 10px;
  text-align: center;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  outline: none;
  transition: .2s;
  background: #fff;
  color: #475569;
}
.me-neg-input:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124,58,237,.12);
}
.me-neg-input.filled {
  border-color: #a78bfa;
  background: #f5f3ff;
}
.me-neg-input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}
`;

c += newStyles;
fs.writeFileSync(p, c, 'utf8');
console.log('FIX applied: mark-entry.css');