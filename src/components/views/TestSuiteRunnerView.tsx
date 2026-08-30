import React, { useState } from 'react';
import {
  Play, CheckCircle2, XCircle, RefreshCw, Terminal, Server
} from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
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
      // This is an internal diagnostic endpoint. It must carry the same
      // authenticated Firebase ID token as every other private API call;
      // using plain fetch here previously made the route vulnerable to
      // unauthenticated remote execution of the test workload.
      const response = await apiFetch('/api/tests/run-all', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Test runner failed (${response.status}).`);
      }
      setTestResults(data);
    } catch (err: any) {
      setTestResults({
        passed: false,
        summary: `Test runner encountered an error: ${err.message}`,
        durationMs: 0,
        tests: [
          { name: 'System Test Engine', passed: false, durationMs: 0, error: err.message }
        ]
      });
    } finally {
      setIsRunning(false);
    }
  };

  const passed = testResults?.summary?.status === 'ALL_PASSED' || testResults?.passed === true;
  const tests = testResults?.results || testResults?.tests || [];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <Server className="w-6 h-6 text-[#f5d97f]" />
            <span>{language === 'ar' ? 'جناح الاختبارات الآلي وفحص تكامل النظام' : 'End-to-End Test Suite & Diagnostics'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar'
              ? 'التحقق الآلي من دورة العمل الكاملة: العميل، عرض السعر، الحجز، العقد، التسليم، والاسترجاع'
              : 'Comprehensive automated verification across the entire CRM lifecycle, VAT math & bank matching'}
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

      {testResults && (
        <div className={`p-6 rounded-3xl border shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          passed
            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {passed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
            </div>
            <div>
              <h3 className="text-lg font-bold font-display">
                {passed ? 'All System Integration Tests Passed' : 'Integration Tests Encountered Failures'}
              </h3>
              <p className="text-xs opacity-80 mt-0.5">
                {testResults.summary?.status || testResults.summary || 'Completed'} • {testResults.summary?.durationMs ?? testResults.durationMs ?? 0}ms
              </p>
            </div>
          </div>
          <Badge variant={passed ? 'emerald' : 'rose'} size="md">
            {passed ? '100% HEALTHY' : 'DIAGNOSTIC ALERT'}
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

          {tests.map((test: any, idx: number) => {
            const testPassed = test.passed ?? test.status === 'PASSED';
            return (
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
                  {testPassed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  )}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">{test.name || test.workflowName}</h4>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{test.details || (testPassed ? 'Assertions validated successfully' : test.error)}</p>
                  </div>
                </div>
                <div className="text-end text-[11px] font-mono text-zinc-400">
                  <span>{test.durationMs ?? 0}ms</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:col-span-5 p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3 font-mono text-xs shadow-2xl flex flex-col h-[520px]">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Terminal className="w-4 h-4 text-[#f5d97f]" />
              <span className="text-[11px] font-bold uppercase tracking-wider">Test Suite Output Logs</span>
            </div>
            <span className="text-[10px] text-emerald-400">STATUS: AUTHENTICATED</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 text-[11px] text-zinc-400 custom-scrollbar pr-1">
            <p className="text-zinc-600">// SPLENDOR PRIVATE CRM E2E TEST ENGINE</p>
            <p className="text-zinc-600">// TARGET: authenticated /api/tests/run-all</p>
            <p className="text-zinc-500">----------------------------------------</p>

            {testResults ? (
              <>
                <p className="text-emerald-400">[INFO] Test suite execution completed.</p>
                {tests.map((t: any, idx: number) => {
                  const testPassed = t.passed ?? t.status === 'PASSED';
                  return (
                    <div key={idx} className="space-y-0.5 pt-1">
                      <p className={testPassed ? 'text-emerald-300' : 'text-rose-400'}>
                        {testPassed ? '✓' : '✗'} [ASSERTION] {t.name || t.workflowName} ({t.durationMs ?? 0}ms)
                      </p>
                      {t.details && <p className="text-zinc-500 text-[10px] pl-3">↳ {t.details}</p>}
                      {t.error && <p className="text-rose-400 text-[10px] pl-3">↳ ERROR: {t.error}</p>}
                    </div>
                  );
                })}
                <p className="text-zinc-500 pt-2">----------------------------------------</p>
                <p className="text-[#f5d97f] font-bold">TOTAL SUITE EXECUTION: {testResults.summary?.durationMs ?? testResults.durationMs ?? 0}ms</p>
                <p className="text-emerald-400 font-bold">FINAL RESULT: {passed ? 'PASS (0 ERRORS)' : 'FAIL'}</p>
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
