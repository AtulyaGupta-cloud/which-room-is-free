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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) return json({ error: 'Unauthorized' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || user?.app_metadata?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const activityDate = istDate();
  const [{ count, error: countError }, { data: metrics, error: metricsError }] = await Promise.all([
    admin
      .from('app_daily_visitors')
      .select('*', { count: 'exact', head: true })
      .eq('activity_date', activityDate),
    admin
      .from('app_daily_metrics')
      .select('peak_concurrent')
      .eq('activity_date', activityDate)
      .maybeSingle(),
  ]);

  if (countError || metricsError) return json({ error: 'Unable to load usage statistics' }, 500);
  return json({
    activityDate,
    uniqueVisitors: count ?? 0,
    peakConcurrent: metrics?.peak_concurrent ?? 0,
  });
});
