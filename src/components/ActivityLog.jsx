import { EmptyState, formatStamp } from './Shared'

export default function ActivityLog({ events }) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Activity</p>
          <h2>Run log</h2>
        </div>
        <span className="tag tag--neutral">Latest first</span>
      </div>

      {events.length ? (
        <div className="event-list">
          {events.map((event) => (
            <article className="event-row" key={event.id}>
              <div className="event-row__top">
                <h3>{event.title}</h3>
                <span>{formatStamp(event.createdAt)}</span>
              </div>
              <p>{event.detail ?? event.note}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing has run yet"
          body="The activity feed will start filling in as soon as you generate the first set of concepts."
        />
      )}
    </section>
  )
}
