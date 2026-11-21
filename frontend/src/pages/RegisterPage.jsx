import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import SignedInNotice from '../components/SignedInNotice.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const { user, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <SignedInNotice nextAction="register another user" />;

  const nameError = fullName.trim().length < 2 ? 'Enter your name (at least 2 letters).' : '';
  const emailError = !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : '';
  const passwordError = password.length < 8 ? 'Use at least 8 characters.' : '';

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');
    setShowErrors(true);
    if (nameError || emailError || passwordError) return;

    setBusy(true);
    try {
      const created = await register(email, fullName, password);
      toast.success(`Account created. Welcome, ${created.fullName}.`);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>Create an account</h2>
      <p className="muted small">
        You start with ₹1,00,000.00 of virtual cash and 100 shares of every security. Your account is
        completely separate from everyone else's.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="reg-name">Full name</label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={showErrors && nameError ? 'invalid' : ''}
          />
          {showErrors && nameError && <p className="field-error">{nameError}</p>}
        </div>
        <div className="field">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={showErrors && emailError ? 'invalid' : ''}
          />
          {showErrors && emailError && <p className="field-error">{emailError}</p>}
        </div>
        <div className="field">
          <label htmlFor="reg-password">Password</label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={showErrors && passwordError ? 'invalid' : ''}
          />
          {showErrors && passwordError ? (
            <p className="field-error">{passwordError}</p>
          ) : (
            <p className="hint">At least 8 characters.</p>
          )}
        </div>

        {serverError && <p className="alert alert-error">{serverError}</p>}

        <button type="submit" className="btn btn-wide" disabled={busy}>
          {busy ? 'Creating...' : 'Register'}
        </button>
      </form>

      <p className="muted small">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}