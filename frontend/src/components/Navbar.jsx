import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  function handleLogout() {
    logout();
    toast.success('You have been signed out.');
    navigate('/');
  }

  function handleSwitch() {
    logout();
    navigate('/login');
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">M</span>
          <span>
            Match<b>Engine</b>
          </span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/" end>
            Market
          </NavLink>
          {user && <NavLink to="/portfolio">Portfolio</NavLink>}
        </nav>

        <div className="nav-user">
          {user ? (
            <>
              <div className="user-chip" title={user.email}>
                <span className="avatar">{initialsOf(user.fullName)}</span>
                <span className="user-text">
                  <strong>{user.fullName}</strong>
                  <small>{user.email}</small>
                </span>
              </div>
              <button type="button" className="btn btn-small btn-ghost" onClick={handleSwitch}>
                Switch
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-small btn-ghost" to="/login">
                Log in
              </Link>
              <Link className="btn btn-small" to="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}