import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BellRing, CalendarCheck, Download, LogOut, Send, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getUsageDeviceId, isUsageExcluded, setUsageExcluded } from '../lib/usageTracking';

interface UsageStats {
  activityDate: string;
  uniqueVisitors: number;
  peakConcurrent: number;
  installedDevices: number;
  notificationSubscribers: number;
  timetableImporters: number;
  history: Array<{
    activityDate: string;
    uniqueVisitors: number;
    peakConcurrent: number;
  }>;
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [deviceExcluded, setDeviceExcludedState] = useState(isUsageExcluded);
  const [notificationTitle, setNotificationTitle] = useState('Which Room Is Free?');
  const [notificationBody, setNotificationBody] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [notificationResult, setNotificationResult] = useState('');

  const isAdmin = session?.user.app_metadata?.role === 'admin';

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const loadStats = async () => {
      const { data, error } = await supabase.functions.invoke('usage-stats');
      if (error || !data) {
        setStatsError('Could not load usage statistics. Please try again.');
        return;
      }
      setStats(data as UsageStats);
      setStatsError('');
    };

    void loadStats();
    const interval = window.setInterval(() => void loadStats(), 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isAdmin]);

  const toggleDeviceExclusion = async () => {
    const next = !deviceExcluded;
    setUsageExcluded(next);
    setDeviceExcludedState(next);

    if (next) {
      await supabase.functions.invoke('track-usage', {
        body: { deviceId: getUsageDeviceId(), exclude: true },
      });
      const { data } = await supabase.functions.invoke('usage-stats');
      if (data) setStats(data as UsageStats);
    }
  };

  const requestSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('Sending your private sign-in link…');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setMessage(error ? error.message : 'Check your email and open the sign-in link on this device.');
  };

  const sendNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm(`Send this notification to ${stats?.notificationSubscribers ?? 0} subscribed devices?`)) return;
    setSendingNotification(true);
    setNotificationResult('Sending…');
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { title: notificationTitle.trim(), message: notificationBody.trim(), url: '/' },
    });
    if (error || !data?.ok) {
      setNotificationResult('Could not send the notification. Please try again.');
    } else {
      setNotificationResult(`Sent to ${data.sent} device${data.sent === 1 ? '' : 's'}${data.failed ? ` · ${data.failed} failed` : ''}.`);
      setNotificationBody('');
    }
    setSendingNotification(false);
  };

  if (!authReady) {
    return <main className="admin-page"><p className="admin-loading">Checking access…</p></main>;
  }

  if (!session) {
    return (
      <main className="admin-page">
        <section className="admin-login-card">
          <p className="admin-kicker">Private owner dashboard</p>
          <h1>App usage</h1>
          <p>Sign in using your approved admin email. No password is required.</p>
          <form onSubmit={requestSignIn}>
            <label htmlFor="admin-email">Email address</label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button type="submit">Email me a sign-in link</button>
          </form>
          {message && <p className="admin-message">{message}</p>}
          <a href="/">← Return to the app</a>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <section className="admin-login-card">
          <p className="admin-kicker">Private owner dashboard</p>
          <h1>Access not approved</h1>
          <p>This signed-in account does not have the administrator role.</p>
          <button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-dashboard">
        <header>
          <div>
            <p className="admin-kicker">Which Room Is Free?</p>
            <h1>Today&apos;s activity</h1>
          </div>
          <button type="button" onClick={() => void supabase.auth.signOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </header>

        <div className="admin-stats-grid">
          <div className="admin-live-card">
            <span className="admin-live-icon"><Users size={22} /></span>
            <div>
              <p>Users today</p>
              <strong>{stats ? stats.uniqueVisitors : '—'}</strong>
              <small>Unique anonymous devices</small>
            </div>
          </div>
          <div className="admin-live-card admin-peak-card">
            <span className="admin-live-icon"><TrendingUp size={22} /></span>
            <div>
              <p>Maximum online today</p>
              <strong>{stats ? stats.peakConcurrent : '—'}</strong>
              <small>Highest simultaneous usage</small>
            </div>
          </div>
          <div className="admin-live-card admin-install-card">
            <span className="admin-live-icon"><Download size={22} /></span>
            <div>
              <p>Installed devices</p>
              <strong>{stats ? stats.installedDevices : '—'}</strong>
              <small>Observed Home Screen/PWA launches</small>
            </div>
          </div>
          <div className="admin-live-card admin-notification-card">
            <span className="admin-live-icon"><BellRing size={22} /></span>
            <div>
              <p>Notifications enabled</p>
              <strong>{stats ? stats.notificationSubscribers : '—'}</strong>
              <small>Currently subscribed devices</small>
            </div>
          </div>
          <div className="admin-live-card admin-timetable-card">
            <span className="admin-live-icon"><CalendarCheck size={22} /></span>
            <div>
              <p>Timetables imported</p>
              <strong>{stats ? stats.timetableImporters : '—'}</strong>
              <small>Unique devices that saved My Classes</small>
            </div>
          </div>
        </div>

        {statsError && <p className="admin-error">{statsError}</p>}

        <div className="admin-device-control">
          <div>
            <strong>Exclude this device</strong>
            <small>{deviceExcluded ? 'This phone/browser is not counted.' : 'This phone/browser currently counts like a visitor.'}</small>
          </div>
          <button
            type="button"
            className={deviceExcluded ? 'is-excluded' : ''}
            aria-pressed={deviceExcluded}
            onClick={() => void toggleDeviceExclusion()}
          >
            {deviceExcluded ? 'Excluded' : 'Exclude'}
          </button>
        </div>

        <section className="admin-notification-composer">
          <div>
            <p className="admin-kicker">Push announcement</p>
            <h2>Notify subscribed students</h2>
            <p>It will appear like a normal phone notification. A confirmation is required before sending.</p>
          </div>
          <form onSubmit={sendNotification}>
            <label htmlFor="notification-title">Title</label>
            <input id="notification-title" value={notificationTitle} maxLength={80} required onChange={(event) => setNotificationTitle(event.target.value)} />
            <label htmlFor="notification-body">Message</label>
            <textarea id="notification-body" value={notificationBody} maxLength={240} required rows={4} placeholder="Example: The timetable has been updated with the latest AUGSD changes." onChange={(event) => setNotificationBody(event.target.value)} />
            <div className="admin-composer-footer">
              <span>{notificationBody.length}/240</span>
              <button type="submit" disabled={sendingNotification || !notificationBody.trim()}><Send size={15} /> {sendingNotification ? 'Sending…' : 'Send notification'}</button>
            </div>
          </form>
          {notificationResult && <p className="admin-message">{notificationResult}</p>}
        </section>

        <section className="admin-history">
          <div className="admin-history-heading">
            <div>
              <p className="admin-kicker">Stored securely in Supabase</p>
              <h2>Daily history</h2>
            </div>
            <span>Last 30 days</span>
          </div>
          {stats?.history?.length ? (
            <div className="admin-history-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Users</th>
                    <th>Peak online</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.history.map((day) => (
                    <tr key={day.activityDate}>
                      <td>{new Date(`${day.activityDate}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>{day.uniqueVisitors}</td>
                      <td>{day.peakConcurrent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-history-empty">Daily records will appear here after the first tracked visit.</p>
          )}
        </section>

        <p className="admin-privacy-note">
          Daily usage counts reset at midnight IST. Install, notification and timetable-import totals are cumulative. Anonymous device identifiers are hashed; no timetable images, class details, names, emails, phone numbers or locations are collected in analytics.
        </p>
        <a href="/">Open the public app →</a>
      </section>
    </main>
  );
}
