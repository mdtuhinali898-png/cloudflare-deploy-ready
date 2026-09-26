const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatAuditLog(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        user: row.user,
        action: row.action,
        module: row.module,
        recordId: row.record_id,
        oldValue: row.old_value,
        newValue: row.new_value,
        description: row.description,
        ip: row.ip,
        createdAt: row.created_at
    };
}

// @route   GET /api/audit-logs
// @desc    Get audit logs with pagination and filters
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { module, action, user, startDate, endDate, page = 1, limit = 50 } = req.query;
        const limitVal = parseInt(limit) || 50;
        const pageVal = parseInt(page) || 1;
        const offset = (pageVal - 1) * limitVal;

        let query = supabase.from('audit_logs').select('*', { count: 'exact' });

        if (module) query = query.eq('module', module);
        if (action) query = query.eq('action', action);
        if (user) query = query.ilike('user', `%${user}%`);
        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate + 'T23:59:59.999Z');

        query = query.order('created_at', { ascending: false }).range(offset, offset + limitVal - 1);

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count || 0;
        res.json({
            success: true,
            logs: (data || []).map(formatAuditLog),
            total,
            page: pageVal,
            totalPages: Math.ceil(total / limitVal)
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ success: false, message: 'Error fetching audit logs', error: error.message });
    }
});

// @route   POST /api/audit-logs
// @desc    Create audit log entry
// @access  Public
router.post('/', async (req, res) => {
    try {
        const { user, action, module, recordId, oldValue, newValue, description, ip } = req.body;
        const newRow = {
            user: user || 'Admin',
            action,
            module,
            record_id: recordId,
            old_value: oldValue,
            new_value: newValue,
            description,
            ip,
            created_at: new Date()
        };

        const { data, error } = await supabase.from('audit_logs').insert(newRow).select().single();
        if (error) throw error;

        res.status(201).json({ success: true, log: formatAuditLog(data) });
    } catch (error) {
        console.error('Error creating audit log:', error);
        res.status(500).json({ success: false, message: 'Error creating audit log', error: error.message });
    }
});

// @route   GET /api/audit-logs/summary
// @desc    Get audit log summary
// @access  Public
router.get('/summary', async (req, res) => {
    try {
        const { data: logs, error } = await supabase
            .from('audit_logs')
            .select('module, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const moduleMap = new Map();
        (logs || []).forEach(l => {
            const m = l.module || 'General';
            moduleMap.set(m, (moduleMap.get(m) || 0) + 1);
        });

        const summary = Array.from(moduleMap.entries()).map(([m, count]) => ({ _id: m, count }));
        const recentLogs = (logs || []).slice(0, 10).map(formatAuditLog);

        res.json({ success: true, summary, recentLogs });
    } catch (error) {
        console.error('Error fetching audit summary:', error);
        res.status(500).json({ success: false, message: 'Error fetching audit summary', error: error.message });
    }
});

module.exports = router;