import { InlineError } from './Shared'

export default function DuckBriefForm({
  form,
  onPatchForm,
  onGenerate,
  conceptStatus,
  conceptError,
  hasConcepts,
  imagesOffline,
  footnote,
}) {
  return (
    <section className="card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Prompt</p>
          <h2>Duck brief</h2>
        </div>
        <span className="tag tag--neutral">Single-piece</span>
      </div>

      <label className="field">
        <span>Theme prompt</span>
        <input
          type="text"
          value={form.prompt}
          onChange={(e) => onPatchForm('prompt', e.target.value)}
        />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Color cap</span>
          <select
            value={form.colorCap}
            onChange={(e) => onPatchForm('colorCap', Number(e.target.value))}
          >
            <option value={2}>2 colors</option>
            <option value={3}>3 colors</option>
            <option value={4}>4 colors</option>
          </select>
        </label>

        <label className="field">
          <span>Support posture</span>
          <select
            value={form.supportPolicy}
            onChange={(e) => onPatchForm('supportPolicy', e.target.value)}
          >
            <option value="Light">Light</option>
            <option value="Balanced">Balanced</option>
            <option value="Forgiving">Forgiving</option>
          </select>
        </label>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Target height</span>
          <select
            value={form.targetHeight}
            onChange={(e) => onPatchForm('targetHeight', Number(e.target.value))}
          >
            <option value={55}>55 mm</option>
            <option value={58}>58 mm</option>
            <option value={60}>60 mm</option>
          </select>
        </label>

        <button
          className={`toggle ${form.fandomRisk ? 'toggle--active' : ''}`}
          type="button"
          onClick={() => onPatchForm('fandomRisk', !form.fandomRisk)}
        >
          <span>IP tag</span>
          <strong>{form.fandomRisk ? 'Fandom risky' : 'Original-safe'}</strong>
        </button>
      </div>

      <button
        className={`toggle ${form.generateColor3mf ? 'toggle--active' : ''}`}
        type="button"
        onClick={() => onPatchForm('generateColor3mf', !form.generateColor3mf)}
      >
        <span>Color 3MF</span>
        <strong>{form.generateColor3mf ? 'On' : 'Off'}</strong>
      </button>

      <div className="actions">
        <button
          className="button button--primary"
          type="button"
          onClick={onGenerate}
          disabled={conceptStatus === 'loading' || !form.prompt.trim() || imagesOffline}
        >
          {conceptStatus === 'loading'
            ? 'Generating concepts...'
            : hasConcepts
              ? 'Regenerate Concepts'
              : 'Generate Concepts'}
        </button>
      </div>

      <p className="footnote">
        {footnote ?? 'This run uses Gemini Nano Banana for images and Meshy only for 3D output.'}
      </p>

      {conceptError ? <InlineError message={conceptError} /> : null}
    </section>
  )
}
