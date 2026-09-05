import React, { Suspense, lazy, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';
import { canAccessView } from './config/permissions';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ArabicInterfaceGuard } from './components/common/ArabicInterfaceGuard';

// Views -- lazy-loaded so the browser only downloads the JS for the screen
// currently open instead of one bundle containing all ~30 screens up front.
const DashboardView = lazy(() => import('./components/views/DashboardView').then(m => ({ default: m.DashboardView })));
const Customer360View = lazy(() => import('./components/views/Customer360View').then(m => ({ default: m.Customer360View })));
const LeadsPipelineView = lazy(() => import('./components/views/LeadsPipelineView').then(m => ({ default: m.LeadsPipelineView })));
const FleetCRMView = lazy(() => import('./components/views/FleetCRMView').then(m => ({ default: m.FleetCRMView })));
const QuotationsView = lazy(() => import('./components/views/QuotationsView').then(m => ({ default: m.QuotationsView })));
const ReservationsView = lazy(() => import('./components/views/ReservationsView').then(m => ({ default: m.ReservationsView })));
const ContractsOpsView = lazy(() => import('./components/views/ContractsOpsView').then(m => ({ default: m.ContractsOpsView })));
const FinanceControlCenterView = lazy(() => import('./components/views/FinanceControlCenterView').then(m => ({ default: m.FinanceControlCenterView })));
const TaxFilingView = lazy(() => import('./components/views/TaxFilingView').then(m => ({ default: m.TaxFilingView })));
const BankReconciliationView = lazy(() => import('./components/views/BankReconciliationView').then(m => ({ default: m.BankReconciliationView })));
const TollsParkingView = lazy(() => import('./components/views/TollsParkingView').then(m => ({ default: m.TollsParkingView })));
const NotificationWhatsAppCenterView = lazy(() => import('./components/views/NotificationWhatsAppCenterView').then(m => ({ default: m.NotificationWhatsAppCenterView })));
const TasksFollowupsView = lazy(() => import('./components/views/TasksFollowupsView').then(m => ({ default: m.TasksFollowupsView })));
const AIStudioView = lazy(() => import('./components/views/AIStudioView').then(m => ({ default: m.AIStudioView })));
const TestSuiteRunnerView = lazy(() => import('./components/views/TestSuiteRunnerView').then(m => ({ default: m.TestSuiteRunnerView })));
const SettingsAuditView = lazy(() => import('./components/views/SettingsAuditView').then(m => ({ default: m.SettingsAuditView })));
const ProcurementView = lazy(() => import('./components/views/ProcurementView').then(m => ({ default: m.ProcurementView })));
const SecurityBlocklistView = lazy(() => import('./components/views/SecurityBlocklistView').then(m => ({ default: m.SecurityBlocklistView })));
const VehicleInspectionsView = lazy(() => import('./components/views/VehicleInspectionsView').then(m => ({ default: m.VehicleInspectionsView })));
const WhatsAppInboxView = lazy(() => import('./components/views/WhatsAppInboxView').then(m => ({ default: m.WhatsAppInboxView })));
const LeaseToOwnView = lazy(() => import('./components/views/LeaseToOwnView').then(m => ({ default: m.LeaseToOwnView })));
const CorporateDocumentsView = lazy(() => import('./components/views/CorporateDocumentsView').then(m => ({ default: m.CorporateDocumentsView })));
const VipTierManagementView = lazy(() => import('./components/views/VipTierManagementView').then(m => ({ default: m.VipTierManagementView })));
const FleetAcquisitionRoiView = lazy(() => import('./components/views/FleetAcquisitionRoiView').then(m => ({ default: m.FleetAcquisitionRoiView })));
const LiveFleetTelematicsMapView = lazy(() => import('./components/views/LiveFleetTelematicsMapView').then(m => ({ default: m.LiveFleetTelematicsMapView })));
const OperationsControlRoomView = lazy(() => import('./components/views/OperationsControlRoomView').then(m => ({ default: m.OperationsControlRoomView })));
const CorporateBranchPortalView = lazy(() => import('./components/views/CorporateBranchPortalView').then(m => ({ default: m.CorporateBranchPortalView })));
const ExecutiveDashboardView = lazy(() => import('./components/views/ExecutiveDashboardView').then(m => ({ default: m.ExecutiveDashboardView })));
const CorrectionsCenterView = lazy(() => import('./components/views/CorrectionsCenterView').then(m => ({ default: m.CorrectionsCenterView })));

const ViewLoadingFallback: React.FC = () => {
  const { language } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-500">
      <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-[#D4AF37] animate-spin" />
      <p className="text-xs">{language === 'ar' ? 'جارٍ تحميل الشاشة...' : 'Loading screen...'}</p>
    </div>
  );
};

const MainLayout: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { activeView } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const renderActiveView = () => {
    // Central access gate -- the Sidebar already hides links this role
    // can't use, but a view can also be reached other ways (global search,
    // a dashboard quick-link, stale state after a role change). This is the
    // one place every path through the app is re-checked.
    if (!canAccessView(currentUser.role, activeView)) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-24 gap-3">
          <ShieldAlert className="w-10 h-10 text-zinc-600" />
          <h3 className="text-lg font-display font-bold text-zinc-200">
            {language === 'ar' ? 'لا تملك صلاحية الوصول لهذه الشاشة' : 'You don\'t have access to this screen'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm">
            {language === 'ar'
              ? 'هذه الشاشة غير متاحة لدورك الوظيفي الحالي. تواصل مع المدير إذا كنت تحتاج صلاحية إضافية.'
              : 'This screen isn\'t part of your current role. Contact an administrator if you need access.'}
          </p>
        </div>
      );
    }

    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'customers': return <Customer360View />;
      case 'leads': return <LeadsPipelineView />;
      case 'fleet': return <FleetCRMView />;
      case 'quotations': return <QuotationsView />;
      case 'reservations': return <ReservationsView />;
      case 'contracts': return <ContractsOpsView />;
      case 'finance': return <FinanceControlCenterView />;
      case 'executive-dashboard': return <ExecutiveDashboardView />;
      case 'corrections-center': return <CorrectionsCenterView />;
      case 'tax-filing': return <TaxFilingView />;
      case 'reconciliation':
      case 'bank-reconciliation': return <BankReconciliationView />;
      case 'tolls': return <TollsParkingView />;
      case 'notification-center': return <NotificationWhatsAppCenterView />;
      case 'tasks': return <TasksFollowupsView />;
      case 'procurement': return <ProcurementView initialTab="suppliers" />;
      case 'purchase-orders':
      case 'lpo':
      case 'supply-orders': return <ProcurementView initialTab="purchase-orders" />;
      case 'security': return <SecurityBlocklistView />;
      case 'inspections': return <VehicleInspectionsView />;
      case 'lease-to-own': return <LeaseToOwnView />;
      case 'vip-tiers': return <VipTierManagementView />;
      case 'fleet-acquisition-roi':
      case 'roi-simulator': return <FleetAcquisitionRoiView />;
      case 'live-radar':
      case 'telematics-radar': return <LiveFleetTelematicsMapView />;
      case 'operations-control-room':
      case 'control-room': return <OperationsControlRoomView />;
      case 'corporate-branches':
      case 'corporate-portal': return <CorporateBranchPortalView />;
      case 'whatsapp-inbox': return <WhatsAppInboxView />;
      case 'corporate-documents': return <CorporateDocumentsView />;
      case 'ai-studio':
      case 'ai-intelligence': return <AIStudioView />;
      case 'test-suite':
      case 'tests': return <TestSuiteRunnerView />;
      case 'settings': return <SettingsAuditView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 flex font-sans ${language === 'ar' ? 'font-arabic' : ''}`}>
      <ArabicInterfaceGuard />
      <ToastContainer />
      <Sidebar isMobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <PWAInstallBanner />
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8">
          <ErrorBoundary key={activeView}>
            <Suspense fallback={<ViewLoadingFallback />}>
              {renderActiveView()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CRMProvider>
          <MainLayout />
        </CRMProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
