import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React ErrorBoundary caught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6 text-center">
          <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold text-xl">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-slate-900">Page Encountered an Error</h2>
            <p className="text-xs text-slate-600 font-mono bg-slate-50 p-3 rounded border border-slate-200 text-left overflow-auto max-h-36">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={() => (window.location.href = '/')}
                className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 transition-colors"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-[#7B3F4A] px-4 py-2 text-xs font-bold text-white hover:bg-[#68343E] transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
