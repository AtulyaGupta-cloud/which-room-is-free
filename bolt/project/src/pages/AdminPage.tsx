import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Activity, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [presenceReady, setPresenceReady] = useState(false);

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

    const channel = supabase.channel('which-room-is-free-online');
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const connectedVisitors = Object.values(state).reduce(
          (total, connections) => total + connections.length,
          0
        );
        setOnlineCount(connectedVisitors);
        setPresenceReady(true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setPresenceReady(true);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin]);

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
          <h1>Live app activity</h1>
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
            <h1>Live activity</h1>
          </div>
          <button type="button" onClick={() => void supabase.auth.signOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </header>

        <div className="admin-live-card">
          <span className="admin-live-icon"><Activity size={22} /></span>
          <div>
            <p>Students online now</p>
            <strong>{presenceReady ? onlineCount : '—'}</strong>
            <small>{presenceReady ? 'Updates automatically' : 'Connecting to live presence…'}</small>
          </div>
        </div>

        <p className="admin-privacy-note">
          This is an anonymous count of connected app sessions. No names, emails, phone numbers or locations are collected.
        </p>
        <a href="/">Open the public app →</a>
      </section>
    </main>
  );
}
