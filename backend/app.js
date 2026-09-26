const path = require('path');
try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
    // serverless edge environment
}
const express = require('express');
const cors = require('cors');
const supabase = require('./config/supabase');

// Import routes
const studentRoutes = require('./routes/students');
const paymentRoutes = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const batchRoutes = require('./routes/batches');
const examRoutes = require('./routes/exams');
const resultRoutes = require('./routes/results');
const landingSettingsRoutes = require('./routes/landingSettings');
const studentPortalRoutes = require('./routes/studentPortal');
const appSettingsRoutes = require('./routes/appSettings');
const expenseRoutes = require('./routes/expenses');
const financeRoutes = require('./routes/finance');
const noticeRoutes = require('./routes/notices');
const instituteRoutes = require('./routes/institute');
const budgetRoutes = require('./routes/budgets');
const auditLogRoutes = require('./routes/auditLogs');
const payrollRoutes = require('./routes/payroll');
const recurringExpenseRoutes = require('./routes/recurringExpenses');
const incomeRoutes = require('./routes/incomes');
const uccRoutes = require('./routes/ucc');
const bookRoutes = require('./routes/books');
const bookSaleRoutes = require('./routes/bookSales');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security Headers (relaxed for static assets and CDN)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

// Middleware - Allow all origins
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Cloudflare serves static assets through its Assets binding. Express static is
// only enabled for local Node.js development because Workers have no filesystem.
if (process.env.NODE_ENV !== 'production') {
  try {
    app.use(express.static(path.join(__dirname, '../frontend')));
  } catch (e) {
    // Static files are optional during local API-only development.
  }
}

// API Routes
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/landing-settings', landingSettingsRoutes);
app.use('/api/student-portal', studentPortalRoutes);
app.use('/api/settings', appSettingsRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/institute', instituteRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/recurring-expenses', recurringExpenseRoutes);
app.use('/api/incomes', incomeRoutes);
app.use('/api/ucc', uccRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/book-sales', bookSaleRoutes);

// Health check route
app.get('/api/health', async (req, res) => {
    try {
        const { count, error } = await supabase.from('students').select('*', { count: 'exact', head: true });
        res.json({
            status: 'OK',
            database: 'Supabase PostgreSQL',
            studentsCount: count || 0,
            connected: !error,
            message: 'SMS Backend is running smoothly on Cloudflare Workers & Supabase'
        });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', message: err.message });
    }
});

// Serve frontend index in local dev
app.get('/', (req, res, next) => {
    try {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    } catch (e) {
        next();
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack || err);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: 'API Route not found' });
});

module.exports = app;
