import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

import { AuthProvider, useAuth } from './AuthContext.jsx';
import LoginPage   from './LoginPage.jsx';
import LandingPage from './LandingPage.jsx';
import App         from './App.jsx';

// ── Top-level router ──────────────────────────────────────────────────────────
function Root() {
  const { user } = useAuth();
  const [currentApp, setCurrentApp] = useState(null);

  // Still checking Firebase auth state — show spinner
  if (user === undefined) {
    return (
      <div className="loading-overlay" style={{ display: 'flex' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  // Not logged in
  if (!user) return <LoginPage />;

  // Logged in but no app chosen → show hub
  if (!currentApp) return <LandingPage onEnterApp={setCurrentApp} />;

  // Butler Coffee Admin
  if (currentApp === 'coffee') {
    return <App onBackToHub={() => setCurrentApp(null)} />;
  }

  // Fallback — shouldn't happen
  return <LandingPage onEnterApp={setCurrentApp} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
