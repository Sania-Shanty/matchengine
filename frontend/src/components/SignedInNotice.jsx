import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Shown on the Login and Register pages when somebody is already signed in,
// so you can switch to another account instead of being bounced away.
export default function SignedInNotice({ nextAction }) {
  const { user, logout } = useAuth();

  return (
    <div className="card narrow">
      <h2>You are already signed in</h2>
      <p className="muted">
        Signed in as <strong>{user.fullName}</strong> ({user.email}).
      </p>
      <div className="row">
        <Link className="btn" to="/">
          Go to the market
        </Link>
        <button type="button" className="btn btn-outline" onClick={logout}>
          Sign out and {nextAction}
        </button>
      </div>
    </div>
  );
}