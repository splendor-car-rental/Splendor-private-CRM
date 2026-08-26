import React, { useState } from 'react';
import { 
  Play, CheckCircle2, XCircle, Clock, AlertTriangle, 
  Terminal, ShieldCheck, RefreshCw, Sparkles, Server
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

export const TestSuiteRunnerView: React.FC = () => {
  const { language } = useLanguage();
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [activeLogStep, setActiveLogStep] = useState<number | null>(null);

  const handleRunAllTests = async () => {
    setIsRunning(true);
    try {
      const response = await fetch('/api/tests/run-all');
      const data = await response.json();
      setTestResults(data);
    } catch (err: any) {
      setTestResults({
        passed: false,
        summary: `Test runner encountered network error: ${err.message}`,
        durationMs: 0,
        tests: [
          { name: 'System Test Engine', passed: false, durationMs: 0, error: err.message }
        ]
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <Server className="w-6 h-6 text-[#f5d97f]" />
            <span>{language === 'ar' ? 'جناح الاختبارات الآلي وفحص تكامل النظام' : 'End-to-End Test Suite & Diagnostics'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'التحقق الآلي من دورة العمل الكاملة: العميل، عرض السعر، الحجز، العقد، التسليم، والاسترجاع' : 'Comprehensive automated verification across the entire CRM lifecycle, VAT math & bank matching'}
          </p>
        </div>

        <button
          onClick={handleRunAllTests}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs lg:text-sm shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
        >
          <Play className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Running Full Test Suite...' : 'Run All E2E Integration Tests'}</span>
        </button>
      </div>

      {/* Overview Status Banner */}
      {testResults && (
        <div className={`p-6 rounded-3xl border shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          testResults.passed
            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${testResults.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {testResults.passed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
            </div>
            <div>
              <h3 className="text-lg font-bold font-display">
                {testResults.passed ? 'All System Integration Tests Passed' : 'Integration Tests Encountered Failures'}
              </h3>
              <p className="text-xs opacity-80 mt-0.5">
                {testResults.summary} • Completed in {testResults.durationMs}ms
              </p>
            </div>
          </div>

          <Badge variant={testResults.passed ? 'emerald' : 'rose'} size="md">
            {testResults.passed ? '100% HEALTHY' : 'DIAGNOSTIC ALERT'}
          </Badge>
        </div>
      )}

      {/* Tests Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Test Steps List (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <h3 className="text-xs uppercase font-bold text-zinc-400 tracking-wider">Executed Test Scenarios</h3>

          {!testResults && !isRunning && (
            <div className="p-12 rounded-3xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
              Click "Run All E2E Integration Tests" to execute live backend and workflow assertions.
            </div>
          )}

          {isRunning && (
            <div className="p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-3 text-center">
              <RefreshCw className="w-8 h-8 text-[#f5d97f] animate-spin mx-auto" />
              <p className="text-sm font-semibold text-zinc-200">Executing End-to-End Business Workflows...</p>
              <p className="text-xs text-zinc-500">Asserting Lead → Customer → Quote → Reservation → Contract Handover → Return Ledger Settlement</p>
            </div>
          )}

          {testResults?.tests?.map((test: any, idx: number) => (
            <div
              key={idx}
              onClick={() => setActiveLogStep(idx)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                activeLogStep === idx
                  ? 'bg-zinc-800/90 border-[#D4AF37]/40'
                  : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {test.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                )}
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">{test.name}</h4>
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{test.details || (test.passed ? 'Assertions validated successfully' : test.error)}</p>
                </div>
              </div>

              <div className="text-end text-[11px] font-mono text-zinc-400">
                <span>{test.durationMs}ms</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Terminal / Assertion Logs (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3 font-mono text-xs shadow-2xl flex flex-col h-[520px]">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Terminal className="w-4 h-4 text-[#f5d97f]" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Test Suite Output Logs</span>
            </div>
            <span className="text-[10px] text-emerald-400">STATUS: LIVE</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 text-[11px] text-zinc-400 custom-scrollbar pr-1">
            <p className="text-zinc-600">// SPLENDOR PRIVATE CRM E2E TEST ENGINE v3.4.0</p>
            <p className="text-zinc-600">// TARGET: http://localhost:3000/api</p>
            <p className="text-zinc-500">----------------------------------------</p>

            {testResults ? (
              <>
                <p className="text-emerald-400">[INFO] Test suite run initiated at {new Date(testResults.timestamp).toLocaleTimeString()}</p>
                {testResults.tests.map((t: any, idx: number) => (
                  <div key={idx} className="space-y-0.5 pt-1">
                    <p className={t.passed ? 'text-emerald-300' : 'text-rose-400'}>
                      {t.passed ? '✓' : '✗'} [ASSERTION] {t.name} ({t.durationMs}ms)
                    </p>
                    {t.details && <p className="text-zinc-500 text-[10px] pl-3">↳ {t.details}</p>}
                    {t.error && <p className="text-rose-400 text-[10px] pl-3">↳ ERROR: {t.error}</p>}
                  </div>
                ))}
                <p className="text-zinc-500 pt-2">----------------------------------------</p>
                <p className="text-[#f5d97f] font-bold">TOTAL SUITE EXECUTION: {testResults.durationMs}ms</p>
                <p className="text-emerald-400 font-bold">FINAL RESULT: {testResults.passed ? 'PASS (0 ERRORS)' : 'FAIL'}</p>
              </>
            ) : (
              <p className="text-zinc-600 italic">No execution logs available. Click Run to begin diagnostic checks.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
