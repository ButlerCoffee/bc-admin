import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { login, resetPassword } = useAuth();
  const [mode,      setMode]      = useState('login'); // 'login' | 'reset'
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      // AuthProvider will update `user` → Root re-renders to Landing
    } catch (err) {
      setError(friendlyLoginError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(friendlyResetError(err.code));
    } finally {
      setLoading(false);
    }
  }

  function friendlyLoginError(code) {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/invalid-email':
        return "That doesn't look like a valid email address.";
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  function friendlyResetError(code) {
    switch (code) {
      case 'auth/user-not-found':
        return 'No account found with that email address.';
      case 'auth/invalid-email':
        return "That doesn't look like a valid email address.";
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return 'Could not send reset email. Please try again.';
    }
  }

  function switchToReset() { setMode('reset'); setError(''); setResetSent(false); }
  function switchToLogin() { setMode('login'); setError(''); setResetSent(false); }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/butler-logo.png" alt="Butler Society"
            className="login-brand__logo"
            onError={e => e.currentTarget.style.display = 'none'} />
          <div className="login-brand__name">Butler Society</div>
          <div className="login-brand__sub">S.L. — Admin Portal</div>
        </div>

        {/* ── Sign in form ── */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn--primary login-submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <button type="button" className="login-forgot" onClick={switchToReset}>
              Forgot password?
            </button>
          </form>
        )}

        {/* ── Reset password form ── */}
        {mode === 'reset' && !resetSent && (
          <form onSubmit={handleReset} className="login-form">
            <p className="login-reset-hint">
              Enter your email and we'll send you a link to reset your password.
            </p>

            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn--primary login-submit"
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <button type="button" className="login-forgot" onClick={switchToLogin}>
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── Reset sent confirmation ── */}
        {mode === 'reset' && resetSent && (
          <div className="login-reset-success">
            <div className="login-reset-success__icon">
              <i className="fa-solid fa-envelope-circle-check" />
            </div>
            <p>Reset link sent! Check your inbox — the email will come from Butler Society.</p>
            <button
              type="button"
              className="btn btn--ghost login-submit"
              onClick={switchToLogin}
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
