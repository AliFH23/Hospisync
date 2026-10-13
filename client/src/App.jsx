import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import { useAuth, HOME_BY_ROLE } from './auth/AuthContext';
import AppLayout from './layout/AppLayout';
import LoginPage from './pages/LoginPage';
import ForbiddenPage from './pages/ForbiddenPage';
import QueuePage from './pages/QueuePage';
import WardPage from './pages/WardPage';
import NewOrderPage from './pages/NewOrderPage';
import StockPage from './pages/StockPage';
import ForecastPage from './pages/ForecastPage';
import WastePage from './pages/WastePage';
import OrdersPage from './pages/OrdersPage';
import FormularyPage from './pages/FormularyPage';
import UsersPage from './pages/UsersPage';

function Home() {
  const { user } = useAuth();
  return <Navigate to={HOME_BY_ROLE[user.role] ?? '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />

          {/* Nurse */}
          <Route element={<RequireAuth roles={['nurse']} />}>
            <Route path="/ward" element={<WardPage />} />
            <Route path="/ward/new" element={<NewOrderPage />} />
          </Route>

          {/* Pharmacist + admin */}
          <Route element={<RequireAuth roles={['pharmacist', 'admin']} />}>
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/waste" element={<WastePage />} />
          </Route>

          {/* Everyone */}
          <Route path="/formulary" element={<FormularyPage />} />

          {/* Admin */}
          <Route element={<RequireAuth roles={['admin']} />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>

          <Route path="*" element={<ForbiddenPage notFound />} />
        </Route>
      </Route>
    </Routes>
  );
}