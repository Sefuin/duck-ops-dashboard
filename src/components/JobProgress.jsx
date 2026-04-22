import { ArtifactLink, EmptyState, InlineError, Stat, toneForStatus } from './Shared'

export default function JobProgress({ job, jobStatus }) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Meshy Job</p>
          <h2>{job?.step ?? 'No 3D job yet'}</h2>
        </div>
        <span className={`tag tag--${toneForStatus(job?.status ?? jobStatus)}`}>
          {job?.status ?? (jobStatus === 'loading' ? 'IN_PROGRESS' : 'Idle')}
        </span>
      </div>

      {job ? (
        <div className="stacked">
          <div className="progress-block">
            <div className="progress-block__labels">
              <span>{job.step}</span>
              <strong>{job.progress}%</strong>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p>{job.note}</p>
          </div>

          {job.result?.modelTask?.thumbnail_url ? (
            <img
              alt="Meshy model preview"
              className="preview-image"
              src={job.result.modelTask.thumbnail_url}
            />
          ) : null}

          {job.result?.viewImages?.length ? (
            <div>
              <h4>Images used for 3D</h4>
              <div className="view-grid">
                {job.result.viewImages.map((view) => (
                  <article className="view-card" key={view.key}>
                    <img alt={view.label} src={view.imageUrl} />
                    <span>{view.label}</span>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {job.result?.normalization?.qa ? (
            <div>
              <h4>Flat-bottom QA</h4>
              <div className="mini-stats">
                <Stat
                  label="Status"
                  value={job.result.normalization.status === 'passed' ? 'Passed' : 'Failed'}
                />
                <Stat
                  label="Cut depth"
                  value={`${job.result.normalization.qa.cut_depth_mm.toFixed(2)} mm`}
                />
                <Stat
                  label="Contact patch"
                  value={`${(job.result.normalization.qa.contact_area_ratio * 100).toFixed(1)}%`}
                />
                <Stat
                  label="Volume removed"
                  value={`${(job.result.normalization.qa.removed_volume_ratio * 100).toFixed(1)}%`}
                />
                <Stat
                  label="Final height"
                  value={`${job.result.normalization.qa.final_height_mm.toFixed(2)} mm`}
                />
                <Stat
                  label="Watertight"
                  value={job.result.normalization.qa.watertight ? 'Yes' : 'No'}
                />
              </div>
              {job.result.normalization.warnings?.length ? (
                <div className="stacked">
                  {job.result.normalization.warnings.map((warning) => (
                    <InlineError key={warning} message={warning} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {job.result?.modelTask?.model_urls ||
          job.result?.printTask?.model_urls ||
          job.result?.normalization?.normalizedModelUrl ? (
            <div>
              <h4>Artifacts</h4>
              <div className="artifact-list">
                {job.result?.normalization?.normalizedModelUrl ? (
                  <ArtifactLink
                    label="Normalized GLB (canonical)"
                    url={job.result.normalization.normalizedModelUrl}
                  />
                ) : null}
                {job.result?.normalization?.downloadedOriginalUrl ? (
                  <ArtifactLink
                    label="Meshy GLB (downloaded)"
                    url={job.result.normalization.downloadedOriginalUrl}
                  />
                ) : null}
                {job.result?.normalization?.reportUrl ? (
                  <ArtifactLink
                    label="Flat-bottom QA report"
                    url={job.result.normalization.reportUrl}
                  />
                ) : null}
                {job.result?.modelTask?.model_urls?.glb ? (
                  <ArtifactLink
                    label="Meshy GLB (remote)"
                    url={job.result.modelTask.model_urls.glb}
                  />
                ) : null}
                {job.result?.modelTask?.model_urls?.['3mf'] ? (
                  <ArtifactLink
                    label="Plain 3MF"
                    url={job.result.modelTask.model_urls['3mf']}
                  />
                ) : null}
                {job.result?.printTask?.model_urls?.['3mf'] ? (
                  <ArtifactLink
                    label="Colored 3MF (pre-normalization)"
                    url={job.result.printTask.model_urls['3mf']}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {job.error ? <InlineError message={job.error} /> : null}
        </div>
      ) : (
        <EmptyState
          title="No model job running"
          body="Once you approve a concept, the backend will generate matching Nano Banana angle images and launch a real Meshy 3D task."
        />
      )}
    </section>
  )
}
