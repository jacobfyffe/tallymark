import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import { apiClient, type CurrentUser } from './lib/api';
import { ChartView } from './components/ChartView';
import { AdminView } from './components/AdminView';
import { ArtistPage } from './components/ArtistPage';
import { SongPage } from './components/SongPage';
import { SearchBar } from './components/SearchBar';
import { SearchPage } from './components/SearchPage';
import { LoginPage } from './components/LoginPage';
import './styles/app.css';

type AuthStatus = 'loading' | 'logged-in' | 'logged-out';

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiClient
      .me()
      .then((me) => {
        setUser(me);
        setAuthStatus('logged-in');
      })
      .catch(() => {
        setAuthStatus('logged-out');
      });
  }, []);

  // Show nothing while checking auth — avoids a flash of the login page
  // before the session cookie is verified.
  if (authStatus === 'loading') {
    return null;
  }

  if (authStatus === 'logged-out') {
    return <LoginPage />;
  }

  return <Shell user={user!} onLogout={() => { setUser(null); setAuthStatus('logged-out'); }} />;
}

function Shell({ user, onLogout }: { user: CurrentUser; onLogout: () => void }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await apiClient.logout();
    onLogout();
    navigate('/');
  }

  function tabClass({ isActive }: { isActive: boolean }): string {
    return `tab${isActive ? ' active' : ''}`;
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="tallymark-glyph" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span className="slash" />
          </span>
          <h1>
            Tally<span className="mark">mark</span>
          </h1>
        </div>
        <div className="masthead-row">
          <div className="tagline">A running tally of what you play</div>
          <button type="button" className="logout-btn" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/" end className={tabClass}>
          Global
        </NavLink>
        <NavLink to="/personal" className={tabClass}>
          Personal
        </NavLink>
        <NavLink to="/admin" className={tabClass}>
          Admin
        </NavLink>
      </nav>

      <SearchBar />

      <Routes>
        <Route path="/" element={<ChartView scope={{ kind: 'global' }} />} />
        <Route
          path="/personal"
          element={<ChartView scope={{ kind: 'personal', userId: user.userId }} />}
        />
        <Route path="/admin" element={<AdminView />} />
        <Route path="/artist/:id" element={<ArtistPage personalUserId={user.userId} />} />
        <Route path="/song/:id" element={<SongPage personalUserId={user.userId} />} />
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </div>
  );
}
