import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ margin: 24 }}>
          <div className="card__header">
            <div>
              <p className="eyebrow">Error</p>
              <h2>Something crashed</h2>
            </div>
            <span className="tag tag--danger">Fatal</span>
          </div>
          <div className="inline-error">{this.state.error.message}</div>
          <div className="actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => this.setState({ error: null })}
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
