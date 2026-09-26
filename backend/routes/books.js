const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatBook(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        bookId: row.book_id,
        title: row.title,
        author: row.author,
        publisher: row.publisher,
        category: row.category,
        mrpPrice: Number(row.mrp_price || 0),
        sellingPrice: Number(row.selling_price || 0),
        discountAmount: Number(row.discount_amount || 0),
        discountPercent: Number(row.discount_percent || 0),
        stockIn: Number(row.stock_in || 0),
        stockSold: Number(row.stock_sold || 0),
        stockCurrent: Number(row.stock_current || 0),
        lowStockAlert: Number(row.low_stock_alert || 5),
        status: row.status,
        stockHistory: row.stock_history || [],
        description: row.description,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function computeStatus(stockCurrent, lowStockAlert) {
    if (stockCurrent === 0) return 'Out of Stock';
    if (stockCurrent <= lowStockAlert) return 'Low Stock';
    return 'Available';
}

// ─── GET /api/books/summary ───────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const { data: books, error } = await supabase
            .from('books')
            .select('stock_in, stock_sold, stock_current, status')
            .eq('is_active', true);

        if (error) throw error;

        let totalBooks = (books || []).length;
        let available = 0, lowStock = 0, outOfStock = 0;
        let totalStockIn = 0, totalStockSold = 0, totalStockCurrent = 0;

        (books || []).forEach(b => {
            if (b.status === 'Available') available++;
            else if (b.status === 'Low Stock') lowStock++;
            else if (b.status === 'Out of Stock') outOfStock++;

            totalStockIn += Number(b.stock_in || 0);
            totalStockSold += Number(b.stock_sold || 0);
            totalStockCurrent += Number(b.stock_current || 0);
        });

        res.json({
            success: true,
            totalBooks,
            available,
            lowStock,
            outOfStock,
            totalStockIn,
            totalStockSold,
            totalStockCurrent
        });
    } catch (err) {
        console.error('GET /api/books/summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/books ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { category, status, search, isActive } = req.query;
        let query = supabase.from('books').select('*');

        if (category && category !== 'all') query = query.eq('category', category);
        if (status && status !== 'all') query = query.eq('status', status);

        if (isActive === 'false') query = query.eq('is_active', false);
        else if (isActive !== 'all') query = query.eq('is_active', true);

        if (search) {
            const s = search.trim();
            query = query.or(`title.ilike.%${s}%,author.ilike.%${s}%,publisher.ilike.%${s}%,book_id.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false });

        const { data: books, error } = await query;
        if (error) throw error;

        const formatted = (books || []).map(formatBook);
        res.json({ success: true, books: formatted, total: formatted.length });
    } catch (err) {
        console.error('GET /api/books error:', err);
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

        if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
        if (!sellingPrice) return res.status(400).json({ success: false, message: 'Selling price is required' });

        const stock = Number(initialStock) || 0;
        const lowStock = Number(lowStockAlert) || 5;
        const status = computeStatus(stock, lowStock);

        const ts = Date.now().toString().slice(-6);
        const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        const bookId = `BK-${ts}${rand}`;

        const stockHistory = stock > 0 ? [{
            quantity: stock,
            date: new Date(),
            note: 'Initial stock',
            addedBy: createdBy || 'Admin'
        }] : [];

        const newRow = {
            book_id: bookId,
            title,
            author: author || '',
            publisher: publisher || '',
            category: category || 'General',
            mrp_price: Number(mrpPrice) || 0,
            selling_price: Number(sellingPrice),
            discount_amount: Number(discountAmount) || 0,
            discount_percent: Number(discountPercent) || 0,
            stock_in: stock,
            stock_sold: 0,
            stock_current: stock,
            low_stock_alert: lowStock,
            status,
            stock_history: stockHistory,
            description: description || '',
            is_active: true,
            created_by: createdBy || 'Admin',
            created_at: new Date(),
            updated_at: new Date()
        };

        const { data: savedBook, error } = await supabase
            .from('books')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Book added successfully', book: formatBook(savedBook) });
    } catch (err) {
        console.error('POST /api/books error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/books/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('books').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('book_id', idParam);

        const { data: book, error } = await query.maybeSingle();
        if (error || !book) return res.status(404).json({ success: false, message: 'Book not found' });

        res.json({ success: true, book: formatBook(book) });
    } catch (err) {
        console.error('GET /api/books/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/books/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let findQuery = supabase.from('books').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) findQuery = findQuery.eq('id', idParam);
        else findQuery = findQuery.eq('book_id', idParam);

        const { data: book } = await findQuery.maybeSingle();
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        const updateData = { updated_at: new Date() };
        if (req.body.title !== undefined) updateData.title = req.body.title;
        if (req.body.author !== undefined) updateData.author = req.body.author;
        if (req.body.publisher !== undefined) updateData.publisher = req.body.publisher;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.mrpPrice !== undefined) updateData.mrp_price = Number(req.body.mrpPrice);
        if (req.body.sellingPrice !== undefined) updateData.selling_price = Number(req.body.sellingPrice);
        if (req.body.discountAmount !== undefined) updateData.discount_amount = Number(req.body.discountAmount);
        if (req.body.discountPercent !== undefined) updateData.discount_percent = Number(req.body.discountPercent);
        if (req.body.lowStockAlert !== undefined) updateData.low_stock_alert = Number(req.body.lowStockAlert);
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.isActive !== undefined) updateData.is_active = req.body.isActive;

        const stockCurrent = Number(book.stock_current || 0);
        const lowStock = updateData.low_stock_alert || Number(book.low_stock_alert || 5);
        updateData.status = computeStatus(stockCurrent, lowStock);

        const { data: updatedBook, error } = await supabase
            .from('books')
            .update(updateData)
            .eq('id', book.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Book updated', book: formatBook(updatedBook) });
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

        const idParam = req.params.id;
        let findQuery = supabase.from('books').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) findQuery = findQuery.eq('id', idParam);
        else findQuery = findQuery.eq('book_id', idParam);

        const { data: book } = await findQuery.maybeSingle();
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        const newStockIn = Number(book.stock_in || 0) + qty;
        const newStockCurrent = Math.max(0, newStockIn - Number(book.stock_sold || 0));
        const newStatus = computeStatus(newStockCurrent, Number(book.low_stock_alert || 5));

        const history = Array.isArray(book.stock_history) ? [...book.stock_history] : [];
        history.push({
            quantity: qty,
            date: new Date(),
            note: note || 'Stock added',
            addedBy: addedBy || 'Admin'
        });

        const { data: updatedBook, error } = await supabase
            .from('books')
            .update({
                stock_in: newStockIn,
                stock_current: newStockCurrent,
                status: newStatus,
                stock_history: history,
                updated_at: new Date()
            })
            .eq('id', book.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, message: `${qty} copies added to stock`, book: formatBook(updatedBook) });
    } catch (err) {
        console.error('POST /api/books/:id/stock error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /api/books/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let findQuery = supabase.from('books').select('id, book_id, title');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) findQuery = findQuery.eq('id', idParam);
        else findQuery = findQuery.eq('book_id', idParam);

        const { data: book } = await findQuery.maybeSingle();
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

        // Read sale rows in pages and match the item IDs in application code.
        // This also catches older rows whose JSON item key is book_id instead of bookId.
        const sales = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
            const { data: page, error: salesError } = await supabase
                .from('book_sales')
                .select('id, items, total_items, gross_amount, total_discount, net_amount, income_id')
                .order('id', { ascending: true })
                .range(offset, offset + pageSize - 1);
            if (salesError) throw salesError;
            sales.push(...(page || []));
            if (!page || page.length < pageSize) break;
        }
        const isDeletedBookItem = item => String(item?.bookId ?? item?.book_id ?? item?.bookID ?? '') === String(book.book_id);
        const relatedSales = sales.filter(sale => Array.isArray(sale.items) && sale.items.some(isDeletedBookItem));

        let removedSaleItems = 0;
        for (const sale of relatedSales) {
            const items = Array.isArray(sale.items) ? sale.items : [];
            const retainedItems = items.filter(item => !isDeletedBookItem(item));
            removedSaleItems += items.length - retainedItems.length;

            if (retainedItems.length === 0) {
                const { error: saleDeleteError } = await supabase.from('book_sales').delete().eq('id', sale.id);
                if (saleDeleteError) throw saleDeleteError;
                if (sale.income_id) {
                    const { error: incomeDeleteError } = await supabase
                        .from('incomes')
                        .delete()
                        .eq('income_id', sale.income_id)
                        .eq('source', 'Books');
                    if (incomeDeleteError) throw incomeDeleteError;
                }
                continue;
            }

            const totalItems = retainedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            const grossAmount = retainedItems.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0);
            const totalDiscount = retainedItems.reduce((sum, item) => sum + Number(item.discount || 0), 0);
            const netAmount = retainedItems.reduce((sum, item) => sum + Number(item.subtotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 0) - Number(item.discount || 0))), 0);

            const { error: saleUpdateError } = await supabase.from('book_sales').update({
                items: retainedItems,
                total_items: totalItems,
                gross_amount: grossAmount,
                total_discount: totalDiscount,
                net_amount: netAmount,
                updated_at: new Date()
            }).eq('id', sale.id);
            if (saleUpdateError) throw saleUpdateError;

            if (sale.income_id) {
                const { error: incomeUpdateError } = await supabase
                    .from('incomes')
                    .update({ amount: netAmount, updated_at: new Date() })
                    .eq('income_id', sale.income_id)
                    .eq('source', 'Books');
                if (incomeUpdateError) throw incomeUpdateError;
            }
        }

        const { error: bookDeleteError } = await supabase.from('books').delete().eq('id', book.id);
        if (bookDeleteError) throw bookDeleteError;

        res.json({ success: true, message: 'Book and its related sale entries deleted', removedSaleItems, removedSales: relatedSales.length });
    } catch (err) {
        console.error('DELETE /api/books/:id error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
