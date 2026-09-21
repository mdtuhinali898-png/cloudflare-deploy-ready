/* ============================================================
   BOOK-STORE.JS — EduSmart Book Store Module
   ============================================================ */

const API = window.API_BASE || '';

// ── State ──────────────────────────────────────────────────
let allBooks       = [];
let allSales       = [];
let cart           = [];           // [{book, qty, unitPrice, discount}]
let selectedMethod = 'Cash';
let selectedBuyer  = 'External';
let currentTab     = 'inventory';
let editBookId     = null;         // for edit modal
let charts         = {};

// ── Helpers ────────────────────────────────────────────────
const fmt  = n => '৳' + Number(n || 0).toLocaleString();
const fmtN = n => Number(n || 0).toLocaleString();

function showToast(msg, type = 'success') {
    document.querySelectorAll('.bs-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = `bs-toast ${type}`;
    t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function renderChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    const existing = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existing) existing.destroy();
    charts[id] = new Chart(canvas.getContext('2d'), config);
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadInstituteInfo();
    loadAllData();
    setupBuyerTypeToggle();
    setupPaymentMethodBtns();
    setDefaultDate();
    toggleBuyerFields(); // initial state: External fields দেখাবে
});

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('saleDateInput');
    if (el) el.value = today;
}

async function loadInstituteInfo() {
    try {
        const res = await fetch(`${API}/api/institute/public`);
        if (res.ok) {
            const r = await res.json();
            if (r.success && r.data) {
                window._instituteName    = r.data.name    || 'EduSmart';
                window._instituteDetails = `${r.data.address || ''} | Phone: ${r.data.phone || ''}`;
            }
        }
    } catch (_) {}
}

async function loadAllData() {
    await Promise.all([loadBooks(), loadSales()]);
    loadSummaryCards();
    renderInventoryTable(); // page load এ inventory tab active থাকে তাই এখনই render করো
}

// ══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.bs-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.bs-tab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    const cnt = document.getElementById(`tab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.classList.add('active');

    switch (tab) {
        case 'inventory': renderInventoryTable(); break;
        case 'sale':      populateBookDropdown(); break;
        case 'history':   loadSalesHistory(); break;
        case 'reports':   loadReports(); break;
    }
}

// ══════════════════════════════════════════════════════════════
// SUMMARY CARDS (top of page)
// ══════════════════════════════════════════════════════════════
async function loadSummaryCards() {
    try {
        const [sumRes, invRes] = await Promise.all([
            fetch(`${API}/api/book-sales/summary`),
            fetch(`${API}/api/books/summary`)
        ]);
        const sumData = await sumRes.json();
        const invData = await invRes.json();

        if (sumData.success) {
            setText('sc-today-amt',   fmt(sumData.today?.amount));
            setText('sc-today-pcs',   fmtN(sumData.today?.items) + ' pcs');
            setText('sc-month-amt',   fmt(sumData.thisMonth?.amount));
            setText('sc-month-pcs',   fmtN(sumData.thisMonth?.items) + ' pcs');
            setText('sc-total-amt',   fmt(sumData.allTime?.amount));
            setText('sc-total-sales', fmtN(sumData.allTime?.count) + ' sales');
        }
        if (invData.success) {
            setText('sc-total-books',  fmtN(invData.totalBooks));
            setText('sc-low-stock',    fmtN(invData.lowStock));
            setText('sc-out-stock',    fmtN(invData.outOfStock));
            setText('sc-stock-cur',    fmtN(invData.totalStockCurrent) + ' pcs');
        }
    } catch (e) {
        console.error('loadSummaryCards error:', e);
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ══════════════════════════════════════════════════════════════
// TAB 1 — INVENTORY
// ══════════════════════════════════════════════════════════════
async function loadBooks() {
    try {
        const res  = await fetch(`${API}/api/books?isActive=true`);
        const data = await res.json();
        if (data.success) allBooks = data.books || [];
    } catch (e) { console.error('loadBooks error:', e); }
}

function renderInventoryTable() {
    const cat    = document.getElementById('invCatFilter')?.value || 'all';
    const status = document.getElementById('invStatusFilter')?.value || 'all';
    const search = (document.getElementById('invSearch')?.value || '').toLowerCase();

    let books = allBooks.filter(b => {
        if (cat    !== 'all' && b.category !== cat)    return false;
        if (status !== 'all' && b.status   !== status) return false;
        if (search && !`${b.title} ${b.author} ${b.bookId}`.toLowerCase().includes(search)) return false;
        return true;
    });

    const tbody = document.getElementById('invTableBody');
    if (!tbody) return;

    if (books.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="9">কোনো বই পাওয়া যায়নি।</td></tr>`;
        return;
    }

    tbody.innerHTML = books.map(b => {
        const statusBadge = b.status === 'Available'
            ? `<span class="bs-badge bs-badge-available">Available</span>`
            : b.status === 'Low Stock'
            ? `<span class="bs-badge bs-badge-low">⚠ Low Stock</span>`
            : `<span class="bs-badge bs-badge-out">Out of Stock</span>`;

        return `<tr class="${b.status === 'Out of Stock' ? 'out-of-stock-row' : b.status === 'Low Stock' ? 'low-stock-row' : ''}">
            <td><strong style="color:#f97316">${b.bookId}</strong></td>
            <td>
                <div style="font-weight:600;color:#2c3e50">${b.title}</div>
                ${b.author ? `<div style="font-size:11px;color:#6c757d">${b.author}</div>` : ''}
            </td>
            <td><span class="bs-badge" style="background:#f0f4ff;color:#4e73df">${b.category}</span></td>
            <td>${fmt(b.mrpPrice || 0)}</td>
            <td style="font-weight:700;color:#1cc88a">${fmt(b.sellingPrice)}</td>
            <td>${b.discountAmount > 0 ? fmt(b.discountAmount) : b.discountPercent > 0 ? b.discountPercent + '%' : '—'}</td>
            <td>
                <span style="font-weight:700;color:${b.stockCurrent <= b.lowStockAlert ? '#e74a3b' : '#2c3e50'}">${b.stockCurrent}</span>
                <span style="font-size:11px;color:#6c757d"> / ${b.stockIn} in</span>
            </td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-warning btn-sm" onclick="openAddStockModal('${b.bookId}','${b.title.replace(/'/g,"\\'")}')">
                    <i class="fas fa-plus"></i> Stock
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openEditModal('${b.bookId}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function applyInventoryFilter() {
    renderInventoryTable();
}

// ── Add Book Modal ──
function openAddBookModal() {
    editBookId = null;
    document.getElementById('bookModalTitle').textContent = 'নতুন বই যোগ করুন';
    document.getElementById('bookForm').reset();
    document.getElementById('bookInitialStock').parentElement.style.display = 'flex';
    openModal('addBookModal');
}

async function openEditModal(bookId) {
    const book = allBooks.find(b => b.bookId === bookId);
    if (!book) return;
    editBookId = bookId;
    document.getElementById('bookModalTitle').textContent = 'বই আপডেট করুন';
    document.getElementById('bookTitle').value          = book.title         || '';
    document.getElementById('bookAuthor').value         = book.author        || '';
    document.getElementById('bookPublisher').value      = book.publisher     || '';
    document.getElementById('bookCategory').value       = book.category      || 'General';
    document.getElementById('bookMrpPrice').value       = book.mrpPrice      || '';
    document.getElementById('bookSellingPrice').value   = book.sellingPrice  || '';
    document.getElementById('bookDiscountAmt').value    = book.discountAmount || '';
    document.getElementById('bookDiscountPct').value    = book.discountPercent|| '';
    document.getElementById('bookLowAlert').value       = book.lowStockAlert  || 5;
    document.getElementById('bookDescription').value   = book.description    || '';
    document.getElementById('bookInitialStock').parentElement.style.display = 'none';
    openModal('addBookModal');
}

async function saveBook() {
    const payload = {
        title:           document.getElementById('bookTitle').value.trim(),
        author:          document.getElementById('bookAuthor').value.trim(),
        publisher:       document.getElementById('bookPublisher').value.trim(),
        category:        document.getElementById('bookCategory').value,
        mrpPrice:        document.getElementById('bookMrpPrice').value,
        sellingPrice:    document.getElementById('bookSellingPrice').value,
        discountAmount:  document.getElementById('bookDiscountAmt').value,
        discountPercent: document.getElementById('bookDiscountPct').value,
        lowStockAlert:   document.getElementById('bookLowAlert').value,
        description:     document.getElementById('bookDescription').value.trim(),
        initialStock:    document.getElementById('bookInitialStock').value || 0
    };

    if (!payload.title)        return showToast('বইয়ের নাম দিন', 'error');
    if (!payload.sellingPrice) return showToast('বিক্রয় মূল্য দিন', 'error');

    const btn = document.getElementById('saveBookBtn');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';

    try {
        const url    = editBookId ? `${API}/api/books/${editBookId}` : `${API}/api/books`;
        const method = editBookId ? 'PUT' : 'POST';
        const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data   = await res.json();

        if (data.success) {
            showToast(editBookId ? 'বই আপডেট হয়েছে' : 'নতুন বই যোগ হয়েছে ✓');
            closeModal('addBookModal');
            await loadBooks();
            renderInventoryTable();
            loadSummaryCards();
        } else {
            showToast(data.message || 'Error', 'error');
        }
    } catch (e) {
        showToast('Server error', 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'সংরক্ষণ করুন';
    }
}

// ── Add Stock Modal ──
function openAddStockModal(bookId, title) {
    document.getElementById('stockBookId').value    = bookId;
    document.getElementById('stockBookTitle').value = title;
    document.getElementById('stockQty').value       = '';
    document.getElementById('stockNote').value      = '';
    openModal('addStockModal');
}

async function saveStock() {
    const bookId = document.getElementById('stockBookId').value;
    const qty    = Number(document.getElementById('stockQty').value);
    const note   = document.getElementById('stockNote').value.trim();

    if (!qty || qty <= 0) return showToast('পরিমাণ দিন (0 এর বেশি)', 'error');

    const btn = document.getElementById('saveStockBtn');
    btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';

    try {
        const res  = await fetch(`${API}/api/books/${bookId}/stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: qty, note })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`${qty} কপি স্টকে যোগ হয়েছে ✓`);
            closeModal('addStockModal');
            await loadBooks();
            renderInventoryTable();
            loadSummaryCards();
        } else {
            showToast(data.message || 'Error', 'error');
        }
    } catch (e) {
        showToast('Server error', 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'স্টক যোগ করুন';
    }
}

// ══════════════════════════════════════════════════════════════
// TAB 2 — NEW SALE
// ══════════════════════════════════════════════════════════════
function setupBuyerTypeToggle() {
    // নতুন design এ nsSwitchBuyer() ব্যবহার হচ্ছে — এটা fallback
    document.querySelectorAll('.buyer-radio-label').forEach(label => {
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = label.dataset.value;
            if (!value) return;
            selectedBuyer = value;
            document.querySelectorAll('.buyer-radio-label').forEach(l => l.classList.remove('selected'));
            label.classList.add('selected');
            const radio = label.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            toggleBuyerFields();
        });
    });
}

// নতুন design — buyer type switch
function nsSwitchBuyer(btn) {
    selectedBuyer = btn.dataset.value;
    document.querySelectorAll('.ns-toggle-btn').forEach(b => b.classList.remove('ns-toggle-active'));
    btn.classList.add('ns-toggle-active');
    toggleBuyerFields();
    if (selectedBuyer === 'External') {
        const card = document.getElementById('studentCard');
        if (card) card.style.display = 'none';
    }
}

// নতুন design — qty counter +/−
function nsChangeQty(delta) {
    const el = document.getElementById('bookQtyInput');
    if (!el) return;
    el.value = Math.max(1, (parseInt(el.value) || 1) + delta);
    updateAddRowPreview();
}

function toggleBuyerFields() {
    const studentFields  = document.getElementById('studentFields');
    const externalFields = document.getElementById('externalFields');
    if (selectedBuyer === 'Student') {
        if (studentFields)  studentFields.style.display  = 'flex';
        if (externalFields) externalFields.style.display = 'none';
    } else {
        if (studentFields)  studentFields.style.display  = 'none';
        if (externalFields) externalFields.style.display = 'block';
    }
}

// Auto-fill student info
async function lookupStudent() {
    const sid = document.getElementById('saleStudentId')?.value.trim();
    if (!sid) return showToast('Student ID দিন', 'warning');

    try {
        // First: try exact match via /:id route
        const res1  = await fetch(`${API}/api/students/${encodeURIComponent(sid)}`);
        const data1 = await res1.json();

        let s = null;

        if (data1.success && data1.student) {
            s = data1.student;
        } else {
            // Fallback: search query
            const res2  = await fetch(`${API}/api/students?search=${encodeURIComponent(sid)}&limit=50`);
            const data2 = await res2.json();
            const list  = data2.students || data2.data || [];
            s = list.find(x =>
                (x.studentId || '').toLowerCase() === sid.toLowerCase()
            );
        }

        if (s) {
            // span element এ textContent দিয়ে set করতে হবে (value নয়)
            const setSpan = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val || '';
            };
            setSpan('saleStudentName',  s.name);
            setSpan('saleStudentBatch', s.batch);
            setSpan('saleStudentPhone', s.phone);

            // student card show
            const card = document.getElementById('studentCard');
            if (card) {
                document.getElementById('saleStudentIdShow').textContent = s.studentId;
                card.style.display = 'block';
            }
            showToast(`✓ পাওয়া গেছে: ${s.name} (${s.batch})`, 'success');
        } else {
            showToast('Student ID পাওয়া যায়নি', 'warning');
            ['saleStudentName','saleStudentBatch','saleStudentPhone','saleStudentIdShow'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '';
            });
            const card = document.getElementById('studentCard');
            if (card) card.style.display = 'none';
        }
    } catch (e) {
        showToast('Server error: ' + e.message, 'error');
    }
}

function setText2(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
}

function populateBookDropdown() {
    const sel = document.getElementById('bookSelectDropdown');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- বই সিলেক্ট করুন --</option>';
    allBooks.filter(b => b.stockCurrent > 0).forEach(b => {
        const opt = document.createElement('option');
        opt.value       = b.bookId;
        opt.textContent = `${b.title} (Stock: ${b.stockCurrent}) — ${fmt(b.sellingPrice)}`;
        sel.appendChild(opt);
    });
}

function onBookSelect() {
    const sel  = document.getElementById('bookSelectDropdown');
    const book = allBooks.find(b => b.bookId === sel.value);

    const selectedCard = document.getElementById('selectedBookCard');
    const prev         = document.getElementById('addRowPreview');

    if (!book) {
        if (selectedCard) selectedCard.style.display = 'none';
        if (prev)         prev.style.display         = 'none';
        return;
    }

    // price + disc fill
    const priceEl = document.getElementById('bookUnitPrice');
    const discEl  = document.getElementById('bookDiscInput');
    const qtyEl   = document.getElementById('bookQtyInput');
    if (priceEl) priceEl.value = book.sellingPrice;
    if (discEl)  discEl.value  = book.discountAmount || 0;
    if (qtyEl)   qtyEl.value   = 1;

    // selected book card populate
    if (selectedCard) {
        const thumb = document.getElementById('selectedBookThumb');
        const title = document.getElementById('selectedBookTitle');
        const meta  = document.getElementById('selectedBookMeta');

        // random-ish color from bookId
        const colors = ['#f97316','#4e73df','#1cc88a','#8b5cf6','#e74a3b','#36b9cc'];
        const color  = colors[book.bookId.charCodeAt(book.bookId.length - 1) % colors.length];
        if (thumb) {
            thumb.style.background = `linear-gradient(135deg, ${color}, ${color}cc)`;
            thumb.innerHTML        = `<i class="fas fa-book"></i>`;
        }
        if (title) title.textContent = book.title;
        if (meta)  meta.innerHTML   = `Stock: ${book.stockCurrent} &nbsp;|&nbsp; Unit Price: ৳${book.sellingPrice}`;

        selectedCard.style.display = 'flex';
    }

    updateAddRowPreview();
}

// Live preview — quantity/price/discount যেকোনো field change হলে
function updateAddRowPreview() {
    const qty       = parseInt(document.getElementById('bookQtyInput')?.value)    || 0;
    const unitPrice = parseFloat(document.getElementById('bookUnitPrice')?.value) || 0;
    const discount  = parseFloat(document.getElementById('bookDiscInput')?.value) || 0;

    const prev = document.getElementById('addRowPreview');
    const text = document.getElementById('previewText');
    if (!prev || !text) return;

    if (!unitPrice || qty <= 0) {
        prev.style.display = 'none';
        return;
    }

    const totalDiscount = discount * qty;
    const subtotal      = (unitPrice - discount) * qty;

    // format: 🧮 ৳200 × 3 পিস = ৳600  |  🏷️ ছাড় ৳60  |  💰 নেট মূল্য ৳540
    const gross = unitPrice * qty;
    text.innerHTML =
        `<span style="color:#4e73df;">🧮 ${fmt(unitPrice)} × ${qty} পিস = ${fmt(gross)}</span>` +
        `<span style="color:#9ca3af;margin:0 10px;">|</span>` +
        `<span style="color:#e74a3b;">🏷️ ছাড় ${fmt(totalDiscount)}</span>` +
        `<span style="color:#9ca3af;margin:0 10px;">|</span>` +
        `<span style="color:#f97316;font-weight:800;">💰 নেট মূল্য ${fmt(subtotal)}</span>`;

    prev.style.display = 'block';
}

function addToCart() {
    const sel      = document.getElementById('bookSelectDropdown');
    const qtyEl    = document.getElementById('bookQtyInput');
    const priceEl  = document.getElementById('bookUnitPrice');
    const discEl   = document.getElementById('bookDiscInput');

    const bookId   = sel.value;
    const qty      = parseInt(qtyEl.value) || 1;
    const unitPrice= parseFloat(priceEl.value) || 0;
    const discount = parseFloat(discEl.value)  || 0;

    if (!bookId) return showToast('বই সিলেক্ট করুন', 'error');
    if (qty <= 0) return showToast('পরিমাণ সঠিক নয়', 'error');

    const book = allBooks.find(b => b.bookId === bookId);
    if (!book) return;

    if (qty > book.stockCurrent) {
        return showToast(`স্টক কম! পাওয়া যাচ্ছে: ${book.stockCurrent}`, 'warning');
    }

    // If already in cart, update qty
    const existing = cart.find(c => c.bookId === bookId);
    if (existing) {
        const newQty = existing.qty + qty;
        if (newQty > book.stockCurrent) {
            return showToast(`মোট পরিমাণ স্টকের বেশি! সর্বোচ্চ: ${book.stockCurrent}`, 'warning');
        }
        existing.qty       = newQty;
        existing.discount  = discount;
        // discount per-unit — তাই qty দিয়ে multiply করতে হবে
        existing.subtotal  = (unitPrice - discount) * newQty;
    } else {
        cart.push({
            bookId,
            title: book.title,
            qty,
            unitPrice,
            discount,
            // discount per-unit: (200-20) × 3 = 540
            subtotal: (unitPrice - discount) * qty
        });
    }

    // Reset add-row
    sel.value       = '';
    qtyEl.value     = '1';
    if (priceEl) priceEl.value = '';
    if (discEl)  discEl.value  = '0';

    // preview ও selected book card hide
    const prev = document.getElementById('addRowPreview');
    if (prev) prev.style.display = 'none';
    const selCard = document.getElementById('selectedBookCard');
    if (selCard) selCard.style.display = 'none';

    renderCart();
}

function removeFromCart(bookId) {
    cart = cart.filter(c => c.bookId !== bookId);
    renderCart();
}

// cart এ +/− button
function nsCartQty(bookId, delta) {
    const item = cart.find(c => c.bookId === bookId);
    if (!item) return;
    const book   = allBooks.find(b => b.bookId === bookId);
    const newQty = item.qty + delta;
    if (newQty < 1) return;
    if (book && newQty > book.stockCurrent) {
        return showToast(`সর্বোচ্চ স্টক: ${book.stockCurrent}`, 'warning');
    }
    item.qty      = newQty;
    item.subtotal = (item.unitPrice - item.discount) * newQty;
    renderCart();
}

function updateCartItem(bookId, field, value) {
    const item = cart.find(c => c.bookId === bookId);
    if (!item) return;
    if (field === 'qty')      item.qty      = Math.max(1, parseInt(value) || 1);
    if (field === 'discount') item.discount = Math.max(0, parseFloat(value) || 0);
    // discount per-unit: (unitPrice - discount) × qty
    item.subtotal = (item.unitPrice - item.discount) * item.qty;
    renderCartTotals();
}

function renderCart() {
    const tbody = document.getElementById('cartBody');
    if (!tbody) return;

    // cart count badge update
    const countEl = document.getElementById('cartItemCount');
    if (countEl) countEl.textContent = cart.length > 0 ? `${cart.length} টি আইটেম` : '0 টি আইটেম';

    if (cart.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="ns-empty-cart">
            <i class="fas fa-shopping-basket"></i>
            <p>কার্ট খালি। বাম দিক থেকে বই যোগ করুন।</p>
        </td></tr>`;
        renderCartTotals();
        return;
    }

    tbody.innerHTML = cart.map((item, idx) => {
        const colors = ['#f97316','#4e73df','#1cc88a','#8b5cf6','#e74a3b','#36b9cc'];
        const color  = colors[item.bookId.charCodeAt(item.bookId.length - 1) % colors.length];
        return `<tr>
            <td style="font-weight:600;color:#6c757d;">${idx + 1}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:42px;border-radius:5px;background:linear-gradient(135deg,${color},${color}cc);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;flex-shrink:0;">
                        <i class="fas fa-book"></i>
                    </div>
                    <div>
                        <div style="font-weight:700;color:#2c3e50;font-size:13px;">${item.title}</div>
                        <div style="font-size:11px;color:#6c757d;">Stock: ${allBooks.find(b=>b.bookId===item.bookId)?.stockCurrent ?? '—'}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="ns-cart-qty">
                    <button onclick="nsCartQty('${item.bookId}',-1)">−</button>
                    <input type="number" min="1" value="${item.qty}"
                        onchange="updateCartItem('${item.bookId}','qty',this.value)">
                    <button onclick="nsCartQty('${item.bookId}',1)">+</button>
                </div>
            </td>
            <td style="font-weight:600;">৳${item.unitPrice.toLocaleString()}</td>
            <td style="color:#e74a3b;font-weight:600;">৳${item.discount.toLocaleString()}</td>
            <td style="font-weight:800;color:#1cc88a;">৳${item.subtotal.toLocaleString()}</td>
            <td>
                <button class="ns-remove-btn" onclick="removeFromCart('${item.bookId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    renderCartTotals();
}

function renderCartTotals() {
    const gross = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
    const disc  = cart.reduce((s, c) => s + c.discount * c.qty, 0);
    const net   = gross - disc;

    setText('cartGross',    fmt(gross));
    setText('cartDiscount', fmt(disc));
    setText('cartNet',      fmt(net));

    // submit button এ net amount দেখাবে
    const btnNet = document.getElementById('btnNetAmount');
    if (btnNet) btnNet.textContent = fmt(net);

    const btn = document.getElementById('btnSubmitSale');
    if (btn) btn.disabled = cart.length === 0;
}

function setupPaymentMethodBtns() {
    // পুরনো .pay-method-btn
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedMethod = btn.dataset.method;
            document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    // নতুন .ns-pay-btn
    document.querySelectorAll('.ns-pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedMethod = btn.dataset.method;
            document.querySelectorAll('.ns-pay-btn').forEach(b => b.classList.remove('ns-pay-active'));
            btn.classList.add('ns-pay-active');
        });
    });
}

async function submitSale() {
    if (cart.length === 0) return showToast('কার্টে কোনো বই নেই', 'error');

    // Buyer info
    let buyerName, buyerPhone = '', buyerAddress = '', buyerBatch = '', studentId = '';

    if (selectedBuyer === 'Student') {
        studentId  = document.getElementById('saleStudentId')?.value.trim() || '';
        buyerName  = document.getElementById('saleStudentName')?.textContent?.trim() || '';
        buyerBatch = document.getElementById('saleStudentBatch')?.textContent?.trim() || '';
        buyerPhone = document.getElementById('saleStudentPhone')?.textContent?.trim() || '';
        if (!buyerName) return showToast('ছাত্রের নাম পাওয়া যায়নি। Student ID দিয়ে খুঁজুন।', 'error');
    } else {
        buyerName    = document.getElementById('extBuyerName')?.value.trim() || '';
        buyerPhone   = document.getElementById('extBuyerPhone')?.value.trim() || '';
        buyerAddress = document.getElementById('extBuyerAddress')?.value.trim() || '';
        if (!buyerName) return showToast('ক্রেতার নাম দিন', 'error');
    }

    const saleDate     = document.getElementById('saleDateInput')?.value || new Date().toISOString().split('T')[0];
    const paymentStatus= document.getElementById('paymentStatusSel')?.value || 'Paid';
    const remarks      = document.getElementById('saleRemarks')?.value.trim() || '';

    const gross = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
    const disc  = cart.reduce((s, c) => s + c.discount * c.qty, 0);
    const net   = gross - disc;

    const payload = {
        saleDate,
        buyerType: selectedBuyer,
        studentId, buyerName, buyerPhone, buyerAddress, buyerBatch,
        items: cart.map(c => ({
            bookId: c.bookId, title: c.title,
            quantity: c.qty, unitPrice: c.unitPrice,
            discount: c.discount, subtotal: c.subtotal
        })),
        grossAmount:   gross,
        totalDiscount: disc,
        netAmount:     net,
        paymentMethod: selectedMethod,
        paymentStatus, remarks
    };

    const btn = document.getElementById('btnSubmitSale');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> বিক্রি হচ্ছে...';

    try {
        const res  = await fetch(`${API}/api/book-sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            showToast(`বিক্রি সফল! রসিদ: ${data.sale.receiptNo} ✓`);
            cart = [];
            renderCart();
            resetSaleForm();
            await loadBooks();
            await loadSales();
            loadSummaryCards();
            // show receipt
            showReceiptModal(data.sale);
        } else {
            showToast(data.message || 'Error', 'error');
        }
    } catch (e) {
        showToast('Server error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> বিক্রি সম্পন্ন করুন';
    }
}

function resetSaleForm() {
    // input fields clear
    const inputIds = ['saleStudentId', 'extBuyerName', 'extBuyerPhone', 'extBuyerAddress', 'saleRemarks'];
    inputIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // span fields clear
    ['saleStudentName','saleStudentBatch','saleStudentPhone','saleStudentIdShow'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });

    // student card hide
    const card = document.getElementById('studentCard');
    if (card) card.style.display = 'none';

    setDefaultDate();
}

// ══════════════════════════════════════════════════════════════
// RECEIPT MODAL
// ══════════════════════════════════════════════════════════════
function showReceiptModal(sale) {
    const instituteName    = window._instituteName    || 'EduSmart';
    const instituteDetails = window._instituteDetails || '';

    const itemRows = (sale.items || []).map(item => `
        <tr>
            <td>${item.title}</td>
            <td style="text-align:center">${item.quantity}</td>
            <td style="text-align:right">${fmt(item.unitPrice)}</td>
            <td style="text-align:right">${item.discount ? fmt(item.discount) : '—'}</td>
            <td style="text-align:right">${fmt(item.subtotal)}</td>
        </tr>
    `).join('');

    const html = `
        <div class="receipt-box" id="receiptContent">
            <div class="receipt-header">
                <h2><i class="fas fa-book"></i> ${instituteName}</h2>
                <p>${instituteDetails}</p>
                <p style="margin-top:6px;font-weight:700;font-size:14px;">📚 Book Sale Receipt</p>
            </div>
            <hr class="receipt-divider">
            <div class="receipt-row"><span>Receipt No:</span><strong>${sale.receiptNo}</strong></div>
            <div class="receipt-row"><span>Date:</span><span>${sale.saleDate}</span></div>
            <div class="receipt-row"><span>Buyer:</span><span>${sale.buyerName}</span></div>
            ${sale.buyerPhone ? `<div class="receipt-row"><span>Phone:</span><span>${sale.buyerPhone}</span></div>` : ''}
            ${sale.buyerType === 'Student' ? `<div class="receipt-row"><span>Student ID:</span><span>${sale.studentId}</span></div>` : ''}
            <hr class="receipt-divider">
            <table class="receipt-items-table">
                <thead><tr><th>Book</th><th>Qty</th><th>Price</th><th>Disc</th><th>Total</th></tr></thead>
                <tbody>${itemRows}</tbody>
            </table>
            <hr class="receipt-divider">
            <div class="receipt-row"><span>Gross Amount:</span><span>${fmt(sale.grossAmount)}</span></div>
            ${sale.totalDiscount > 0 ? `<div class="receipt-row" style="color:#e74a3b"><span>Total Discount:</span><span>- ${fmt(sale.totalDiscount)}</span></div>` : ''}
            <div class="receipt-row total"><span>Net Total:</span><strong>${fmt(sale.netAmount)}</strong></div>
            <hr class="receipt-divider">
            <div class="receipt-row"><span>Payment:</span><span>${sale.paymentMethod}</span></div>
            <div class="receipt-row"><span>Status:</span><span>${sale.paymentStatus === 'Paid' ? '✅ Paid' : '⚠ Due'}</span></div>
            <hr class="receipt-divider">
            <p style="text-align:center;font-size:11px;color:#6c757d;margin-top:8px;">ধন্যবাদ আপনার কেনাকাটার জন্য!</p>
        </div>
    `;

    document.getElementById('receiptModalBody').innerHTML = html;
    openModal('receiptModal');
}

function printReceipt() {
    const content = document.getElementById('receiptContent')?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank', 'width=500,height=700');
    w.document.write(`<!DOCTYPE html><html><head>
        <title>Book Sale Receipt</title>
        <style>
            body{font-family:Arial,sans-serif;padding:16px;font-size:13px;}
            .receipt-box{max-width:380px;margin:0 auto;}
            .receipt-header{text-align:center;margin-bottom:12px;}
            .receipt-header h2{font-size:18px;color:#f97316;margin-bottom:4px;}
            .receipt-divider{border:none;border-top:1px dashed #ccc;margin:10px 0;}
            .receipt-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}
            .receipt-row.total{border-top:2px solid #f97316;margin-top:8px;padding-top:8px;font-weight:700;font-size:15px;color:#f97316;}
            .receipt-items-table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0;}
            .receipt-items-table th{background:#fff7f0;padding:5px;text-align:left;border-bottom:1px solid #eee;}
            .receipt-items-table td{padding:4px 5px;border-bottom:1px solid #f5f5f5;}
        </style>
    </head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
}

// ══════════════════════════════════════════════════════════════
// TAB 3 — SALES HISTORY
// ══════════════════════════════════════════════════════════════
async function loadSales() {
    try {
        const res  = await fetch(`${API}/api/book-sales?limit=1000`);
        const data = await res.json();
        if (data.success) allSales = data.sales || [];
    } catch (e) { console.error('loadSales error:', e); }
}

function loadSalesHistory() {
    const from   = document.getElementById('histFromDate')?.value || '';
    const to     = document.getElementById('histToDate')?.value   || '';
    const bType  = document.getElementById('histBuyerType')?.value || 'all';
    const pStat  = document.getElementById('histPayStatus')?.value || 'all';

    let sales = allSales.filter(s => {
        if (from && s.saleDate < from) return false;
        if (to   && s.saleDate > to)   return false;
        if (bType !== 'all' && s.buyerType     !== bType) return false;
        if (pStat !== 'all' && s.paymentStatus !== pStat) return false;
        return true;
    });

    // summary
    const totalAmt  = sales.reduce((s, x) => s + x.netAmount, 0);
    const totalPcs  = sales.reduce((s, x) => s + x.totalItems, 0);
    setText('histTotalAmt',   fmt(totalAmt));
    setText('histTotalPcs',   fmtN(totalPcs) + ' pcs');
    setText('histTotalSales', fmtN(sales.length) + ' sales');

    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;

    if (sales.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="8">কোনো বিক্রির রেকর্ড পাওয়া যায়নি।</td></tr>`;
        return;
    }

    tbody.innerHTML = sales.map(s => {
        const buyerBadge = s.buyerType === 'Student'
            ? `<span class="bs-badge bs-badge-student">Student</span>`
            : `<span class="bs-badge bs-badge-external">External</span>`;
        const payBadge = s.paymentStatus === 'Paid'
            ? `<span class="bs-badge bs-badge-paid">Paid</span>`
            : `<span class="bs-badge bs-badge-due">Due</span>`;
        const methodBadge = s.paymentMethod === 'bKash'
            ? `<span class="bs-badge bs-badge-bkash">${s.paymentMethod}</span>`
            : s.paymentMethod === 'Nagad'
            ? `<span class="bs-badge bs-badge-nagad">${s.paymentMethod}</span>`
            : `<span class="bs-badge bs-badge-cash">${s.paymentMethod}</span>`;

        return `<tr>
            <td>${s.saleDate}</td>
            <td><strong style="color:#f97316">${s.receiptNo}</strong></td>
            <td>${s.buyerName}<br><small style="color:#6c757d">${s.studentId ? 'ID: ' + s.studentId : s.buyerPhone || ''}</small></td>
            <td>${buyerBadge}</td>
            <td>${fmtN(s.totalItems)} pcs</td>
            <td style="font-weight:700;color:#1cc88a">${fmt(s.netAmount)}</td>
            <td>${methodBadge} ${payBadge}</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="viewSaleReceipt('${s.receiptNo}')">
                    <i class="fas fa-eye"></i> Receipt
                </button>
            </td>
        </tr>`;
    }).join('');
}

async function viewSaleReceipt(receiptNo) {
    try {
        const res  = await fetch(`${API}/api/book-sales/receipt/${receiptNo}`);
        const data = await res.json();
        if (data.success) showReceiptModal(data.sale);
        else showToast('রসিদ পাওয়া যায়নি', 'error');
    } catch (e) { showToast('Server error', 'error'); }
}

function applyHistoryFilter() { loadSalesHistory(); }
function resetHistoryFilter() {
    ['histFromDate','histToDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('histBuyerType').value = 'all';
    document.getElementById('histPayStatus').value = 'all';
    loadSalesHistory();
}

// ══════════════════════════════════════════════════════════════
// TAB 4 — REPORTS
// ══════════════════════════════════════════════════════════════
async function loadReports() {
    try {
        const res  = await fetch(`${API}/api/book-sales/summary`);
        const data = await res.json();
        if (!data.success) return;

        // Summary cards
        setText('rpt-today-amt',  fmt(data.today?.amount));
        setText('rpt-today-pcs',  fmtN(data.today?.items) + ' pcs');
        setText('rpt-month-amt',  fmt(data.thisMonth?.amount));
        setText('rpt-month-pcs',  fmtN(data.thisMonth?.items) + ' pcs');
        setText('rpt-total-amt',  fmt(data.allTime?.amount));
        setText('rpt-total-pcs',  fmtN(data.allTime?.items) + ' pcs');

        // Top books list
        renderTopBooks(data.topBooks || []);

        // Buyer type chart
        renderBuyerTypeChart(data.byBuyerType || []);

        // Payment method chart
        renderMethodChart(data.byMethod || []);

        // Daily trend chart
        loadDailyTrendChart();

    } catch (e) { console.error('loadReports error:', e); }
}

function renderTopBooks(topBooks) {
    const el = document.getElementById('topBooksList');
    if (!el) return;
    if (topBooks.length === 0) {
        el.innerHTML = '<p style="color:#6c757d;text-align:center;padding:20px;">কোনো ডেটা নেই</p>';
        return;
    }
    el.innerHTML = topBooks.map((b, i) => `
        <div class="top-book-row">
            <div class="top-book-rank">${i + 1}</div>
            <div class="top-book-info">
                <div class="book-name">${b.title}</div>
                <div class="book-qty">${fmtN(b.totalQty)} কপি বিক্রি</div>
            </div>
            <div class="top-book-amount">${fmt(b.totalAmt)}</div>
        </div>
    `).join('');
}

function renderBuyerTypeChart(byBuyerType) {
    const labels = byBuyerType.map(b => b._id);
    const data   = byBuyerType.map(b => b.amount);
    renderChart('buyerTypeChart', {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: ['#4e73df','#8b5cf6'], borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderMethodChart(byMethod) {
    const colors = { Cash:'#1cc88a', bKash:'#e91e8c', Nagad:'#f97316', Bank:'#4e73df', Rocket:'#8b5cf6', Card:'#36b9cc' };
    renderChart('methodChart', {
        type: 'bar',
        data: {
            labels: byMethod.map(m => m._id),
            datasets: [{
                label: 'Amount (৳)',
                data: byMethod.map(m => m.amount),
                backgroundColor: byMethod.map(m => colors[m._id] || '#4e73df')
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

async function loadDailyTrendChart() {
    try {
        const res  = await fetch(`${API}/api/book-sales/daily`);
        const data = await res.json();
        if (!data.success) return;

        const daily  = (data.daily || []).slice(-14); // last 14 days
        const labels = daily.map(d => d._id);
        const amounts= daily.map(d => d.totalAmt);

        renderChart('dailyTrendChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Daily Book Sale (৳)',
                    data: amounts,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249,115,22,.12)',
                    fill: true, tension: .35
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
// MODAL HELPERS
// ══════════════════════════════════════════════════════════════
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('bs-modal-overlay')) {
        e.target.classList.remove('active');
    }
});
