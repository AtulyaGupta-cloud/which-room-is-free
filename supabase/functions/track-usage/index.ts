import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function istDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { deviceId, exclude = false } = await request.json();
    if (typeof deviceId !== 'string' || deviceId.length < 16 || deviceId.length > 100) {
      return json({ error: 'Invalid anonymous device identifier' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Usage tracking is not configured' }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const visitorHash = await sha256(deviceId);
    const activityDate = istDate();
    const rpc = exclude ? 'remove_app_usage' : 'record_app_usage';
    const { error } = await admin.rpc(rpc, {
      p_activity_date: activityDate,
      p_visitor_hash: visitorHash,
    });

    if (error) {
      console.error('Usage RPC failed', error);
      return json({ error: 'Unable to update usage' }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('track-usage failed', error);
    return json({ error: 'Unable to update usage' }, 500);
  }
});
