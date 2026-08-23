const mongoose = require('mongoose');

const uccMaterialSchema = new mongoose.Schema({
  materialCode: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },

  /* ── Scope System ── */
  scope: { type: String, enum: ['program', 'batch', 'all'], default: 'all' },
  applicableProgram: { type: String, default: '' },
  program: { type: String, default: 'All' },
  applicableBatches: [{ type: String }],

  /* ── Stock & Inventory ── */
  stockQuantity:   { type: Number, default: 0 },    // current in-hand stock
  totalReceived:   { type: Number, default: 0 },    // সব stock entry এর sum
  distributedCount:{ type: Number, default: 0 },    // কতটা issue হয়েছে
  stockHistory: [{
    quantity:  { type: Number, required: true },
    date:      { type: Date,   default: Date.now },
    note:      { type: String, default: '' },
    addedBy:   { type: String, default: 'Admin' }
  }],

  paymentThreshold: { type: Number, default: 0 },
  status: { type: String, enum: ['Available', 'Low Stock', 'Out of Stock'], default: 'Available' }
}, {
  timestamps: true
});

// Auto-calculate status before saving
uccMaterialSchema.pre('save', function(next) {
  // Calculate status based on stockQuantity and totalReceived
  if (this.stockQuantity === 0) {
    this.status = 'Out of Stock';
  } else if (this.totalReceived > 0) {
    const percentage = (this.stockQuantity / this.totalReceived) * 100;
    if (percentage <= 20) {
      this.status = 'Low Stock';
    } else {
      this.status = 'Available';
    }
  } else {
    this.status = 'Available';
  }
  next();
});

module.exports = mongoose.model('UccMaterial', uccMaterialSchema);
