const mongoose = require('mongoose');

const uccResultSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'UccExam', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'UccStudent', required: true, index: true },
  studentRoll: { type: String, required: true },
  studentName: { type: String, required: true },
  batchName: { type: String, default: '' },
  
  subjectMarks: [{
    subjectName: String,
    marksObtained: Number
  }],
  
  correctAnswer: { type: Number, default: null },
  wrongAnswer: { type: Number, default: null },
  negativeMarkPerWrong: { type: Number, default: null },
  
  totalObtained: { type: Number, required: true, default: 0 },
  percentage: { type: Number, default: 0 },
  meritPosition: { type: Number, default: 0 },
  status: { type: String, enum: ['Pass', 'Fail', 'Absent'], default: 'Pass' }
}, {
  timestamps: true
});

module.exports = mongoose.model('UccResult', uccResultSchema);
