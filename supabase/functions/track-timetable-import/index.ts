import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { deviceId } = await request.json();
    if (typeof deviceId !== 'string' || deviceId.length < 16 || deviceId.length > 100) {
      return json({ error: 'Invalid anonymous device identifier' }, 400);
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Import tracking is not configured' }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const visitorHash = await sha256(deviceId);
    const { data: existing } = await admin.from('app_timetable_import_devices').select('import_count').eq('visitor_hash', visitorHash).maybeSingle();
    const { error } = await admin.from('app_timetable_import_devices').upsert({
      visitor_hash: visitorHash,
      last_imported_at: new Date().toISOString(),
      import_count: (existing?.import_count ?? 0) + 1,
    }, { onConflict: 'visitor_hash' });

    if (error) {
      console.error('Timetable import tracking failed', error);
      return json({ error: 'Unable to update import statistics' }, 500);
    }
    return json({ ok: true });
  } catch (error) {
    console.error('track-timetable-import failed', error);
    return json({ error: 'Unable to update import statistics' }, 500);
  }
});
