import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CRMProvider, useCRM } from './context/CRMContext';
import { canAccessView } from './config/permissions';
import './customer-sapphire.css';

import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ArabicInterfaceGuard } from './components/common/ArabicInterfaceGuard';
import { DashboardPersonalizationGuard } from './components/dashboard/DashboardPersonalizationGuard';
import { CustomerIntakePortal } from './components/customers/CustomerIntakePortal';
import { ContextualDocumentActions } from './components/documents/ContextualDocumentActions';
import { ProcurementLpoRail } from './components/documents/ProcurementLpoRail';

import { DashboardView } from './components/views/DashboardView';
import { Customer360View } from './components/views/Customer360View';
import { LeadsPipelineView } from './components/views/LeadsPipelineView';
import { FleetCRMView } from './components/views/FleetCRMView';
import { QuotationsView } from './components/views/QuotationsView';
import { ReservationsView } from './components/views/ReservationsView';
import { ContractsOpsView } from './components/views/ContractsOpsView';
import { FinanceControlCenterView } from './components/views/FinanceControlCenterView';
import { BankReconciliationView } from './components/views/BankReconciliationView';
import { TollsParkingView } from './components/views/TollsParkingView';
import { NotificationWhatsAppCenterView } from './components/views/NotificationWhatsAppCenterView';
import { TasksFollowupsView } from './components/views/TasksFollowupsView';
import { AIStudioView } from './components/views/AIStudioView';
import { TestSuiteRunnerView } from './components/views/TestSuiteRunnerView';
import { SettingsAuditView } from './components/views/SettingsAuditView';
import { ProcurementView } from './components/views/ProcurementView';
import { SecurityBlocklistView } from './components/views/SecurityBlocklistView';
import { VehicleInspectionsView } from './components/views/VehicleInspectionsView';
import { WhatsAppInboxView } from './components/views/WhatsAppInboxView';
import { LeaseToOwnView } from './components/views/LeaseToOwnView';
import { CorporateDocumentsView } from './components/views/CorporateDocumentsView';
import { VipTierManagementView } from './components/views/VipTierManagementView';
import { FleetAcquisitionRoiView } from './components/views/FleetAcquisitionRoiView';
import { LiveFleetTelematicsMapView } from './components/views/LiveFleetTelematicsMapView';
import { OperationsControlRoomView } from './components/views/OperationsControlRoomView';
import { CorporateAccountsDirectoryView } from './components/views/CorporateAccountsDirectoryView';
import { TaxComplianceView } from './components/views/TaxComplianceView';

const PROCUREMENT_VIEWS = new Set(['procurement', 'purchase-orders', 'lpo', 'supply-orders']);

const MainLayout: React.FC = () => {
  const { language } = useLanguage();
  const { currentUser } = useAuth();
  const { activeView } = useCRM();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const renderActiveView = () => {
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
      case 'tax-compliance':
      case 'tax': return <TaxComplianceView />;
      case 'reconciliation':
      case 'bank-reconciliation': return <BankReconciliationView />;
      case 'tolls': return <TollsParkingView />;
      case 'notification-center': return <NotificationWhatsAppCenterView />;
      case 'tasks': return <TasksFollowupsView />;
      case 'procurement':
      case 'purchase-orders':
      case 'lpo':
      case 'supply-orders': return <ProcurementView />;
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
      case 'corporate-portal': return <CorporateAccountsDirectoryView />;
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
    <div className={`h-dvh min-h-0 overflow-hidden bg-zinc-950 text-zinc-100 flex font-sans ${language === 'ar' ? 'font-arabic' : ''}`}>
      <ArabicInterfaceGuard />
      <DashboardPersonalizationGuard />
      <CustomerIntakePortal />
      <ToastContainer />
      <Sidebar isMobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <PWAInstallBanner />
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main
          data-active-view={activeView}
          data-testid="main-scroll-viewport"
          className="flex-1 min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y p-4 sm:p-6 lg:p-8"
        >
          <ErrorBoundary key={activeView}>
            <ContextualDocumentActions />
            {PROCUREMENT_VIEWS.has(activeView) && <ProcurementLpoRail />}
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
