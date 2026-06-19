import { useState, useEffect, useCallback } from 'react';
import HomePage from './pages/HomePage';
import RoomDetailPage from './pages/RoomDetailPage';
import { supabase, Room, RoomSchedule } from './lib/supabase';

function parsePath() {
  const path = window.location.pathname;
  if (path.startsWith('/room/')) return { page: 'room' as const, roomNumber: decodeURIComponent(path.slice(6)) };
  return { page: 'home' as const, roomNumber: '' };
}

export default function App() {
  const [route, setRoute] = useState(parsePath);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [allSchedules, setAllSchedules] = useState<RoomSchedule[]>([]);

  const preload = useCallback(async () => {
    const [{ data: rooms }, { data: schedules }] = await Promise.all([
      supabase.from('rooms').select('*').order('room_number'),
      supabase.from('room_schedules').select('*'),
    ]);
    if (rooms) setAllRooms(rooms as Room[]);
    if (schedules) setAllSchedules(schedules as RoomSchedule[]);
  }, []);

  useEffect(() => {
    preload();
  }, [preload]);

  useEffect(() => {
    const handlePop = () => setRoute(parsePath());
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parsePath());
    window.scrollTo({ top: 0 });
  };

  if (route.page === 'room') {
    return (
      <RoomDetailPage
        roomNumber={route.roomNumber}
        onNavigate={navigate}
        allRooms={allRooms}
        allSchedules={allSchedules}
      />
    );
  }

  return <HomePage onNavigate={navigate} />;
}
