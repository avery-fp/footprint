'use client'

import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  context?: 'profile' | 'editor' | 'dashboard'
}

interface ErrorBoundaryState {
  hasError: boolean
}

const messages: Record<string, string> = {
  editor: 'The editor hit a snag. Your work is saved.',
  profile: 'This section failed to load.',
  dashboard: 'Something went wrong loading the dashboard.',
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-white/25 text-sm mb-3">
              {messages[this.props.context || ''] || 'Something went wrong here.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="text-white/40 hover:text-white/60 text-xs underline"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
