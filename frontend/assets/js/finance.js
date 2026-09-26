// ==========================================================================
// EduSmart Complete Finance Dashboard JavaScript
// ==========================================================================

let currentPeriod = 'month';
let fromDate = '', toDate = '';
let barChart = null, pieChart = null, incomeSourceChart = null, trendChart = null;
let currentTrendDays = 7;
let _autoRefreshTimer = null;
let _lastLoadTime = 0;

// ── Cache: graph-data and budget only load once (or on manual full-refresh) ──
let _graphDataCache   = null;   // set after first successful /api/finance/graph-data fetch
let _budgetCache      = null;   // set after first successful /api/budgets fetch
let _cacheTimestamp   = 0;      // when the cache was last filled
const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 minutes — matches auto-refresh interval

function _isCacheValid() {
    return _graphDataCache && _budgetCache && (Date.now() - _cacheTimestamp < CACHE_TTL_MS);
}

function _bustCache() {
    _graphDataCache = null;
    _budgetCache    = null;
    _cacheTimestamp = 0;
}

// Prevent double-loads — skip if called within 10 seconds of the last load
function _shouldSkipLoad() {
    const now = Date.now();
    if (now - _lastLoadTime < 10000) return true;
    _lastLoadTime = now;
    return false;
}

document.addEventListener('DOMContentLoaded', function() {
    // Set default dates
    const today = new Date();
    fromDate = today.toISOString().split('T')[0].slice(0, 8) + '01';
    toDate = today.toISOString().split('T')[0];

    document.getElementById('fromDate').value = fromDate;
    document.getElementById('toDate').value = toDate;

    // Setup period buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentPeriod = this.dataset.period;

            // Update print button label
            _updatePrintBtnText(currentPeriod);

            if (currentPeriod === 'custom') {
                document.getElementById('customDateInputs').style.display = 'flex';
            } else {
                document.getElementById('customDateInputs').style.display = 'none';
                // Period change → only dashboard needs to reload (graph + budget are cached)
                loadPeriodData();
            }
        });
    });

    // Initial full load (fetches everything including graph + budget)
    loadAllFinanceData();

    // Auto-refresh every 5 minutes — bust cache so fresh data is fetched
    _autoRefreshTimer = setInterval(() => {
        if (!document.hidden) {
            _bustCache();
            loadAllFinanceData();
        }
    }, CACHE_TTL_MS);

    // Reload when user switches back to this tab (skip if loaded recently)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !_shouldSkipLoad()) loadAllFinanceData();
    });
});

// Period label map for print button
const _periodLabels = {
    today    : 'Today',
    week     : 'This Week',
    month    : 'This Month',
    lastMonth: 'Last Month',
    year     : 'This Year',
    custom   : 'Custom'
};

function _updatePrintBtnText(period) {
    const el = document.getElementById('financePrintBtnText');
    if (el) el.textContent = (_periodLabels[period] || 'Selected') + ' Print Report';
}

function toggleFinanceDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('financeDropdownMenu');
    const icon = document.getElementById('financeDropdownIcon');
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
    icon.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
}

function closeFinanceDropdown() {
    const menu = document.getElementById('financeDropdownMenu');
    const icon = document.getElementById('financeDropdownIcon');
    if (menu) menu.style.display = 'none';
    if (icon) icon.className = 'fas fa-chevron-down';
}

// Close dropdown when clicking outside
document.addEventListener('click', () => closeFinanceDropdown());

function printFinanceReport() {
    if (typeof printCurrentPeriodReport === 'function') {
        printCurrentPeriodReport();
    } else {
        window.print();
    }
}

function applyCustomDate() {
    fromDate = document.getElementById('fromDate').value;
    toDate = document.getElementById('toDate').value;
    if (fromDate && toDate) {
        loadPeriodData();
    }
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────
// Show animated skeletons only in the summary + balance card areas while the
// dashboard API responds. The charts (graph/budget) stay visible — they don't
// change on period switch anyway.
function showCardsSkeleton() {
    const summaryEl = document.getElementById('summaryCards');
    const balanceEl = document.getElementById('balanceCards');
    const skeleton  = `<div class="skeleton-card"></div>`;
    if (summaryEl) summaryEl.innerHTML = skeleton.repeat(4);
    if (balanceEl) balanceEl.innerHTML = skeleton.repeat(5);
}

function showFullLoading() {
    document.getElementById('dashboardContent').style.opacity = '0.3';
    document.getElementById('dashboardLoading').style.display = 'flex';
}

function hideFullLoading() {
    document.getElementById('dashboardContent').style.opacity = '1';
    document.getElementById('dashboardLoading').style.display = 'none';
}

// Keep old names as aliases so any other code that calls them still works
function showLoading() { showFullLoading(); }
function hideLoading()  { hideFullLoading(); }

function showError(msg) {
    document.getElementById('errorMessage').textContent = msg || 'Failed to load financial data. Please try again.';
    document.getElementById('errorModal').classList.add('active');
    hideFullLoading();
}

// ── loadPeriodData: called on every period/date change ───────────────────────
// Only fetches /api/finance/dashboard. Graph + budget come from cache.
async function loadPeriodData() {
    showCardsSkeleton();   // instant feedback — no page-wide blur
    _lastLoadTime = Date.now();
    try {
        await loadDashboardData();
        // Re-render cached charts/budget so the page looks complete
        if (_graphDataCache) {
            renderBarChart(_graphDataCache.monthlyData);
            renderPieChart(_graphDataCache.categoryData);
            renderIncomeSourceChart(_graphDataCache.incomeSourceData);
            renderTrendChart(
                currentTrendDays === 7
                    ? (_graphDataCache.trend?.last7Days  || [])
                    : (_graphDataCache.trend?.last30Days || [])
            );
        }
        if (_budgetCache) {
            renderBudgetStatus(_budgetCache);
        }
    } catch (error) {
        console.error('Error loading period data:', error);
        showError('Failed to load financial data. Check your connection and try again.');
    }
}

// ── loadAllFinanceData: full load (first visit + auto-refresh) ───────────────
async function loadAllFinanceData() {
    showCardsSkeleton();
    _lastLoadTime = Date.now();
    try {
        // 1. Load primary dashboard data first (cards, balances, recent activity)
        await loadDashboardData();
        hideFullLoading();

        // 2. Load graphs and budgets asynchronously in background if not cached
        if (!_isCacheValid()) {
            Promise.allSettled([
                loadGraphData(),
                loadBudgetData()
            ]).catch(e => console.warn('Background finance data load error:', e));
        }
    } catch (error) {
        console.error('Error loading finance data:', error);
        showError('Failed to load financial data. Check your connection and try again.');
    } finally {
        hideFullLoading();
    }
}

// ==========================================================================
// 1. Dashboard Summary Cards
// ==========================================================================
async function loadDashboardData() {
    try {
        const params = new URLSearchParams();
        if (currentPeriod && currentPeriod !== 'custom') params.append('period', currentPeriod);
        if (currentPeriod === 'custom') {
            params.append('startDate', fromDate);
            params.append('endDate', toDate);
        }
        
        // Include selected month filter for due summary
        const monthSelect = document.getElementById('dueMonthSelect');
        const selectedMonth = monthSelect ? monthSelect.value : '';
        if (selectedMonth) params.append('month', selectedMonth);
        
        const response = await fetch(`/api/finance/dashboard?${params.toString()}`);
        const data = await response.json();
        
        if (!data.success) {
            showError('Failed to load dashboard data');
            return;
        }
        
        // Update summary cards
        renderSummaryCards(data);
        
        // Update balance cards
        renderBalanceCards(data.balances);
        
        // Update due summary — use the month-filtered data from the backend
        renderDueSummary(data.dueSummary);
        
        // Update recent expenses/income
        renderRecentActivity(data.recentExpenses, data.recentPayments);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        throw error;
    }
}

function renderSummaryCards(data) {
    const container = document.getElementById('summaryCards');
    
    // Determine dynamic prefix/labels based on currentPeriod
    let periodPrefix = 'Total';
    if (currentPeriod === 'today') periodPrefix = 'Today';
    else if (currentPeriod === 'week') periodPrefix = 'This Week';
    else if (currentPeriod === 'month') periodPrefix = 'This Month';
    else if (currentPeriod === 'lastMonth') periodPrefix = 'Last Month';
    else if (currentPeriod === 'year') periodPrefix = 'This Year';
    else if (currentPeriod === 'custom') periodPrefix = 'Period';

    const incomeVal = data.range && data.range.income !== undefined ? Number(data.range.income) : Number(data.totalCollection || 0);
    const expenseVal = data.range && data.range.expense !== undefined ? Number(data.range.expense) : Number(data.totalExpense || 0);
    const netVal = data.range && data.range.net !== undefined ? Number(data.range.net) : (incomeVal - expenseVal);

    const cards = [
        { label: `${periodPrefix} Income`, value: incomeVal, icon: 'fa-money-bill-wave', color: '#059669', prefix: '৳' },
        { label: `${periodPrefix} Expense`, value: expenseVal, icon: 'fa-shopping-cart', color: '#dc2626', prefix: '৳' },
        { label: `${periodPrefix} Profit / Loss`, value: netVal, icon: 'fa-chart-line', color: netVal >= 0 ? '#059669' : '#dc2626', prefix: '৳', isProfit: true },
        { label: `${periodPrefix} Available Balance`, value: netVal, icon: 'fa-wallet', color: '#6366f1', prefix: '৳' }
    ];
    
    container.innerHTML = cards.map((card) => {
        const val = card.value;
        const formatted = formatCurrency(val);
        const valClass = card.isProfit ? (val >= 0 ? 'positive' : 'negative') : '';
        return `
            <div class="finance-stat-card" style="border-left: 4px solid ${card.color};">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div class="stat-label">${card.label}</div>
                        <div class="stat-value ${valClass}">${formatted}</div>
                    </div>
                    <div class="stat-icon"><i class="fas ${card.icon}"></i></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderBalanceCards(balances) {
    if (!balances) return;
    const container = document.getElementById('balanceCards');
    
    const balanceItems = [
        { label: 'Cash in Hand', value: balances.cashInHand, cls: 'cash', icon: 'fa-money-bill-wave' },
        { label: 'Bank Balance', value: balances.bankBalance, cls: 'bank', icon: 'fa-university' },
        { label: 'bKash Balance', value: balances.bKashBalance, cls: 'bkash', icon: 'fa-mobile-alt' },
        { label: 'Nagad Balance', value: balances.nagadBalance, cls: 'nagad', icon: 'fa-mobile-alt' },
        { label: 'Total Available', value: balances.totalAvailableBalance, cls: 'total', icon: 'fa-wallet' }
    ];
    
    container.innerHTML = balanceItems.map(item => `
        <div class="balance-card ${item.cls}">
            <div class="bal-label"><i class="fas ${item.icon}"></i> ${item.label}</div>
            <div class="bal-value">${formatCurrency(item.value || 0)}</div>
        </div>
    `).join('');
}

// ==========================================================================
// 2. Due Collection Summary
// ==========================================================================
// Note: loadDueSummary() is kept for standalone use only.
// During normal page load, dueSummary data comes from /api/finance/dashboard
// to avoid an extra API call.
async function loadDueSummary() {
    try {
        const response = await fetch('/api/finance/due-summary');
        const data = await response.json();
        
        if (!data.success) return;
        
        renderDueSummary(data);
    } catch (error) {
        console.error('Error loading due summary:', error);
    }
}

// Load due summary filtered by selected month
async function loadDueSummaryByMonth(month) {
    try {
        // Show loading state
        const section = document.getElementById('dueSummarySection');
        if (section) section.innerHTML = '<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--primary);"></i></div>';

        const url = month
            ? `/api/finance/due-summary?month=${encodeURIComponent(month)}`
            : '/api/finance/due-summary';
        const response = await fetch(url);
        const data = await response.json();

        if (!data.success) return;

        renderDueSummary(data);
    } catch (error) {
        console.error('Error loading due summary by month:', error);
        const section = document.getElementById('dueSummarySection');
        if (section) section.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load due summary. Please try again.</p></div>';
    }
}

function renderDueSummary(due) {
    if (!due) return;
    
    const section = document.getElementById('dueSummarySection');
    
    // Stats grid
    let html = `
        <div class="due-summary-grid">
            <div class="due-stat" style="border-left:4px solid #dc2626;">
                <div class="due-label">Total Outstanding</div>
                <div class="due-value" style="color:#dc2626;">${formatCurrency(due.totalOutstandingFee || 0)}</div>
            </div>
            <div class="due-stat" style="border-left:4px solid #f59e0b;">
                <div class="due-label">Expected Collection (Today)</div>
                <div class="due-value" style="color:#f59e0b;">${formatCurrency(due.todayExpectedCollection || 0)}</div>
            </div>
            <div class="due-stat" style="border-left:4px solid #3b82f6;">
                <div class="due-label">Overdue Students</div>
                <div class="due-value" style="color:#3b82f6;">${due.overdueCount || 0}</div>
            </div>
            <div class="due-stat" style="border-left:4px solid #8b5cf6;">
                <div class="due-label">Students with Due</div>
                <div class="due-value" style="color:#8b5cf6;">${due.totalStudentsWithDue || 0}</div>
            </div>
        </div>
    `;
    
    // Top due students
    if (due.topDueStudents && due.topDueStudents.length > 0) {
        html += `
            <div style="margin-bottom:12px;">
                <div style="font-weight:700;font-size:0.85rem;margin-bottom:8px;color:var(--text-main);">Top Due Students</div>
                <div class="due-list">
                    ${due.topDueStudents.map(s => {
                        const unpaidLabels = (s.unpaidMonths && s.unpaidMonths.length > 0)
                            ? `<div style="font-size:0.7rem;color:#dc2626;margin-top:2px;">Due Months: ${s.unpaidMonths.map(m => m.month.slice(0,3)).join(', ')}</div>`
                            : '';
                        return `
                            <div class="due-item">
                                <div>
                                    <div class="due-name">${escapeHtml(s.name)}</div>
                                    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.studentId)} - ${escapeHtml(s.batch)}</div>
                                    ${unpaidLabels}
                                </div>
                                <div class="due-amount">${formatCurrency(s.due)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Batch-wise due
    if (due.batchWiseDue && due.batchWiseDue.length > 0) {
        html += `
            <div style="margin-bottom:8px;">
                <div style="font-weight:700;font-size:0.85rem;margin-bottom:8px;color:var(--text-main);">Batch-wise Due</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    ${due.batchWiseDue.map(b => `
                        <span style="background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:var(--radius-full);font-size:0.8rem;font-weight:600;">
                            ${escapeHtml(b.batch)}: ${formatCurrency(b.total || b.amount || 0)}${b.count ? ` (${b.count} students)` : ''}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    if (!due.topDueStudents || due.topDueStudents.length === 0) {
        html += `
            <div class="empty-state">
                <i class="fas fa-check-circle" style="color:#059669;"></i>
                <p>No outstanding dues! All students are up to date.</p>
            </div>
        `;
    }
    
    section.innerHTML = html;
}

// ==========================================================================
// 3. Charts (Bar, Pie, Line)
// ==========================================================================
async function loadGraphData() {
    try {
        const response = await fetch('/api/finance/graph-data');
        const data = await response.json();

        if (!data.success) return;

        // Store in module-level cache AND legacy window variable
        _graphDataCache    = data;
        _cacheTimestamp    = Date.now();
        window._lastGraphData = data;

        renderBarChart(data.monthlyData);
        renderPieChart(data.categoryData);
        renderIncomeSourceChart(data.incomeSourceData);
        renderTrendChart(data.trend?.last7Days || []);

    } catch (error) {
        console.error('Error loading graph data:', error);
    }
}

function renderBarChart(monthlyData) {
    if (!monthlyData || monthlyData.length === 0) {
        document.getElementById('incomeExpenseChart').style.display = 'none';
        document.getElementById('barChartEmpty').style.display = 'block';
        return;
    }
    
    document.getElementById('incomeExpenseChart').style.display = 'block';
    document.getElementById('barChartEmpty').style.display = 'none';
    
    const labels = monthlyData.map(m => m.month);
    const income = monthlyData.map(m => m.income || 0);
    const expense = monthlyData.map(m => m.expense || 0);
    
    const hasExpense = expense.some(e => e > 0);
    const hasIncome = income.some(i => i > 0);
    
    if (!hasIncome && !hasExpense) {
        document.getElementById('incomeExpenseChart').style.display = 'none';
        document.getElementById('barChartEmpty').style.display = 'block';
        return;
    }
    
    const ctx = document.getElementById('incomeExpenseChart').getContext('2d');
    
    if (barChart) barChart.destroy();
    
    barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: income,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: '#10b981',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Expense',
                    data: expense,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ৳' + parseFloat(context.raw).toLocaleString('en', { minimumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return '৳' + value.toLocaleString(); },
                        font: { size: 10 }
                    }
                },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function renderPieChart(categoryData) {
    if (!categoryData || categoryData.length === 0) {
        document.getElementById('categoryPieChart').style.display = 'none';
        document.getElementById('pieChartEmpty').style.display = 'block';
        return;
    }
    
    document.getElementById('categoryPieChart').style.display = 'block';
    document.getElementById('pieChartEmpty').style.display = 'none';
    
    const colors = [
        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
        '#6366f1', '#14b8a6', '#e11d48', '#84cc16', '#0ea5e9', '#a855f7'
    ];
    
    const labels = categoryData.map(c => c.category);
    const values = categoryData.map(c => c.total);
    
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    
    if (pieChart) pieChart.destroy();
    
    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return context.label + ': ৳' + parseFloat(context.raw).toLocaleString('en', { minimumFractionDigits: 2 }) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

function renderIncomeSourceChart(incomeSourceData) {
    if (!incomeSourceData || incomeSourceData.length === 0) {
        document.getElementById('incomeSourceChart').style.display = 'none';
        document.getElementById('incomeSourceEmpty').style.display = 'block';
        return;
    }
    
    document.getElementById('incomeSourceChart').style.display = 'block';
    document.getElementById('incomeSourceEmpty').style.display = 'none';
    
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1'];
    const labels = incomeSourceData.map(s => s.source);
    const values = incomeSourceData.map(s => s.total);
    
    const ctx = document.getElementById('incomeSourceChart').getContext('2d');
    
    if (incomeSourceChart) incomeSourceChart.destroy();
    
    incomeSourceChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return context.label + ': ৳' + parseFloat(context.raw).toLocaleString('en', { minimumFractionDigits: 2 }) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

function renderTrendChart(trendData) {
    if (!trendData || trendData.length === 0) {
        document.getElementById('trendChart').style.display = 'none';
        document.getElementById('trendChartEmpty').style.display = 'block';
        return;
    }
    
    document.getElementById('trendChart').style.display = 'block';
    document.getElementById('trendChartEmpty').style.display = 'none';
    
    const labels = trendData.map(d => d.label);
    const income = trendData.map(d => d.income || 0);
    const expense = trendData.map(d => d.expense || 0);
    
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (trendChart) trendChart.destroy();
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: income,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#10b981',
                    borderWidth: 2
                },
                {
                    label: 'Expense',
                    data: expense,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#ef4444',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ৳' + parseFloat(context.raw).toLocaleString('en', { minimumFractionDigits: 2 });
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return '৳' + value.toLocaleString(); },
                        font: { size: 10 }
                    }
                },
                x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
            }
        }
    });
}

function switchTrend(days) {
    currentTrendDays = days;
    document.querySelectorAll('.trend-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.trend-tab[data-days="${days}"]`).classList.add('active');
    // Only update trend chart, not reload all graph data
    if (window._lastGraphData) {
        const trendData = days === 7
            ? (window._lastGraphData.trend?.last7Days  || [])
            : (window._lastGraphData.trend?.last30Days || []);
        renderTrendChart(trendData);
    }
}

// ==========================================================================
// 4. Budget Status
// ==========================================================================
async function loadBudgetData() {
    try {
        // Single call to /api/budgets — returns full list with usage + alerts derived below
        const response = await fetch('/api/budgets');
        const data = await response.json();

        if (!data.success) return;

        // Store in module-level cache
        _budgetCache    = data;
        _cacheTimestamp = Date.now();   // graph + budget share the same timestamp

        renderBudgetStatus(data);

    } catch (error) {
        console.error('Error loading budget data:', error);
    }
}

function renderBudgetStatus(data) {
    const budgetSection = document.getElementById('budgetList');
    const budgetAlerts  = document.getElementById('budgetAlerts');
    const budgetEmpty   = document.getElementById('budgetEmpty');
    const monthLabel    = document.getElementById('budgetMonthLabel');
    
    const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    monthLabel.textContent = `- ${monthName}`;
    
    // Build alerts from the budget list (no separate summary call needed)
    budgetAlerts.innerHTML = '';
    if (data.budgets && data.budgets.length > 0) {
        data.budgets.forEach(b => {
            const pct = b.usedPercentage || 0;
            if (pct >= 100) {
                budgetAlerts.innerHTML += `<div class="budget-alert danger"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(b.category)} budget exceeded! (${pct.toFixed(0)}%)</div>`;
            } else if (pct >= 90) {
                budgetAlerts.innerHTML += `<div class="budget-alert warning"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(b.category)} budget nearly full (${pct.toFixed(0)}%)</div>`;
            } else if (pct >= 70) {
                budgetAlerts.innerHTML += `<div class="budget-alert info"><i class="fas fa-info-circle"></i> ${escapeHtml(b.category)} at ${pct.toFixed(0)}% usage</div>`;
            }
        });
    }
    
    if (!data.budgets || data.budgets.length === 0) {
        budgetSection.innerHTML = '';
        budgetEmpty.style.display = 'block';
        return;
    }
    
    budgetEmpty.style.display = 'none';
    
    budgetSection.innerHTML = data.budgets.map(b => {
        const pct       = Math.min(b.usedPercentage || 0, 100);
        const fillClass = b.alert === 'exceeded' ? 'exceeded' : b.alert === 'high' ? 'high' : b.alert === 'warning' ? 'warning' : 'normal';
        const alertColor = b.alert === 'exceeded' ? '#dc2626' : b.alert === 'high' ? '#f97316' : b.alert === 'warning' ? '#f59e0b' : '#10b981';
        
        return `
            <div class="budget-bar">
                <div class="budget-cat">${escapeHtml(b.category)}</div>
                <div class="budget-track">
                    <div class="budget-fill ${fillClass}" style="width:${pct}%"></div>
                </div>
                <div class="budget-info">
                    ${formatCurrency(b.currentExpense)} / ${formatCurrency(b.amount)}
                    <br><small style="color:${alertColor};">${(b.usedPercentage || 0).toFixed(1)}% used</small>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================================================
// 5. Recent Activity
// ==========================================================================
function renderRecentActivity(expenses, payments) {
    const expensesContainer = document.getElementById('recentExpenses');
    const incomeContainer = document.getElementById('recentIncome');
    
    // Recent expenses
    if (expenses && expenses.length > 0) {
        expensesContainer.innerHTML = expenses.slice(0, 5).map(e => `
            <div class="due-item">
                <div>
                    <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(e.category)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(e.expenseId)} - ${e.date}</div>
                </div>
                <div style="font-weight:700;color:#dc2626;font-size:0.85rem;">${formatCurrency(e.amount)}</div>
            </div>
        `).join('');
    } else {
        expensesContainer.innerHTML = `<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>No recent expenses.</p></div>`;
    }
    
    // Recent payments/income
    if (payments && payments.length > 0) {
        incomeContainer.innerHTML = payments.slice(0, 5).map(p => `
            <div class="due-item">
                <div>
                    <div style="font-weight:600;font-size:0.85rem;">${escapeHtml(p.studentName)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(p.receiptNo)} - ${p.date}</div>
                </div>
                <div style="font-weight:700;color:#059669;font-size:0.85rem;">${formatCurrency(p.amount)}</div>
            </div>
        `).join('');
    } else {
        incomeContainer.innerHTML = `<div class="empty-state"><i class="fas fa-money-bill-wave"></i><p>No recent income.</p></div>`;
    }
}

// ==========================================================================
// 6. Existing Functions (Print, Report, etc.)
// ==========================================================================

function formatCurrency(amount) {
    return '৳' + parseFloat(amount || 0).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Print Modal Functions
function openPrintModal() {
    document.getElementById('printModal').classList.add('active');
}

// ── Shared helper: get startD, endD, periodTitle from currentPeriod ───────────
function _getPeriodDates() {
    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];
    let startD = todayStr, endD = todayStr, periodTitle = 'Finance Report';

    if (currentPeriod === 'today') {
        startD = todayStr; endD = todayStr;
        periodTitle = `Today (${todayStr})`;
    } else if (currentPeriod === 'week') {
        const w = new Date(now); w.setDate(w.getDate() - 7);
        startD = w.toISOString().split('T')[0]; endD = todayStr;
        periodTitle = `This Week (${startD} to ${endD})`;
    } else if (currentPeriod === 'month') {
        startD = todayStr.slice(0, 8) + '01'; endD = todayStr;
        periodTitle = `This Month (${now.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
    } else if (currentPeriod === 'lastMonth') {
        const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const l = new Date(now.getFullYear(), now.getMonth(), 0);
        startD = f.toISOString().split('T')[0]; endD = l.toISOString().split('T')[0];
        periodTitle = `Last Month (${f.toLocaleString('default', { month: 'long', year: 'numeric' })})`;
    } else if (currentPeriod === 'year') {
        startD = now.getFullYear() + '-01-01'; endD = todayStr;
        periodTitle = `This Year (${now.getFullYear()})`;
    } else if (currentPeriod === 'custom') {
        startD = document.getElementById('fromDate').value || todayStr;
        endD   = document.getElementById('toDate').value   || todayStr;
        periodTitle = `Custom (${startD} to ${endD})`;
    }

    return { startD, endD, periodTitle };
}

// Smart Dynamic Print: Prints the report for the currently active period
async function printCurrentPeriodReport() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    const url = `/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`;
    fetchAndPrint(url, periodTitle);
    closePrintModal();
}

function printDailySummary() {
    const date = new Date().toISOString().split('T')[0];
    const url = `/api/finance/reports/daily-summary?date=${date}`;
    fetchAndPrint(url, 'Daily Summary');
    closePrintModal();
}

function printCollectionDetails() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    const url = `/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`;
    fetchAndPrint(url, `Income & Expense — ${periodTitle}`);
    closePrintModal();
}

function printExpenseDetails() {
    const date = new Date().toISOString().split('T')[0];
    const url = `/api/finance/reports/expense?startDate=${date}&endDate=${date}`;
    fetchAndPrint(url, 'Expense Details');
    closePrintModal();
}

function printDateRangeReport() {
    const today = new Date().toISOString().split('T')[0];
    const startDate = prompt('Enter Start Date (YYYY-MM-DD):', today.slice(0, 8) + '01');
    if (!startDate) return;
    const endDate = prompt('Enter End Date (YYYY-MM-DD):', today);
    if (!endDate) return;
    const url = `/api/finance/reports/date-range?startDate=${startDate}&endDate=${endDate}`;
    fetchAndPrint(url, 'Date Range Report');
    closePrintModal();
}

function printMonthlyReport() {
    const month = new Date().toLocaleString('default', { month: 'long' });
    const year = new Date().getFullYear();
    const url = `/api/finance/reports/monthly?month=${month}&year=${year}`;
    fetchAndPrint(url, 'Monthly Report');
    closePrintModal();
}

function printIncomeReport() {
    const today = new Date().toISOString().split('T')[0];
    const startDate = today.slice(0, 8) + '01';
    const url = `/api/finance/reports/income?startDate=${startDate}&endDate=${today}`;
    fetchAndPrint(url, 'Income Report');
    closePrintModal();
}

function printBudgetReport() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    const url = `/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`;
    fetchAndPrint(url, `Budget vs Actual — ${periodTitle}`);
    closePrintModal();
}

async function fetchAndPrint(url, reportType) {
    const printBtn = document.getElementById('financePrintBtn');
    const printBtnText = document.getElementById('financePrintBtnText');
    const originalText = printBtnText ? printBtnText.innerHTML : 'Print Report';
    
    if (printBtnText) {
        printBtnText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparing Print...`;
    }
    if (printBtn) printBtn.style.opacity = '0.75';

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            let instituteName = 'EduSmart Coaching Center';
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                const instituteResponse = await fetch('/api/institute/public', { signal: controller.signal });
                clearTimeout(timeoutId);
                const instituteResult = await instituteResponse.json();
                if (instituteResult.success && instituteResult.data && instituteResult.data.name) {
                    instituteName = instituteResult.data.name;
                }
            } catch (e) {
                // Ignore timeout, use default
            }
            
            openPrintWindow(data, reportType, instituteName);
        } else {
            alert('Could not fetch report data: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report. Please check your connection and try again.');
    } finally {
        if (printBtnText) printBtnText.innerHTML = originalText;
        if (printBtn) printBtn.style.opacity = '1';
    }
}

function openPrintWindow(data, reportType, instituteName) {
    const content = generateEnhancedPrintContent(data, reportType, instituteName);
    
    // Direct in-page print via hidden iframe (no new window/tab, 100% bypasses popup blocker)
    let printFrame = document.getElementById('financePrintFrame');
    if (printFrame) printFrame.remove();
    
    printFrame = document.createElement('iframe');
    printFrame.id = 'financePrintFrame';
    printFrame.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;z-index:-9999;';
    document.body.appendChild(printFrame);
    
    const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
    frameDoc.open();
    frameDoc.write(content);
    frameDoc.close();
    
    function triggerPrint() {
        setTimeout(() => {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                console.error('Finance print error:', e);
            }
        }, 250);
    }

    if (frameDoc.readyState === 'complete') {
        triggerPrint();
    } else {
        printFrame.onload = triggerPrint;
    }

    // Auto cleanup after printing or canceling
    if (printFrame.contentWindow) {
        printFrame.contentWindow.addEventListener('afterprint', () => {
            printFrame.remove();
        });
    }
}

function _getPrintMethodBadge(method) {
    const m = (method || 'Cash').toString().toLowerCase();
    let cls = 'method-other';
    if (m.includes('cash')) cls = 'method-cash';
    else if (m.includes('bkash')) cls = 'method-bkash';
    else if (m.includes('nagad')) cls = 'method-nagad';
    else if (m.includes('bank') || m.includes('cheque') || m.includes('transfer')) cls = 'method-bank';
    return `<span class="method-pill ${cls}">${escapeHtml(method || 'Cash')}</span>`;
}

function generateEnhancedPrintContent(data, reportType, instituteName) {
    const date = new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = new Date().toLocaleTimeString('en-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    // Executive summary calculations
    const totalCollection = Number(data.totalCollection || data.totalIncome || data.total || 0);
    const totalExpense = Number(data.totalExpense || 0);
    const net = Number(data.net !== undefined ? data.net : (totalCollection - totalExpense));
    const netType = net >= 0 ? 'Profit' : 'Loss';
    
    const payments = data.payments || [];
    const expenses = data.expenses || [];
    const budgets = data.budgets || [];
    const hasPayments = payments.length > 0;
    const hasExpenses = expenses.length > 0;
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(reportType)} - ${escapeHtml(instituteName)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --indigo: #4f46e5;
            --indigo-dark: #3730a3;
            --indigo-light: #eef2ff;
            --purple: #7c3aed;
            --purple-light: #f5f3ff;
            --text-main: #0f172a;
            --text-body: #1e293b;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --row-alt: #f8fafc;
            --green-bg: #ecfdf5; --green-text: #059669; --green-border: #a7f3d0;
            --blue-bg: #eff6ff;  --blue-text: #2563eb;  --blue-border: #bfdbfe;
            --amber-bg: #fffbeb; --amber-text: #b45309; --amber-border: #fde68a;
            --red-bg: #fef2f2;   --red-text: #dc2626;   --red-border: #fecaca;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page {
            size: A4 portrait;
            margin: 12mm 15mm;
        }

        body {
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 8.5pt;
            color: var(--text-body);
            background: #fff;
            line-height: 1.4;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* ── UCC Style Header ── */
        .ds-header {
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4f46e5 100%);
            color: #fff;
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 14px;
        }
        .ds-header-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
        }
        .ds-header h1 {
            font-size: 16pt;
            font-weight: 900;
            letter-spacing: 0.3px;
            color: #fff;
            line-height: 1.2;
            margin-bottom: 3px;
        }
        .ds-sub {
            font-size: 8pt;
            color: rgba(255, 255, 255, 0.85);
            margin-bottom: 4px;
        }
        .ds-generated {
            font-size: 7.5pt;
            color: rgba(255, 255, 255, 0.75);
        }
        .ds-generated b { color: #fff; }
        .ds-header-right {
            text-align: right;
            flex-shrink: 0;
        }
        .ds-report-label {
            font-size: 7pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: rgba(255, 255, 255, 0.75);
            margin-bottom: 4px;
        }
        .ds-batch-tag {
            background: rgba(255, 255, 255, 0.18);
            border: 1px solid rgba(255, 255, 255, 0.35);
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 9.5pt;
            font-weight: 800;
            display: inline-block;
            color: #fff;
        }
        .ds-header-line {
            height: 3px;
            background: linear-gradient(90deg, #f59e0b, rgba(255, 255, 255, 0.6), #f59e0b);
            border-radius: 2px;
            margin-top: 10px;
        }

        /* ── UCC Style KPI Summary Strip ── */
        .ds-summary-strip {
            margin: 12px 0 18px;
            padding: 12px 14px;
            background: linear-gradient(135deg, var(--indigo-light) 0%, var(--purple-light) 100%);
            border: 1px solid #c7d2fe;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .ds-strip-box {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 10px;
            background: #fff;
            border: 1px solid #e0e7ff;
            border-radius: 8px;
            padding: 9px 12px;
            box-shadow: 0 1px 4px rgba(79, 70, 229, 0.05);
        }
        .ds-strip-icon {
            flex: 0 0 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
        }
        .ds-strip-box.income .ds-strip-icon { background: var(--green-bg); color: var(--green-text); }
        .ds-strip-box.expense .ds-strip-icon { background: var(--red-bg); color: var(--red-text); }
        .ds-strip-box.net.profit .ds-strip-icon { background: linear-gradient(135deg, #059669, #10b981); color: #fff; }
        .ds-strip-box.net.loss .ds-strip-icon { background: linear-gradient(135deg, #dc2626, #ef4444); color: #fff; }

        .ds-strip-body { min-width: 0; }
        .ds-strip-label {
            font-size: 6.5pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-muted);
        }
        .ds-strip-value {
            font-size: 11.5pt;
            font-weight: 900;
            color: var(--text-main);
            font-family: 'Inter', sans-serif;
            line-height: 1.25;
            margin: 1px 0;
        }
        .ds-strip-sub {
            font-size: 6.5pt;
            color: var(--text-muted);
            font-weight: 600;
        }

        .ds-strip-box.net.profit {
            background: linear-gradient(135deg, #065f46, #047857);
            border-color: #059669;
        }
        .ds-strip-box.net.profit .ds-strip-label { color: rgba(255, 255, 255, 0.8); }
        .ds-strip-box.net.profit .ds-strip-value { color: #fff; }
        .ds-strip-box.net.profit .ds-strip-sub { color: rgba(255, 255, 255, 0.75); }

        .ds-strip-box.net.loss {
            background: linear-gradient(135deg, #991b1b, #b91c1c);
            border-color: #dc2626;
        }
        .ds-strip-box.net.loss .ds-strip-label { color: rgba(255, 255, 255, 0.8); }
        .ds-strip-box.net.loss .ds-strip-value { color: #fff; }
        .ds-strip-box.net.loss .ds-strip-sub { color: rgba(255, 255, 255, 0.75); }

        /* ── Section Title ── */
        .ds-section {
            margin-top: 16px;
            margin-bottom: 6px;
        }
        .ds-section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 5px;
            margin-bottom: 8px;
            border-bottom: 1.5px solid var(--border);
        }
        .ds-section-title h2 {
            margin: 0;
            font-size: 10pt;
            font-weight: 800;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 7px;
        }
        .ds-section-title h2 i {
            color: var(--indigo);
            font-size: 9pt;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--indigo-light);
            border-radius: 5px;
        }
        .ds-subtitle {
            font-size: 7.5pt;
            color: var(--text-muted);
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        /* ── Full Width UCC Clean Tables ── */
        .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin-bottom: 16px;
            table-layout: fixed;
        }
        .report-table th {
            background: var(--indigo);
            color: #fff;
            padding: 5px 6px;
            text-align: left;
            font-size: 6.8pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border: 1px solid var(--indigo-dark);
            white-space: nowrap;
            overflow: hidden;
        }
        .report-table th.num, .report-table td.num {
            text-align: right;
        }
        .report-table td {
            padding: 4px 6px;
            border-bottom: 1px solid #eef0f4;
            border-left: 1px solid #f1f5f9;
            border-right: 1px solid #f1f5f9;
            vertical-align: middle;
            line-height: 1.35;
            overflow: hidden;
            word-wrap: break-word;
        }
        .report-table tbody tr:nth-child(even) td {
            background: var(--row-alt);
        }

        /* Monospace ID/Receipt with word-wrap so it never bleeds into date */
        .code-cell {
            color: var(--indigo);
            font-weight: 700;
            font-family: 'Consolas', 'JetBrains Mono', 'Courier New', monospace;
            font-size: 7pt;
            letter-spacing: -0.01em;
            word-break: break-all;
            overflow-wrap: anywhere;
            line-height: 1.25;
            display: block;
        }
        .date-cell {
            white-space: nowrap;
            font-size: 7.5pt;
            color: #334155;
            font-weight: 500;
        }
        .amount-cell {
            font-weight: 700;
            font-family: 'Consolas', 'Courier New', monospace;
            text-align: right;
            white-space: nowrap;
            color: #0f172a;
        }

        /* Total Row */
        .total-row td {
            background: var(--indigo-light) !important;
            color: var(--indigo-dark) !important;
            font-weight: 800;
            border-top: 1.5px solid var(--indigo) !important;
            border-bottom: 1.5px solid var(--indigo) !important;
            font-size: 8pt;
        }
        .total-row-expense td {
            background: #fef2f2 !important;
            color: #991b1b !important;
            font-weight: 800;
            border-top: 1.5px solid #dc2626 !important;
            border-bottom: 1.5px solid #dc2626 !important;
            font-size: 8pt;
        }

        /* Method Pills */
        .method-pill {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 99px;
            font-size: 6.8pt;
            font-weight: 700;
            white-space: nowrap;
        }
        .method-cash  { background: var(--green-bg); color: var(--green-text); border: 1px solid var(--green-border); }
        .method-bkash { background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; }
        .method-nagad { background: var(--amber-bg); color: var(--amber-text); border: 1px solid var(--amber-border); }
        .method-bank  { background: var(--blue-bg); color: var(--blue-text); border: 1px solid var(--blue-border); }
        .method-other { background: #f1f5f9; color: #475569; border: 1px solid var(--border); }

        .no-data {
            text-align: center;
            padding: 16px;
            color: var(--text-muted);
            font-style: italic;
            border: 1px dashed var(--border);
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 8pt;
        }

        /* ── UCC Style Signatures ── */
        .ds-signatures {
            display: flex;
            justify-content: space-between;
            margin: 28px 0 10px;
            gap: 20px;
        }
        .ds-sig {
            flex: 1;
            text-align: center;
        }
        .ds-sig-line {
            border-top: 1.5px solid #374151;
            padding-top: 4px;
            margin-bottom: 3px;
        }
        .ds-sig-role {
            font-size: 8.5pt;
            font-weight: 800;
            color: #1e293b;
        }
        .ds-sig-sub {
            font-size: 7pt;
            color: var(--text-muted);
        }

        /* ── Footer ── */
        .ds-final-note {
            text-align: center;
            padding-top: 10px;
            margin-top: 10px;
            border-top: 1px solid var(--border);
            font-size: 7pt;
            color: var(--text-muted);
        }
        .ds-final-note b { color: var(--indigo); font-weight: 700; }

        /* ── Print Optimizations ── */
        @media print {
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            .ds-signatures { page-break-inside: avoid; }
            .ds-summary-strip { page-break-inside: avoid; }
            .ds-section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <!-- 1. Header -->
    <div class="ds-header">
        <div class="ds-header-main">
            <div>
                <h1>${escapeHtml(instituteName)}</h1>
                <div class="ds-sub">Financial Management &amp; Accounts Statement</div>
                <div class="ds-generated"><b>Generated on:</b> ${date} at ${time}</div>
            </div>
            <div class="ds-header-right">
                <div class="ds-report-label">Report Period / Scope</div>
                <div class="ds-batch-tag">${escapeHtml(reportType)}</div>
            </div>
        </div>
        <div class="ds-header-line"></div>
    </div>

    <!-- 2. KPI Summary Strip -->
    <div class="ds-summary-strip">
        <div class="ds-strip-box income">
            <div class="ds-strip-icon"><i class="fas fa-arrow-down"></i></div>
            <div class="ds-strip-body">
                <div class="ds-strip-label">Total Income / Collection</div>
                <div class="ds-strip-value">${formatCurrency(totalCollection)}</div>
                <div class="ds-strip-sub">${payments.length} Transactions</div>
            </div>
        </div>
        <div class="ds-strip-box expense">
            <div class="ds-strip-icon"><i class="fas fa-arrow-up"></i></div>
            <div class="ds-strip-body">
                <div class="ds-strip-label">Total Expenses</div>
                <div class="ds-strip-value">${formatCurrency(totalExpense)}</div>
                <div class="ds-strip-sub">${expenses.length} Expense Records</div>
            </div>
        </div>
        <div class="ds-strip-box net ${net >= 0 ? 'profit' : 'loss'}">
            <div class="ds-strip-icon"><i class="fas ${net >= 0 ? 'fa-chart-line' : 'fa-chart-pie'}"></i></div>
            <div class="ds-strip-body">
                <div class="ds-strip-label">Net ${netType}</div>
                <div class="ds-strip-value">${formatCurrency(Math.abs(net))}</div>
                <div class="ds-strip-sub">${net >= 0 ? 'Surplus Balance' : 'Deficit Amount'}</div>
            </div>
        </div>
    </div>`;

    // 3. Income / Payment Details Table (Stacked, Full Width)
    if (hasPayments) {
        const totalPayAmt = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        html += `
        <div class="ds-section">
            <div class="ds-section-title">
                <h2><i class="fas fa-receipt"></i> Income &amp; Collection Details</h2>
                <span class="ds-subtitle"><i class="fas fa-list-check"></i> ${payments.length} Total Records</span>
            </div>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width:4%;text-align:center;">SL</th>
                        <th style="width:20%;">Receipt No</th>
                        <th style="width:11%;">Date</th>
                        <th style="width:25%;">Payer / Description</th>
                        <th style="width:14%;">Month / Year</th>
                        <th style="width:12%;">Method</th>
                        <th class="num" style="width:14%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${payments.map((p, idx) => {
                        const receiptNo = p.receiptNo || p.receipt_no || '-';
                        const pDate = p.date ? p.date.split('T')[0] : '-';
                        const studentName = p.source === 'Books'
                            ? `Book Sale${p.studentName ? ' · ' + p.studentName : ''}`
                            : p.studentName || p.student_name || '-';
                        const monthStr = [p.month, p.year].filter(Boolean).join(' ') || '-';
                        const method = p.paymentMethod || p.payment_method || 'Cash';
                        const amount = Number(p.amount || 0);
                        return `
                        <tr>
                            <td style="text-align:center;color:var(--text-muted);font-weight:600;">${idx + 1}</td>
                            <td class="code-cell">${escapeHtml(receiptNo)}</td>
                            <td class="date-cell">${escapeHtml(pDate)}</td>
                            <td style="font-weight:600;">${escapeHtml(studentName)}</td>
                            <td>${escapeHtml(monthStr)}</td>
                            <td>${_getPrintMethodBadge(method)}</td>
                            <td class="amount-cell">${formatCurrency(amount)}</td>
                        </tr>`;
                    }).join('')}
                    <tr class="total-row">
                        <td colspan="4"><strong>TOTAL INCOME (${payments.length} Transactions)</strong></td>
                        <td colspan="2" style="text-align:right;">Total:</td>
                        <td class="amount-cell">${formatCurrency(totalPayAmt)}</td>
                    </tr>
                </tbody>
            </table>
        </div>`;
    } else {
        html += `
        <div class="ds-section">
            <div class="ds-section-title">
                <h2><i class="fas fa-receipt"></i> Income &amp; Collection Details</h2>
            </div>
            <div class="no-data">No income records found for this period.</div>
        </div>`;
    }

    // 4. Expense Details Table (Stacked, Full Width)
    if (hasExpenses) {
        const totalExpAmt = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        html += `
        <div class="ds-section">
            <div class="ds-section-title">
                <h2><i class="fas fa-shopping-cart"></i> Expense Details</h2>
                <span class="ds-subtitle"><i class="fas fa-list-check"></i> ${expenses.length} Total Records</span>
            </div>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width:4%;text-align:center;">SL</th>
                        <th style="width:20%;">Expense ID</th>
                        <th style="width:11%;">Date</th>
                        <th style="width:20%;">Category</th>
                        <th style="width:19%;">Vendor / Description</th>
                        <th style="width:12%;">Method</th>
                        <th class="num" style="width:14%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map((e, idx) => {
                        const expId = e.expenseId || e.expense_id || '-';
                        const eDate = e.date ? e.date.split('T')[0] : '-';
                        const category = e.category || '-';
                        const vendorDesc = e.vendor || e.description || '-';
                        const method = e.paymentMethod || e.payment_method || 'Cash';
                        const amount = Number(e.amount || 0);
                        return `
                        <tr>
                            <td style="text-align:center;color:var(--text-muted);font-weight:600;">${idx + 1}</td>
                            <td class="code-cell">${escapeHtml(expId)}</td>
                            <td class="date-cell">${escapeHtml(eDate)}</td>
                            <td style="font-weight:600;">${escapeHtml(category)}</td>
                            <td>${escapeHtml(vendorDesc)}</td>
                            <td>${_getPrintMethodBadge(method)}</td>
                            <td class="amount-cell">${formatCurrency(amount)}</td>
                        </tr>`;
                    }).join('')}
                    <tr class="total-row-expense">
                        <td colspan="4"><strong>TOTAL EXPENSES (${expenses.length} Entries)</strong></td>
                        <td colspan="2" style="text-align:right;">Total:</td>
                        <td class="amount-cell">${formatCurrency(totalExpAmt)}</td>
                    </tr>
                </tbody>
            </table>
        </div>`;
    } else {
        html += `
        <div class="ds-section">
            <div class="ds-section-title">
                <h2><i class="fas fa-shopping-cart"></i> Expense Details</h2>
            </div>
            <div class="no-data">No expense records found for this period.</div>
        </div>`;
    }

    // 5. Budget vs Actual Table (if available)
    if (budgets.length > 0) {
        html += `
        <div class="ds-section">
            <div class="ds-section-title">
                <h2><i class="fas fa-tasks"></i> Budget vs Actual Analysis</h2>
            </div>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width:28%;">Category</th>
                        <th class="num" style="width:18%;">Allocated Budget</th>
                        <th class="num" style="width:18%;">Actual Expense</th>
                        <th class="num" style="width:18%;">Remaining Balance</th>
                        <th style="width:18%;text-align:center;">Utilization %</th>
                    </tr>
                </thead>
                <tbody>
                    ${budgets.map(b => {
                        const usedPct = Number(b.usedPercentage || 0);
                        let badgeColor = '#059669';
                        if (usedPct > 100) badgeColor = '#dc2626';
                        else if (usedPct > 80) badgeColor = '#d97706';
                        return `
                        <tr>
                            <td style="font-weight:600;">${escapeHtml(b.category)}</td>
                            <td class="amount-cell">${formatCurrency(b.amount)}</td>
                            <td class="amount-cell">${formatCurrency(b.currentExpense || 0)}</td>
                            <td class="amount-cell">${formatCurrency(b.remaining || 0)}</td>
                            <td style="text-align:center;font-weight:700;color:${badgeColor};">${usedPct.toFixed(1)}%</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    // 6. UCC Style Signatures
    html += `
    <div class="ds-signatures">
        <div class="ds-sig">
            <div class="ds-sig-line"></div>
            <div class="ds-sig-role">Prepared By</div>
            <div class="ds-sig-sub">Accounts Officer / Operator</div>
        </div>
        <div class="ds-sig">
            <div class="ds-sig-line"></div>
            <div class="ds-sig-role">Verified By</div>
            <div class="ds-sig-sub">Accountant / Finance Manager</div>
        </div>
        <div class="ds-sig">
            <div class="ds-sig-line"></div>
            <div class="ds-sig-role">Approved By</div>
            <div class="ds-sig-sub">Director / Principal</div>
        </div>
    </div>

    <!-- 7. Footer -->
    <div class="ds-final-note">
        <b>${escapeHtml(instituteName)}</b> &bull; Financial Statement &bull; Generated from EduSmart Finance System on ${date} at ${time}
    </div>
</body>
</html>`;

    return html;
}

// Export functions
function exportDailySummaryPDF() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    const url = `/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`;
    fetchAndExportPDF(url, `Finance-Report-${periodTitle.replace(/\s+/g, '-')}`);
    closePrintModal();
}

function exportMonthlyReportPDF() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    const url = `/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`;
    fetchAndExportPDF(url, `Finance-Report-${periodTitle.replace(/\s+/g, '-')}`);
    closePrintModal();
}

async function fetchAndExportPDF(url, filename) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
            let instituteName = 'EduSmart Coaching Center';
            try {
                const instRes = await fetch('/api/institute/public');
                const instData = await instRes.json();
                if (instData.success && instData.data.name) instituteName = instData.data.name;
            } catch(e) {}
            const content = generateEnhancedPrintContent(data, filename.replace(/-/g, ' '), instituteName);
            const blob = new Blob([content], { type: 'text/html' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename + '.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting report. Please try again.');
    }
}

function exportDailySummaryExcel() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    fetch(`/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) exportToCSV(data, `Finance-Report-${periodTitle.replace(/\s+/g, '-')}`);
        })
        .catch(err => alert('Export failed: ' + err.message));
    closePrintModal();
}

function exportMonthlyReportExcel() {
    const { startD, endD, periodTitle } = _getPeriodDates();
    fetch(`/api/finance/reports/date-range?startDate=${startD}&endDate=${endD}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) exportToCSV(data, `Finance-Report-${periodTitle.replace(/\s+/g, '-')}`);
        })
        .catch(err => alert('Export failed: ' + err.message));
    closePrintModal();
}

function exportToCSV(data, filename) {
    let csv = 'Type,Description,Amount,Date\n';
    
    if (data.payments) {
        data.payments.forEach(p => {
            csv += `Income,${p.studentName || 'Payment'} - ${p.receiptNo || ''},${p.amount},${p.date}\n`;
        });
    }
    
    if (data.expenses) {
        data.expenses.forEach(e => {
            csv += `Expense,${e.category} - ${e.description || ''},${e.amount},${e.date}\n`;
        });
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}
