const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function formatNotice(row) {
    if (!row) return null;
    return {
        _id: row.id,
        id: row.id,
        title: row.title,
        content: row.content,
        targetBatch: row.target_batch || 'All',
        status: row.status || 'Published',
        createdBy: row.created_by || 'Admin',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// Get all active notices for public landing page
router.get('/public', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .eq('status', 'Published')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;
        res.json({ success: true, data: (data || []).map(formatNotice) });
    } catch (error) { next(error); }
});

// Admin: Get all notices
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: (data || []).map(formatNotice) });
    } catch (error) { next(error); }
});

// Admin: Create notice
router.post('/', async (req, res, next) => {
    try {
        const { title, content, targetBatch, status, createdBy } = req.body;
        const newRow = {
            title,
            content,
            target_batch: targetBatch || 'All',
            status: status || 'Published',
            created_by: createdBy || 'Admin',
            created_at: new Date(),
            updated_at: new Date()
        };

        const { data, error } = await supabase.from('notices').insert(newRow).select().single();
        if (error) throw error;
        res.json({ success: true, data: formatNotice(data) });
    } catch (error) { next(error); }
});

// Admin: Update notice
router.put('/:id', async (req, res, next) => {
    try {
        const { title, content, targetBatch, status } = req.body;
        const updateData = { updated_at: new Date() };
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (targetBatch !== undefined) updateData.target_batch = targetBatch;
        if (status !== undefined) updateData.status = status;

        const { data, error } = await supabase
            .from('notices')
            .update(updateData)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data: formatNotice(data) });
    } catch (error) { next(error); }
});

// Admin: Delete notice
router.delete('/:id', async (req, res, next) => {
    try {
        const { error } = await supabase.from('notices').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { next(error); }
});

module.exports = router;