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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { action, deviceId, subscription, platform = 'unknown' } = await request.json();
    if (typeof deviceId !== 'string' || deviceId.length < 16 || deviceId.length > 100) {
      return json({ error: 'Invalid anonymous device identifier' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Push storage is not configured' }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const deviceHash = await sha256(deviceId);

    if (action === 'installed') {
      const { error } = await admin.from('app_installed_devices').upsert({
        device_hash: deviceHash,
        platform: String(platform).slice(0, 40),
        last_seen: new Date().toISOString(),
      }, { onConflict: 'device_hash' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'subscribe') {
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: 'Invalid push subscription' }, 400);
      }
      const { error } = await admin.from('app_push_subscriptions').upsert({
        endpoint: subscription.endpoint,
        device_hash: deviceHash,
        subscription,
        enabled: true,
        last_seen: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const endpoint = subscription?.endpoint;
      if (typeof endpoint === 'string') {
        await admin.from('app_push_subscriptions').update({ enabled: false }).eq('endpoint', endpoint);
      } else {
        await admin.from('app_push_subscriptions').update({ enabled: false }).eq('device_hash', deviceHash);
      }
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('push-subscription failed', error);
    return json({ error: 'Unable to update notification settings' }, 500);
  }
});

