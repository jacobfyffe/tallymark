import { useState } from 'react';
import { ChartView } from './components/ChartView';
import { AdminView } from './components/AdminView';
import './styles/app.css';

type Tab = 'global' | 'personal' | 'admin';

// One user today; personal uses user #1. Becomes a real selection with auth.
const PERSONAL_USER_ID = '1';

export function App() {
  const [tab, setTab] = useState<Tab>('global');

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
