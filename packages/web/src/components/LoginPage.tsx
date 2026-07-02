/**
 * The login page — shown whenever there's no active session.
 * One action: connect via Spotify. This kicks off the OAuth flow through
 * the Vite proxy → web-server → Spotify → callback → home.
 */
export function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand login-brand">
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

        <p className="login-tagline">
          A running tally of what you play — your personal Billboard, built from your listening history.
        </p>

        <a href="/connect/spotify" className="btn btn-spotify">
          Connect with Spotify
        </a>

        <p className="login-note">
          Tallymark reads your recently played tracks to build your chart.
          It never modifies your Spotify library or shares your data.
        </p>
      </div>
    </div>
  );
}
