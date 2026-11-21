import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan yang tidak terduga.'
    };
  }

  componentDidCatch(error: Error): void {
    console.error('ALSTORE ErrorBoundary caught:', error);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="liquid-glass rounded-2xl max-w-md w-full p-6 text-center space-y-4">
            <div
              className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Gangguan Sementara
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Tampilan mengalami kendala saat memuat data. Anda dapat memuat ulang tampilan tanpa kehilangan riwayat lokal.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="liquid-btn-primary rounded-xl px-5 py-2.5 text-sm whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Muat Ulang Tampilan
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
