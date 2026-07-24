import { useState, useEffect } from 'react';
import { ArrowLeft, Share2 } from 'lucide-react';
import { supabase, Room, RoomSchedule } from '../lib/supabase';
import {
  computeRoomStatus,
  RoomStatus,
  getISTDayName,
  formatTimeStr,
  formatDuration,
  getWeekSchedule,
  HOUR_SLOTS,
  getCurrentTimeStr,
  timeToMinutes,
} from '../lib/timeUtils';

interface Props {
  roomNumber: string;
  onNavigate: (path: string) => void;
  allRooms: Room[];
  allSchedules: RoomSchedule[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

export default function RoomDetailPage({ roomNumber, onNavigate, allRooms, allSchedules }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [roomSchedules, setRoomSchedules] = useState<RoomSchedule[]>([]);
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const todayName = getISTDayName();
  const now = getCurrentTimeStr();

  const shareOnWhatsApp = () => {
    if (!room || !status) return;

    const statusLine = status.isBusy
      ? `🔴 BUSY until ${formatTimeStr(status.busyUntil!)}`
      : status.freeAllDay
      ? '🟢 FREE for the rest of the day'
      : `🟢 FREE until ${formatTimeStr(status.freeUntil!)}`;
    const courseLine = status.currentCourse ? `\nCourse: ${status.currentCourse}` : '';
    const roomUrl = `${window.location.origin}/room/${encodeURIComponent(room.room_number)}`;
    const message = `🏫 Room ${room.room_number} · ${room.building}\n${statusLine}${courseLine}\n\nSee schedule: ${roomUrl}\nShared from Which Room Is Free?`;

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    async function load() {
      let foundRoom = allRooms.find((r) => r.room_number === roomNumber) ?? null;
      if (!foundRoom) {
        const { data } = await supabase.from('rooms').select('*').eq('room_number', roomNumber).maybeSingle();
        foundRoom = (data as Room) ?? null;
      }
      if (!foundRoom) { setLoading(false); return; }
      setRoom(foundRoom);

      let schedules = allSchedules.filter((s) => s.room_number === roomNumber);
      if (schedules.length === 0 && allSchedules.length === 0) {
        const { data } = await supabase.from('room_schedules').select('*').eq('room_number', roomNumber);
        schedules = (data || []) as RoomSchedule[];
      }
      setRoomSchedules(schedules);

      const todayScheds = schedules.filter((s) => s.day_of_week === todayName);
      setStatus(computeRoomStatus(foundRoom, todayScheds));
      setLoading(false);
    }
    load();
  }, [roomNumber, allRooms, allSchedules, todayName]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <div className="spin" style={{ width: 36, height: 36, border: '3px solid #1E1E1E', borderTopColor: '#7C3AED', borderRadius: '50%' }} />
        <p style={{ color: '#555', fontSize: 14 }}>Loading room...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <p style={{ color: '#888', fontSize: 18 }}>Room not found</p>
        <button onClick={() => onNavigate('/')} style={{ color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Go back home</button>
      </div>
    );
  }

  const isBusy = status?.isBusy ?? false;
  const color = isBusy ? '#FF3B3B' : '#00FF88';
  const weekSchedule = getWeekSchedule(roomNumber, roomSchedules);
  const todaySlots = weekSchedule[todayName] || [];

  const nearbyRooms = allRooms
    .filter((r) => r.building === room.building && r.room_number !== roomNumber)
    .slice(0, 4);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1E1E1E',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => onNavigate('/')}
            style={{ background: '#181818', border: '1px solid #262626', borderRadius: 10, width: 44, height: 44, cursor: 'pointer', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#222'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#181818'; }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>Room {room.room_number}</h1>
            <p style={{ color: '#555', fontSize: 12, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {room.venue}{room.floor ? ` · ${room.floor} Floor` : ''}
            </p>
          </div>
          <span style={{ padding: '6px 14px', borderRadius: 100, background: `${color}14`, color, fontSize: 12, fontWeight: 700, border: `1px solid ${color}33`, letterSpacing: '0.06em', flexShrink: 0 }}>
            {isBusy ? 'BUSY' : 'FREE'}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Status Card */}
        {status && (
          <div style={{ background: `${color}07`, border: `1px solid ${color}25`, borderRadius: 16, padding: '20px 24px', marginBottom: 28 }}>
            {isBusy ? (
              <>
                <p style={{ color: '#555', fontSize: 12, margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Class in progress</p>
                <p style={{ fontSize: 22, fontWeight: 700, color, margin: '0 0 4px' }}>Until {formatTimeStr(status.busyUntil!)}</p>
                {status.currentCourse && <p style={{ color: '#555', fontSize: 14, margin: 0 }}>Course: <span style={{ color: '#888', fontWeight: 600 }}>{status.currentCourse}</span></p>}
              </>
            ) : (
              <>
                <p style={{ color: '#555', fontSize: 12, margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Currently available</p>
                <p style={{ fontSize: 22, fontWeight: 700, color, margin: '0 0 4px' }}>
                  {status.freeAllDay ? 'Free for the rest of the day' : `Free until ${formatTimeStr(status.freeUntil!)}`}
                </p>
                {!status.freeAllDay && status.freeForMins !== undefined && (
                  <p style={{ color: '#555', fontSize: 14, margin: 0 }}>
                    <span style={{ color: '#00FF88', fontWeight: 600 }}>{formatDuration(status.freeForMins)}</span> remaining
                  </p>
                )}
              </>
            )}
            <button type="button" className="whatsapp-share-button" onClick={shareOnWhatsApp}>
              <Share2 size={16} />
              Share status on WhatsApp
            </button>
          </div>
        )}

        {/* Today's Timeline */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: '0 0 14px' }}>
            Today's Schedule
            <span style={{ color: '#333', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{todayName}</span>
          </h2>
          <Timeline schedules={todaySlots} currentTime={now} />
        </section>

        {/* Week Table */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: '0 0 14px' }}>Full Week</h2>
          <WeekTable weekSchedule={weekSchedule} todayName={todayName} />
        </section>

        {/* Nearby Rooms */}
        {nearbyRooms.length > 0 && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: '0 0 14px' }}>
              Nearby Rooms
              <span style={{ color: '#333', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{room.building}</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {nearbyRooms.map((nr) => {
                const ns = computeRoomStatus(nr, allSchedules.filter((s) => s.day_of_week === todayName));
                const nc = ns.isBusy ? '#FF3B3B' : '#00FF88';
                return (
                  <div key={nr.id} onClick={() => onNavigate(`/room/${nr.room_number}`)}
                    style={{ background: '#111', border: `1px solid ${nc}22`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'transform 0.18s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                  >
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#FFF', margin: '0 0 8px' }}>{nr.room_number}</p>
                    <span style={{ padding: '3px 8px', borderRadius: 100, background: `${nc}14`, color: nc, fontSize: 10, fontWeight: 700, border: `1px solid ${nc}2A`, letterSpacing: '0.08em' }}>
                      {ns.isBusy ? 'BUSY' : 'FREE'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer style={{ borderTop: '1px solid #161616', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: '#2A2A2A', fontSize: 12, margin: '0 0 6px' }}>Built for BITS Pilani · Sem 2 2025-26</p>
        <p className="credit-line" style={{ margin: 0 }}>Made by Atulya Gupta</p>
      </footer>
    </div>
  );
}

function Timeline({ schedules, currentTime }: { schedules: RoomSchedule[]; currentTime: string }) {
  const nowMins = timeToMinutes(currentTime);
  const START = 8 * 60;
  const END = 18 * 60;
  const TOTAL = END - START;

  return (
    <div style={{ background: '#111', border: '1px solid #1E1E1E', borderRadius: 16, padding: '20px', overflowX: 'auto' }}>
      <div style={{ position: 'relative', minWidth: 560 }}>
        {/* Hour labels row */}
        <div style={{ position: 'relative', height: 20, marginBottom: 6 }}>
          {Array.from({ length: 11 }, (_, i) => {
            const hour = 8 + i;
            const pct = (i * 60 / TOTAL) * 100;
            const label = hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`;
            return (
              <span key={hour} style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', fontSize: 10, color: '#444', fontWeight: 600 }}>
                {label}
              </span>
            );
          })}
        </div>

        {/* Timeline bar */}
        <div style={{ position: 'relative', height: 44, borderRadius: 8, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.08)' }}>
          {schedules.map((s) => {
            const left = ((timeToMinutes(s.start_time) - START) / TOTAL) * 100;
            const width = ((timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / TOTAL) * 100;
            return (
              <div key={s.id} title={s.course_code} style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${left}%`, width: `${width}%`,
                background: 'rgba(255,59,59,0.2)', borderLeft: '2px solid #FF3B3B',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B3B', whiteSpace: 'nowrap', padding: '0 4px' }}>{s.course_code}</span>
              </div>
            );
          })}

          {/* Now indicator */}
          {nowMins >= START && nowMins <= END && (
            <div style={{
              position: 'absolute', top: -6, bottom: -6,
              left: `${((nowMins - START) / TOTAL) * 100}%`,
              width: 2, background: '#7C3AED', borderRadius: 2,
              boxShadow: '0 0 8px rgba(124,58,237,0.8)', zIndex: 5,
            }}>
              <div style={{
                position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
                width: 8, height: 8, borderRadius: '50%', background: '#7C3AED',
              }} />
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
          {[
            { bg: 'rgba(255,59,59,0.2)', border: '#FF3B3B', label: 'Busy' },
            { bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.15)', label: 'Free' },
            { bg: '#7C3AED', border: '#7C3AED', label: 'Now' },
          ].map(({ bg, border, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: label === 'Now' ? 2 : 10, height: 10, borderRadius: label === 'Now' ? 1 : 3, background: bg, border: `1px solid ${border}` }} />
              <span style={{ fontSize: 11, color: '#555' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekTable({ weekSchedule, todayName }: { weekSchedule: Record<string, RoomSchedule[]>; todayName: string }) {
  const slots = Object.values(HOUR_SLOTS);
  return (
    <div style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ width: 42, padding: '4px 6px', textAlign: 'left' }} />
            {slots.map((slot, i) => (
              <th key={i} style={{ padding: '4px 2px', fontSize: 9, color: '#444', fontWeight: 600, textAlign: 'center' }}>
                {formatTimeStr(slot.start).replace(':00', '').replace(' ', '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const isToday = day === todayName;
            const dayScheds = weekSchedule[day] || [];
            return (
              <tr key={day}>
                <td style={{ padding: '2px 6px 2px 0', fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? '#7C3AED' : '#444', whiteSpace: 'nowrap' }}>
                  {DAY_SHORT[day]}
                </td>
                {slots.map((slot, i) => {
                  const cls = dayScheds.find(
                    (s) => timeToMinutes(s.start_time) <= timeToMinutes(slot.start) && timeToMinutes(slot.start) < timeToMinutes(s.end_time)
                  );
                  const hasClass = !!cls;
                  return (
                    <td key={i} style={{ padding: 0 }}>
                      <div title={cls?.course_code} style={{
                        width: 36, height: 26, borderRadius: 5,
                        background: hasClass ? 'rgba(255,59,59,0.18)' : 'rgba(0,255,136,0.06)',
                        border: hasClass ? '1px solid rgba(255,59,59,0.3)' : '1px solid rgba(0,255,136,0.08)',
                        outline: isToday ? '1px solid rgba(124,58,237,0.15)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {hasClass && cls && (
                          <span style={{ fontSize: 6, color: '#FF3B3B', fontWeight: 700, textAlign: 'center', padding: '0 1px', lineHeight: 1.2 }}>
                            {cls.course_code.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
