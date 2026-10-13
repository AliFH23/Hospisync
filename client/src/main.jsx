import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import './i18n';
import { PreferencesProvider } from './theme/PreferencesProvider';
import { AuthProvider } from './auth/AuthContext';
import { SocketProvider } from './socket/SocketProvider';
import { NotificationProvider } from './components/NotificationCenter';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Respects the OS "reduce motion" setting for every animation */}
    <MotionConfig reducedMotion="user">
      <PreferencesProvider>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <NotificationProvider>
                <App />
              </NotificationProvider>
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </PreferencesProvider>
    </MotionConfig>
  </StrictMode>
);