import { createWorker, PSM } from 'tesseract.js';

export const PERSONAL_TIMETABLE_KEY = 'which-room-is-free:personal-timetable:v1';
export const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export type TimetableDay = typeof TIMETABLE_DAYS[number];

export interface PersonalClass {
  id: string;
  day: TimetableDay;
  courseCode: string;
  section: string;
  classType: string;
  startTime: string;
  endTime: string;
  room: string;
}

function normalizeOcr(text: string) {
  return text
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDayText(rawText: string, day: TimetableDay): PersonalClass[] {
  const text = normalizeOcr(rawText);
  const coursePattern = /\b([A-Z]{2,5})\s*([A-Z])\s*([0-9O]{3})\s*-?\s*([LTPC]\s*\d{1,2})\b/g;
  const starts = [...text.matchAll(coursePattern)];
  const parsed: PersonalClass[] = [];

  starts.forEach((match, index) => {
    const segment = text.slice(match.index, starts[index + 1]?.index ?? text.length);
    const time = segment.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*-\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (!time) return;

    const afterTime = segment.slice((time.index ?? 0) + time[0].length);
    const roomMatches = [...afterTime.matchAll(/\b([1-7][0-9O]{3}[A-Z]?)\b/g)];
    const roomMatch = roomMatches[roomMatches.length - 1];
    if (!roomMatch) return;

    const startTime = `${time[1].padStart(2, '0')}:${time[2]}`;
    const endTime = `${time[3].padStart(2, '0')}:${time[4]}`;
    const courseCode = `${match[1]} ${match[2]}${match[3].replace(/O/g, '0')}`;
    const section = match[4].replace(/\s+/g, '');
    const typeMatch = segment.match(/\b(LECTURE|TUTORIAL|PRACTICAL|LAB(?:ORATORY)?)\b/);
    const room = roomMatch[1].replace(/O/g, '0');

    parsed.push({
      id: `${day}-${courseCode}-${section}-${startTime}-${room}`,
      day,
      courseCode,
      section,
      classType: typeMatch?.[1] ?? (section.startsWith('T') ? 'TUTORIAL' : section.startsWith('P') ? 'PRACTICAL' : 'LECTURE'),
      startTime,
      endTime,
      room,
    });
  });

  return parsed.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected image could not be opened.'));
    };
    image.src = url;
  });
}

function cropDayColumn(image: HTMLImageElement, dayIndex: number) {
  // ERP timetable screenshots use one time column followed by six equal day columns.
  // Cropping the original pixels (never the displayed/mobile-scaled preview) makes
  // extraction identical across phones and laptops.
  const leftRail = 0.168;
  const usableWidth = 0.828;
  const header = 0.035;
  const columnWidth = usableWidth / 6;
  const sourceX = Math.round(image.naturalWidth * (leftRail + dayIndex * columnWidth));
  const sourceY = Math.round(image.naturalHeight * header);
  const sourceWidth = Math.round(image.naturalWidth * columnWidth);
  const sourceHeight = Math.round(image.naturalHeight * 0.955);
  const scale = Math.max(1, Math.min(2, 1100 / sourceWidth));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function extractPersonalTimetable(file: File, onProgress: (value: number, label: string) => void) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a PNG, JPG or WebP screenshot.');
  const image = await loadImage(file);
  if (image.naturalWidth < 900 || image.naturalHeight < 700) {
    throw new Error('Please upload the original full timetable screenshot, not a cropped or compressed copy.');
  }

  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress(Math.min(98, Math.round(message.progress * 15)), 'Reading timetable…');
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    const classes: PersonalClass[] = [];
    for (let index = 0; index < TIMETABLE_DAYS.length; index += 1) {
      const day = TIMETABLE_DAYS[index];
      onProgress(Math.round((index / 6) * 100), `Reading ${day}…`);
      const result = await worker.recognize(cropDayColumn(image, index));
      classes.push(...parseDayText(result.data.text, day));
    }
    onProgress(100, 'Timetable ready for review');
    return classes.sort((a, b) => TIMETABLE_DAYS.indexOf(a.day) - TIMETABLE_DAYS.indexOf(b.day) || a.startTime.localeCompare(b.startTime));
  } finally {
    await worker.terminate();
  }
}

export function loadPersonalTimetable(): PersonalClass[] {
  try {
    const value = JSON.parse(localStorage.getItem(PERSONAL_TIMETABLE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function savePersonalTimetable(classes: PersonalClass[]) {
  localStorage.setItem(PERSONAL_TIMETABLE_KEY, JSON.stringify(classes));
}
