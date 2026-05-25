import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

import { AuthProvider, useAuth } from './AuthContext.jsx';
import LoginPage          from './LoginPage.jsx';
import LandingPage        from './LandingPage.jsx';
import App                from './App.jsx';
import SubscriptionPanel  from './SubscriptionPanel.jsx';

// ── Mobile bottom nav + menu sheet ────────────────────────────────────────────
function MobileNav({ currentApp, setCurrentApp }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() { setMenuOpen(false); }

  function goTo(app) {
    setCurrentApp(app);
    closeMenu();
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="mobile-nav">
        <button
          className={`mobile-nav__item${!currentApp ? ' mobile-nav__item--active' : ''}`}
          onClick={() => goTo(null)}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-house" /></span>
          <span className="mobile-nav__label">Home</span>
        </button>

        <button
          className={`mobile-nav__item${currentApp === 'coffee' ? ' mobile-nav__item--active' : ''}`}
          onClick={() => goTo('coffee')}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-mug-hot" /></span>
          <span className="mobile-nav__label">Coffee</span>
        </button>

        <button
          className={`mobile-nav__item${currentApp === 'subs' ? ' mobile-nav__item--active' : ''}`}
          onClick={() => goTo('subs')}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-layer-group" /></span>
          <span className="mobile-nav__label">Subs</span>
        </button>

        <button
          className={`mobile-nav__item${menuOpen ? ' mobile-nav__item--active' : ''}`}
          onClick={() => setMenuOpen(p => !p)}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-bars" /></span>
          <span className="mobile-nav__label">Menu</span>
        </button>
      </nav>

      {/* Menu bottom sheet */}
      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMenu}>
          <div className="mobile-menu" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu__handle" />

            <div className="mobile-menu__account">
              <div className="mobile-menu__avatar">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="mobile-menu__email">{user?.email}</div>
                <div className="mobile-menu__org">Butler Society, S.L.</div>
              </div>
            </div>

            <div className="mobile-menu__divider" />

            <button className="mobile-menu__item" onClick={() => { goTo(null); }}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-house" /></span>
              <span>Butler Society Hub</span>
            </button>
            <button className="mobile-menu__item" onClick={() => { goTo('coffee'); }}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-mug-hot" /></span>
              <span>Butler Coffee</span>
            </button>
            <button className="mobile-menu__item" onClick={() => { goTo('subs'); }}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-layer-group" /></span>
              <span>Subscriptions</span>
            </button>

            <div className="mobile-menu__divider" />

            <button className="mobile-menu__item mobile-menu__item--danger" onClick={logout}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-right-from-bracket" /></span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Top-level router ──────────────────────────────────────────────────────────
function Root() {
  const { user } = useAuth();
  const [currentApp, setCurrentApp] = useState(null);

  if (user === undefined) {
    return (
      <div className="loading-overlay" style={{ display: 'flex' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const backToHub = () => setCurrentApp(null);

  return (
    <>
      {currentApp === 'coffee'
        ? <App onBackToHub={backToHub} />
        : currentApp === 'subs'
        ? <SubscriptionPanel onBackToHub={backToHub} />
        : <LandingPage onEnterApp={setCurrentApp} />
      }
      <MobileNav currentApp={currentApp} setCurrentApp={setCurrentApp} />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
