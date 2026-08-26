import React, { useState } from 'react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer';
import { ToastContainer } from './components/common/ToastContainer';

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
import { TasksFollowupsView } from './components/views/TasksFollowupsView';
import { AIStudioView } from './components/views/AIStudioView';
import { TestSuiteRunnerView } from './components/views/TestSuiteRunnerView';
import { SettingsAuditView } from './components/views/SettingsAuditView';

const MainLayout: React.FC = () => {
  const { language } = useLanguage();
  const { activeView, searchModalOpen, setSearchModalOpen, notificationsOpen, setNotificationsOpen } = useCRM();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderActiveView = () => {
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
      case 'bank-reconciliation':
        return <BankReconciliationView />;
      case 'tasks':
        return <TasksFollowupsView />;
      case 'ai-intelligence':
        return <AIStudioView />;
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

      {/* Global Search Dialog */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {/* Main Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:ps-64">
        {/* Top Header */}
        <Header onOpenSidebar={() => setSidebarOpen(true)} />

        {/* View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {renderActiveView()}
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
