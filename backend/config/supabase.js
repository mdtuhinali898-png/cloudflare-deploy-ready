const { createClient } = require('@supabase/supabase-js');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
    // Cloudflare Workers environment
}

let _supabaseInstance = null;

function getSupabaseClient() {
    if (_supabaseInstance) return _supabaseInstance;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured as Worker secrets/variables.');
    }

    _supabaseInstance = createClient(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    return _supabaseInstance;
}

// Proxy wrapper for backward compatibility across all 19+ routes
const supabase = new Proxy({}, {
    get(target, prop) {
        const client = getSupabaseClient();
        const value = client[prop];
        if (typeof value === 'function') {
            return value.bind(client);
        }
        return value;
    }
});

module.exports = supabase;
