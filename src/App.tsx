import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';
import { canAccessView } from './config/permissions';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Views
import { DashboardView } from './components/views/DashboardView';
import { Customer360View } from './components/views/Customer360View';
import { LeadsPipelineView } from './components/views/LeadsPipelineView';
import { FleetCRMView } from './components/views/FleetCRMView';
import { QuotationsView } from './components/views/QuotationsView';
import { ReservationsView } from './components/views/ReservationsView';
import { ContractsOpsView } from './components/views/ContractsOpsView';
import { FinanceLedgerView } from './components/views/FinanceLedgerView';
import { BankReconciliationView } from './components/views/BankReconciliationView';
import { TollsParkingView } from './components/views/TollsParkingView';
import { NotificationWhatsAppCenterView } from './components/views/NotificationWhatsAppCenterView';
import { TasksFollowupsView } from './components/views/TasksFollowupsView';
import { AIStudioView } from './components/views/AIStudioView';
import { TestSuiteRunnerView } from './components/views/TestSuiteRunnerView';
import { SettingsAuditView } from './components/views/SettingsAuditView';
import { ProcurementView } from './components/views/ProcurementView';

const MainLayout: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { activeView } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const renderActiveView = () => {
    // Central access gate -- the Sidebar already hides links this role
    // can't use, but a view can also be reached other ways (global search,
    // a dashboard quick-link, stale state after a role change). This is
    // the one place every path through the app is re-checked.
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
      case 'dashboard':
        return <DashboardView />;
      case 'customers':
        return <Customer360View />;
      case 'leads':
        return <LeadsPipelineView />;
      case 'fleet':
        return <FleetCRMView />;
      case 'quotations':
        return <QuotationsView />;
      case 'reservations':
        return <ReservationsView />;
      case 'contracts':
        return <ContractsOpsView />;
      case 'finance':
        return <FinanceLedgerView />;
      case 'reconciliation':
      case 'bank-reconciliation':
        return <BankReconciliationView />;
      case 'tolls':
        return <TollsParkingView />;
      case 'notification-center':
        return <NotificationWhatsAppCenterView />;
      case 'tasks':
        return <TasksFollowupsView />;
      case 'procurement':
        return <ProcurementView />;
      case 'ai-studio':
      case 'ai-intelligence':
        return <AIStudioView />;
      case 'test-suite':
      case 'tests':
        return <TestSuiteRunnerView />;
      case 'settings':
        return <SettingsAuditView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 flex font-sans ${language === 'ar' ? 'font-arabic' : ''}`}>
      {/* Toast Notifications */}
      <ToastContainer />

      {/* Main Sidebar */}
      <Sidebar isMobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top Header with Language Switcher and Action Modals */}
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* View Container -- fills the full remaining width next to the
            sidebar. Previously capped at max-w-7xl (1280px) and centered,
            which left large empty margins on wide desktop monitors and
            made the app look "cut off" instead of using the whole screen. */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8">
          <ErrorBoundary key={activeView}>
            {renderActiveView()}
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
