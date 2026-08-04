import { Component } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-lift p-8 text-center">
            <div className="w-16 h-16 bg-danger/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} className="text-danger" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-muted-foreground mb-6">
              We&apos;re sorry, but an unexpected error occurred. Please try refreshing the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-left text-xs bg-elevated p-4 rounded-lg mb-6 overflow-auto text-danger">
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-medium transition-colors"
            >
              <RefreshCcw size={18} />
              Go Home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
