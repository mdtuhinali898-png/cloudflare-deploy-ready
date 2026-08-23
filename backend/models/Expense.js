const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    // Auto-generated Expense ID
    expenseId: {
        type: String,
        unique: true,
        trim: true
    },
    
    // Expense Date & Time
    date: {
        type: String,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    month: {
        type: String,
        trim: true
    },
    year: {
        type: Number
    },
    
    // Category & Sub Category
    category: {
        type: String,
        required: true,
        trim: true
    },
    subCategory: {
        type: String,
        trim: true
    },
    
    // Payment Method
    paymentMethod: {
        type: String,
        required: true,
        enum: ['Cash', 'Bank', 'bKash', 'Nagad', 'Rocket', 'Card', 'Cheque'],
        trim: true
    },
    
    // Vendor/Supplier
    vendor: {
        type: String,
        trim: true
    },

    // Branch / Unit
    branch: {
        type: String,
        trim: true,
        default: 'UCC Pabna Main'
    },

    // Amount
    amount: {
        type: Number,
        required: true,
        default: 0
    },
    
    // Description/Notes
    description: {
        type: String,
        trim: true
    },
    
    // Receipt Attachment
    receiptFile: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Voided'],
        default: 'Approved'
    },
    approvedBy: { type: String, trim: true, default: '' },
    approvedAt: { type: Date },
    rejectedBy: { type: String, trim: true, default: '' },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true, default: '' },
    voidReason: { type: String, trim: true, default: '' },
    auditLog: [{
        action: String,
        by: { type: String, default: 'Admin' },
        at: { type: Date, default: Date.now },
        note: String
    }],
    recurringExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringExpense' },
    
    // Income Source
    incomeSource: {
        type: String,
        enum: ['Monthly Student Fee', 'Admission Fee', 'Exam Fee', 'Books', 'Special Course', 'Registration Fee', 'Other Income', ''],
        default: '',
        trim: true
    },
    
    // Created By
    createdBy: {
        type: String,
        trim: true,
        default: 'Admin'
    }
}, {
    timestamps: true
});

// Indexes for better query performance
expenseSchema.index({ date: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ paymentMethod: 1 });
expenseSchema.index({ expenseId: 1 });
expenseSchema.index({ status: 1 });                           // filter by Approved
expenseSchema.index({ date: 1, status: 1 });                 // range + status: most common query pattern
expenseSchema.index({ month: 1, year: 1, status: 1 });       // monthly aggregation with status filter
expenseSchema.index({ year: 1, status: 1 });                 // yearly aggregation with status filter
expenseSchema.index({ paymentMethod: 1, status: 1 });        // balance by method (Approved only)

module.exports = mongoose.model('Expense', expenseSchema);
