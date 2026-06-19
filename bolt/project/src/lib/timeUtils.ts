import { Room, RoomSchedule } from './supabase';

export const HOUR_SLOTS: Record<number, { start: string; end: string; label: string }> = {
  1: { start: '08:00', end: '09:00', label: '8:00 AM – 9:00 AM' },
  2: { start: '09:00', end: '10:00', label: '9:00 AM – 10:00 AM' },
  3: { start: '10:00', end: '11:00', label: '10:00 AM – 11:00 AM' },
  4: { start: '11:00', end: '12:00', label: '11:00 AM – 12:00 PM' },
  5: { start: '12:00', end: '13:00', label: '12:00 PM – 1:00 PM' },
  6: { start: '13:00', end: '14:00', label: '1:00 PM – 2:00 PM' },
  7: { start: '14:00', end: '15:00', label: '2:00 PM – 3:00 PM' },
  8: { start: '15:00', end: '16:00', label: '3:00 PM – 4:00 PM' },
  9: { start: '16:00', end: '17:00', label: '4:00 PM – 5:00 PM' },
  10: { start: '17:00', end: '18:00', label: '5:00 PM – 6:00 PM' },
};

export function getISTTime(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

export function getISTDayName(): string {
  return getISTTime().toLocaleDateString('en-US', { weekday: 'long' });
}

export function formatTimeStr(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

export function getCurrentTimeStr(): string {
  const d = getISTTime();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function getCurrentHourSlot(): { slot: number; label: string } | null {
  const now = getCurrentTimeStr();
  const nowMins = timeToMinutes(now);
  for (const [slot, { start, end }] of Object.entries(HOUR_SLOTS)) {
    if (nowMins >= timeToMinutes(start) && nowMins < timeToMinutes(end)) {
      return { slot: Number(slot), label: `Hour ${slot} · ${formatTimeStr(start)} – ${formatTimeStr(end)}` };
    }
  }
  return null;
}

export interface RoomStatus {
  room: Room;
  isBusy: boolean;
  currentCourse?: string;
  busyUntil?: string;
  freeUntil?: string;
  freeForMins?: number;
  freeAllDay: boolean;
}

export function computeRoomStatus(room: Room, todaySchedules: RoomSchedule[]): RoomStatus {
  const now = getCurrentTimeStr();
  const nowMins = timeToMinutes(now);
  const schedules = todaySchedules.filter((s) => s.room_number === room.room_number);

  const currentClass = schedules.find(
    (s) => timeToMinutes(s.start_time) <= nowMins && nowMins < timeToMinutes(s.end_time)
  );

  if (currentClass) {
    return {
      room,
      isBusy: true,
      currentCourse: currentClass.course_code,
      busyUntil: currentClass.end_time,
      freeAllDay: false,
    };
  }

  const upcoming = schedules
    .filter((s) => timeToMinutes(s.start_time) > nowMins)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  if (upcoming.length === 0) {
    return { room, isBusy: false, freeAllDay: true };
  }

  const next = upcoming[0];
  return {
    room,
    isBusy: false,
    freeUntil: next.start_time,
    freeForMins: timeToMinutes(next.start_time) - nowMins,
    freeAllDay: false,
  };
}

export function computeRoomStatusAtTime(
  room: Room,
  schedules: RoomSchedule[],
  selectedTime: string
): RoomStatus {
  const nowMins = timeToMinutes(selectedTime);
  const roomSchedules = schedules.filter((s) => s.room_number === room.room_number);

  const currentClass = roomSchedules.find(
    (s) => timeToMinutes(s.start_time) <= nowMins && nowMins < timeToMinutes(s.end_time)
  );

  if (currentClass) {
    return {
      room,
      isBusy: true,
      currentCourse: currentClass.course_code,
      busyUntil: currentClass.end_time,
      freeAllDay: false,
    };
  }

  const upcoming = roomSchedules
    .filter((s) => timeToMinutes(s.start_time) > nowMins)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  if (upcoming.length === 0) {
    return { room, isBusy: false, freeAllDay: true };
  }

  const next = upcoming[0];
  return {
    room,
    isBusy: false,
    freeUntil: next.start_time,
    freeForMins: timeToMinutes(next.start_time) - nowMins,
    freeAllDay: false,
  };
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}hr`;
  return `${h}hr ${m}min`;
}

export function getWeekSchedule(
  roomNumber: string,
  allSchedules: RoomSchedule[]
): Record<string, RoomSchedule[]> {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const result: Record<string, RoomSchedule[]> = {};
  for (const day of days) {
    result[day] = allSchedules.filter(
      (s) => s.room_number === roomNumber && s.day_of_week === day
    );
  }
  return result;
}