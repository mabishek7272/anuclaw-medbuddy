import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode; label?: string; }
interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass flex items-start gap-3 p-4"
          style={{ border: '1px solid rgba(255,23,68,0.25)' }}
          role="alert">
          <AlertTriangle size={16} style={{ color: '#FF1744' }} className="shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-medium" style={{ color: '#E8EEF6' }}>
              {this.props.label ?? 'This panel failed to load'}
            </p>
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
              {this.state.error.message}
            </p>
            <button
              className="btn-ghost-med flex items-center gap-1.5 text-xs mt-2 px-2 py-1"
              onClick={() => this.setState({ error: null })}
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
