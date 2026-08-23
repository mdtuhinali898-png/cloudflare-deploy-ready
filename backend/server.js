const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

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

const app = express();

// Middleware - Allow all origins for development
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

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

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'SMS Backend is running' });
});

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sms-database';

// Connect to MongoDB with proper options
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            connectTimeoutMS: 30000,
            socketTimeoutMS: 30000
        });
        console.log('✅ Connected to MongoDB successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️  Server is running but without database connection.');
        console.log('   For local MongoDB: Start MongoDB service');
        console.log('   For MongoDB Atlas: Add your IP to the whitelist');
        console.log('   Connection string being used:', MONGODB_URI);
        return false;
    }
};

// Start the server first, then attempt MongoDB connection
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    
    // Try connecting to MongoDB (non-blocking)
    connectDB();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await mongoose.connection.close();
    console.log('📦 MongoDB connection closed');
    process.exit(0);
});
