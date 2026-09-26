const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../config/supabase');

const LANDING_IMAGE_BUCKET = 'landing-images';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function getLandingImagePath(imageUrl) {
    try {
        const url = new URL(imageUrl);
        const marker = `/storage/v1/object/public/${LANDING_IMAGE_BUCKET}/`;
        if (!url.pathname.startsWith(marker)) return null;
        const filePath = decodeURIComponent(url.pathname.slice(marker.length));
        return filePath.startsWith('hero/') ? filePath : null;
    } catch (_) {
        return null;
    }
}

async function ensureLandingImageBucket() {
    const { data: bucket } = await supabase.storage.getBucket(LANDING_IMAGE_BUCKET);
    if (bucket) return;

    const { error: createError } = await supabase.storage.createBucket(LANDING_IMAGE_BUCKET, {
        public: true,
        fileSizeLimit: String(MAX_IMAGE_BYTES),
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    if (createError) throw createError;
}

router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'public-landing')
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, data: data ? data.value : null });
    } catch (error) { next(error); }
});

// Upload the landing banner as a real file in Supabase Storage. Only its URL
// is kept in app_settings, avoiding Base64 images inside the database.
router.post('/hero-image', async (req, res, next) => {
    try {
        const dataUrl = String(req.body?.dataUrl || '');
        const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
        if (!match) {
            return res.status(400).json({ success: false, message: 'Please upload a JPG, PNG, or WebP image.' });
        }

        const contentType = match[1].toLowerCase();
        const fileBuffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
        if (!fileBuffer.length || fileBuffer.length > MAX_IMAGE_BYTES) {
            return res.status(400).json({ success: false, message: 'Image must be 2MB or smaller.' });
        }

        await ensureLandingImageBucket();

        const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
        const filePath = `hero/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
            .from(LANDING_IMAGE_BUCKET)
            .upload(filePath, fileBuffer, { contentType, cacheControl: '31536000', upsert: false });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from(LANDING_IMAGE_BUCKET).getPublicUrl(filePath);
        res.status(201).json({ success: true, url: publicUrlData.publicUrl, path: filePath });
    } catch (error) { next(error); }
});

// Remove an uploaded banner and clear its saved URL in the same request.
router.delete('/hero-image', async (req, res, next) => {
    try {
        const imageUrl = String(req.body?.imageUrl || '');
        const filePath = getLandingImagePath(imageUrl);
        if (!filePath) {
            return res.status(400).json({ success: false, message: 'This is not a removable landing image.' });
        }

        const { error: removeError } = await supabase.storage.from(LANDING_IMAGE_BUCKET).remove([filePath]);
        if (removeError) throw removeError;

        const { data: setting, error: readError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'public-landing')
            .maybeSingle();
        if (readError) throw readError;

        const landing = setting?.value && typeof setting.value === 'object' ? setting.value : {};
        if (landing.heroImage === imageUrl) {
            landing.heroImage = '';
            const { error: saveError } = await supabase
                .from('app_settings')
                .upsert({ key: 'public-landing', value: landing, updated_at: new Date() }, { onConflict: 'key' });
            if (saveError) throw saveError;
        }

        res.json({ success: true });
    } catch (error) { next(error); }
});

router.put('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .upsert({ key: 'public-landing', value: req.body, updated_at: new Date() }, { onConflict: 'key' })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, data: data.value });
    } catch (error) { next(error); }
});

module.exports = router;
