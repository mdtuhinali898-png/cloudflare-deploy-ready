const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    bookId: {
        type: String,
        unique: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        trim: true,
        default: ''
    },
    publisher: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        enum: ['SSC', 'HSC', 'Admission', 'General', 'Other'],
        default: 'General'
    },
    mrpPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: 0
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    discountPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },

    // ── Inventory ──
    stockIn: {
        type: Number,
        default: 0,
        min: 0
    },
    stockSold: {
        type: Number,
        default: 0,
        min: 0
    },
    stockCurrent: {
        type: Number,
        default: 0,
        min: 0
    },
    lowStockAlert: {
        type: Number,
        default: 5,
        min: 0
    },
    status: {
        type: String,
        enum: ['Available', 'Low Stock', 'Out of Stock'],
        default: 'Available'
    },
    stockHistory: [{
        quantity: { type: Number, required: true },
        date:     { type: Date, default: Date.now },
        note:     { type: String, default: '' },
        addedBy:  { type: String, default: 'Admin' }
    }],
    description: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: String,
        default: 'Admin'
    }
}, {
    timestamps: true
});

// ── Auto-calculate status before saving ──
// ── Auto-generate bookId ──
// দুটো hook একসাথে — নির্ভরযোগ্য ID generation সহ
bookSchema.pre('save', async function (next) {
    try {
        // 1. bookId generate (শুধু নতুন document এর জন্য)
        if (!this.bookId) {
            // timestamp + random দিয়ে unique ID নিশ্চিত করা
            const ts    = Date.now().toString().slice(-6);
            const rand  = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            this.bookId = `BK-${ts}${rand}`;
        }

        // 2. stockCurrent recalculate
        this.stockCurrent = Math.max(0, this.stockIn - this.stockSold);

        // 3. status auto-set
        if (this.stockCurrent === 0) {
            this.status = 'Out of Stock';
        } else if (this.stockCurrent <= this.lowStockAlert) {
            this.status = 'Low Stock';
        } else {
            this.status = 'Available';
        }

        next();
    } catch (err) {
        next(err);
    }
});

bookSchema.index({ bookId: 1 });
bookSchema.index({ category: 1 });
bookSchema.index({ status: 1 });
bookSchema.index({ title: 'text', author: 'text' });

module.exports = mongoose.model('Book', bookSchema);
