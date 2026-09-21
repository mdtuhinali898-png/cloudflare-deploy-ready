const mongoose = require('mongoose');

const bookSaleItemSchema = new mongoose.Schema({
    bookId:    { type: String, required: true, trim: true },
    title:     { type: String, required: true, trim: true },
    quantity:  { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount:  { type: Number, default: 0, min: 0 },
    subtotal:  { type: Number, required: true, min: 0 }
}, { _id: false });

const bookSaleSchema = new mongoose.Schema({
    saleId: {
        type: String,
        unique: true,
        trim: true
    },
    receiptNo: {
        type: String,
        unique: true,
        trim: true
    },
    saleDate: {
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

    // ── Buyer info ──
    buyerType: {
        type: String,
        enum: ['Student', 'External'],
        required: true,
        default: 'External'
    },
    studentId: {
        type: String,
        trim: true,
        default: ''
    },
    buyerName: {
        type: String,
        required: true,
        trim: true
    },
    buyerPhone: {
        type: String,
        trim: true,
        default: ''
    },
    buyerAddress: {
        type: String,
        trim: true,
        default: ''
    },
    buyerBatch: {
        type: String,
        trim: true,
        default: ''
    },

    // ── Sale items ──
    items: {
        type: [bookSaleItemSchema],
        required: true
    },
    totalItems: {
        type: Number,
        default: 0
    },
    grossAmount: {
        type: Number,
        required: true,
        default: 0
    },
    totalDiscount: {
        type: Number,
        default: 0
    },
    netAmount: {
        type: Number,
        required: true,
        default: 0
    },

    // ── Payment ──
    paymentMethod: {
        type: String,
        enum: ['Cash', 'bKash', 'Nagad', 'Bank', 'Rocket', 'Card'],
        required: true,
        default: 'Cash'
    },
    paymentStatus: {
        type: String,
        enum: ['Paid', 'Due'],
        default: 'Paid'
    },
    remarks: {
        type: String,
        trim: true,
        default: ''
    },
    soldBy: {
        type: String,
        trim: true,
        default: 'Admin'
    },

    // linked Income record id (for reference)
    incomeId: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

// ── Auto-fill month/year, totalItems, saleId, receiptNo ──
// সব একটা hook এ — try/catch সহ নির্ভরযোগ্য
bookSaleSchema.pre('save', async function (next) {
    try {
        // 1. month/year auto-fill
        if (this.saleDate && (!this.month || !this.year)) {
            const d = new Date(this.saleDate + 'T00:00:00');
            if (!this.month) this.month = d.toLocaleString('default', { month: 'long' });
            if (!this.year)  this.year  = d.getFullYear();
        }

        // 2. totalItems recalculate
        this.totalItems = (this.items || []).reduce((s, i) => s + i.quantity, 0);

        // 3. saleId generate — timestamp+random (no countDocuments race condition)
        if (!this.saleId) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const ts      = Date.now().toString().slice(-5);
            const rand    = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            this.saleId   = `BSALE-${dateStr}-${ts}${rand}`;
        }

        // 4. receiptNo generate — timestamp+random
        if (!this.receiptNo) {
            const ts        = Date.now().toString().slice(-6);
            const rand      = Math.floor(Math.random() * 10);
            this.receiptNo  = `BRCPT-${ts}${rand}`;
        }

        next();
    } catch (err) {
        next(err);
    }
});

bookSaleSchema.index({ saleDate: 1 });
bookSaleSchema.index({ saleId: 1 });
bookSaleSchema.index({ receiptNo: 1 });
bookSaleSchema.index({ buyerType: 1 });
bookSaleSchema.index({ studentId: 1 });
bookSaleSchema.index({ month: 1, year: 1 });
bookSaleSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('BookSale', bookSaleSchema);
