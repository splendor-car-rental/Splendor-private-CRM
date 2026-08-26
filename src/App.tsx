import React, { useState } from 'react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
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
  const { activeView } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
      case 'reconciliation':
      case 'bank-reconciliation':
        return <BankReconciliationView />;
      case 'tasks':
        return <TasksFollowupsView />;
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
