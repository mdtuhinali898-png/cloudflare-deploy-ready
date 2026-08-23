const mongoose = require('mongoose');

const uccExamSchema = new mongoose.Schema({
  examCode: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  program: { type: String, default: 'Medical' },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'UccBatch' },
  batchName: { type: String, default: '' },
  examDate: { type: Date, default: Date.now },
  totalMarks: { type: Number, required: true, default: 100 },
  negativeMarking: { type: Boolean, default: false },
  negativeMarkPerWrong: { type: Number, default: 0.25 },
  subjects: [{
    subjectName: { type: String, required: true },
    fullMarks: { type: Number, required: true },
    passMarks: { type: Number, default: 0 }
  }],
  status: { type: String, enum: ['Scheduled', 'Completed'], default: 'Scheduled' }
}, {
  timestamps: true
});

module.exports = mongoose.model('UccExam', uccExamSchema);
