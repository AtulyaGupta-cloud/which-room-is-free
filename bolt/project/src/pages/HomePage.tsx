import { useState, useEffect, useCallback } from 'react';
import { Search, X, Menu } from 'lucide-react';
import { supabase, Room, RoomSchedule } from '../lib/supabase';
import {
  computeRoomStatusAtTime,
  RoomStatus,
  getISTTime,
  getISTDayName,
  getCurrentTimeStr,
  getCurrentHourSlot,
  formatTimeStr,
  formatDuration,
} from '../lib/timeUtils';
import SkeletonCard from '../components/SkeletonCard';

type FilterType =
  | 'ALL'
  | 'FREE NOW'
  | 'BUSY NOW'
  | 'FREE 1HR+'
  | 'FD I'
  | 'FD II'
  | 'FD III'
  | 'LTC'
  | 'NAB'
  | 'IPC'
  | 'NEW WORKSHOP';

const FILTERS: FilterType[] = [
  'ALL', 'FREE NOW', 'BUSY NOW', 'FREE 1HR+',
  'FD I', 'FD II', 'FD III', 'LTC', 'NAB', 'IPC', 'NEW WORKSHOP',
];

const BUILDING_FILTER_MAP: Record<string, string> = {
  'FD I': 'FD I',
  'FD II': 'FD II',
  'FD III': 'FD III',
  'LTC': 'LTC',
  'NAB': 'NAB',
  'IPC': 'IPC',
  'NEW WORKSHOP': 'New Workshop',
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Snap any current time to the nearest class-hour slot start (08:00 to 17:00)
function snapToHourSlot(): string {
  const now = getCurrentTimeStr();
  const [h] = now.split(':').map(Number);
  if (h < 8) return '08:00';
  if (h >= 18) return '17:00';
  return `${String(h).padStart(2, '0')}:00`;
}

interface Props {
  onNavigate: (path: string) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [statuses, setStatuses] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>(getISTDayName());
  const [selectedTime, setSelectedTime] = useState<string>(snapToHourSlot());
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMap, setActiveMap] = useState<string | null>(null);
  const [liveTime, setLiveTime] = useState(getISTTime());
  const [lastUpdated, setLastUpdated] = useState(0);
  const [todaySchedules, setTodaySchedules] = useState<RoomSchedule[]>([]);

  const todayName = getISTDayName();
  const hourSlot = getCurrentHourSlot();

  // Re-sync day + time to "right now" every time the page is opened/reloaded
  useEffect(() => {
    setSelectedDay(getISTDayName());
    setSelectedTime(snapToHourSlot());
  }, []);

  const fetchData = useCallback(async () => {
    const [{ data: allRooms }, { data: schedules }] = await Promise.all([
      supabase.from('rooms').select('*').order('room_number'),
      supabase.from('room_schedules').select('*').eq('day_of_week', selectedDay),
    ]);
    if (allRooms) {
      const sched = (schedules || []) as RoomSchedule[];
      setRooms(allRooms as Room[]);
      setTodaySchedules(sched);
      setStatuses(
        (allRooms as Room[]).map((r) => computeRoomStatusAtTime(r, sched, selectedTime))
      );
    }
    setLastUpdated(Date.now());
    setLoading(false);
  }, [selectedDay, selectedTime]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const tick = setInterval(() => setLiveTime(getISTTime()), 1000);
    return () => clearInterval(tick);
  }, []);

  const isSunday = todayName === 'Sunday';
  const secondsAgo = lastUpdated > 0 ? Math.floor((Date.now() - lastUpdated) / 1000) : 0;

  const filtered = statuses
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.room.room_number.toLowerCase().includes(q) ||
        s.room.building.toLowerCase().includes(q) ||
        s.room.venue.toLowerCase().includes(q)
      );
    })
    .filter((s) => {
      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'FREE NOW') return !s.isBusy;
      if (activeFilter === 'BUSY NOW') return s.isBusy;
      if (activeFilter === 'FREE 1HR+')
        return !s.isBusy && (s.freeAllDay || (s.freeForMins !== undefined && s.freeForMins >= 60));
      const target = BUILDING_FILTER_MAP[activeFilter];
      return target ? s.room.building === target : true;
    })
    .sort((a, b) => {
      if (!a.isBusy && b.isBusy) return -1;
      if (a.isBusy && !b.isBusy) return 1;
      if (!a.isBusy && !b.isBusy) {
        const af = a.freeAllDay ? Infinity : (a.freeForMins ?? 0);
        const bf = b.freeAllDay ? Infinity : (b.freeForMins ?? 0);
        return bf - af;
      }
      return 0;
    });

  const MAPS = [
    { label: 'FD I Map', id: 'fd1' },
    { label: 'FD II Map', id: 'fd2' },
    { label: 'FD III Map', id: 'fd3' },
    { label: 'LTC Map', id: 'ltc' },
    { label: 'NAB Map', id: 'nab' },
    { label: 'IPC Map', id: 'ipc' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Sticky Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,10,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid #1E1E1E',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
            >
              <Menu size={24} />
            </button>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#FFFFFF',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {liveTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {liveTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </div>
            <div style={{ fontSize: 11, color: hourSlot ? '#7C3AED' : '#444', fontWeight: 600, marginTop: 2 }}>
              {hourSlot ? hourSlot.label : 'Outside class hours'}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '50px 20px 120px' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h1
            style={{
              fontSize: 'clamp(36px,8vw,52px)',
              fontWeight: 900,
              margin: 0,
              background: 'linear-gradient(90deg,#7C3AED,#00FF88,#3B82F6,#FF3B3B)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
            }}
          >
            Which Room Is Free?
          </h1>

          <p style={{ color: '#666', marginTop: 10, fontSize: 14 }}>
            BITS Pilani Real-Time Room Availability
          </p>

          <p style={{ color: '#2A2A2A', marginTop: 6, fontSize: 11, letterSpacing: '0.03em' }}>
            Made with ❤️ by Atulya Gupta
          </p>
        </div>

        {/* Sunday Banner */}
        {isSunday && (
          <div
            style={{
              background: 'rgba(0,255,136,0.06)',
              border: '1px solid rgba(0,255,136,0.15)',
              borderRadius: 16,
              padding: '20px 24px',
              marginBottom: 24,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#00FF88', margin: '0 0 4px' }}>No Classes on Sunday</h2>
            <p style={{ color: '#666', margin: 0 }}>All rooms are free — enjoy your weekend!</p>
          </div>
        )}

        {/* Filter Bar */}
        <div style={{ overflowX: 'auto', marginBottom: 14, paddingBottom: 4, scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 100,
                  cursor: 'pointer',
                  border: activeFilter === f ? 'none' : '1px solid #242424',
                  background: activeFilter === f ? '#7C3AED' : 'transparent',
                  color: activeFilter === f ? '#FFFFFF' : '#777',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'all 0.18s ease',
                  whiteSpace: 'nowrap',
                  minHeight: 40,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Day + Time selectors */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            style={{
              flex: 1,
              background: '#111',
              color: '#FFF',
              border: '1px solid #222',
              borderRadius: 10,
              padding: '10px',
              fontFamily: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <select
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            style={{
              flex: 1,
              background: '#111',
              color: '#FFF',
              border: '1px solid #222',
              borderRadius: 10,
              padding: '10px',
              fontFamily: 'inherit',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <option value="08:00">Hour 1 · 8:00 AM – 9:00 AM</option>
            <option value="09:00">Hour 2 · 9:00 AM – 10:00 AM</option>
            <option value="10:00">Hour 3 · 10:00 AM – 11:00 AM</option>
            <option value="11:00">Hour 4 · 11:00 AM – 12:00 PM</option>
            <option value="12:00">Hour 5 · 12:00 PM – 1:00 PM</option>
            <option value="13:00">Hour 6 · 1:00 PM – 2:00 PM</option>
            <option value="14:00">Hour 7 · 2:00 PM – 3:00 PM</option>
            <option value="15:00">Hour 8 · 3:00 PM – 4:00 PM</option>
            <option value="16:00">Hour 9 · 4:00 PM – 5:00 PM</option>
            <option value="17:00">Hour 10 · 5:00 PM – 6:00 PM</option>
          </select>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 13,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#444',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search by room number or building..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 40px 12px 38px',
              background: '#111',
              border: '1px solid #1E1E1E',
              borderRadius: 12,
              color: '#FFF',
              fontSize: 16,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#7C3AED44';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#1E1E1E';
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#555',
                display: 'flex',
                padding: 4,
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="room-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF', margin: '0 0 8px' }}>No rooms found</h3>
            <p style={{ color: '#555', margin: 0, fontSize: 14 }}>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="room-grid">
            {filtered.map((s) => (
              <RoomCard key={s.room.id} status={s} onClick={() => onNavigate(`/room/${s.room.room_number}`)} />
            ))}
          </div>
        )}
      </main>

      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }}
          />

          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: 280,
              height: '100vh',
              background: '#111',
              borderRight: '1px solid #222',
              zIndex: 999,
              padding: 24,
              overflowY: 'auto',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Menu</h2>

            <p
              style={{
                color: '#888',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 12,
                marginTop: 8,
              }}
            >
              Campus Maps
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {MAPS.map((map) => (
                <button
                  key={map.id}
                  onClick={() => setActiveMap(map.id === activeMap ? null : map.id)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: activeMap === map.id ? '#7C3AED22' : '#1A1A1A',
                    border: `1px solid ${activeMap === map.id ? '#7C3AED' : '#333'}`,
                    borderRadius: 10,
                    color: activeMap === map.id ? '#7C3AED' : '#AAA',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {map.label}
                </button>
              ))}
            </div>

            {activeMap && (
              <div
                style={{
                  background: '#1A1A1A',
                  border: '1px solid #333',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  textAlign: 'center',
                }}
              >
                <p style={{ color: '#555', fontSize: 12, margin: 0 }}>📍 Map image coming soon</p>
                <p style={{ color: '#333', fontSize: 11, margin: '6px 0 0' }}>
                  Upload your map image and I'll add it here
                </p>
              </div>
            )}

            <button
              onClick={() => window.open('https://wa.me/917976194901', '_blank')}
              style={{
                width: '100%',
                padding: 14,
                background: '#25D366',
                border: 'none',
                borderRadius: 12,
                color: '#FFF',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              WhatsApp Feedback
            </button>
          </div>
        </>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #161616', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: '#2A2A2A', fontSize: 12, margin: '0 0 4px' }}>Built for BITS Pilani · Sem 2 2025-26</p>
        {lastUpdated > 0 && (
          <p style={{ color: '#222', fontSize: 11, margin: '0 0 6px' }}>Last updated {secondsAgo}s ago</p>
        )}
        <p style={{ color: '#444', fontSize: 12, margin: 0 }}>Made with ❤️ by Atulya Gupta</p>
      </footer>
    </div>
  );
}

function RoomCard({ status, onClick }: { status: RoomStatus; onClick: () => void }) {
  const { room, isBusy, currentCourse, busyUntil, freeUntil, freeForMins, freeAllDay } = status;
  const color = isBusy ? '#FF3B3B' : '#00FF88';

  const primaryText = isBusy
    ? `Until ${formatTimeStr(busyUntil!)}`
    : freeAllDay
    ? 'Free all day'
    : `Until ${formatTimeStr(freeUntil!)}`;

  const secondaryText =
    isBusy && currentCourse
      ? currentCourse
      : !isBusy && !freeAllDay && freeForMins !== undefined
      ? `Free for ${formatDuration(freeForMins)}`
      : '';

  return (
    <div
      onClick={onClick}
      style={{
        background: '#111111',
        border: `1px solid ${color}2A`,
        borderRadius: 14,
        padding: '10px',
        cursor: 'pointer',
        boxShadow: isBusy ? '0 0 20px rgba(255,59,59,0.06)' : '0 0 20px rgba(0,255,136,0.06)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = isBusy
          ? '0 8px 28px rgba(255,59,59,0.18)'
          : '0 8px 28px rgba(0,255,136,0.15)';
        (e.currentTarget as HTMLDivElement).style.borderColor = `${color}55`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = isBusy
          ? '0 0 20px rgba(255,59,59,0.06)'
          : '0 0 20px rgba(0,255,136,0.06)';
        (e.currentTarget as HTMLDivElement).style.borderColor = `${color}2A`;
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
          {room.room_number}
        </span>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 100,
            background: `${color}14`,
            color,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            border: `1px solid ${color}33`,
          }}
        >
          {isBusy ? 'BUSY' : 'FREE'}
        </span>
      </div>
      <p style={{ color: '#444', fontSize: 10, margin: '0 0 8px', fontWeight: 500 }}>
        {room.building}
        {room.floor ? ` · ${room.floor} Floor` : ''}
      </p>
      <p style={{ color, fontSize: 12, fontWeight: 700, margin: 0 }}>{primaryText}</p>

      {secondaryText && <p style={{ color: '#555', fontSize: 12, margin: '3px 0 0' }}>{secondaryText}</p>}
    </div>
  );
}
