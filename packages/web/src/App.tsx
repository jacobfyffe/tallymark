import { useState } from 'react';
import { ChartView } from './components/ChartView';
import { AdminView } from './components/AdminView';
import './styles/app.css';

type Tab = 'global' | 'personal' | 'admin';

// With a single user today, the personal chart uses user #1. When auth/multiple
// users arrive, this becomes a real selection.
const PERSONAL_USER_ID = '1';

export function App() {
  const [tab, setTab] = useState<Tab>('global');

  return (
    <div className="shell">
      <header className="masthead">
        <h1>
          <span className="the">The</span> Chart
        </h1>
        <div className="tagline">Your week in music · ranked</div>
      </header>

      <nav className="tabs">
        <button className={`tab${tab === 'global' ? ' active' : ''}`} onClick={() => setTab('global')}>
          Global
        </button>
        <button className={`tab${tab === 'personal' ? ' active' : ''}`} onClick={() => setTab('personal')}>
          Personal
        </button>
        <button className={`tab${tab === 'admin' ? ' active' : ''}`} onClick={() => setTab('admin')}>
          Admin
        </button>
      </nav>

      {tab === 'global' && <ChartView scope={{ kind: 'global' }} />}
      {tab === 'personal' && <ChartView scope={{ kind: 'personal', userId: PERSONAL_USER_ID }} />}
      {tab === 'admin' && <AdminView />}
    </div>
  );
}
