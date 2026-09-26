const app = require('./app');
const supabase = require('./config/supabase');

const PORT = process.env.PORT || 5002;

// Check Supabase connection
const checkSupabase = async () => {
    try {
        const { count, error } = await supabase.from('students').select('*', { count: 'exact', head: true });
        if (error) throw error;
        console.log(`✅ Connected to Supabase PostgreSQL successfully!`);
        console.log(`📊 Active Students in Supabase: ${count}`);
        return true;
    } catch (error) {
        console.error('❌ Supabase connection error:', error.message);
        return false;
    }
};

// Start server
const server = app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    await checkSupabase();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
});
