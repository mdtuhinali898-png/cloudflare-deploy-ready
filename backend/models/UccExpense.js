const mongoose = require('mongoose');

const uccExpenseSchema = new mongoose.Schema({
    expenseId: {
        type: String,
        unique: true,
        trim: true
    },
    date: {
        type: String,
        required: true
    },
    time: {
        type: String,
        default: '00:00'
    },
    month: {
        type: String,
        trim: true
    },
    year: {
        type: Number
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    subCategory: {
        type: String,
        trim: true
    },
    paymentMethod: {
        type: String,
        required: true,
        default: 'Cash',
        trim: true
    },
    vendor: {
        type: String,
        trim: true,
        default: ''
    },
    branch: {
        type: String,
        trim: true,
        default: 'UCC Pabna Main'
    },
    amount: {
        type: Number,
        required: true,
        default: 0
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: ['Approved', 'Pending Approval', 'Rejected', 'Voided'],
        default: 'Approved'
    },
    createdBy: {
        type: String,
        trim: true,
        default: 'Admin'
    }
}, {
    timestamps: true,
    collection: 'uccexpenses'
});

module.exports = mongoose.model('UccExpense', uccExpenseSchema);
