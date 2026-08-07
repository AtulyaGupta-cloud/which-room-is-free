import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, TrendingUp, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getUsageDeviceId, isUsageExcluded, setUsageExcluded } from '../lib/usageTracking';

interface UsageStats {
  activityDate: string;
  uniqueVisitors: number;
  peakConcurrent: number;
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [deviceExcluded, setDeviceExcludedState] = useState(isUsageExcluded);

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

        <p className="admin-privacy-note">
          Counts reset at midnight IST. Anonymous device identifiers are hashed; no names, emails, phone numbers or locations are collected.
        </p>
        <a href="/">Open the public app →</a>
      </section>
    </main>
  );
}
