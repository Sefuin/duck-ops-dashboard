import { EmptyState, Stat } from './Shared'

export default function SpecDisplay({ spec }) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Spec</p>
          <h2>Structured output</h2>
        </div>
        <span className={`tag tag--${spec ? 'success' : 'neutral'}`}>
          {spec ? 'Ready' : 'Waiting'}
        </span>
      </div>

      {spec ? (
        <div className="stacked">
          <div className="summary-block">
            <h3>{spec.title}</h3>
            <p>{spec.summary}</p>
          </div>

          <div className="mini-stats">
            <Stat label="Risk tag" value={spec.riskTag} />
            <Stat label="Height" value={`${spec.targetHeight} mm`} />
            <Stat
              label="Color path"
              value={spec.generateColor3mf ? `${spec.colorCap}-color 3MF` : 'Plain 3MF'}
            />
          </div>

          <div>
            <h4>Guardrails</h4>
            <ul className="bullet-list">
              {spec.guardrails.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>QA notes</h4>
            <ul className="bullet-list">
              {spec.qaChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No spec yet"
          body="Generate concept images first and the backend will return a structured duck spec from Gemini or the local fallback builder."
        />
      )}
    </section>
  )
}
