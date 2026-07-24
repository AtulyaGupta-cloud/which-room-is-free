const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUILDINGS = [
  { name: 'FD I', longitude: 75.58935, latitude: 28.36382 },
  { name: 'FD II', longitude: 75.5880798, latitude: 28.3639767 },
  { name: 'FD III', longitude: 75.5859022, latitude: 28.3636528 },
  { name: 'LTC', longitude: 75.5907, latitude: 28.36385 },
  { name: 'NAB', longitude: 75.5875265, latitude: 28.3620457 },
  { name: 'IPC', longitude: 75.5875265, latitude: 28.3620457 },
  { name: 'New Workshop', longitude: 75.5877529, latitude: 28.3650753 },
] as const;

interface MatrixResponse {
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
  error?: { message?: string };
}

interface CachedResult {
  expiresAt: number;
  routes: Record<string, { distanceMeters: number; durationSeconds: number }>;
}

const cache = new Map<string, CachedResult>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { latitude, longitude } = await request.json();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: 'Valid latitude and longitude are required' }, 400);
    }

    // Limit this public endpoint to the Pilani region to protect the free quota.
    if (latitude < 28.25 || latitude > 28.47 || longitude < 75.45 || longitude > 75.72) {
      return json({ error: 'Walking routes are available near the Pilani campus only' }, 400);
    }

    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return json({ routes: cached.routes, cached: true });
    }

    const apiKey = Deno.env.get('ORS_API_KEY');
    if (!apiKey) return json({ error: 'Routing service is not configured' }, 500);

    const locations = [
      [longitude, latitude],
      ...BUILDINGS.map((building) => [building.longitude, building.latitude]),
    ];

    const response = await fetch('https://api.openrouteservice.org/v2/matrix/foot-walking', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        locations,
        sources: ['0'],
        destinations: BUILDINGS.map((_, index) => String(index + 1)),
        metrics: ['distance', 'duration'],
        units: 'm',
      }),
    });

    const matrix = await response.json() as MatrixResponse;
    if (!response.ok || !matrix.distances?.[0] || !matrix.durations?.[0]) {
      console.error('OpenRouteService error', response.status, matrix.error?.message);
      return json({ error: 'The walking-route service is temporarily unavailable' }, 502);
    }

    const routes: Record<string, { distanceMeters: number; durationSeconds: number }> = {};
    BUILDINGS.forEach((building, index) => {
      const distance = matrix.distances?.[0]?.[index];
      const duration = matrix.durations?.[0]?.[index];
      if (distance !== null && distance !== undefined && duration !== null && duration !== undefined) {
        routes[building.name] = {
          distanceMeters: Math.round(distance),
          durationSeconds: Math.round(duration),
        };
      }
    });

    cache.set(cacheKey, { expiresAt: Date.now() + 60_000, routes });
    return json({ routes, cached: false });
  } catch (error) {
    console.error('walking-distances failed', error);
    return json({ error: 'Unable to calculate walking routes' }, 500);
  }
});
