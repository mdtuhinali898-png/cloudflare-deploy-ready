const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatBookSale(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        saleId: row.sale_id,
        receiptNo: row.receipt_no,
        saleDate: row.sale_date,
        month: row.month,
        year: row.year,
        buyerType: row.buyer_type,
        studentId: row.student_id,
        buyerName: row.buyer_name,
        buyerPhone: row.buyer_phone,
        buyerAddress: row.buyer_address,
        buyerBatch: row.buyer_batch,
        items: row.items || [],
        totalItems: Number(row.total_items || 0),
        grossAmount: Number(row.gross_amount || 0),
        totalDiscount: Number(row.total_discount || 0),
        netAmount: Number(row.net_amount || 0),
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        remarks: row.remarks || '',
        soldBy: row.sold_by,
        incomeId: row.income_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// ─── POST /api/book-sales ─────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const {
            saleDate, buyerType, studentId, buyerName,
            buyerPhone, buyerAddress, buyerBatch,
            items, paymentMethod, paymentStatus, remarks, soldBy
        } = req.body;

        if (!saleDate) return res.status(400).json({ success: false, message: 'Sale date is required' });
        if (!buyerName) return res.status(400).json({ success: false, message: 'Buyer name is required' });
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one book item is required' });
        }

        let grossAmount = 0;
        let totalDiscount = 0;
        const saleItems = [];

        for (const item of items) {
            const { data: book } = await supabase
                .from('books')
                .select('*')
                .eq('book_id', item.bookId)
                .maybeSingle();

            if (!book) {
                return res.status(400).json({ success: false, message: `Book not found: ${item.bookId}` });
            }

            const availableStock = Number(book.stock_current || 0);
            const qty = Number(item.quantity);

            if (availableStock < qty) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${book.title}". Available: ${availableStock}`
                });
            }

            const unitPrice = Number(item.unitPrice) || Number(book.selling_price);
            const discount = Number(item.discount) || 0;
            const subtotal = (unitPrice * qty) - discount;

            grossAmount += unitPrice * qty;
            totalDiscount += discount;

            saleItems.push({
                bookId: book.book_id,
                title: book.title,
                quantity: qty,
                unitPrice,
                discount,
                subtotal
            });
        }

        const netAmount = grossAmount - totalDiscount;
        const dateObj = new Date(saleDate + 'T00:00:00');
        const month = dateObj.toLocaleString('default', { month: 'long' });
        const year = dateObj.getFullYear();
        const totalItems = saleItems.reduce((s, i) => s + i.quantity, 0);

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const ts = Date.now().toString().slice(-5);
        const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        const saleId = `BSALE-${dateStr}-${ts}${rand}`;
        const receiptNo = `BRCPT-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;

        const newSaleRow = {
            sale_id: saleId,
            receipt_no: receiptNo,
            sale_date: saleDate,
            month,
            year,
            buyer_type: buyerType || 'External',
            student_id: studentId || '',
            buyer_name: buyerName,
            buyer_phone: buyerPhone || '',
            buyer_address: buyerAddress || '',
            buyer_batch: buyerBatch || '',
            items: saleItems,
            total_items: totalItems,
            gross_amount: grossAmount,
            total_discount: totalDiscount,
            net_amount: netAmount,
            payment_method: paymentMethod || 'Cash',
            payment_status: paymentStatus || 'Paid',
            remarks: remarks || '',
            sold_by: soldBy || 'Admin',
            created_at: new Date(),
            updated_at: new Date()
        };

        const { data: savedSale, error: saleErr } = await supabase
            .from('book_sales')
            .insert(newSaleRow)
            .select()
            .single();

        if (saleErr) throw saleErr;

        // Update stock
        for (const item of saleItems) {
            const { data: currentBook } = await supabase.from('books').select('*').eq('book_id', item.bookId).maybeSingle();
            if (currentBook) {
                const stockSold = Number(currentBook.stock_sold || 0) + item.quantity;
                const stockCurrent = Math.max(0, Number(currentBook.stock_in || 0) - stockSold);
                let status = 'Available';
                if (stockCurrent === 0) status = 'Out of Stock';
                else if (stockCurrent <= Number(currentBook.low_stock_alert || 5)) status = 'Low Stock';

                await supabase.from('books').update({
                    stock_sold: stockSold,
                    stock_current: stockCurrent,
                    status,
                    updated_at: new Date()
                }).eq('id', currentBook.id);
            }
        }

        // Auto-save Income record
        if (paymentStatus !== 'Due') {
            try {
                const { count: incCount } = await supabase.from('incomes').select('*', { count: 'exact', head: true });
                const incomeId = `INC-${Date.now()}-${(incCount || 0) + 1}`;

                await supabase.from('incomes').insert({
                    income_id: incomeId,
                    date: saleDate,
                    month,
                    year,
                    source: 'Books',
                    amount: netAmount,
                    payment_method: paymentMethod || 'Cash',
                    description: `Book Sale: ${receiptNo}`,
                    received_from: buyerName,
                    status: 'Active',
                    created_by: soldBy || 'Admin',
                    created_at: new Date(),
                    updated_at: new Date()
                });

                await supabase.from('book_sales').update({ income_id: incomeId }).eq('id', savedSale.id);
                savedSale.income_id = incomeId;
            } catch (incErr) {
                console.warn('Income auto-save warning:', incErr.message);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Sale recorded successfully',
            sale: formatBookSale(savedSale)
        });
    } catch (err) {
        console.error('POST /api/book-sales error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { date, fromDate, toDate, buyerType, paymentStatus, studentId, limit, page, view, includeCount } = req.query;
        const paginated = page !== undefined;
        const shouldCount = paginated && includeCount !== 'false';
        const columns = view === 'summary' ? 'sale_date,net_amount' : '*';
        let query = supabase.from('book_sales').select(columns, shouldCount ? { count: 'exact' } : undefined);

        if (date) query = query.eq('sale_date', date);
        else {
            if (fromDate) query = query.gte('sale_date', fromDate);
            if (toDate) query = query.lte('sale_date', toDate);
        }

        if (buyerType && buyerType !== 'all') query = query.eq('buyer_type', buyerType);
        if (paymentStatus && paymentStatus !== 'all') query = query.eq('payment_status', paymentStatus);
        if (studentId) query = query.eq('student_id', studentId);

        const lim = Math.min(1000, Math.max(1, parseInt(limit, 10) || 1000));
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
        if (paginated) {
            const pageNumber = Math.max(1, parseInt(page, 10) || 1);
            const offset = (pageNumber - 1) * lim;
            query = query.range(offset, offset + lim - 1);
        } else {
            // Preserve the existing non-paginated behavior for other callers.
            query = query.limit(parseInt(limit, 10) || 1000);
        }

        const { data: sales, count, error } = await query;
        if (error) throw error;

        const formatted = (sales || []).map(formatBookSale);
        if (!paginated) {
            return res.json({ success: true, sales: formatted, total: formatted.length });
        }

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        res.json({
            success: true,
            sales: formatted,
            total: shouldCount ? (count || 0) : null,
            page: pageNumber,
            totalPages: shouldCount ? Math.ceil((count || 0) / lim) : null
        });
    } catch (err) {
        console.error('GET /api/book-sales error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/summary ─────────────────────────────────────────────
router.get('/summary', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toLocaleString('default', { month: 'long' });
        const currentYear = new Date().getFullYear();

        const { data: allSales, error } = await supabase.from('book_sales').select('*');
        if (error) throw error;

        let todaySummary = { amount: 0, count: 0, items: 0 };
        let thisMonthSummary = { amount: 0, count: 0, items: 0 };
        let allTimeSummary = { amount: 0, count: 0, items: 0 };

        const buyerTypeMap = new Map();
        const methodMap = new Map();
        const topBooksMap = new Map();

        (allSales || []).forEach(s => {
            const net = Number(s.net_amount || 0);
            const itms = Number(s.total_items || 0);

            allTimeSummary.amount += net;
            allTimeSummary.count += 1;
            allTimeSummary.items += itms;

            if (s.sale_date === today) {
                todaySummary.amount += net;
                todaySummary.count += 1;
                todaySummary.items += itms;
            }

            if (s.month === currentMonth && Number(s.year) === currentYear) {
                thisMonthSummary.amount += net;
                thisMonthSummary.count += 1;
                thisMonthSummary.items += itms;
            }

            const bt = s.buyer_type || 'External';
            const curBt = buyerTypeMap.get(bt) || { _id: bt, amount: 0, count: 0 };
            curBt.amount += net;
            curBt.count += 1;
            buyerTypeMap.set(bt, curBt);

            const m = s.payment_method || 'Cash';
            const curM = methodMap.get(m) || { _id: m, amount: 0, count: 0 };
            curM.amount += net;
            curM.count += 1;
            methodMap.set(m, curM);

            (s.items || []).forEach(item => {
                const bId = item.bookId;
                const curB = topBooksMap.get(bId) || { _id: bId, title: item.title, totalQty: 0, totalAmt: 0 };
                curB.totalQty += Number(item.quantity || 0);
                curB.totalAmt += Number(item.subtotal || 0);
                topBooksMap.set(bId, curB);
            });
        });

        const topBooks = Array.from(topBooksMap.values()).sort((a,b) => b.totalQty - a.totalQty).slice(0, 5);

        res.json({
            success: true,
            today: todaySummary,
            thisMonth: thisMonthSummary,
            allTime: allTimeSummary,
            byBuyerType: Array.from(buyerTypeMap.values()),
            byMethod: Array.from(methodMap.values()),
            topBooks
        });
    } catch (err) {
        console.error('GET /api/book-sales/summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/daily ────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        let query = supabase.from('book_sales').select('sale_date, net_amount, total_items');

        if (fromDate) query = query.gte('sale_date', fromDate);
        if (toDate) query = query.lte('sale_date', toDate);

        const { data: sales, error } = await query;
        if (error) throw error;

        const dailyMap = new Map();
        (sales || []).forEach(s => {
            const d = s.sale_date;
            const cur = dailyMap.get(d) || { _id: d, totalAmt: 0, totalItems: 0, count: 0 };
            cur.totalAmt += Number(s.net_amount || 0);
            cur.totalItems += Number(s.total_items || 0);
            cur.count += 1;
            dailyMap.set(d, cur);
        });

        const daily = Array.from(dailyMap.values()).sort((a,b) => a._id.localeCompare(b._id));
        res.json({ success: true, daily });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/receipt/:receiptNo ───────────────────────────────────
router.get('/receipt/:receiptNo', async (req, res) => {
    try {
        const { data: sale, error } = await supabase
            .from('book_sales')
            .select('*')
            .ilike('receipt_no', req.params.receiptNo.trim())
            .maybeSingle();

        if (error || !sale) return res.status(404).json({ success: false, message: 'Receipt not found' });
        res.json({ success: true, sale: formatBookSale(sale) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /api/book-sales/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const idParam = req.params.id;
        let query = supabase.from('book_sales').select('*');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
        if (isUuid) query = query.eq('id', idParam);
        else query = query.eq('sale_id', idParam);

        const { data: sale, error } = await query.maybeSingle();
        if (error || !sale) return res.status(404).json({ success: false, message: 'Sale not found' });

        res.json({ success: true, sale: formatBookSale(sale) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
