import { Component, type ReactNode } from 'react';

/**
 * Filet de sécurité : une erreur d'affichage dans un panneau ne doit jamais laisser une page blanche.
 * Le message d'erreur est affiché (avec un bouton « Réessayer ») pour qu'on puisse le signaler et le corriger.
 */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) { console.error(`[${this.props.label}] erreur d'affichage :`, error); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 space-y-3 text-left">
        <p className="text-sm font-black text-rose-700">⚠️ « {this.props.label} » n'a pas pu s'afficher.</p>
        <p className="text-xs text-rose-600 break-words">{String(this.state.error.message || this.state.error).slice(0, 300)}</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">Réessayer</button>
      </div>
    );
  }
}
