import { useEffect, useMemo, useRef, useState } from 'react'
import ActivityLog from './components/ActivityLog'
import ConceptDetail from './components/ConceptDetail'
import ConceptGrid from './components/ConceptGrid'
import DuckBriefForm from './components/DuckBriefForm'
import ErrorBoundary from './components/ErrorBoundary'
import JobProgress from './components/JobProgress'
import SpecDisplay from './components/SpecDisplay'
import { StatusTile } from './components/Shared'

const API_BASE =
  import.meta.env.VITE_DUCK_API_BASE ||
  (import.meta.env.DEV ? 'http://127.0.0.1:3020' : '')
const HEALTH_RETRY_LIMIT = 4
const HEALTH_REFRESH_MS = 15000
const JOB_POLL_MS = 3500
const RETRYABLE_FETCH_ERROR =
  'Duck Ops API is unreachable. Make sure the local duck API server is running on port 3020.'

const INITIAL_FORM = {
  prompt: 'Batman duck',
  colorCap: 3,
  targetHeight: 55,
  supportPolicy: 'Balanced',
  fandomRisk: true,
  generateColor3mf: true,
}

function buildApiUrl(path) {
  return `${API_BASE}${path}`
}

async function requestJson(path, options) {
  let response

  try {
    response = await fetch(buildApiUrl(path), options)
  } catch {
    throw new Error(RETRYABLE_FETCH_ERROR)
  }

  const raw = await response.text()
  let payload = null

  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      if (response.ok) {
        throw new Error('Duck Ops API returned an invalid JSON response.')
      }
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || raw || `Request failed with status ${response.status}.`)
  }

  return payload
}

function App() {
  const [health, setHealth] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [spec, setSpec] = useState(null)
  const [concepts, setConcepts] = useState([])
  const [selectedConceptId, setSelectedConceptId] = useState('')
  const [conceptStatus, setConceptStatus] = useState('idle')
  const [conceptError, setConceptError] = useState('')
  const [localEvents, setLocalEvents] = useState([])
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState(null)
  const [jobError, setJobError] = useState('')
  const [jobStatus, setJobStatus] = useState('idle')
  const lastJobEventCount = useRef(0)

  const selectedConcept = useMemo(
    () => concepts.find((c) => c.id === selectedConceptId) ?? null,
    [concepts, selectedConceptId],
  )

  // --- Health check with retry ---
  useEffect(() => {
    let ignore = false
    let refreshTimer = null

    async function loadHealth(attempt = 1) {
      try {
        const payload = await requestJson('/api/health')
        if (!ignore) {
          setHealth(payload)
        }
      } catch (error) {
        if (ignore) return
        if (attempt < HEALTH_RETRY_LIMIT) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 4000)
          await new Promise((r) => setTimeout(r, delay))
          if (!ignore) await loadHealth(attempt + 1)
        } else {
          if (!ignore) {
            setHealth({
              ok: false,
              runtime: {
                imageMode: 'offline',
                meshyMode: 'offline',
                geminiConfigured: false,
                bambuConfigured: false,
              },
              message: error.message,
            })
          }
        }
      }
    }

    loadHealth()
    refreshTimer = window.setInterval(() => {
      void loadHealth()
    }, HEALTH_REFRESH_MS)

    return () => {
      ignore = true
      if (refreshTimer !== null) {
        clearInterval(refreshTimer)
      }
    }
  }, [])

  // --- Job polling ---
  useEffect(() => {
    if (!jobId) return undefined

    let cancelled = false
    let timerId = null

    async function pollJob() {
      try {
        const payload = await requestJson(`/api/model-jobs/${jobId}`)

        if (cancelled) return

        setJob(payload)
        setJobError('')
        setJobStatus(
          payload.status === 'FAILED'
            ? 'error'
            : payload.status === 'SUCCEEDED'
              ? 'ready'
              : 'loading',
        )

        if (Array.isArray(payload.events) && payload.events.length > lastJobEventCount.current) {
          lastJobEventCount.current = payload.events.length
        }

        if (payload.status === 'PENDING' || payload.status === 'IN_PROGRESS') {
          timerId = window.setTimeout(pollJob, JOB_POLL_MS)
        }
      } catch (error) {
        if (!cancelled) {
          setJobError(error.message)
          setJobStatus('error')
          timerId = window.setTimeout(pollJob, JOB_POLL_MS * 2)
        }
      }
    }

    pollJob()
    return () => {
      cancelled = true
      if (timerId !== null) clearTimeout(timerId)
    }
  }, [jobId])

  // --- Actions ---
  function patchForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function pushLocalEvent(title, detail) {
    setLocalEvents((current) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          detail,
          createdAt: Date.now(),
        },
        ...current,
      ].slice(0, 8),
    )
  }

  async function handleGenerateConcepts() {
    setConceptStatus('loading')
    setConceptError('')
    setJob(null)
    setJobId('')
    setJobStatus('idle')
    setJobError('')

    try {
      const payload = await requestJson('/api/concepts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      setSpec(payload.spec)
      setConcepts(payload.concepts)
      setSelectedConceptId(payload.concepts[0]?.id ?? '')
      setHealth({ ok: true, runtime: payload.runtime })
      setConceptStatus('ready')
      pushLocalEvent(
        'Concept images generated',
        `${payload.concepts.length} Nano Banana concept images were created for ${payload.spec.title}.`,
      )
    } catch (error) {
      setConceptStatus('error')
      setConceptError(error.message)
      pushLocalEvent('Concept generation failed', error.message)
    }
  }

  async function handleGenerateModel() {
    if (!selectedConcept || !spec) return

    setJobStatus('loading')
    setJobError('')
    setJob(null)
    setJobId('')
    lastJobEventCount.current = 0

    try {
      const payload = await requestJson('/api/model-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, concept: selectedConcept }),
      })

      setJobId(payload.jobId)
      pushLocalEvent(
        '3D job queued',
        `${selectedConcept.title} was sent to Meshy with ${form.generateColor3mf ? 'colored 3MF' : 'plain 3MF'} output enabled.`,
      )
    } catch (error) {
      setJobStatus('error')
      setJobError(error.message)
      pushLocalEvent('3D job failed to start', error.message)
    }
  }

  // --- Derived state ---
  const combinedEvents = [
    ...(job?.events ?? []),
    ...localEvents.map((event) => ({
      id: event.id,
      title: event.title,
      detail: event.detail,
      createdAt: event.createdAt,
      status: 'local',
    })),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 10)

  const imagesOffline = health?.runtime?.imageMode === 'offline'
  const meshyOffline = health?.runtime?.meshyMode === 'offline'

  // --- Loading state ---
  if (health === null) {
    return (
      <div className="shell">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Connecting to Duck Ops API...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="shell">
        <header className="hero">
          <div>
            <p className="eyebrow">Duck Ops / Live Wiring</p>
            <h1>Gemini + Meshy duck pipeline</h1>
            <p className="hero__copy">
              Generate a structured duck spec, create Nano Banana concept images,
              approve one, and push Gemini-derived angle views into a real Meshy
              3D job with optional colored 3MF output.
            </p>
          </div>

          <div className="hero__status">
            <StatusTile
              label="Images"
              value={
                health.runtime?.imageMode === 'configured'
                  ? 'Key present'
                  : 'Offline'
              }
              tone={
                health.runtime?.imageMode === 'configured'
                  ? 'success'
                  : 'danger'
              }
            />
            <StatusTile
              label="Spec"
              value={health.runtime?.geminiConfigured ? 'Gemini structured' : 'Fallback spec'}
              tone={health.runtime?.geminiConfigured ? 'success' : 'neutral'}
            />
            <StatusTile
              label="3D"
              value={health.runtime?.meshyMode === 'configured' ? 'Key present' : 'Offline'}
              tone={health.runtime?.meshyMode === 'configured' ? 'success' : 'danger'}
            />
          </div>
        </header>

        <main className="layout">
          <aside className="sidebar">
            <DuckBriefForm
              form={form}
              onPatchForm={patchForm}
              onGenerate={handleGenerateConcepts}
              conceptStatus={conceptStatus}
              conceptError={conceptError}
              hasConcepts={concepts.length > 0}
              imagesOffline={imagesOffline}
              footnote={health.runtime?.imageNote}
            />

            <SpecDisplay spec={spec} />

            <section className="card">
              <div className="card__header">
                <div>
                  <p className="eyebrow">QA</p>
                  <h2>Reality check</h2>
                </div>
                <span className="tag tag--neutral">Honest state</span>
              </div>

              <ul className="bullet-list">
                <li>
                  Nano Banana concept generation:{' '}
                  {imagesOffline ? 'offline - add GEMINI_API_KEY' : 'configured'}
                </li>
                <li>Nano Banana angle renders: {imagesOffline ? 'offline' : 'configured'}</li>
                <li>Meshy multi-image 3D job: {meshyOffline ? 'offline' : 'configured'}</li>
                <li>Flat-bottom normalization: Python + trimesh QA pass after Meshy GLB</li>
                <li>
                  Meshy multi-color print:{' '}
                  {meshyOffline ? 'offline' : 'configured when enabled'}
                </li>
                <li>Meshy colored 3MF is still pre-normalization in this pass</li>
                <li>Bambu Studio slicing: not wired yet in this pass</li>
              </ul>
            </section>
          </aside>

          <section className="main">
            <ConceptGrid
              concepts={concepts}
              conceptStatus={conceptStatus}
              selectedConceptId={selectedConceptId}
              onSelectConcept={setSelectedConceptId}
            />

            <section className="grid-2">
              <ConceptDetail
                concept={selectedConcept}
                job={job}
                jobStatus={jobStatus}
                jobError={jobError}
                generateColor3mf={form.generateColor3mf}
                meshyOffline={meshyOffline}
                onGenerateModel={handleGenerateModel}
              />
              <JobProgress job={job} jobStatus={jobStatus} />
            </section>

            <ActivityLog events={combinedEvents} />
          </section>
        </main>
      </div>
    </ErrorBoundary>
  )
}

export default App
