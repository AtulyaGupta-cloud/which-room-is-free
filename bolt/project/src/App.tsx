import { useState, useEffect, useCallback } from 'react';
import HomePage from './pages/HomePage';
import RoomDetailPage from './pages/RoomDetailPage';
import AdminPage from './pages/AdminPage';
import { supabase, Room } from './lib/supabase';
import { getUsageDeviceId, isUsageExcluded } from './lib/usageTracking';

function parsePath() {
  const path = window.location.pathname;
  if (path === '/admin' || path === '/admin/') return { page: 'admin' as const, roomNumber: '' };
  if (path.startsWith('/room/')) return { page: 'room' as const, roomNumber: decodeURIComponent(path.slice(6)) };
  return { page: 'home' as const, roomNumber: '' };
}

export default function App() {
  const [route, setRoute] = useState(parsePath);
  const [allRooms, setAllRooms] = useState<Room[]>([]);

  const preload = useCallback(async () => {
    const { data: rooms } = await supabase.from('rooms').select('*').order('room_number');
    if (rooms) setAllRooms(rooms as Room[]);
  }, []);

  useEffect(() => {
    preload();
  }, [preload]);

  const isAdminRoute = route.page === 'admin';

  useEffect(() => {
    if (isAdminRoute) return;

    const recordUsage = () => {
      if (document.visibilityState === 'hidden' || isUsageExcluded()) return;
      void supabase.functions.invoke('track-usage', {
        body: { deviceId: getUsageDeviceId() },
      });
    };

    recordUsage();
    const interval = window.setInterval(recordUsage, 60_000);
    document.addEventListener('visibilitychange', recordUsage);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', recordUsage);
    };
  }, [isAdminRoute]);

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

  if (route.page === 'admin') return <AdminPage />;

  if (route.page === 'room') {
    return (
      <RoomDetailPage
        roomNumber={route.roomNumber}
        onNavigate={navigate}
        allRooms={allRooms}
      />
    );
  }

  return <HomePage onNavigate={navigate} />;
}
