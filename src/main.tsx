import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface AppErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. Without it, any render-time throw (e.g. malformed
 * bootstrap data or a null course list) blanks the entire application with no
 * message and no way to recover.
 */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ExamVault] Unhandled UI error:', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            background: 'var(--canvas, #f6f8f7)',
            color: 'var(--ink, #172522)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: '520px', color: 'var(--muted, #6c7c78)' }}>
            The page hit an unexpected error. Your data is safe. Reload to continue, and if it
            keeps happening please contact campus support.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              minHeight: '44px',
              padding: '0 18px',
              borderRadius: '8px',
              border: '1px solid transparent',
              background: 'var(--accent, #166b55)',
              color: '#fff',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
