import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Search, X, Menu, LocateFixed, MapPin, Heart, ChevronDown, Star } from 'lucide-react';
import { supabase, Room, RoomSchedule } from '../lib/supabase';
import {
  Coordinates,
  formatApproximateDistance,
  formatWalkingDistance,
  getBuildingCoordinates,
  getDistanceInMeters,
} from '../lib/distance';
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
const FAVORITES_KEY = 'which-room-is-free:favorites';

function getStoredFavorites(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

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

type LocationStatus = 'idle' | 'requesting' | 'ready' | 'error';

interface WalkingRoute {
  distanceMeters: number;
  durationSeconds: number;
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
  const [savedRoomsOpen, setSavedRoomsOpen] = useState(false);
  const [liveTime, setLiveTime] = useState(getISTTime());
  const [lastUpdated, setLastUpdated] = useState(0);
  const [todaySchedules, setTodaySchedules] = useState<RoomSchedule[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
const [isInstallable, setIsInstallable] = useState(false);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationError, setLocationError] = useState('');
  const [walkingRoutes, setWalkingRoutes] = useState<Record<string, WalkingRoute>>({});
  const [favoriteRooms, setFavoriteRooms] = useState<string[]>(getStoredFavorites);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');

useEffect(() => {
  const handler = (e: any) => {
    e.preventDefault();
    setInstallPrompt(e);
    setIsInstallable(true);
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}, []);

const handleInstall = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') {
    setInstallPrompt(null);
    setIsInstallable(false);
  }
};

  const fetchWalkingRoutes = async (location: Coordinates) => {
    const { data, error } = await supabase.functions.invoke('walking-distances', {
      body: location,
    });

    if (error || !data?.routes) {
      setWalkingRoutes({});
      setLocationError('Walking routes are unavailable, so approximate distance is shown.');
    } else {
      setWalkingRoutes(data.routes as Record<string, WalkingRoute>);
      setLocationError('');
    }
    setLocationStatus('ready');
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Location is not supported on this device.');
      return;
    }

    setLocationStatus('requesting');
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationAccuracy(position.coords.accuracy);
        void fetchWalkingRoutes({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        setLocationStatus('error');
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Enable it in browser settings to see distances.'
            : 'Could not get your location. Please try again outdoors or near a window.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const todayName = getISTDayName();
  const hourSlot = getCurrentHourSlot();

  const toggleFavorite = (roomNumber: string) => {
    setFavoriteRooms((current) => {
      const next = current.includes(roomNumber)
        ? current.filter((number) => number !== roomNumber)
        : [...current, roomNumber];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openFeedback = () => {
    setMenuOpen(false);
    setFeedbackOpen(true);
  };

  const submitFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = feedbackText.trim();
    if (feedbackRating < 1 || message.length < 3) return;

    const stars = `${'★'.repeat(feedbackRating)}${'☆'.repeat(5 - feedbackRating)}`;
    const whatsappMessage = `Feedback for Which Room Is Free\n\nRating: ${stars} (${feedbackRating}/5)\n\n${message}`;
    window.open(
      `https://wa.me/917976194901?text=${encodeURIComponent(whatsappMessage)}`,
      '_blank',
      'noopener,noreferrer'
    );

    setFeedbackRating(0);
    setFeedbackText('');
    setFeedbackOpen(false);
  };

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

  const showClockTower = ['ALL', 'FREE NOW', 'BUSY NOW', 'FREE 1HR+'].includes(activeFilter);

  return (
    <div className="home-page digital-theme" style={{ minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Sticky Header */}
      <header
        className="app-header"
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
          className="app-header-row"
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
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

  {isInstallable && (
    <button
      onClick={handleInstall}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 100,
        border: '1px solid #7C3AED',
        background: 'rgba(124,58,237,0.12)',
        color: '#7C3AED',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = '#7C3AED';
        (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,58,237,0.12)';
        (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED';
      }}
    >
      ⬇ Install App
    </button>
  )}
</div>          <div className="live-clock" style={{ textAlign: 'right' }}>
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

      <main className="home-main" style={{ maxWidth: 1200, margin: '0 auto', padding: '50px 20px 120px' }}>
        <div
          className={`landing-hero${showClockTower || activeFilter === 'NAB' ? ' has-visual' : ''}`}
          style={{ textAlign: 'center', marginBottom: 30 }}
        >
          <div
            className={`hero-visual hero-visual-clock${showClockTower ? ' is-active' : ''}`}
            aria-hidden="true"
          />
          <div
            className={`hero-visual hero-visual-nab${activeFilter === 'NAB' ? ' is-active' : ''}`}
            aria-hidden="true"
          />
          <h1
            className="hero-title"
            aria-label="Which Room Is Free?"
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
            <span className="hero-title-word word-which">Which</span>{' '}
            <span className="hero-title-word word-room">Room</span>{' '}
            <span className="hero-title-word word-is">Is</span>{' '}
            <span className="hero-title-word word-free">Free?</span>
          </h1>

          <p className="hero-subtitle" style={{ color: '#666', marginTop: 10, fontSize: 14 }}>
            <span>BITS Pilani</span>
            <strong>Real-Time Room Availability</strong>
          </p>

          <p className="credit-line" style={{ marginTop: 8 }}>
            <span>Made by</span>
            <strong>Atulya Gupta</strong>
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
        <div className="filter-scroll" style={{ overflowX: 'auto', marginBottom: 14, paddingBottom: 4, scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`filter-chip${activeFilter === f ? ' is-active' : ''}`}
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
        <div className="time-selectors" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
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
              minWidth: 0,
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

        <div className="distance-control">
          <div>
            <p className="distance-control-title">
              <LocateFixed size={14} />
              {locationStatus === 'ready' ? 'Distance from you is on' : 'See distance from you'}
            </p>
            <p className={locationStatus === 'error' ? 'distance-error' : 'distance-note'}>
              {locationStatus === 'ready'
                ? `${Object.keys(walkingRoutes).length > 0 ? 'Walking route' : 'Approximate distance'}${locationAccuracy ? ` · GPS ±${Math.round(locationAccuracy)} m` : ''}${locationError ? ` · ${locationError}` : ''}`
                : locationError || 'Your location stays on this device and is never stored.'}
            </p>
          </div>
          <button
            type="button"
            onClick={requestLocation}
            disabled={locationStatus === 'requesting'}
            className="distance-button"
          >
            {locationStatus === 'requesting' ? 'Locating…' : locationStatus === 'ready' ? 'Refresh' : 'Enable'}
          </button>
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
            {filtered.map((s) => {
              const buildingLocation = getBuildingCoordinates(s.room.building);
              const walkingRoute = walkingRoutes[s.room.building];
              const distance = walkingRoute?.distanceMeters ?? (userLocation && buildingLocation
                ? getDistanceInMeters(userLocation, buildingLocation)
                : null);

              return (
                <RoomCard
                  key={s.room.id}
                  status={s}
                  distance={distance}
                  walkingDuration={walkingRoute?.durationSeconds ?? null}
                  isFavorite={favoriteRooms.includes(s.room.room_number)}
                  onToggleFavorite={() => toggleFavorite(s.room.room_number)}
                  onClick={() => onNavigate(`/room/${s.room.room_number}`)}
                />
              );
            })}
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
            className="side-menu"
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

            <button
              type="button"
              className="saved-rooms-toggle"
              aria-expanded={savedRoomsOpen}
              aria-controls="saved-rooms-menu"
              onClick={() => setSavedRoomsOpen((open) => !open)}
            >
              <span>Saved Rooms</span>
              <span className="saved-rooms-toggle-meta">
                {favoriteRooms.length}
                <ChevronDown size={15} aria-hidden="true" />
              </span>
            </button>
            {savedRoomsOpen && (favoriteRooms.length === 0 ? (
              <p id="saved-rooms-menu" className="saved-rooms-empty">Tap the heart on a room to save it here.</p>
            ) : (
              <div id="saved-rooms-menu" className="saved-rooms-list">
                {favoriteRooms.map((roomNumber) => {
                  const savedStatus = statuses.find((item) => item.room.room_number === roomNumber);
                  const savedColor = savedStatus?.isBusy ? '#FF3B3B' : '#00FF88';
                  return (
                    <button
                      type="button"
                      key={roomNumber}
                      className="saved-room-button"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate(`/room/${roomNumber}`);
                      }}
                    >
                      <span>
                        <strong>{roomNumber}</strong>
                        <small>{savedStatus?.room.building ?? 'Saved room'}</small>
                      </span>
                      <span style={{ color: savedColor }}>
                        {savedStatus ? (savedStatus.isBusy ? 'BUSY' : 'FREE') : 'OPEN'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}

            <button
              type="button"
              className="feedback-menu-button"
              onClick={openFeedback}
            >
              Give Feedback
            </button>
          </div>
        </>
      )}

      {feedbackOpen && (
        <div className="feedback-modal-layer" role="presentation">
          <button
            type="button"
            className="feedback-modal-backdrop"
            aria-label="Close feedback"
            onClick={() => setFeedbackOpen(false)}
          />
          <section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <button
              type="button"
              className="feedback-modal-close"
              aria-label="Close feedback"
              onClick={() => setFeedbackOpen(false)}
            >
              <X size={18} />
            </button>

            <form onSubmit={submitFeedback}>
                <h2 id="feedback-title">Share feedback</h2>
                <p className="feedback-intro">Help make Which Room Is Free better.</p>

                <fieldset className="feedback-rating">
                  <legend>How would you rate the app?</legend>
                  <div>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        type="button"
                        key={rating}
                        className={rating <= feedbackRating ? 'is-selected' : ''}
                        aria-label={`${rating} star${rating === 1 ? '' : 's'}`}
                        aria-pressed={rating === feedbackRating}
                        onClick={() => setFeedbackRating(rating)}
                      >
                        <Star size={28} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="feedback-message-label" htmlFor="feedback-message">Write your feedback</label>
                <textarea
                  id="feedback-message"
                  value={feedbackText}
                  maxLength={1000}
                  rows={5}
                  placeholder="Tell us what worked or what could be better…"
                  onChange={(event) => setFeedbackText(event.target.value)}
                />
                <div className="feedback-form-meta">
                  <span>WhatsApp will open; your profile or number may be visible when you send.</span>
                  <span>{feedbackText.length}/1000</span>
                </div>

                <button
                  type="submit"
                  className="feedback-submit"
                  disabled={feedbackRating < 1 || feedbackText.trim().length < 3}
                >
                  Continue to WhatsApp
                </button>
              </form>
          </section>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #161616', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: '#2A2A2A', fontSize: 12, margin: '0 0 4px' }}>Built for BITS Pilani · Sem 2 2025-26</p>
        {lastUpdated > 0 && (
          <p style={{ color: '#222', fontSize: 11, margin: '0 0 6px' }}>Last updated {secondsAgo}s ago</p>
        )}
        <p className="credit-line" style={{ margin: 0 }}>Made by Atulya Gupta</p>
      </footer>
    </div>
  );
}

function RoomCard({ status, distance, walkingDuration, isFavorite, onToggleFavorite, onClick }: { status: RoomStatus; distance: number | null; walkingDuration: number | null; isFavorite: boolean; onToggleFavorite: () => void; onClick: () => void }) {
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
      className={`room-card ${isBusy ? 'is-busy' : 'is-free'}`}
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
      <div className="room-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4, marginBottom: 6 }}>
        <div className="room-card-identity" style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <span className="room-number" style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.5px' }}>
            {room.room_number}
          </span>
          <button
            type="button"
            className={`favorite-button${isFavorite ? ' is-favorite' : ''}`}
            aria-label={isFavorite ? `Remove room ${room.room_number} from saved rooms` : `Save room ${room.room_number}`}
            title={isFavorite ? 'Remove saved room' : 'Save room'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
          >
            <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <span
          className="room-status-badge"
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
      <p className="room-building" style={{ color: '#444', fontSize: 10, margin: '0 0 8px', fontWeight: 500 }}>
        {room.building}
        {room.floor ? ` · ${room.floor} Floor` : ''}
      </p>
      <p className="room-primary-status" style={{ color, fontSize: 12, fontWeight: 700, margin: 0 }}>{primaryText}</p>

      {distance !== null && (
        <p className="room-distance">
          <MapPin size={11} aria-hidden="true" />
          {walkingDuration !== null
            ? `${formatWalkingDistance(distance)} · ${Math.max(1, Math.round(walkingDuration / 60))} min walk`
            : `${formatApproximateDistance(distance)} away`}
        </p>
      )}

      {secondaryText && <p className="room-secondary-status" style={{ color: '#555', fontSize: 12, margin: '3px 0 0' }}>{secondaryText}</p>}
    </div>
  );
}
