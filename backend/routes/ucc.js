const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const UccStudent = require('../models/UccStudent');
const UccPayment = require('../models/UccPayment');
const UccBatch = require('../models/UccBatch');
const UccMaterial = require('../models/UccMaterial');
const UccDistribution = require('../models/UccDistribution');
const UccExam = require('../models/UccExam');
const UccResult = require('../models/UccResult');
const UccSettings = require('../models/UccSettings');
const UccExpense = require('../models/UccExpense');

// Helper to generate unique receipt numbers
async function generateReceiptNo() {
  const year = new Date().getFullYear();
  let receiptNo;
  let attempts = 0;
  const maxAttempts = 100;
  
  // Try to generate a unique receipt number
  while (attempts < maxAttempts) {
    const count = await UccPayment.countDocuments();
    const nextNum = (count + 1 + attempts).toString().padStart(4, '0');
    receiptNo = `UCC-REC-${year}-${nextNum}`;
    
    // Check if this receipt number already exists
    const existing = await UccPayment.findOne({ receiptNo });
    if (!existing) {
      return receiptNo; // Found a unique one!
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp if all attempts failed
  const timestamp = Date.now().toString().slice(-6);
  return `UCC-REC-${year}-${timestamp}`;
}

// Helper to generate unique voucher numbers
async function generateVoucherNo() {
  const year = new Date().getFullYear();
  let voucherNo;
  let attempts = 0;
  const maxAttempts = 100;
  
  // Try to generate a unique voucher number
  while (attempts < maxAttempts) {
    const count = await UccDistribution.countDocuments();
    const nextNum = (count + 1 + attempts).toString().padStart(4, '0');
    voucherNo = `UCC-VOU-${year}-${nextNum}`;
    
    // Check if this voucher number already exists
    const existing = await UccDistribution.findOne({ voucherNo });
    if (!existing) {
      return voucherNo; // Found a unique one!
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp if all attempts failed
  const timestamp = Date.now().toString().slice(-6);
  return `UCC-VOU-${year}-${timestamp}`;
}

// =================================================================
// 🎓 1. ADMISSION & STUDENT CREATION
// =================================================================

// Get Next Available Roll for Batch
router.get('/admission/next-roll/:batchName', async (req, res) => {
  try {
    const batchName = decodeURIComponent(req.params.batchName);

    // Find batch in UccBatch collection with case-insensitive search
    let batch = await UccBatch.findOne({ 
      batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    
    // If not found by name, try by batchCode
    if (!batch) {
      batch = await UccBatch.findOne({ 
        batchCode: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }

    // Always query students by batchName (case-insensitive) — this is the source of truth
    const students = await UccStudent.find({ 
      batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }, { roll: 1 }).lean();
    
    let maxRoll = 0;
    for (const s of students) {
      const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num > maxRoll) maxRoll = num;
    }

    const nextRoll = Math.max(maxRoll + 1, (batch ? batch.nextRollNumber : 1) || 1);

    console.log(`[NEXT-ROLL] batchName="${batchName}" | batch found: ${!!batch} | students found: ${students.length} | maxRoll: ${maxRoll} | nextRoll: ${nextRoll}`);

    res.json({ success: true, nextRoll, batchName, studentCount: students.length });
  } catch (error) {
    console.error('[NEXT-ROLL ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admission API (New Student Registration + First Payment)
router.post('/admission', async (req, res) => {
  try {
    const {
      name, phone, guardianPhone, guardianName, batchName, program,
      courseFee, discountType, discountValue, discountReference,
      initialPayment, paymentMethod, transactionId, collector
    } = req.body;

    if (!name || !phone || !batchName) {
      return res.status(400).json({ success: false, message: 'Name, Phone, and Batch are required' });
    }

    // Find or get batch details (case-insensitive search)
    let batch = await UccBatch.findOne({ 
      batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    
    // If batch not found, try to find by batchCode
    if (!batch) {
      batch = await UccBatch.findOne({ 
        batchCode: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }
    
    let rollNum = 1;
    let userRollInput = req.body.roll || req.body.customRoll;

    if (userRollInput !== undefined && userRollInput !== null && String(userRollInput).trim() !== '') {
      const parsed = parseInt(String(userRollInput).trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        rollNum = parsed;
      }
    } else {
      // Calculate next roll from actual student data by batchName (case-insensitive)
      const students = await UccStudent.find({ 
        batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }, { roll: 1 }).lean();
      
      let maxRoll = 0;
      for (const s of students) {
        const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > maxRoll) maxRoll = num;
      }
      rollNum = Math.max(maxRoll + 1, (batch ? batch.nextRollNumber : 1) || 1);
    }
    
    console.log(`[ADMISSION] batchName="${batchName}" | batch found: ${!!batch} | rollNum: ${rollNum}`);

    // Calculate Discount & Fees
    const fee = Number(courseFee) || (batch ? batch.baseFee : 15000);
    let discountAmt = 0;
    const discVal = Number(discountValue) || 0;

    if (discountType === 'percentage') {
      discountAmt = Math.round((fee * discVal) / 100);
    } else if (discountType === 'fixed') {
      discountAmt = discVal;
    }

    const finalFee = Math.max(0, fee - discountAmt);
    const initialPaid = Number(initialPayment) || 0;
    const totalDue = Math.max(0, finalFee - initialPaid);

    let paymentStatus = 'Unpaid';
    if (totalDue === 0 && finalFee > 0) {
      paymentStatus = 'Full Paid';
    } else if (initialPaid > 0) {
      paymentStatus = 'Partial Paid';
    }

    const formattedRoll = String(userRollInput || rollNum).trim().padStart(3, '0');
    
    // Generate unique student ID
    // Use batch code prefix if available, otherwise use first 4 chars of batch name
    let batchPrefix = 'GEN';
    if (batch && batch.batchCode) {
      // Extract meaningful prefix from batch code (e.g., "HUM-BN2-2026" -> "HUMBN2")
      batchPrefix = batch.batchCode.replace(/[-\s]/g, '').substring(0, 6).toUpperCase();
    } else {
      // Use batch name (remove spaces and special chars)
      batchPrefix = batchName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    }
    
    // Check if student ID already exists and make it unique
    let studentId = `UCC-${batchPrefix}-${formattedRoll}`;
    let idCounter = 1;
    let existingStudent = await UccStudent.findOne({ studentId });
    
    while (existingStudent) {
      // If duplicate, append a counter or use timestamp
      studentId = `UCC-${batchPrefix}-${formattedRoll}-${idCounter}`;
      existingStudent = await UccStudent.findOne({ studentId });
      idCounter++;
      
      // Safety check to prevent infinite loop
      if (idCounter > 100) {
        studentId = `UCC-${batchPrefix}-${formattedRoll}-${Date.now().toString().slice(-4)}`;
        break;
      }
    }
    
    // Also check if roll number already exists in this batch
    const existingRoll = await UccStudent.findOne({ 
      batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      roll: formattedRoll
    });
    
    if (existingRoll) {
      // Roll already exists, auto-increment to find next available
      console.log(`[ADMISSION WARNING] Roll ${formattedRoll} already exists for ${existingRoll.name}`);
      
      // Find next available roll
      const allStudents = await UccStudent.find({ 
        batchName: { $regex: new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }, { roll: 1 }).lean();
      
      let maxRoll = 0;
      for (const s of allStudents) {
        const num = parseInt(String(s.roll || '').replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > maxRoll) maxRoll = num;
      }
      
      const nextAvailableRoll = (maxRoll + 1).toString().padStart(3, '0');
      
      return res.status(400).json({ 
        success: false, 
        message: `Roll number ${formattedRoll} is already assigned to ${existingRoll.name} in ${batchName}. Please use roll ${nextAvailableRoll} or higher.`,
        suggestedRoll: nextAvailableRoll
      });
    }
    
    console.log(`[ADMISSION] Generated Student ID: ${studentId} | Roll: ${formattedRoll}`);

    // Create Student
    const student = new UccStudent({
      studentId,
      roll: formattedRoll,
      name,
      phone,
      guardianName: guardianName || '',
      guardianPhone: guardianPhone || '',
      batchId: batch ? batch._id : null,
      batchName,
      program: program || (batch ? batch.program : 'Medical'),
      courseFee: fee,
      discountType: discountType || 'none',
      discountValue: discVal,
      discountAmount: discountAmt,
      discountReference: discountReference || '',
      finalFee,
      totalPaid: initialPaid,
      totalDue,
      paymentStatus
    });

    await student.save();

    // Increment batch rolls & count if batch exists
    if (batch) {
      const numericRoll = parseInt(formattedRoll, 10);
      if (!isNaN(numericRoll)) {
        batch.nextRollNumber = Math.max(batch.nextRollNumber, numericRoll + 1);
      } else {
        batch.nextRollNumber += 1;
      }
      batch.enrolledCount += 1;
      await batch.save();
    }

    // Create Initial Payment Receipt if initial payment > 0
    let receipt = null;
    if (initialPaid > 0) {
      const receiptNo = await generateReceiptNo();
      receipt = new UccPayment({
        receiptNo,
        studentId: student._id,
        studentRoll: student.roll,
        studentName: student.name,
        batchName: student.batchName,
        amount: initialPaid,
        paymentType: 'Admission',
        paymentMethod: paymentMethod || 'Cash',
        transactionId: transactionId || '',
        previousDue: finalFee,
        currentDue: totalDue,
        collector: collector || 'Admin'
      });
      await receipt.save();
    }

    res.status(201).json({
      success: true,
      message: 'Student admitted successfully',
      student,
      receipt
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 👥 2. STUDENTS LIST & PROFILE
// =================================================================

// Get Students List with Search & Filters
router.get('/students', async (req, res) => {
  try {
    const { search, batch, status, paymentStatus } = req.query;
    let query = {};

    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (batch) query.batchName = batch;

    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { studentId: new RegExp(search, 'i') },
        { roll: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { guardianPhone: new RegExp(search, 'i') }
      ];
    }

    const students = await UccStudent.find(query).sort({ roll: 1 });
    res.json({ success: true, count: students.length, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Single Student Profile with Full Financial & Distribution History
router.get('/students/:id', async (req, res) => {
  try {
    const student = await UccStudent.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const payments = await UccPayment.find({ studentId: student._id }).sort({ paymentDate: -1 });
    const distributions = await UccDistribution.find({ studentId: student._id }).sort({ issuedDate: -1 });
    const results = await UccResult.find({ studentId: student._id }).populate('examId').sort({ createdAt: -1 });

    res.json({
      success: true,
      student,
      payments,
      distributions,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Material Distribution Override Permission for Student
router.put('/students/:id/override', async (req, res) => {
  try {
    const { distributionOverride, overrideApprovedBy, overrideReason } = req.body;
    const student = await UccStudent.findByIdAndUpdate(
      req.params.id,
      { distributionOverride, overrideApprovedBy, overrideReason },
      { new: true }
    );
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update UCC Student (Full Profile Edit)
router.put('/students/:id', async (req, res) => {
  try {
    let query = { studentId: req.params.id };
    if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { $or: [{ _id: req.params.id }, { studentId: req.params.id }] };
    }

    const currentStudent = await UccStudent.findOne(query);
    if (!currentStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const {
      roll, name, phone, guardianName, guardianPhone, batchName, program, branch,
      courseFee, discountType, discountValue, discountReference, status, notes, address, email, photo
    } = req.body;

    // Check roll duplicate if changed
    if (roll && roll !== currentStudent.roll) {
      const existingRoll = await UccStudent.findOne({ roll, _id: { $ne: currentStudent._id } });
      if (existingRoll) {
        return res.status(400).json({ success: false, message: `Roll ${roll} is already assigned to another student (${existingRoll.name}).` });
      }
      currentStudent.roll = roll;
    }

    if (name) currentStudent.name = name;
    if (phone) currentStudent.phone = phone;
    if (guardianName !== undefined) currentStudent.guardianName = guardianName;
    if (guardianPhone !== undefined) currentStudent.guardianPhone = guardianPhone;
    if (program) currentStudent.program = program;
    if (branch) currentStudent.branch = branch;
    if (status) currentStudent.status = status;
    if (notes !== undefined) currentStudent.notes = notes;
    if (address !== undefined) currentStudent.address = address;
    if (email !== undefined) currentStudent.email = email;
    if (photo !== undefined) currentStudent.photo = photo;

    // Update batch if provided
    if (batchName && batchName !== currentStudent.batchName) {
      currentStudent.batchName = batchName;
      const batchDoc = await UccBatch.findOne({ batchName });
      if (batchDoc) {
        currentStudent.batchId = batchDoc._id;
      }
    }

    // Financial fee & discount calculations
    if (courseFee !== undefined || discountType !== undefined || discountValue !== undefined) {
      const fee = courseFee !== undefined ? Number(courseFee) : currentStudent.courseFee;
      const dType = discountType !== undefined ? discountType : currentStudent.discountType;
      const dVal = discountValue !== undefined ? Number(discountValue) : currentStudent.discountValue;

      let discountAmt = 0;
      if (dType === 'percentage') {
        discountAmt = Math.round((fee * dVal) / 100);
      } else if (dType === 'fixed') {
        discountAmt = dVal;
      }

      const finalFee = Math.max(0, fee - discountAmt);
      const totalPaid = currentStudent.totalPaid || 0;
      const totalDue = Math.max(0, finalFee - totalPaid);

      let paymentStatus = 'Unpaid';
      if (totalDue === 0 && finalFee > 0) {
        paymentStatus = 'Full Paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'Partial Paid';
      }

      currentStudent.courseFee = fee;
      currentStudent.discountType = dType;
      currentStudent.discountValue = dVal;
      currentStudent.discountAmount = discountAmt;
      if (discountReference !== undefined) currentStudent.discountReference = discountReference;
      currentStudent.finalFee = finalFee;
      currentStudent.totalDue = totalDue;
      currentStudent.paymentStatus = paymentStatus;
    } else if (discountReference !== undefined) {
      currentStudent.discountReference = discountReference;
    }

    await currentStudent.save();

    res.json({
      success: true,
      message: 'Student profile updated successfully',
      student: currentStudent
    });
  } catch (error) {
    console.error('Error updating UCC student:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle UCC Student Status (Active / Inactive)
router.patch('/students/:id/status', async (req, res) => {
  try {
    let query = { $or: [{ studentId: req.params.id }, { roll: req.params.id }] };
    if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { $or: [{ _id: req.params.id }, { studentId: req.params.id }, { roll: req.params.id }] };
    }

    const student = await UccStudent.findOne(query);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const newStatus = req.body.status || (student.status === 'Active' ? 'Inactive' : 'Active');
    student.status = newStatus;
    await student.save();

    res.json({
      success: true,
      message: `Student status changed to ${newStatus}`,
      status: newStatus,
      student
    });
  } catch (error) {
    console.error('Error toggling student status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete UCC Student (with records cleanup)
router.delete('/students/:id', async (req, res) => {
  try {
    let query = { $or: [{ studentId: req.params.id }, { roll: req.params.id }] };
    if (req.params.id && req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { $or: [{ _id: req.params.id }, { studentId: req.params.id }, { roll: req.params.id }] };
    }

    const student = await UccStudent.findOne(query);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const studentMongoId = student._id;

    // Clean up related records
    await UccPayment.deleteMany({ studentId: studentMongoId });
    await UccDistribution.deleteMany({ studentId: studentMongoId });
    await UccResult.deleteMany({ studentId: studentMongoId });

    // Delete student record
    await UccStudent.findByIdAndDelete(studentMongoId);

    res.json({
      success: true,
      message: `Student ${student.name} (Roll: ${student.roll}) deleted successfully.`
    });
  } catch (error) {
    console.error('Error deleting UCC student:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 💰 3. PAYMENTS & DAILY STATEMENT
// =================================================================

// Collect Installment Payment
router.post('/payments', async (req, res) => {
  try {
    const { studentId, amount, paymentMethod, transactionId, collector, remarks, additionalDiscount } = req.body;
    
    const student = await UccStudent.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    const addDisc = Number(additionalDiscount) || 0;
    if (addDisc > 0) {
      student.discountAmount = (student.discountAmount || 0) + addDisc;
      student.finalFee = Math.max(0, (student.courseFee || 0) - student.discountAmount);
    }

    const previousDue = student.totalDue;
    const currentDue = Math.max(0, previousDue - payAmount - addDisc);
    const newTotalPaid = student.totalPaid + payAmount;

    let paymentStatus = 'Unpaid';
    if (currentDue === 0) {
      paymentStatus = 'Full Paid';
    } else if (newTotalPaid > 0) {
      paymentStatus = 'Partial Paid';
    }

    // Update Student Ledger
    student.totalPaid = newTotalPaid;
    student.totalDue = currentDue;
    student.paymentStatus = paymentStatus;
    await student.save();

    // Create Payment Receipt
    const receiptNo = await generateReceiptNo();
    const payment = new UccPayment({
      receiptNo,
      studentId: student._id,
      studentRoll: student.roll,
      studentName: student.name,
      batchName: student.batchName,
      amount: payAmount,
      paymentType: 'Installment',
      paymentMethod: paymentMethod || 'Cash',
      transactionId: transactionId || '',
      previousDue,
      currentDue,
      collector: collector || 'Admin',
      remarks: remarks || (addDisc > 0 ? `Additional discount: ৳${addDisc}` : '')
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Payment collected successfully',
      payment,
      student
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Payment Receipt by Receipt Number
router.get('/payments/receipt/:receiptNo', async (req, res) => {
  try {
    let receiptParam = (req.params.receiptNo || '').trim();
    console.log('[UCC RECEIPT API] Searching for receipt:', receiptParam, 'Roll:', req.query.roll);
    
    let payment = await UccPayment.findOne({ receiptNo: receiptParam });
    if (!payment) {
      payment = await UccPayment.findOne({ receiptNo: { $regex: new RegExp(`^${receiptParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    }
    
    // If receipt not found by receiptNo, try searching by studentId pattern (for admission receipts)
    if (!payment && receiptParam.includes('UCC-')) {
      const student = await UccStudent.findOne({ studentId: receiptParam });
      if (student) {
        payment = await UccPayment.findOne({ studentId: student._id }).sort({ paymentDate: -1 });
      }
    }
    
    // If still not found and roll is provided, fetch by roll
    if (!payment && req.query.roll) {
      payment = await UccPayment.findOne({ studentRoll: req.query.roll }).sort({ paymentDate: -1 });
      console.log('[UCC RECEIPT API] Searching by roll:', req.query.roll, 'Found:', !!payment);
    }
    
    if (!payment) {
      console.log('[UCC RECEIPT API] Receipt not found:', receiptParam);
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }
    
    console.log('[UCC RECEIPT API] Payment found:', payment.receiptNo);

    // Robust Student Lookup (by ObjectId, studentId, or roll)
    let student = null;
    if (payment.studentId && mongoose.Types.ObjectId.isValid(payment.studentId)) {
      student = await UccStudent.findById(payment.studentId);
    }
    if (!student) {
      student = await UccStudent.findOne({
        $or: [
          { studentId: payment.studentId },
          { roll: payment.studentRoll }
        ]
      });
    }

    let history = [];
    if (student) {
      history = await UccPayment.find({ studentId: student._id }).sort({ paymentDate: 1 });
    } else if (payment.studentRoll) {
      history = await UccPayment.find({ studentRoll: payment.studentRoll }).sort({ paymentDate: 1 });
    }

    // Determine target batch name
    const targetBatchName = (student && student.batchName) || payment.batchName || '';

    // Lookup Batch Base Fee from UccBatch collection
    let batchBaseFee = 0;
    if (targetBatchName) {
      const bDoc = await UccBatch.findOne({ 
        batchName: { $regex: new RegExp(`^${targetBatchName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      });
      if (bDoc && bDoc.baseFee) {
        batchBaseFee = bDoc.baseFee;
      }
    }

    // Calculate fixed course fee (batch baseFee > student.courseFee > mathematical sum)
    let courseFee = batchBaseFee || (student && student.courseFee > 0 ? student.courseFee : 0);
    if (!courseFee && student) {
      courseFee = (student.totalPaid || 0) + (student.totalDue || 0) + (student.discountAmount || 0);
    }
    if (!courseFee) {
      const historyTotal = history.reduce((sum, h) => sum + (h.amount || 0), 0);
      courseFee = (historyTotal > 0 ? historyTotal : (payment.amount || 0)) + (payment.currentDue || 0);
    }

    const discountAmount = student ? (student.discountAmount || 0) : 0;
    const finalFee = student ? (student.finalFee || (courseFee - discountAmount)) : (courseFee - discountAmount);
    
    // Cumulative total paid by student up to this point
    const installmentSum = history.filter(h => !h.paymentType || !h.paymentType.toLowerCase().includes('admission')).reduce((sum, h) => sum + (h.amount || 0), 0);
    const totalDue = student ? student.totalDue : (payment.currentDue !== undefined ? payment.currentDue : Math.max(0, finalFee - (installmentSum + (payment.amount || 0))));
    const totalPaid = Math.max(0, finalFee - totalDue);

    // Ensure Admission payment is explicitly included in history
    const hasAdmissionPayment = history.some(h => (h.paymentType && h.paymentType.toLowerCase().includes('admission')));
    if (!hasAdmissionPayment) {
      const initialPaidAmt = Math.max(0, finalFee - totalDue - installmentSum);
      if (initialPaidAmt > 0) {
        history.unshift({
          receiptNo: `UCC-ADM-${student ? student.roll : payment.studentRoll}`,
          paymentDate: (student && (student.admissionDate || student.createdAt)) ? (student.admissionDate || student.createdAt) : payment.paymentDate,
          paymentType: 'Admission',
          paymentMethod: 'Cash',
          amount: initialPaidAmt,
          transactionId: ''
        });
      }
    }

    res.json({
      success: true,
      payment: {
        receiptNo: payment.receiptNo,
        date: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        paymentType: payment.paymentType,
        previousDue: payment.previousDue,
        currentDue: payment.currentDue,
        transactionId: payment.transactionId,
        collector: payment.collector,
        studentRoll: payment.studentRoll,
        studentName: payment.studentName,
        batchName: targetBatchName,
        totalFee: courseFee,
        discount: discountAmount,
        finalFee: finalFee,
        paid: payment.amount || 0,
        totalPaid: totalPaid,
        due: totalDue,
        status: totalDue === 0 ? 'Paid' : 'Partial'
      },
      student: student ? {
        roll: student.roll,
        name: student.name,
        guardian: student.guardianName || student.guardianPhone || '',
        batch: student.batchName,
        phone: student.phone,
        status: student.status,
        courseFee: courseFee,
        discountAmount: discountAmount,
        finalFee: finalFee,
        totalPaid: totalPaid,
        totalDue: totalDue
      } : {
        roll: payment.studentRoll,
        name: payment.studentName,
        guardian: '',
        batch: targetBatchName,
        phone: '',
        status: 'Active',
        courseFee: courseFee,
        discountAmount: discountAmount,
        finalFee: finalFee,
        totalPaid: totalPaid,
        totalDue: totalDue
      },
      history: history.map(h => ({
        receiptNo: h.receiptNo,
        date: h.paymentDate,
        type: h.paymentType,
        method: h.paymentMethod,
        amount: h.amount,
        trxId: h.transactionId
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Daily Collection Statement Report
router.get('/payments/daily-statement', async (req, res) => {
  try {
    const { startDate, endDate, collector, paymentMethod } = req.query;
    let filter = {};

    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        let end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = end;
      }
    } else {
      // Default: Today's transactions
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const endToday = new Date();
      endToday.setHours(23, 59, 59, 999);
      filter.paymentDate = { $gte: startToday, $lte: endToday };
    }

    if (collector) filter.collector = collector;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const payments = await UccPayment.find(filter).sort({ paymentDate: -1 });
    
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const count = payments.length;

    res.json({
      success: true,
      summary: {
        totalCollected,
        transactionCount: count
      },
      payments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 📚 4. MATERIAL INVENTORY & DISTRIBUTION
// =================================================================

// Get All Materials Catalog
router.get('/materials', async (req, res) => {
  try {
    const materials = await UccMaterial.find().sort({ createdAt: -1 });
    res.json({ success: true, count: materials.length, materials });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add New Material to Catalog
router.post('/materials', async (req, res) => {
  try {
    const { materialCode, title, program, scope, applicableProgram, applicableBatches, stockQuantity, paymentThreshold } = req.body;

    const material = new UccMaterial({
      materialCode,
      title,
      program: program || 'All',
      scope: scope || 'all',
      applicableProgram: applicableProgram || '',
      applicableBatches: applicableBatches || [],
      stockQuantity: Number(stockQuantity) || 100,
      paymentThreshold: Number(paymentThreshold) || 0
    });
    await material.save();
    res.status(201).json({ success: true, material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Material from Catalog
router.delete('/materials/:id', async (req, res) => {
  try {
    const material = await UccMaterial.findByIdAndDelete(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }
    res.json({ success: true, message: 'Material deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Material (Edit)
router.put('/materials/:id', async (req, res) => {
  try {
    const { materialCode, title, program, scope, applicableProgram, applicableBatches, stockQuantity, paymentThreshold, status } = req.body;
    const material = await UccMaterial.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          title,
          program: program || 'All',
          scope: scope || 'all',
          applicableProgram: applicableProgram || '',
          applicableBatches: applicableBatches || [],
          stockQuantity: Number(stockQuantity) || 100,
          paymentThreshold: Number(paymentThreshold) || 0,
          status: status || 'Available'
        }
      },
      { new: true, runValidators: true }
    );
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }
    res.json({ success: true, material });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 📦 STOCK MANAGEMENT — Add Stock Entry & Get History
// =================================================================

// Add Stock Entry (Restock)
router.post('/materials/:id/stock', async (req, res) => {
  try {
    const { quantity, date, note, addedBy } = req.body;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const material = await UccMaterial.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }

    // Stock history entry যোগ করো
    material.stockHistory.push({
      quantity: qty,
      date:     date ? new Date(date) : new Date(),
      note:     note || '',
      addedBy:  addedBy || 'Admin'
    });

    // totalReceived ও stockQuantity আপডেট
    material.totalReceived   = (material.totalReceived || 0) + qty;
    material.stockQuantity   = (material.stockQuantity  || 0) + qty;

    // Auto status update
    const pct = material.totalReceived > 0
      ? (material.stockQuantity / material.totalReceived) * 100 : 100;
    if (material.stockQuantity === 0)  material.status = 'Out of Stock';
    else if (pct <= 20)                material.status = 'Low Stock';
    else                               material.status = 'Available';

    await material.save();

    res.json({
      success: true,
      message: `${qty} units added to stock`,
      stockQuantity:  material.stockQuantity,
      totalReceived:  material.totalReceived,
      distributedCount: material.distributedCount,
      status: material.status,
      lastEntry: material.stockHistory[material.stockHistory.length - 1]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Stock History for a Material
router.get('/materials/:id/stock', async (req, res) => {
  try {
    const material = await UccMaterial.findById(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Material not found' });
    }

    res.json({
      success: true,
      title:            material.title,
      currentStock:     material.stockQuantity,    // renamed for frontend
      stockQuantity:    material.stockQuantity,    // keep for compatibility
      totalReceived:    material.totalReceived   || 0,
      distributedCount: material.distributedCount || 0,
      status:           material.status,
      history: material.stockHistory
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check Student Eligibility for Material Distribution
router.get('/distribution/check-eligibility/:studentId', async (req, res) => {
  try {
    const student = await UccStudent.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const previousDistributions = await UccDistribution.find({ studentId: student._id });

    // Extract all items already issued to this student
    const issuedItemIds = [];
    previousDistributions.forEach(d => {
      d.items.forEach(item => {
        if (item.materialId) issuedItemIds.push(item.materialId.toString());
      });
    });

    // Scope-based eligible material IDs for this student
    const allMaterials = await UccMaterial.find();
    const eligibleMaterialIds = allMaterials
      .filter(m => {
        const sc = m.scope || 'all';
        if (sc === 'all') return true;
        if (sc === 'program') {
          // student.program এবং material.applicableProgram case-insensitive match
          return (m.applicableProgram || '').toLowerCase().trim() ===
                 (student.program || '').toLowerCase().trim();
        }
        if (sc === 'batch') {
          return (m.applicableBatches || []).includes(student.batchName);
        }
        return false;
      })
      .map(m => m._id.toString());

    res.json({
      success: true,
      student,
      isEligible: student.totalDue === 0 || student.distributionOverride === true,
      hasDue: student.totalDue > 0,
      distributionOverride: student.distributionOverride,
      issuedItemIds,
      eligibleMaterialIds
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Issue Material Voucher
router.post('/distribution/issue', async (req, res) => {
  try {
    const { studentId, items, hasOverride, overrideReason, issuedBy } = req.body;
    
    const student = await UccStudent.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'No items selected for distribution' });
    }

    const voucherNo = await generateVoucherNo();
    const distribution = new UccDistribution({
      voucherNo,
      studentId: student._id,
      studentRoll: student.roll,
      studentName: student.name,
      batchName: student.batchName,
      items,
      hasOverride: hasOverride || false,
      overrideReason: overrideReason || '',
      issuedBy: issuedBy || 'Admin'
    });

    await distribution.save();

    // Update stock quantity for each material
    for (let item of items) {
      if (item.materialId) {
        const material = await UccMaterial.findById(item.materialId);
        if (material) {
          material.stockQuantity = (material.stockQuantity || 0) - 1;
          material.distributedCount = (material.distributedCount || 0) + 1;
          await material.save(); // This triggers pre-save hook for status calculation
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Materials issued successfully',
      distribution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 📑 5. BATCHES & EXAMS & MERIT LIST
// =================================================================

// Get Batches
router.get('/batches', async (req, res) => {
  try {
    const batches = await UccBatch.find().sort({ createdAt: -1 });
    res.json({ success: true, count: batches.length, batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Batch
router.post('/batches', async (req, res) => {
  try {
    const { batchCode, batchName, program, baseFee, capacity, nextRollNumber, startingRollNumber } = req.body;
    const initialRoll = Number(nextRollNumber || startingRollNumber) || 1;
    const batch = new UccBatch({
      batchCode,
      batchName,
      program,
      baseFee: Number(baseFee) || 15000,
      capacity: Number(capacity) || 60,
      nextRollNumber: initialRoll
    });
    await batch.save();
    res.status(201).json({ success: true, batch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Batch (Edit)
router.put('/batches/:id', async (req, res) => {
  try {
    const { batchCode, batchName, program, baseFee, capacity, status, nextRollNumber, startingRollNumber } = req.body;
    const updateData = {
      batchCode,
      batchName,
      program,
      baseFee: Number(baseFee) || 15000,
      capacity: Number(capacity) || 60,
      status
    };

    if (nextRollNumber !== undefined || startingRollNumber !== undefined) {
      updateData.nextRollNumber = Number(nextRollNumber || startingRollNumber) || 1;
    }

    const batch = await UccBatch.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    res.json({ success: true, batch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Batch (CASCADE: Deletes batch + all students + payments + results + distributions)
router.delete('/batches/:id', async (req, res) => {
  try {
    const batch = await UccBatch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batchName = batch.batchName;
    console.log(`[CASCADE DELETE] Starting deletion for batch: ${batchName}`);

    // Create case-insensitive regex pattern for exact match
    const batchNamePattern = new RegExp(`^${batchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // 1. Find all students in this batch
    const students = await UccStudent.find({ 
      batchName: batchNamePattern
    });
    const studentIds = students.map(s => s._id);
    
    console.log(`[CASCADE DELETE] Found ${students.length} students in batch ${batchName}`);
    if (students.length > 0) {
      console.log('[CASCADE DELETE] Sample students:', students.slice(0, 3).map(s => `${s.roll}: ${s.name}`).join(', '));
    }

    // 2. Delete all payments for these students
    const paymentsDeleted = await UccPayment.deleteMany({ studentId: { $in: studentIds } });
    console.log(`[CASCADE DELETE] Deleted ${paymentsDeleted.deletedCount} payment records`);

    // 3. Delete all distributions for these students
    const distributionsDeleted = await UccDistribution.deleteMany({ studentId: { $in: studentIds } });
    console.log(`[CASCADE DELETE] Deleted ${distributionsDeleted.deletedCount} distribution records`);

    // 4. Delete all results for these students
    const resultsDeleted = await UccResult.deleteMany({ studentId: { $in: studentIds } });
    console.log(`[CASCADE DELETE] Deleted ${resultsDeleted.deletedCount} result records`);

    // 5. Delete all students in this batch
    const studentsDeleted = await UccStudent.deleteMany({ 
      batchName: batchNamePattern
    });
    console.log(`[CASCADE DELETE] Deleted ${studentsDeleted.deletedCount} student records`);

    // 6. Finally delete the batch itself
    await UccBatch.findByIdAndDelete(req.params.id);
    console.log(`[CASCADE DELETE] Deleted batch: ${batchName}`);

    // Verify deletion
    const remainingStudents = await UccStudent.find({ batchName: batchNamePattern });
    if (remainingStudents.length > 0) {
      console.warn(`[CASCADE DELETE WARNING] ${remainingStudents.length} students still remain!`);
    }

    res.json({ 
      success: true, 
      message: `Batch "${batchName}" and all related data deleted successfully`,
      deleted: {
        batch: batchName,
        students: studentsDeleted.deletedCount,
        payments: paymentsDeleted.deletedCount,
        distributions: distributionsDeleted.deletedCount,
        results: resultsDeleted.deletedCount
      }
    });
  } catch (error) {
    console.error('[CASCADE DELETE ERROR]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get All Exams
router.get('/exams', async (req, res) => {
  try {
    const exams = await UccExam.find().sort({ createdAt: -1 });
    res.json({ success: true, count: exams.length, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Single Exam
router.get('/exams/:id', async (req, res) => {
  try {
    const exam = await UccExam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create Exam
router.post('/exams', async (req, res) => {
  try {
    const { examCode, title, program, batchId, batchName, totalMarks, subjects, examDate, status, negativeMarking, negativeMarkPerWrong } = req.body;
    const exam = new UccExam({
      examCode: examCode || 'EX' + Date.now().toString().slice(-6),
      title,
      program,
      batchId: batchId || null,
      batchName: batchName || '',
      examDate: examDate || Date.now(),
      totalMarks: Number(totalMarks) || 100,
      negativeMarking: negativeMarking === true || negativeMarking === 'true',
      negativeMarkPerWrong: negativeMarkPerWrong != null ? Number(negativeMarkPerWrong) : 0.25,
      subjects: subjects || [],
      status: status || 'Scheduled'
    });
    await exam.save();
    res.status(201).json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Exam
router.put('/exams/:id', async (req, res) => {
  try {
    const { examCode, title, program, batchId, batchName, totalMarks, subjects, examDate, status, negativeMarking, negativeMarkPerWrong } = req.body;
    const exam = await UccExam.findByIdAndUpdate(
      req.params.id,
      {
        examCode, title, program,
        batchId: batchId || null,
        batchName: batchName || '',
        examDate: examDate || Date.now(),
        totalMarks: Number(totalMarks) || 100,
        negativeMarking: negativeMarking === true || negativeMarking === 'true',
        negativeMarkPerWrong: negativeMarkPerWrong != null ? Number(negativeMarkPerWrong) : 0.25,
        subjects: (subjects && subjects.length) ? subjects : undefined,
        status: status || 'Scheduled'
      },
      { new: true, runValidators: true }
    );
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete Exam
router.delete('/exams/:id', async (req, res) => {
  try {
    const exam = await UccExam.findByIdAndDelete(req.params.id);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    // Also delete associated results
    await UccResult.deleteMany({ examId: exam._id });
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Entry Marks & Automatically Calculate Merit List Positions
router.post('/results/mark-entry', async (req, res) => {
  try {
    const { examId, markEntries } = req.body; // markEntries: [{ studentId, subjectMarks, totalObtained }]
    const exam = await UccExam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    // Save or update results for each student
    for (let entry of markEntries) {
      const student = await UccStudent.findById(entry.studentId);
      if (student) {
        // Bug 1 fix: Absent status — trust the frontend status field directly
        const isAbsent = entry.status === 'Absent';
        const passMarks = (exam.subjects && exam.subjects.length && exam.subjects[0].passMarks)
          ? exam.subjects[0].passMarks : 40;
        let resultStatus;
        if (isAbsent) {
          resultStatus = 'Absent';
        } else {
          resultStatus = entry.totalObtained >= passMarks ? 'Pass' : 'Fail';
        }

        // Bug 2 fix: correct/wrong → correctAnswer/wrongAnswer (model field names)
        const percentage = isAbsent ? 0 : Math.round((entry.totalObtained / exam.totalMarks) * 100);
        await UccResult.findOneAndUpdate(
          { examId: exam._id, studentId: student._id },
          { $set: {
            studentRoll: student.roll,
            studentName: student.name,
            batchName: student.batchName,
            subjectMarks: entry.subjectMarks || [],
            correctAnswer: (entry.correct !== undefined && entry.correct !== null) ? Number(entry.correct) : null,
            wrongAnswer:   (entry.wrong   !== undefined && entry.wrong   !== null) ? Number(entry.wrong)   : null,
            negativeMarkPerWrong: entry.negRate != null ? Number(entry.negRate) : (exam.negativeMarkPerWrong || 0.25),
            totalObtained: isAbsent ? 0 : entry.totalObtained,
            percentage,
            status: resultStatus
          }},
          { upsert: true, new: true }
        );
      }
    }

    // Bug 3 fix: Tie-breaking — same totalObtained gets same merit position
    // Absent students go to the bottom regardless of marks
    const allResults = await UccResult.find({ examId: exam._id })
      .sort({ totalObtained: -1 });

    // Separate absent and non-absent, sort non-absent by marks desc
    const present = allResults.filter(r => r.status !== 'Absent')
                               .sort((a, b) => b.totalObtained - a.totalObtained);
    const absent  = allResults.filter(r => r.status === 'Absent');

    let rank = 1;
    for (let idx = 0; idx < present.length; idx++) {
      const resDoc = present[idx];
      if (idx > 0 && resDoc.totalObtained === present[idx - 1].totalObtained) {
        resDoc.meritPosition = present[idx - 1].meritPosition; // same marks → same position (dense ranking)
        // rank does NOT increment on tie → next unique score gets consecutive rank (1,2,2,3 not 1,2,2,4)
      } else {
        resDoc.meritPosition = rank;
        rank++;
      }
      await resDoc.save();
    }
    for (let resDoc of absent) {
      resDoc.meritPosition = 0; // 0 = no position
      await resDoc.save();
    }

    res.json({ success: true, message: 'Marks saved and Merit List generated successfully', count: allResults.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Merit List for an Exam
router.get('/results/merit-list/:examId', async (req, res) => {
  try {
    const exam = await UccExam.findById(req.params.examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const meritList = await UccResult.find({ examId: exam._id })
      .populate('studentId', 'phone guardianPhone')
      .sort({ meritPosition: 1 });
    res.json({ success: true, exam, meritList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 📊 7. REPORTS & ANALYTICS
// =================================================================

// Comprehensive Reports Data for the Reports page
router.get('/reports', async (req, res) => {
  try {
    const { from, to, batch, method } = req.query;

    // Fetch all students
    let studentQuery = {};
    if (batch && batch !== 'all') studentQuery.batchName = batch;
    const students = await UccStudent.find(studentQuery).sort({ roll: 1 });

    // Fetch all payments with optional date/method filters
    let paymentFilter = {};
    if (from || to) {
      paymentFilter.paymentDate = {};
      if (from) paymentFilter.paymentDate.$gte = new Date(from);
      if (to) {
        let end = new Date(to);
        end.setHours(23, 59, 59, 999);
        paymentFilter.paymentDate.$lte = end;
      }
    }
    if (method && method !== 'all') paymentFilter.paymentMethod = method;
    if (batch && batch !== 'all') paymentFilter.batchName = batch;

    const payments = await UccPayment.find(paymentFilter).sort({ paymentDate: -1 });

    // Fetch all batches
    const batches = await UccBatch.find().sort({ createdAt: -1 });

    // Fetch all materials
    const materials = await UccMaterial.find().sort({ createdAt: -1 });

    // Fetch all distributions
    const distributions = await UccDistribution.find().sort({ issuedDate: -1 });

    // Build material stats: eligible students per material
    // A student is eligible for a material if their totalDue === 0 or they have distributionOverride
    const materialStats = materials.map(m => {
      // Find students in applicable batches or all students if no batch specified
      let eligibleStudents = [];
      if (m.applicableBatches && m.applicableBatches.length > 0) {
        eligibleStudents = students.filter(s => 
          m.applicableBatches.includes(s.batchName) && 
          (s.totalDue === 0 || s.distributionOverride === true)
        );
      } else {
        // If no specific batches, consider all students with no due or override
        eligibleStudents = students.filter(s => 
          s.totalDue === 0 || s.distributionOverride === true
        );
      }

      // Count issued copies for this material
      let issuedCount = 0;
      distributions.forEach(d => {
        d.items.forEach(item => {
          if (item.materialId && item.materialId.toString() === m._id.toString()) {
            issuedCount += item.quantity || 1;
          }
        });
      });

      // Fallback: use distributedCount from material model
      if (issuedCount === 0 && m.distributedCount > 0) {
        issuedCount = m.distributedCount;
      }

      return {
        _id: m._id,
        title: m.title,
        category: m.program || 'All',
        batch: m.applicableBatches && m.applicableBatches.length ? m.applicableBatches.join(', ') : 'All batches',
        limit: m.paymentThreshold || 0,
        eligible: eligibleStudents.length,
        issued: issuedCount,
        pending: Math.max(0, eligibleStudents.length - issuedCount),
        fulfillment: eligibleStudents.length ? Math.round(issuedCount / eligibleStudents.length * 100) : 0
      };
    });

    // Build batch summary with student financial data
    const batchSummary = batches.map(b => {
      const batchStudents = students.filter(s => s.batchName === b.batchName);
      const totalFee = batchStudents.reduce((a, s) => a + (s.finalFee || s.courseFee || 0), 0);
      const totalPaid = batchStudents.reduce((a, s) => a + (s.totalPaid || 0), 0);
      const totalDue = batchStudents.reduce((a, s) => a + (s.totalDue || 0), 0);
      const paidCount = batchStudents.filter(s => (s.totalDue || 0) === 0).length;
      const dueCount = batchStudents.filter(s => (s.totalDue || 0) > 0).length;
      const rate = totalFee ? Math.round(totalPaid / totalFee * 100) : 0;

      return {
        _id: b._id,
        id: b._id.toString(),
        name: b.batchName,
        batchName: b.batchName,
        batchCode: b.batchCode,
        category: b.program,
        program: b.program,
        session: b.startDate ? new Date(b.startDate).getFullYear().toString() : '2026',
        capacity: b.capacity || 60,
        coordinator: b.coordinator || '',
        startDate: b.startDate ? b.startDate.toISOString().split('T')[0] : '',
        endDate: b.endDate ? b.endDate.toISOString().split('T')[0] : '',
        admissionFee: b.admissionFee || 0,
        courseFee: b.baseFee || 0,
        baseFee: b.baseFee || 0,
        notes: b.notes || '',
        status: b.status || 'Active',
        enrolledCount: batchStudents.length,
        students: batchStudents.length,
        totalFee,
        totalPaid,
        totalDue,
        paidCount,
        dueCount,
        rate
      };
    });

    // Build student list with materials
    const studentList = students.map(s => {
      // Find distributions for this student
      const studentDistributions = distributions.filter(d => 
        d.studentId && d.studentId.toString() === s._id.toString()
      );
      
      // Extract material names
      const materialNames = [];
      studentDistributions.forEach(d => {
        d.items.forEach(item => {
          if (item.materialName) materialNames.push(item.materialName);
        });
      });

      return {
        _id: s._id,
        roll: s.roll,
        name: s.name,
        phone: s.phone,
        guardian: s.guardianPhone || '',
        guardianPhone: s.guardianPhone || '',
        batch: s.batchName,
        batchName: s.batchName,
        batchId: s.batchId,
        fee: s.finalFee || s.courseFee || 0,
        finalFee: s.finalFee || s.courseFee || 0,
        paid: s.totalPaid || 0,
        totalPaid: s.totalPaid || 0,
        due: s.totalDue || 0,
        totalDue: s.totalDue || 0,
        paymentStatus: s.paymentStatus || 'Unpaid',
        status: s.status || 'Active',
        active: s.status === 'Active',
        materials: materialNames,
        admissionDate: s.admissionDate ? s.admissionDate.toISOString().split('T')[0] : ''
      };
    });

    // Build transaction list
    const transactionList = payments.map(p => ({
      _id: p._id,
      date: p.paymentDate ? p.paymentDate.toISOString().split('T')[0] : '',
      receipt: p.receiptNo,
      roll: p.studentRoll,
      studentName: p.studentName,
      batch: p.batchName,
      type: p.paymentType === 'Admission' ? 'Admission' : 'Payment',
      method: p.paymentMethod,
      amount: p.amount,
      collector: p.collector,
      transactionId: p.transactionId
    }));

    res.json({
      success: true,
      data: {
        students: studentList,
        transactions: transactionList,
        materials: materialStats,
        batches: batchSummary,
        distributions: distributions.map(d => ({
          _id: d._id,
          voucherNo: d.voucherNo,
          studentId: d.studentId,
          studentRoll: d.studentRoll,
          studentName: d.studentName,
          batchName: d.batchName,
          items: d.items,
          issuedBy: d.issuedBy,
          issuedDate: d.issuedDate ? d.issuedDate.toISOString().split('T')[0] : ''
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get Single Student Ledger Data for Reports
router.get('/reports/students/:id', async (req, res) => {
  try {
    const student = await UccStudent.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const payments = await UccPayment.find({ studentId: student._id }).sort({ paymentDate: -1 });
    const distributions = await UccDistribution.find({ studentId: student._id }).sort({ issuedDate: -1 });

    // Extract material names from distributions
    const materialNames = [];
    distributions.forEach(d => {
      d.items.forEach(item => {
        if (item.materialName) materialNames.push(item.materialName);
      });
    });

    res.json({
      success: true,
      student: {
        _id: student._id,
        roll: student.roll,
        name: student.name,
        phone: student.phone,
        guardianPhone: student.guardianPhone || '',
        batch: student.batchName,
        batchName: student.batchName,
        fee: student.finalFee || student.courseFee || 0,
        paid: student.totalPaid || 0,
        due: student.totalDue || 0,
        paymentStatus: student.paymentStatus || 'Unpaid',
        materials: materialNames
      },
      payments: payments.map(p => ({
        _id: p._id,
        date: p.paymentDate ? p.paymentDate.toISOString().split('T')[0] : '',
        receipt: p.receiptNo,
        method: p.paymentMethod,
        amount: p.amount,
        type: p.paymentType
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Student (for Batch-wise Report edit modal)
router.patch('/students/:roll', async (req, res) => {
  try {
    const { name, phone, guardianPhone, fee, batchId, materials } = req.body;
    
    const student = await UccStudent.findOne({ roll: req.params.roll });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (name) student.name = name;
    if (phone) student.phone = phone;
    if (guardianPhone !== undefined) student.guardianPhone = guardianPhone;
    if (fee !== undefined) {
      student.finalFee = Number(fee);
      student.courseFee = Number(fee);
      student.totalDue = Math.max(0, Number(fee) - (student.totalPaid || 0));
    }
    if (batchId) {
      const batch = await UccBatch.findById(batchId);
      if (batch) {
        student.batchId = batch._id;
        student.batchName = batch.batchName;
      }
    }

    await student.save();
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle Student Active Status
router.patch('/students/:roll/status', async (req, res) => {
  try {
    const { active } = req.body;
    const student = await UccStudent.findOne({ roll: req.params.roll });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    student.status = active ? 'Active' : 'Inactive';
    await student.save();
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// ⚙️ 6. SETTINGS
// =================================================================
router.get('/settings', async (req, res) => {
  try {
    let settings = await UccSettings.findOne();
    if (!settings) {
      settings = new UccSettings();
      await settings.save();
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    let settings = await UccSettings.findOne();
    if (!settings) {
      settings = new UccSettings(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =================================================================
// 💸 8. UCC EXPENSES (DEDICATED uccexpenses COLLECTION)
// =================================================================

// GET /api/ucc/expenses
router.get('/expenses', async (req, res) => {
  try {
    const { category, method, search, date, startDate, endDate, limit = 50 } = req.query;
    let query = {};

    if (category && category !== 'all') query.category = category;
    if (method && method !== 'all') query.paymentMethod = method;
    if (date) query.date = date;
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    if (search) {
      query.$or = [
        { expenseId: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { vendor: new RegExp(search, 'i') },
        { category: new RegExp(search, 'i') }
      ];
    }

    const expenses = await UccExpense.find(query).sort({ createdAt: -1 }).limit(Number(limit));
    const totalCount = await UccExpense.countDocuments(query);
    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    res.json({ success: true, count: totalCount, totalAmount, expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/ucc/expenses/:id
router.get('/expenses/:id', async (req, res) => {
  try {
    const expense = await UccExpense.findById(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/ucc/expenses
router.post('/expenses', async (req, res) => {
  try {
    const { description, category, amount, paymentMethod, vendor, branch, date, notes, status, createdBy } = req.body;
    
    const count = await UccExpense.countDocuments();
    const expenseId = 'UCC-EXP-' + Date.now().toString().slice(-6) + '-' + (count + 1);
    const dateObj = new Date(date || Date.now());

    const expense = new UccExpense({
      expenseId,
      description: description || 'UCC Expense',
      category: category || 'Office',
      amount: Number(amount) || 0,
      paymentMethod: paymentMethod || 'Cash',
      vendor: vendor || 'General Vendor',
      branch: branch || 'UCC Pabna Main',
      date: date || dateObj.toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      month: dateObj.toLocaleString('default', { month: 'long' }),
      year: dateObj.getFullYear(),
      status: status || 'Approved',
      createdBy: createdBy || 'Admin'
    });

    await expense.save();
    res.status(201).json({ success: true, message: 'UCC Expense saved to uccexpenses collection', expense });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/ucc/expenses/:id
router.delete('/expenses/:id', async (req, res) => {
  try {
    let query = { _id: req.params.id };
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { expenseId: req.params.id };
    }
    const expense = await UccExpense.findOneAndDelete(query);
    if (!expense) return res.status(404).json({ success: false, message: 'UCC Expense not found' });
    res.json({ success: true, message: 'UCC Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;


// =================================================================
// 🔄 BATCH TRANSFER
// =================================================================

// Get next available roll for a specific batch
router.get('/batches/:batchName/next-roll', async (req, res) => {
  try {
    const batchName = decodeURIComponent(req.params.batchName);
    
    console.log(`[NEXT-ROLL] Searching for batch: "${batchName}"`); // Debug

    // Find the batch to get nextRollNumber
    const batch = await UccBatch.findOne({ batchName: batchName });
    
    if (!batch) {
      console.log(`[NEXT-ROLL] Warning: Batch "${batchName}" not found in UccBatch collection`);
    } else {
      console.log(`[NEXT-ROLL] Found batch: "${batch.batchName}", nextRollNumber: ${batch.nextRollNumber}`);
    }
    
    // Find all students in this batch
    const students = await UccStudent.find({ batchName: batchName }, { roll: 1 }).lean();
    console.log(`[NEXT-ROLL] Students found: ${students.length}`);
    
    // Extract maximum roll number from students
    let maxRoll = 0;
    students.forEach(s => {
      // Remove any non-numeric characters (like prefix letters)
      const numericPart = String(s.roll || '').replace(/[^0-9]/g, '');
      const num = parseInt(numericPart, 10);
      if (!isNaN(num) && num > maxRoll) {
        maxRoll = num;
      }
    });

    // Determine next roll:
    // 1. If students exist, use max + 1
    // 2. If no students but batch has nextRollNumber, use that
    // 3. Otherwise start from 1
    let nextRollNumber = 1;
    
    if (students.length > 0) {
      // Students exist, use max roll + 1
      nextRollNumber = maxRoll + 1;
      console.log(`[NEXT-ROLL] Using max roll + 1: ${nextRollNumber}`);
    } else if (batch && batch.nextRollNumber) {
      // No students yet, use batch's nextRollNumber
      nextRollNumber = batch.nextRollNumber;
      console.log(`[NEXT-ROLL] Using batch nextRollNumber: ${nextRollNumber}`);
    } else {
      console.log(`[NEXT-ROLL] Defaulting to 1`);
    }

    const nextRoll = nextRollNumber.toString().padStart(3, '0');

    res.json({
      success: true,
      nextRoll: nextRoll,
      batchName: batchName,
      currentMaxRoll: maxRoll,
      studentCount: students.length,
      batchNextRoll: batch?.nextRollNumber || null
    });
  } catch (error) {
    console.error('Error fetching next roll:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Batch Transfer API
router.post('/batch-transfer', async (req, res) => {
  try {
    const { studentId, targetBatchName, notes } = req.body;

    if (!studentId || !targetBatchName) {
      return res.status(400).json({
        success: false,
        message: 'Student ID and Target Batch Name are required'
      });
    }

    // Find the student (case-insensitive studentId search or _id)
    let student = await UccStudent.findOne({ 
      $or: [
        { studentId: { $regex: new RegExp(`^${studentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { roll: studentId }
      ]
    });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if transferring to same batch (case-insensitive comparison)
    if (student.batchName.toLowerCase().trim() === targetBatchName.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer to the same batch'
      });
    }

    // Find target batch (case-insensitive search)
    const targetBatch = await UccBatch.findOne({ 
      batchName: { $regex: new RegExp(`^${targetBatchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    
    if (!targetBatch) {
      return res.status(404).json({
        success: false,
        message: `Target batch "${targetBatchName}" not found in the database. Please check the batch name or create it first.`
      });
    }

    // Check batch capacity
    if (targetBatch.enrolledCount >= targetBatch.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Target batch is full'
      });
    }

    // Store old data for history
    const oldBatchName = student.batchName;
    const oldBatchId = student.batchId;
    const oldRoll = student.roll;
    const oldStudentId = student.studentId;
    const oldProgram = student.program;

    // Calculate next available roll in target batch (case-insensitive search)
    const targetStudents = await UccStudent.find({ 
      batchName: { $regex: new RegExp(`^${targetBatchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }, { roll: 1 }).lean();
    
    let maxRoll = 0;
    targetStudents.forEach(s => {
      const numericPart = String(s.roll || '').replace(/[^0-9]/g, '');
      const num = parseInt(numericPart, 10);
      if (!isNaN(num) && num > maxRoll) {
        maxRoll = num;
      }
    });

    const newRoll = (maxRoll + 1).toString().padStart(3, '0');

    // Generate new student ID
    const batchPrefix = targetBatch.batchCode 
      ? targetBatch.batchCode.replace(/[-\s]/g, '').substring(0, 6).toUpperCase()
      : targetBatch.batchName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    const newStudentId = `UCC-${batchPrefix}-${newRoll}`;

    // Update student record
    student.batchId = targetBatch._id;
    student.batchName = targetBatch.batchName;
    student.program = targetBatch.program;
    student.roll = newRoll;
    student.studentId = newStudentId;

    // Add transfer history to notes
    const transferNote = `\n[BATCH TRANSFER] ${new Date().toLocaleDateString('en-GB')} - From "${oldBatchName}" (Roll: ${oldRoll}, ID: ${oldStudentId}) → To "${targetBatch.batchName}" (Roll: ${newRoll}, ID: ${newStudentId})${notes ? ` | Notes: ${notes}` : ''}`;
    student.notes = (student.notes || '') + transferNote;

    // Save student
    await student.save();

    // Update batch enrollment counts
    if (oldBatchId) {
      await UccBatch.findByIdAndUpdate(oldBatchId, {
        $inc: { enrolledCount: -1 }
      });
    }

    await UccBatch.findByIdAndUpdate(targetBatch._id, {
      $inc: { enrolledCount: 1, nextRollNumber: 1 }
    });

    // Update payment records (linked by ObjectId student._id)
    await UccPayment.updateMany(
      { studentId: student._id },
      { $set: { batchName: targetBatch.batchName, studentRoll: newRoll } }
    );

    // Update distribution records (linked by ObjectId student._id)
    await UccDistribution.updateMany(
      { studentId: student._id },
      { $set: { batchName: targetBatch.batchName, studentRoll: newRoll } }
    );

    // Update exam results (linked by ObjectId student._id)
    await UccResult.updateMany(
      { studentId: student._id },
      { $set: { batchName: targetBatch.batchName, studentRoll: newRoll } }
    );

    console.log(`[BATCH TRANSFER] Student ${oldStudentId} transferred from ${oldBatchName} to ${targetBatchName}`);

    res.json({
      success: true,
      message: `Student successfully transferred from "${oldBatchName}" to "${targetBatchName}"`,
      data: {
        student: student,
        oldBatch: oldBatchName,
        newBatch: targetBatchName,
        oldRoll: oldRoll,
        newRoll: newRoll,
        oldStudentId: oldStudentId,
        newStudentId: newStudentId
      }
    });

  } catch (error) {
    console.error('Error transferring student:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transfer student: ' + error.message
    });
  }
});
