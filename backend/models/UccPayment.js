const mongoose = require('mongoose');

const uccPaymentSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true, unique: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'UccStudent', required: true, index: true },
  studentRoll: { type: String, required: true },
  studentName: { type: String, required: true },
  batchName: { type: String, required: true },
  
  amount: { type: Number, required: true },
  paymentType: { type: String, enum: ['Admission', 'Installment', 'Due Clear'], default: 'Installment' },
  paymentMethod: { type: String, enum: ['Cash', 'bKash', 'Nagad', 'Bank', 'Bank Transfer', 'Card', 'POS Card', 'Online', 'Other'], default: 'Cash' },
  transactionId: { type: String, default: '' },
  
  previousDue: { type: Number, default: 0 },
  currentDue: { type: Number, default: 0 },
  
  collector: { type: String, default: 'Admin' },
  remarks: { type: String, default: '' },
  paymentDate: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('UccPayment', uccPaymentSchema);
