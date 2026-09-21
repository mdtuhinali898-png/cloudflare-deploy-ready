const express = require('express');
const router  = express.Router();
const Book    = require('../models/Book');

// ─── GET /api/books ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { category, status, search, isActive } = req.query;
        const query = {};

        if (category && category !== 'all') query.category = category;
        if (status   && status   !== 'all') query.status   = status;

        // isActive filter — default: শুধু active books
        if (isActive === 'false') {
            query.isActive = false;
        } else if (isActive === 'all') {
            // কোনো filter নেই
        } else {
            query.isActive = true; // default
        }

        if (search) {
            query.$or = [
                { title:     { $regex: search, $options: 'i' } },
                { author:    { $regex: search, $options: 'i' } },
                { publisher: { $regex: search, $options: 'i' } },
                { bookId:    { $regex: search, $options: 'i' } }
            ];
        }

        const books = await Book.find(query)
            .select('-stockHistory')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, books, total: books.length });
    } catch (err) {
        console.error('GET /api/books error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/books/summary ───────────────────────────────────────────────────
// ⚠ এটা /:id এর আগে থাকা MUST — নইলে Express "summary" কে id মনে করে
router.get('/summary', async (req, res) => {
    try {
        const [totalBooks, available, lowStock, outOfStock] = await Promise.all([
            Book.countDocuments({ isActive: true }),
            Book.countDocuments({ isActive: true, status: 'Available' }),
            Book.countDocuments({ isActive: true, status: 'Low Stock' }),
            Book.countDocuments({ isActive: true, status: 'Out of Stock' })
        ]);

        const stockAgg = await Book.aggregate([
            { $match: { isActive: true } },
            { $group: {
                _id: null,
                totalStockIn:      { $sum: '$stockIn' },
                totalStockSold:    { $sum: '$stockSold' },
                totalStockCurrent: { $sum: '$stockCurrent' }
            }}
        ]);

        const s = stockAgg[0] || {};
        res.json({
            success: true,
            totalBooks,
            available,
            lowStock,
            outOfStock,
            totalStockIn:      s.totalStockIn      || 0,
            totalStockSold:    s.totalStockSold    || 0,
            totalStockCurrent: s.totalStockCurrent || 0
        });
    } catch (err) {
        console.error('GET /api/books/summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/books ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const {
            title, author, publisher, category,
            mrpPrice, sellingPrice, discountAmount, discountPercent,
            initialStock, lowStockAlert, description, createdBy
        } = req.body;

        if (!title)        return res.status(400).json({ success: false, message: 'Title is required' });
        if (!sellingPrice) return res.status(400).json({ success: false, message: 'Selling price is required' });

        const stock = Number(initialStock) || 0;

        const book = new Book({
            title, author, publisher, category,
            mrpPrice:        Number(mrpPrice)        || 0,
            sellingPrice:    Number(sellingPrice),
            discountAmount:  Number(discountAmount)  || 0,
            discountPercent: Number(discountPercent) || 0,
            stockIn:         stock,
            stockSold:       0,
            stockCurrent:    stock,
            lowStockAlert:   Number(lowStockAlert)   || 5,
            description:     description || '',
            createdBy:       createdBy   || 'Admin'
        });

        if (stock > 0) {
            book.stockHistory.push({
                quantity: stock,
                date:     new Date(),
                note:     'Initial stock',
                addedBy:  createdBy || 'Admin'
            });
        }

        await book.save();
        res.status(201).json({ success: true, message: 'Book added successfully', book });
    } catch (err) {
        console.error('POST /api/books error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Book ID already exists. Please retry.' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/books/:id ───────────────────────────────────────────────────────
// ⚠ এটা /summary এর পরে থাকতে হবে
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        const isMongoId = idParam.match(/^[0-9a-fA-F]{24}$/);

        const query = isMongoId
            ? { $or: [{ _id: idParam }, { bookId: idParam }] }
            : { bookId: idParam };

        const book = await Book.findOne(query).lean();
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        res.json({ success: true, book });
    } catch (err) {
        console.error('GET /api/books/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/books/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const idParam   = req.params.id;
        const isMongoId = idParam.match(/^[0-9a-fA-F]{24}$/);
        const query     = isMongoId
            ? { $or: [{ _id: idParam }, { bookId: idParam }] }
            : { bookId: idParam };

        const book = await Book.findOne(query);
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        const allowedFields = [
            'title', 'author', 'publisher', 'category',
            'mrpPrice', 'sellingPrice', 'discountAmount', 'discountPercent',
            'lowStockAlert', 'description', 'isActive'
        ];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) book[field] = req.body[field];
        });

        await book.save();
        res.json({ success: true, message: 'Book updated', book });
    } catch (err) {
        console.error('PUT /api/books/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/books/:id/stock ────────────────────────────────────────────────
router.post('/:id/stock', async (req, res) => {
    try {
        const { quantity, note, addedBy } = req.body;
        const qty = Number(quantity);

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
        }

        const idParam   = req.params.id;
        const isMongoId = idParam.match(/^[0-9a-fA-F]{24}$/);
        const query     = isMongoId
            ? { $or: [{ _id: idParam }, { bookId: idParam }] }
            : { bookId: idParam };

        const book = await Book.findOne(query);
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        book.stockIn += qty;
        book.stockHistory.push({
            quantity: qty,
            date:     new Date(),
            note:     note    || 'Stock added',
            addedBy:  addedBy || 'Admin'
        });

        await book.save();
        res.json({ success: true, message: `${qty} copies added to stock`, book });
    } catch (err) {
        console.error('POST /api/books/:id/stock error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/books/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const idParam   = req.params.id;
        const isMongoId = idParam.match(/^[0-9a-fA-F]{24}$/);
        const query     = isMongoId
            ? { $or: [{ _id: idParam }, { bookId: idParam }] }
            : { bookId: idParam };

        const book = await Book.findOne(query);
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        book.isActive = false;
        await book.save();
        res.json({ success: true, message: 'Book deactivated' });
    } catch (err) {
        console.error('DELETE /api/books/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
