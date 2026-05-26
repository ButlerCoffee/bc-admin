import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './styles.css';

import { AuthProvider, useAuth } from './AuthContext.jsx';
import LoginPage          from './LoginPage.jsx';
import LandingPage        from './LandingPage.jsx';
import App                from './App.jsx';
import {
  CoffeeList, CoffeeView, CoffeeForm, HomePanel,
} from './App.jsx';
import MachinesPanel      from './MachinesPanel.jsx';
import SubscriptionPanel  from './SubscriptionPanel.jsx';
import LabelsPanel        from './LabelsPanel.jsx';
import BlogIndex          from './pages/BlogIndex.jsx';
import BlogPost           from './pages/BlogPost.jsx';
import { CoffeeProvider } from './CoffeeContext.jsx';

// ── Auth guard — redirects to login if not authenticated ──────────────────────
function RequireAuth({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="loading-overlay" style={{ display: 'flex' }}>
        <div className="loading-spinner" />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return children;
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function MobileNav() {
  const { user, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const inCoffee = location.pathname.startsWith('/butlercoffee');
  const atHub    = !inCoffee;

  function closeMenu() { setMenuOpen(false); }

  return (
    <>
      <nav className="mobile-nav">
        <button
          className={`mobile-nav__item${atHub ? ' mobile-nav__item--active' : ''}`}
          onClick={() => { navigate('/'); closeMenu(); }}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-house" /></span>
          <span className="mobile-nav__label">Home</span>
        </button>

        <button
          className={`mobile-nav__item${inCoffee ? ' mobile-nav__item--active' : ''}`}
          onClick={() => { navigate('/butlercoffee'); closeMenu(); }}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-mug-hot" /></span>
          <span className="mobile-nav__label">Coffee</span>
        </button>

        <button
          className="mobile-nav__item mobile-nav__item--soon"
          disabled
          title="Coming soon"
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-code" /></span>
          <span className="mobile-nav__label">App Dev</span>
        </button>

        <button
          className={`mobile-nav__item${menuOpen ? ' mobile-nav__item--active' : ''}`}
          onClick={() => setMenuOpen(p => !p)}
        >
          <span className="mobile-nav__icon"><i className="fa-solid fa-bars" /></span>
          <span className="mobile-nav__label">Menu</span>
        </button>
      </nav>

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
            <button className="mobile-menu__item" onClick={() => { navigate('/'); closeMenu(); }}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-house" /></span>
              <span>Butler Society Hub</span>
            </button>
            <button className="mobile-menu__item" onClick={() => { navigate('/butlercoffee'); closeMenu(); }}>
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-mug-hot" /></span>
              <span>Butler Coffee</span>
            </button>
            <button className="mobile-menu__item mobile-menu__item--soon" disabled title="Coming soon">
              <span className="mobile-menu__item-icon"><i className="fa-solid fa-code" /></span>
              <span>App Development</span>
              <span className="nav-link__badge" style={{ marginLeft:'auto' }}>soon</span>
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

// ── Root layout — auth guard + mobile nav ─────────────────────────────────────
function RootLayout() {
  return (
    <RequireAuth>
      <Outlet />
      <MobileNav />
    </RequireAuth>
  );
}

// ── Route tree ────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  {
    element: <AuthProvider><RootLayout /></AuthProvider>,
    children: [
      { index: true, element: <LandingPage /> },

      {
        path: 'butlercoffee',
        element: (
          <CoffeeProvider>
            <App />
          </CoffeeProvider>
        ),
        children: [
          { index: true,             element: <HomePanel /> },

          // Coffee
          { path: 'coffee',          element: <CoffeeList /> },
          { path: 'coffee/new',      element: <CoffeeForm /> },
          { path: 'coffee/:id',      element: <CoffeeView /> },
          { path: 'coffee/:id/edit', element: <CoffeeForm /> },

          // Machines (wildcard keeps component alive across list/view/form — no remount)
          { path: 'machines/*', element: <MachinesPanel /> },

          // Subscription (wildcard keeps component alive — no remount)
          { path: 'subscription/*', element: <SubscriptionPanel /> },

          // Other
          { path: 'labels',      element: <LabelsPanel /> },
          { path: 'blog',        element: <BlogIndex /> },
          { path: 'blog/:slug',  element: <BlogPost /> },
        ],
      },

      // Catch-all
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
