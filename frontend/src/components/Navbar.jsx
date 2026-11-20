import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          Match<span>Engine</span>
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
              <span className="muted">{user.fullName}</span>
              <button className="btn btn-small btn-ghost" onClick={handleLogout}>
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