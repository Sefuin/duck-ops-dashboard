import { EmptyState, toneForStatus } from './Shared'

export default function ConceptGrid({
  concepts,
  conceptStatus,
  selectedConceptId,
  onSelectConcept,
}) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Concepts</p>
          <h2>Nano Banana concepts</h2>
        </div>
        <span className={`tag tag--${toneForStatus(conceptStatus)}`}>
          {conceptStatus === 'loading'
            ? 'Running'
            : conceptStatus === 'ready'
              ? `${concepts.length} ready`
              : conceptStatus === 'error'
                ? 'Failed'
                : 'Idle'}
        </span>
      </div>

      {concepts.length ? (
        <div className="concept-grid">
          {concepts.map((concept) => (
            <button
              className={`concept-card ${concept.id === selectedConceptId ? 'concept-card--selected' : ''}`}
              key={concept.id}
              type="button"
              onClick={() => onSelectConcept(concept.id)}
            >
              <div className="concept-card__image-wrap">
                {concept.imageUrl ? (
                  <img
                    alt={concept.title}
                    className="concept-card__image"
                    src={concept.imageUrl}
                  />
                ) : (
                  <div className="image-fallback">No image returned</div>
                )}
              </div>
              <div className="concept-card__body">
                <div className="concept-card__meta">
                  <span>{concept.supportLoad}</span>
                  <span>{concept.colors.join(' / ')}</span>
                </div>
                <h3>{concept.title}</h3>
                <p>{concept.summary}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No concepts yet"
          body="Run concept generation to produce actual Nano Banana images instead of placeholder art."
        />
      )}
    </section>
  )
}
