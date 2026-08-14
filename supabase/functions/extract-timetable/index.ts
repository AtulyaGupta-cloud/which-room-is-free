const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedClass {
  day: string;
  courseCode: string;
  courseName: string;
  section: string;
  classType: string;
  startTime: string;
  endTime: string;
  room: string;
  building: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const classSchema = {
  type: 'object',
  properties: {
    day: { type: 'string', description: 'Weekday printed above or associated with this class, such as Monday.' },
    courseCode: { type: 'string', description: 'Exact course code, such as MATH F211 or BITS F225.' },
    courseName: { type: 'string', description: 'Course title visible in the tile. Empty if absent.' },
    section: { type: 'string', description: 'Section label such as L1, L2, T1 or P3. Empty if absent.' },
    classType: { type: 'string', description: 'Lecture, Tutorial, Practical or Laboratory. Empty if absent.' },
    startTime: { type: 'string', description: '24-hour HH:MM start time.' },
    endTime: { type: 'string', description: '24-hour HH:MM end time.' },
    room: { type: 'string', description: 'Exact room number/code visible for this class, such as 6101 or 5102.' },
    building: { type: 'string', description: 'Building text visible in the tile, such as New Academic Building or Lecture Theatre Complex. Empty if absent.' },
  },
  required: ['day', 'courseCode', 'courseName', 'section', 'classType', 'startTime', 'endTime', 'room', 'building'],
};

function cleanClass(value: Record<string, unknown>): ExtractedClass | null {
  const read = (key: string) => typeof value[key] === 'string' ? (value[key] as string).trim() : '';
  const item = {
    day: read('day'), courseCode: read('courseCode').toUpperCase(), courseName: read('courseName'),
    section: read('section').toUpperCase(), classType: read('classType'), startTime: read('startTime'),
    endTime: read('endTime'), room: read('room').toUpperCase().replace(/\s+/g, ''), building: read('building'),
  };
  if (!item.courseCode || !item.room || !/^\d{2}:\d{2}$/.test(item.startTime) || !/^\d{2}:\d{2}$/.test(item.endTime)) return null;
  return item;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { imageData, mimeType } = await request.json();
    if (typeof imageData !== 'string' || !imageData || imageData.length > 18_000_000) {
      return json({ error: 'A valid timetable image under 12 MB is required' }, 400);
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return json({ error: 'Only PNG, JPG and WebP images are supported' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'Timetable recognition is not configured' }, 503);

    const prompt = `You are extracting a student's class timetable from an image.
Inspect the ENTIRE image carefully, including every visible weekday column and every hour from top to bottom.
Return one object for EVERY distinct scheduled class tile visible. Do not limit the number of results. Empty cells are not classes.

Rules:
- Read only information actually visible. Never invent a class, day, room, time, or course.
- A class must have a course code, start/end time, and room. Preserve course codes and room numbers exactly.
- Associate each tile with the weekday heading above its horizontal position, regardless of layout, crop, number of days, colors, or image dimensions.
- Use the time printed inside the tile. If a tile only aligns with an hour label, infer the start hour and use a 50-minute end time only when the grid makes this unambiguous.
- Course code example: "MATH F211 - L2" means courseCode "MATH F211" and section "L2".
- Building example: "NEW ACADEMIC BUILDING 6101" means building "New Academic Building" and room "6101".
- Scan once column-by-column, then scan again row-by-row to ensure no visible tile was missed.
- Deduplicate only exact repeats with the same day, course, section, time, and room.`;

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify({
        model: 'gemini-3.6-flash',
        store: false,
        input: [{ type: 'text', text: prompt }, { type: 'image', mime_type: mimeType, data: imageData, resolution: 'high' }],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: { type: 'object', properties: { classes: { type: 'array', items: classSchema } }, required: ['classes'] },
        },
        generation_config: { temperature: 0, thinking_level: 'low' },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error('Gemini timetable extraction failed', response.status, payload?.error?.message);
      return json({ error: 'The timetable recognition service is temporarily unavailable' }, 502);
    }

    const rawText = payload?.steps
      ?.filter((step: { type?: string }) => step.type === 'model_output')
      ?.flatMap((step: { content?: Array<{ type?: string; text?: string }> }) => step.content ?? [])
      ?.find((content: { type?: string; text?: string }) => content.type === 'text')?.text;
    if (typeof rawText !== 'string') return json({ error: 'No timetable data was returned' }, 422);
    const parsed = JSON.parse(rawText);
    const classes = (Array.isArray(parsed?.classes) ? parsed.classes : [])
      .map((item: unknown) => item && typeof item === 'object' ? cleanClass(item as Record<string, unknown>) : null)
      .filter((item: ExtractedClass | null): item is ExtractedClass => item !== null)
      .filter((item: ExtractedClass, index: number, all: ExtractedClass[]) => all.findIndex((candidate) =>
        candidate.day === item.day && candidate.courseCode === item.courseCode && candidate.section === item.section
        && candidate.startTime === item.startTime && candidate.room === item.room
      ) === index);

    return json({ classes });
  } catch (error) {
    console.error('extract-timetable failed', error);
    return json({ error: 'Unable to read this timetable image' }, 500);
  }
});
