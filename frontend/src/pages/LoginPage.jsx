import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import SignedInNotice from '../components/SignedInNotice.jsx';

const DEMO_USERS = [
  ['Alice', 'alice@example.com'],
  ['Bob', 'bob@example.com'],
  ['Carol', 'carol@example.com'],
  ['Dave', 'dave@example.com'],
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const destination = (location.state && location.state.from) || '/';

  if (user) return <SignedInNotice nextAction="log in as someone else" />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const loggedIn = await login(email, password);
      toast.success(`Welcome back, ${loggedIn.fullName}.`);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>Log in</h2>
      <p className="muted small">Each browser tab keeps its own login, so you can trade as two people side by side.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="alert alert-error">{error}</p>}

        <button type="submit" className="btn btn-wide" disabled={busy}>
          {busy ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <div className="demo-box">
        <p className="small muted">Demo users (password: password123). Click to fill the form:</p>
        <div className="chips">
          {DEMO_USERS.map(([name, address]) => (
            <button
              key={address}
              type="button"
              className="chip"
              onClick={() => {
                setEmail(address);
                setPassword('password123');
                setError('');
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <p className="muted small">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}