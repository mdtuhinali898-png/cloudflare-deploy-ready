const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'main-settings')
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, data: data ? data.value : null });
    } catch (error) { next(error); }
});

router.put('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .upsert({ key: 'main-settings', value: req.body, updated_at: new Date() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data: data.value });
    } catch (error) { next(error); }
});

module.exports = router;
