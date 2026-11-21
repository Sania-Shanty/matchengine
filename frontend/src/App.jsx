import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import { Skeleton } from './components/States.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import MarketPage from './pages/MarketPage.jsx';
import TradePage from './pages/TradePage.jsx';
import PortfolioPage from './pages/PortfolioPage.jsx';

// Only logged-in users may see what is inside.
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="card">
        <Skeleton height={24} width="40%" />
        <Skeleton height={80} style={{ marginTop: 16 }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<MarketPage />} />
          <Route path="/trade/:symbol" element={<TradePage />} />
          <Route
            path="/portfolio"
            element={
              <RequireAuth>
                <PortfolioPage />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        MatchEngine · virtual money, real matching rules · prices refresh every few seconds
      </footer>
    </>
  );
}