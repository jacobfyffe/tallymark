import { NavLink, Routes, Route } from 'react-router-dom';
import { ChartView } from './components/ChartView';
import { AdminView } from './components/AdminView';
import { ArtistPage } from './components/ArtistPage';
import { SongPage } from './components/SongPage';
import { SearchBar } from './components/SearchBar';
import { SearchPage } from './components/SearchPage';
import './styles/app.css';

// One user today; personal uses user #1. Becomes a real selection with auth.
const PERSONAL_USER_ID = '1';

function tabClass({ isActive }: { isActive: boolean }): string {
  return `tab${isActive ? ' active' : ''}`;
}

export function App() {
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
        <div className="tagline">A running tally of what you play</div>
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
          element={<ChartView scope={{ kind: 'personal', userId: PERSONAL_USER_ID }} />}
        />
        <Route path="/admin" element={<AdminView />} />
        <Route path="/artist/:id" element={<ArtistPage personalUserId={PERSONAL_USER_ID} />} />
        <Route path="/song/:id" element={<SongPage personalUserId={PERSONAL_USER_ID} />} />
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </div>
  );
}
