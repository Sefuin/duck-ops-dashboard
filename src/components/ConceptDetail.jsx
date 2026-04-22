import { EmptyState, InlineError, Stat } from './Shared'

export default function ConceptDetail({
  concept,
  job,
  jobStatus,
  jobError,
  generateColor3mf,
  meshyOffline,
  onGenerateModel,
}) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Selected Concept</p>
          <h2>{concept?.title ?? 'Waiting for selection'}</h2>
        </div>
        <span className="tag tag--neutral">Approval gate</span>
      </div>

      {concept ? (
        <div className="selected-concept">
          {concept.imageUrl ? (
            <img
              alt={concept.title}
              className="selected-concept__image"
              src={concept.imageUrl}
            />
          ) : null}

          <div className="stacked">
            <p className="selected-concept__summary">{concept.summary}</p>
            <p className="selected-concept__prompt">{concept.prompt}</p>

            <div className="mini-stats">
              <Stat label="Support" value={concept.supportLoad} />
              <Stat label="Colors" value={concept.colors.join(', ')} />
              <Stat
                label="Output"
                value={generateColor3mf ? 'GLB + Color 3MF' : 'GLB + Plain 3MF'}
              />
            </div>

            <div className="actions">
              <button
                className="button button--primary"
                type="button"
                onClick={onGenerateModel}
                disabled={jobStatus === 'loading' || meshyOffline}
              >
                {jobStatus === 'loading'
                  ? 'Running 3D job...'
                  : meshyOffline
                    ? 'Meshy key required'
                  : jobStatus === 'error'
                    ? 'Retry 3D'
                    : job
                      ? 'Regenerate 3D'
                      : 'Generate 3D'}
              </button>
            </div>

            {jobError ? <InlineError message={jobError} /> : null}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No concept approved yet"
          body="Generate concepts and choose one before sending anything into Meshy 3D."
        />
      )}
    </section>
  )
}
