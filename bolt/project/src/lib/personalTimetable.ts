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

function prepareImage(image: HTMLImageElement) {
  // Always process the original pixels. A bounded working size prevents mobile
  // browsers from running out of memory without making assumptions about layout.
  const scale = Math.min(2, 2200 / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

interface PositionedWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function classesFromPositionedWords(words: PositionedWord[], imageWidth: number) {
  const dayLookup = new Map(TIMETABLE_DAYS.map((day) => [day.toUpperCase(), day]));
  const headings = words
    .map((word) => ({ ...word, normalized: word.text.toUpperCase().replace(/[^A-Z]/g, '') }))
    .filter((word) => dayLookup.has(word.normalized))
    .map((word) => ({ ...word, day: dayLookup.get(word.normalized)! }))
    .sort((a, b) => a.x0 - b.x0)
    .filter((heading, index, all) => all.findIndex((candidate) => candidate.day === heading.day) === index);

  if (headings.length < 2) {
    throw new Error('Day headings could not be read. Upload the uncropped ERP timetable image with Monday–Friday headings visible.');
  }

  const classes: PersonalClass[] = [];
  headings.forEach((heading, index) => {
    const center = (heading.x0 + heading.x1) / 2;
    const previousCenter = index ? (headings[index - 1].x0 + headings[index - 1].x1) / 2 : 0;
    const nextCenter = index < headings.length - 1
      ? (headings[index + 1].x0 + headings[index + 1].x1) / 2
      : imageWidth;
    const left = index ? (previousCenter + center) / 2 : Math.max(0, center - (nextCenter - center) / 2);
    const right = index < headings.length - 1 ? (center + nextCenter) / 2 : Math.min(imageWidth, center + (center - previousCenter) / 2);
    const columnText = words
      .filter((word) => {
        const wordCenter = (word.x0 + word.x1) / 2;
        return word.y0 > heading.y1 && wordCenter >= left && wordCenter < right;
      })
      .sort((a, b) => Math.abs(a.y0 - b.y0) < 8 ? a.x0 - b.x0 : a.y0 - b.y0)
      .map((word) => word.text)
      .join(' ');
    classes.push(...parseDayText(columnText, heading.day));
  });

  return classes;
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
        onProgress(Math.min(98, Math.round(message.progress * 100)), 'Discovering days, courses, times and rooms…');
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    const canvas = prepareImage(image);
    const result = await worker.recognize(canvas, {}, { blocks: true });
    const words: PositionedWord[] = (result.data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words.map((word) => ({
        text: word.text,
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1,
      }))))
    );
    const classes = classesFromPositionedWords(words, canvas.width);
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
