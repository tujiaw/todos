// @ts-nocheck — class Error Boundaries rely on React.Component typings not shipped with this React build.
import React from 'react';

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected render error',
    };
  }

  componentDidCatch(error) {
    console.error('App render crashed:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-center">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full min-h-11 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
