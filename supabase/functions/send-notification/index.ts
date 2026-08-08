import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceKey || !publicKey || !privateKey || !authorization) {
    return json({ error: 'Notification service is not configured' }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (user?.app_metadata?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const { title, message, url = '/' } = await request.json();
  if (typeof title !== 'string' || !title.trim() || title.length > 80
    || typeof message !== 'string' || !message.trim() || message.length > 240) {
    return json({ error: 'Enter a title and message within the limits.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rows, error } = await admin
    .from('app_push_subscriptions')
    .select('endpoint, subscription')
    .eq('enabled', true);
  if (error) return json({ error: 'Could not load subscribers' }, 500);

  webpush.setVapidDetails('mailto:f20251736@pilani.bits-pilani.ac.in', publicKey, privateKey);
  const payload = JSON.stringify({
    title: title.trim(),
    body: message.trim(),
    url: typeof url === 'string' && url.startsWith('/') ? url : '/',
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 86400 });
      sent += 1;
    } catch (pushError) {
      failed += 1;
      const statusCode = Number((pushError as { statusCode?: number }).statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('app_push_subscriptions').update({ enabled: false }).eq('endpoint', row.endpoint);
      }
    }
  }

  return json({ ok: true, sent, failed });
});
