import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineGateModalProps {
  checking: boolean;
  onRetry: () => void;
}

export function OfflineGateModal({ checking, onRetry }: OfflineGateModalProps) {
  return (
    <div
      data-testid="offline-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#040912]/96 backdrop-blur-sm p-6"
    >
      <div className="w-full max-w-md rounded-xl bg-[#0d192a] border border-rose-500/45 p-6 sm:p-8 text-center shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 border border-rose-400/40 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-rose-400" />
        </div>

        <div className="text-xs font-bold uppercase tracking-widest text-rose-400 mt-4">
          MODE EN LIGNE UNIQUEMENT
        </div>
        <h2
          id="offline-gate-title"
          className="font-display font-extrabold text-3xl text-white mt-1 uppercase tracking-wide"
        >
          Connexion Internet requise
        </h2>
        <p className="text-sm text-slate-300 mt-3 leading-relaxed">
          FiFA 2026 nécessite une connexion Internet active pour fonctionner. Vérifiez votre Wi‑Fi ou vos données mobiles, puis réessayez.
        </p>

        <button
          type="button"
          data-testid="offline-retry-btn"
          disabled={checking}
          onClick={onRetry}
          className="mt-6 w-full h-12 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-display font-extrabold text-lg tracking-wider uppercase inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer"
        >
          <RefreshCw className={`w-5 h-5 ${checking ? 'animate-spin' : ''}`} />
          <span>{checking ? 'Vérification...' : 'Réessayer'}</span>
        </button>
      </div>
    </div>
  );
}
