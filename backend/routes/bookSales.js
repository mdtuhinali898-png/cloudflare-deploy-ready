const express  = require('express');
const router   = express.Router();
const BookSale = require('../models/BookSale');
const Book     = require('../models/Book');
const Income   = require('../models/Income');

// ─── Helper: auto-generate incomeId ──────────────────────────────────────────
async function generateIncomeId() {
    const count = await Income.countDocuments();
    return `INC-${Date.now()}-${count + 1}`;
}

// ─── POST /api/book-sales ─────────────────────────────────────────────────────
// নতুন বিক্রি রেকর্ড করা
// stock auto-update + Income auto-save হবে
router.post('/', async (req, res) => {
    try {
        const {
            saleDate, buyerType, studentId, buyerName,
            buyerPhone, buyerAddress, buyerBatch,
            items, paymentMethod, paymentStatus, remarks, soldBy
        } = req.body;

        // ── Validation ──
        if (!saleDate)  return res.status(400).json({ success: false, message: 'Sale date is required' });
        if (!buyerName) return res.status(400).json({ success: false, message: 'Buyer name is required' });
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one book item is required' });
        }

        // ── Validate & calculate each item ──
        let grossAmount   = 0;
        let totalDiscount = 0;
        const saleItems   = [];

        for (const item of items) {
            const book = await Book.findOne({ bookId: item.bookId });
            if (!book) {
                return res.status(400).json({ success: false, message: `Book not found: ${item.bookId}` });
            }
            if (book.stockCurrent < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${book.title}". Available: ${book.stockCurrent}`
                });
            }

            const qty       = Number(item.quantity);
            const unitPrice = Number(item.unitPrice) || book.sellingPrice;
            const discount  = Number(item.discount)  || 0;
            const subtotal  = (unitPrice * qty) - discount;

            grossAmount   += unitPrice * qty;
            totalDiscount += discount;

            saleItems.push({
                bookId:    book.bookId,
                title:     book.title,
                quantity:  qty,
                unitPrice,
                discount,
                subtotal
            });
        }

        const netAmount = grossAmount - totalDiscount;

        // ── Create BookSale record ──
        const sale = new BookSale({
            saleDate,
            buyerType:    buyerType   || 'External',
            studentId:    studentId   || '',
            buyerName,
            buyerPhone:   buyerPhone  || '',
            buyerAddress: buyerAddress|| '',
            buyerBatch:   buyerBatch  || '',
            items:        saleItems,
            grossAmount,
            totalDiscount,
            netAmount,
            paymentMethod: paymentMethod || 'Cash',
            paymentStatus: paymentStatus || 'Paid',
            remarks:       remarks       || '',
            soldBy:        soldBy        || 'Admin'
        });

        await sale.save();

        // ── Update stock for each book ──
        for (const item of saleItems) {
            await Book.findOneAndUpdate(
                { bookId: item.bookId },
                { $inc: { stockSold: item.quantity } },
                { new: true }
            ).then(async (updatedBook) => {
                if (updatedBook) {
                    // recalculate stockCurrent & status
                    updatedBook.stockCurrent = Math.max(0, updatedBook.stockIn - updatedBook.stockSold);
                    if (updatedBook.stockCurrent === 0) {
                        updatedBook.status = 'Out of Stock';
                    } else if (updatedBook.stockCurrent <= updatedBook.lowStockAlert) {
                        updatedBook.status = 'Low Stock';
                    } else {
                        updatedBook.status = 'Available';
                    }
                    await updatedBook.save();
                }
            });
        }

        // ── Auto-save Income record (Finance integration) ──
        if (paymentStatus !== 'Due') {
            try {
                const incomeId = await generateIncomeId();
                const income = new Income({
                    incomeId,
                    date:          saleDate,
                    source:        'Books',
                    amount:        netAmount,
                    paymentMethod: paymentMethod || 'Cash',
                    description:   `Book Sale: ${sale.receiptNo}`,
                    receivedFrom:  buyerName,
                    status:        'Active',
                    createdBy:     soldBy || 'Admin'
                });
                await income.save();

                // link income id back to sale
                sale.incomeId = incomeId;
                await sale.save();
            } catch (incErr) {
                console.warn('Income auto-save warning (sale still created):', incErr.message);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Sale recorded successfully',
            sale
        });
    } catch (err) {
        console.error('POST /api/book-sales error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Duplicate sale ID. Please retry.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales ──────────────────────────────────────────────────────
// বিক্রির তালিকা (filter: date, fromDate, toDate, buyerType, paymentStatus, limit)
router.get('/', async (req, res) => {
    try {
        const { date, fromDate, toDate, buyerType, paymentStatus, studentId, limit } = req.query;
        const query = {};

        if (date) {
            query.saleDate = date;
        } else {
            if (fromDate || toDate) {
                query.saleDate = {};
                if (fromDate) query.saleDate.$gte = fromDate;
                if (toDate)   query.saleDate.$lte = toDate;
            }
        }
        if (buyerType     && buyerType     !== 'all') query.buyerType     = buyerType;
        if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;
        if (studentId)    query.studentId = studentId;

        const lim   = parseInt(limit) || 1000;
        const sales = await BookSale.find(query)
            .sort({ createdAt: -1 })
            .limit(lim)
            .lean();

        res.json({ success: true, sales, total: sales.length });
    } catch (err) {
        console.error('GET /api/book-sales error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/summary ─────────────────────────────────────────────
// রিপোর্ট summary (today, thisMonth, topBooks, byBuyerType, byMethod)
router.get('/summary', async (req, res) => {
    try {
        const today        = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toLocaleString('default', { month: 'long' });
        const currentYear  = new Date().getFullYear();

        const [agg, topBooksAgg] = await Promise.all([
            BookSale.aggregate([{ $facet: {
                today: [
                    { $match: { saleDate: today } },
                    { $group: { _id: null, amount: { $sum: '$netAmount' }, count: { $sum: 1 }, items: { $sum: '$totalItems' } } }
                ],
                thisMonth: [
                    { $match: { month: currentMonth, year: currentYear } },
                    { $group: { _id: null, amount: { $sum: '$netAmount' }, count: { $sum: 1 }, items: { $sum: '$totalItems' } } }
                ],
                allTime: [
                    { $group: { _id: null, amount: { $sum: '$netAmount' }, count: { $sum: 1 }, items: { $sum: '$totalItems' } } }
                ],
                byBuyerType: [
                    { $group: { _id: '$buyerType', amount: { $sum: '$netAmount' }, count: { $sum: 1 } } }
                ],
                byMethod: [
                    { $group: { _id: '$paymentMethod', amount: { $sum: '$netAmount' }, count: { $sum: 1 } } }
                ]
            }}]),

            // Top selling books (unwind items array)
            BookSale.aggregate([
                { $unwind: '$items' },
                { $group: {
                    _id:      '$items.bookId',
                    title:    { $first: '$items.title' },
                    totalQty: { $sum: '$items.quantity' },
                    totalAmt: { $sum: '$items.subtotal' }
                }},
                { $sort: { totalQty: -1 } },
                { $limit: 5 }
            ])
        ]);

        const a = agg[0];
        const g = f => f[0] || { amount: 0, count: 0, items: 0 };

        res.json({
            success: true,
            today:     g(a.today),
            thisMonth: g(a.thisMonth),
            allTime:   g(a.allTime),
            byBuyerType: a.byBuyerType || [],
            byMethod:    a.byMethod    || [],
            topBooks:    topBooksAgg   || []
        });
    } catch (err) {
        console.error('GET /api/book-sales/summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/daily ────────────────────────────────────────────────
// daily breakdown (grouped by date) — reports page এ use হবে
router.get('/daily', async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const match = {};
        if (fromDate || toDate) {
            match.saleDate = {};
            if (fromDate) match.saleDate.$gte = fromDate;
            if (toDate)   match.saleDate.$lte = toDate;
        }

        const daily = await BookSale.aggregate([
            { $match: match },
            { $group: {
                _id:        '$saleDate',
                totalAmt:   { $sum: '$netAmount' },
                totalItems: { $sum: '$totalItems' },
                count:      { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.json({ success: true, daily });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/receipt/:receiptNo ───────────────────────────────────
// রসিদ ডেটা
router.get('/receipt/:receiptNo', async (req, res) => {
    try {
        const sale = await BookSale.findOne({
            receiptNo: { $regex: new RegExp(`^${req.params.receiptNo}$`, 'i') }
        }).lean();

        if (!sale) return res.status(404).json({ success: false, message: 'Receipt not found' });
        res.json({ success: true, sale });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const sale = await BookSale.findOne({
            $or: [
                { _id:    req.params.id.length === 24 ? req.params.id : null },
                { saleId: req.params.id }
            ]
        }).lean();

        if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
        res.json({ success: true, sale });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
