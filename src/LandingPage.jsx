import { useAuth } from './AuthContext';

// App definitions — add new ones here when you create them
const APPS = [
  {
    id:       'coffee',
    icon:     'fa-mug-hot',
    name:     'Butler Coffee',
    desc:     'Coffee catalog, label generator, subscription management',
    status:   'active',
  },
  {
    id:       'appdev',
    icon:     'fa-code',
    name:     'App Development',
    desc:     'Internal tools and custom app projects',
    status:   'soon',
  },
];

export default function LandingPage({ onEnterApp }) {
  const { user, logout } = useAuth();

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-header__brand">
          <img src="/butler-logo.png" alt="Butler Society"
            className="landing-header__logo"
            onError={e => e.currentTarget.style.display = 'none'} />
          <div>
            <div className="landing-header__name">Butler Society</div>
            <div className="landing-header__sub">S.L. — Admin Portal</div>
          </div>
        </div>
        <div className="landing-header__right">
          <span className="landing-user">{user?.email}</span>
          <button className="btn btn--ghost btn--sm" onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* App grid */}
      <main className="landing-main">
        <div className="landing-welcome">
          <h1 className="landing-welcome__title">Welcome back</h1>
          <p className="landing-welcome__sub">Select a tool to get started.</p>
        </div>

        <div className="app-grid">
          {APPS.map(app => (
            <div
              key={app.id}
              className={`app-card${app.status === 'soon' ? ' app-card--soon' : ''}`}
              onClick={() => app.status === 'active' && onEnterApp(app.id)}
              title={app.status === 'soon' ? 'Coming soon' : undefined}
            >
              <div className="app-card__icon"><i className={`fa-solid ${app.icon}`} /></div>
              <div className="app-card__body">
                <div className="app-card__name">{app.name}</div>
                <div className="app-card__desc">{app.desc}</div>
              </div>
              {app.status === 'active'
                ? <div className="app-card__arrow"><i className="fa-solid fa-arrow-right" /></div>
                : <div className="app-card__badge">Soon</div>
              }
            </div>
          ))}
        </div>
      </main>

      <footer className="landing-footer">
        Butler Society, S.L. — Internal use only
      </footer>
    </div>
  );
}
