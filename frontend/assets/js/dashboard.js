// assets/js/dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    
// ============================================
// 1. API CONFIGURATION
// ============================================
const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
    ? 'http://localhost:5002/api' 
    : '/api';

let dashboardData = {
    stats: {},
    monthlyCollection: { labels: [], data: [] },
    batchWise: { labels: [], data: [] },
    recentPayments: [],
    latestAdmissions: [],
    dueStudents: [],
    notices: [
        'Monthly Exam - 25 July',
        'Admission Open for New Batch',
        'New Batch Starts Next Week',
        'Holiday on Friday'
    ]
};

// ============================================
// 2. LOAD ALL DATA IN PARALLEL (FAST!)
// ============================================
async function loadDashboardData() {
    try {
        // Render each section as its own request finishes instead of making
        // the whole dashboard wait for the slowest endpoint.
        const requests = [
            fetch(`${API_BASE_URL}/dashboard/stats`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.stats = value; loadStats(); }),
            fetch(`${API_BASE_URL}/dashboard/recent-payments`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.recentPayments = value; loadRecentPayments(); }),
            fetch(`${API_BASE_URL}/dashboard/recent-admissions`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.latestAdmissions = value; loadLatestAdmissions(); }),
            fetch(`${API_BASE_URL}/dashboard/due-students`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.dueStudents = value; loadDueStudents(); }),
            fetch(`${API_BASE_URL}/dashboard/monthly-collection`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.monthlyCollection = value; loadCharts(); }),
            fetch(`${API_BASE_URL}/dashboard/batch-wise`).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(value => { dashboardData.batchWise = value; loadCharts(); })
        ];
        const results = await Promise.allSettled(requests);
        results.forEach((result, index) => {
            if (result.status === 'rejected') console.error(`Dashboard section ${index + 1} failed:`, result.reason);
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ============================================
// 3. LOAD STAT CARDS
// ============================================
function loadStats() {
    const s = dashboardData.stats;
    if (s.totalStudents !== undefined) {
        document.getElementById('totalStudents').innerText = s.totalStudents.toLocaleString();
        document.getElementById('newStudents').innerText = s.newAdmissions || 0;
        document.getElementById('todayCollection').innerText = '৳' + (s.todayCollection || 0).toLocaleString();
        document.getElementById('todayPayments').innerText = s.todayPaymentsCount || 0;
        document.getElementById('monthlyIncome').innerText = '৳' + (s.monthlyIncome || 0).toLocaleString();
        document.getElementById('currentMonth').innerText = s.currentMonth || 'N/A';
        document.getElementById('dueStudents').innerText = s.dueStudentsCount || 0;
    }
}

    // ============================================
    // 4. LOAD TABLES
    // ============================================
    function loadRecentPayments() {
        const tbody = document.getElementById('recentPaymentsBody');
        if (!dashboardData.recentPayments || dashboardData.recentPayments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">No recent payments</td></tr>';
            return;
        }
        tbody.innerHTML = dashboardData.recentPayments.map(p => `
            <tr>
                <td><a href="student-profile.html?id=${p.id}" class="student-link">${p.id}</a></td>
                <td>${p.name}</td>
                <td>${p.batch}</td>
                <td>${p.month}</td>
                <td>৳${p.amount}</td>
                <td><span class="status-badge status-${(p.status||'').toLowerCase()}">${p.status}</span></td>
                <td><a href="student-profile.html?id=${p.id}" class="btn-view-sm"><i class="fas fa-eye"></i> View</a></td>
            </tr>
        `).join('');
    }

    function loadLatestAdmissions() {
        const tbody = document.getElementById('latestAdmissionsBody');
        if (!dashboardData.latestAdmissions || dashboardData.latestAdmissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No recent admissions</td></tr>';
            return;
        }
        tbody.innerHTML = dashboardData.latestAdmissions.map(a => `
            <tr>
                <td><a href="student-profile.html?id=${a.id}" class="student-link">${a.id}</a></td>
                <td>${a.name}</td>
                <td>${a.batch}</td>
                <td>${a.date}</td>
                <td><a href="student-profile.html?id=${a.id}" class="btn-view-sm"><i class="fas fa-user"></i> Profile</a></td>
            </tr>
        `).join('');
    }

    function loadDueStudents() {
        const tbody = document.getElementById('dueStudentsBody');
        if (!dashboardData.dueStudents || dashboardData.dueStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No due students</td></tr>';
            return;
        }
        tbody.innerHTML = dashboardData.dueStudents.map(d => `
            <tr>
                <td><a href="student-profile.html?id=${d.id}" class="student-link">${d.id}</a></td>
                <td>${d.name}</td>
                <td><span class="status-badge status-due">${d.due}</span></td>
                <td><a href="student-profile.html?id=${d.id}" class="btn-view-sm"><i class="fas fa-user"></i> Profile</a></td>
            </tr>
        `).join('');
    }

    function loadNotices() {
        const ul = document.getElementById('noticeList');
        ul.innerHTML = dashboardData.notices.map(n => `<li><i class="fas fa-bell"></i> ${n}</li>`).join('');
    }

    // ============================================
    // 5. CHARTS (Chart.js)
    // ============================================
    function loadCharts() {
        // Monthly Collection Line Chart
        const monthlyCtx = document.getElementById('monthlyChart');
        if (monthlyCtx && dashboardData.monthlyCollection.labels.length) {
        const existingMonthlyChart = Chart.getChart(monthlyCtx);
        if (existingMonthlyChart) existingMonthlyChart.destroy();
        new Chart(monthlyCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: dashboardData.monthlyCollection.labels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
                datasets: [{
                    label: 'Collection (৳)',
                    data: dashboardData.monthlyCollection.data || [],
                    borderColor: '#4e73df',
                    backgroundColor: 'rgba(78, 115, 223, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#4e73df',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => '৳' + v/1000 + 'k' } }
                }
            }
        });

        }

        // Batch Wise Doughnut Chart
        const batchCtx = document.getElementById('batchChart');
        if (!batchCtx || !dashboardData.batchWise.labels.length) return;
        const existingBatchChart = Chart.getChart(batchCtx);
        if (existingBatchChart) existingBatchChart.destroy();
        new Chart(batchCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: dashboardData.batchWise.labels || [],
                datasets: [{
                    data: dashboardData.batchWise.data || [],
                    backgroundColor: ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } }
                }
            }
        });
    }

    // ============================================
    // 6. SIDEBAR TOGGLE
    // ============================================
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }

// ============================================
// 7. INITIALIZE
// ============================================
loadNotices();
loadDashboardData();
});
