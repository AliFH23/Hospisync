import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from './AuthContext';
import ForbiddenPage from '../pages/ForbiddenPage';

/** Guards a group of routes: must be logged in, and (optionally) have one of `roles`. */
export default function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (status !== 'authed') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <ForbiddenPage />;
  return <Outlet />;
}