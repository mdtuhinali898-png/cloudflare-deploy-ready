const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../config/supabase');

const INSTITUTE_LOGO_BUCKET = 'institute-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function getInstituteLogoPath(imageUrl) {
    try {
        const url = new URL(imageUrl);
        const marker = `/storage/v1/object/public/${INSTITUTE_LOGO_BUCKET}/`;
        if (!url.pathname.startsWith(marker)) return null;
        const filePath = decodeURIComponent(url.pathname.slice(marker.length));
        return filePath.startsWith('logos/') ? filePath : null;
    } catch (_) {
        return null;
    }
}

async function ensureInstituteLogoBucket() {
    const { data: bucket, error: bucketError } = await supabase.storage.getBucket(INSTITUTE_LOGO_BUCKET);
    if (bucket) return;
    if (bucketError && !/not found|does not exist/i.test(bucketError.message || '')) throw bucketError;

    const { error } = await supabase.storage.createBucket(INSTITUTE_LOGO_BUCKET, {
        public: true,
        fileSizeLimit: String(MAX_LOGO_BYTES),
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });
    if (error && !/already exists/i.test(error.message || '')) throw error;
}

// Store the institute logo as an image file; the database keeps only its public URL.
router.post('/logo', async (req, res, next) => {
    try {
        const dataUrl = String(req.body?.dataUrl || '');
        const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
        if (!match) return res.status(400).json({ success: false, message: 'Please upload a JPG, PNG, or WebP logo.' });

        const contentType = match[1].toLowerCase();
        const fileBuffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
        if (!fileBuffer.length || fileBuffer.length > MAX_LOGO_BYTES) {
            return res.status(400).json({ success: false, message: 'Logo must be 2MB or smaller.' });
        }

        await ensureInstituteLogoBucket();
        const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
        const filePath = `logos/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(INSTITUTE_LOGO_BUCKET).upload(filePath, fileBuffer, {
            contentType, cacheControl: '31536000', upsert: false
        });
        if (error) throw error;

        const { data } = supabase.storage.from(INSTITUTE_LOGO_BUCKET).getPublicUrl(filePath);
        res.status(201).json({ success: true, url: data.publicUrl, path: filePath });
    } catch (error) { next(error); }
});

router.delete('/logo', async (req, res, next) => {
    try {
        const filePath = getInstituteLogoPath(String(req.body?.imageUrl || ''));
        if (!filePath) return res.status(400).json({ success: false, message: 'This is not a removable institute logo.' });
        const { error } = await supabase.storage.from(INSTITUTE_LOGO_BUCKET).remove([filePath]);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) { next(error); }
});

// Get public institute info (accessible without auth)
router.get('/public', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'main-settings')
            .maybeSingle();

        const settingData = (data && data.value) ? data.value : {};

        const publicInfo = {
            name: settingData.institute?.name || settingData.name || 'EduSmart Coaching Center',
            logo: settingData.institute?.logo || settingData.logo || '',
            phone: settingData.institute?.phone || settingData.phone || '',
            email: settingData.institute?.email || settingData.email || '',
            address: settingData.institute?.address || settingData.address || '',
            website: settingData.institute?.website || settingData.website || '',
            established: settingData.institute?.established || settingData.established || '',
            about: settingData.institute?.about || settingData.about || '',
            director: settingData.institute?.director || settingData.director || ''
        };

        res.json({ success: true, data: publicInfo });
    } catch (error) { next(error); }
});

// Get full institute info (admin only)
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

// Update institute info
router.put('/', async (req, res, next) => {
    try {
        const { data: existing } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'main-settings')
            .maybeSingle();

        const currentSettings = (existing && existing.value) || {};
        const incomingInstitute = req.body.institute || req.body;
        const mergedValue = {
            ...currentSettings,
            institute: {
                ...(currentSettings.institute || {}),
                ...incomingInstitute
            }
        };

        const { data, error } = await supabase
            .from('app_settings')
            .upsert({ key: 'main-settings', value: mergedValue, updated_at: new Date() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data: data.value });
    } catch (error) { next(error); }
});

module.exports = router;
