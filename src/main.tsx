import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CustomerPortal } from './components/portal/CustomerPortal';
import { PublicKycPortalView } from './components/views/PublicKycPortalView';
import './index.css';
import './premium-sapphire.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // PWA enhancement is optional; the CRM remains fully functional if
      // service-worker registration is unavailable in the current environment.
    });
  });
}

const isCustomerPortal = window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/');
const isKycPortal = window.location.pathname === '/kyc' || window.location.pathname.startsWith('/kyc/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCustomerPortal ? <CustomerPortal /> : isKycPortal ? <PublicKycPortalView /> : <App />}
  </StrictMode>,
);
