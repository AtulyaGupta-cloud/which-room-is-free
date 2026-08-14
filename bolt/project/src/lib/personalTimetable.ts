import { supabase } from './supabase';

export const PERSONAL_TIMETABLE_KEY = 'which-room-is-free:personal-timetable:v2';

export interface PersonalClass {
  id: string;
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

type ExtractedClass = Omit<PersonalClass, 'id'>;

function fileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The selected image could not be opened.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected image could not be opened.')); };
    image.src = url;
  });
}

async function prepareImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPG or WebP timetable image.');
  }
  if (file.size > 12_000_000) throw new Error('The image must be smaller than 12 MB.');

  // Preserve original bytes whenever possible. Large images are resized once in
  // the browser to avoid mobile upload failures while retaining timetable text.
  if (file.size <= 7_000_000) {
    const dataUrl = await fileAsDataUrl(file);
    return { imageData: dataUrl.split(',')[1], mimeType: file.type };
  }

  const image = await loadImage(file);
  const scale = Math.min(1, 2600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  if (!blob) throw new Error('The timetable image could not be prepared.');
  const dataUrl = await fileAsDataUrl(blob);
  return { imageData: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

export async function extractPersonalTimetable(file: File): Promise<PersonalClass[]> {
  const image = await prepareImage(file);
  const { data, error } = await supabase.functions.invoke('extract-timetable', { body: image });
  if (error) throw new Error('The timetable service could not be reached. Please try again.');
  if (data?.error) throw new Error(String(data.error));
  if (!Array.isArray(data?.classes) || data.classes.length === 0) {
    throw new Error('No complete classes were found. Ensure course codes, times and room numbers are readable.');
  }

  return (data.classes as ExtractedClass[]).map((item, index) => ({
    ...item,
    id: `${item.day}-${item.courseCode}-${item.section}-${item.startTime}-${item.room}-${index}`,
  })).sort((a, b) => a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime));
}

export function loadPersonalTimetable(): PersonalClass[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PERSONAL_TIMETABLE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function savePersonalTimetable(classes: PersonalClass[]) {
  localStorage.setItem(PERSONAL_TIMETABLE_KEY, JSON.stringify(classes));
}
