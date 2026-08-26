import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  key?: React.Key;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error in view:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 sm:p-12 rounded-3xl bg-zinc-900/90 border border-zinc-800 text-center max-w-2xl mx-auto my-12 space-y-4 shadow-2xl animate-fade-in">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-zinc-100 font-display">
            {this.props.fallbackTitle || 'تعذر عرض هذه الشاشة مؤقتاً / View rendering error'}
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto font-mono bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-start overflow-x-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div className="pt-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-semibold text-xs shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>إعادة المحاولة / Retry</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
