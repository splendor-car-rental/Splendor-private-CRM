import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CustomerPortal } from './components/portal/CustomerPortal';
import './index.css';
import './premium-sapphire.css';
import './scroll-ownership.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // PWA enhancement is optional; the CRM remains fully functional if
      // service-worker registration is unavailable in the current environment.
    });
  });
}

const isCustomerPortal = window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCustomerPortal ? <CustomerPortal /> : <App />}
  </StrictMode>,
);
