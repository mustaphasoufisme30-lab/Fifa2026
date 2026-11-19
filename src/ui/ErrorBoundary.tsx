import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Une erreur inattendue est survenue.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        readable = `Erreur Firebase (${parsed.operationType ?? 'sync'}): ${parsed.error}`;
      }
    } catch {
      // Keep original message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060d17] p-6 text-white">
          <div className="max-w-md w-full rounded-lg bg-[#0d192a] border border-rose-500/40 p-6 text-center shadow-2xl">
            <h1 className="font-display font-extrabold text-2xl text-rose-400 uppercase tracking-wide">
              FiFA 2026 — Erreur système
            </h1>
            <p className="text-sm text-slate-300 mt-2 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 h-10 px-6 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
            >
              Recharger le jeu
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
