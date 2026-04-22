import cors from 'cors'
import express from 'express'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { generateStructuredDuckSpec } from './duck-spec.js'
import { generateConceptImages } from './gemini-image-client.js'
import { runModelPipeline } from './meshy-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')
const DATA_DIR = path.resolve(__dirname, '../data')
const GENERATED_ASSETS_DIR = path.join(DATA_DIR, 'generated-assets')
const JOB_ARTIFACTS_DIR = path.join(DATA_DIR, 'job-artifacts')
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json')

try {
  process.loadEnvFile(envPath)
} catch {
  // Local env is optional.
}

const app = express()
const PORT = Number(process.env.DUCK_API_PORT || 3020)
const DIST_DIR = path.resolve(__dirname, '../dist')
const PUBLIC_BASE_URL =
  process.env.DUCK_PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api/generated-assets', express.static(GENERATED_ASSETS_DIR))
app.use('/api/job-artifacts', express.static(JOB_ARTIFACTS_DIR))

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true })
}

function loadJobs() {
  if (!existsSync(JOBS_PATH)) {
    return new Map()
  }

  try {
    const serialized = JSON.parse(readFileSync(JOBS_PATH, 'utf8'))
    return new Map(serialized)
  } catch {
    return new Map()
  }
}

const jobs = loadJobs()

function runtimeSnapshot() {
  return {
    imageMode: process.env.GEMINI_API_KEY ? 'configured' : 'offline',
    imageNote: process.env.GEMINI_API_KEY
      ? 'Concept and angle images use Gemini Nano Banana.'
      : 'Add GEMINI_API_KEY to generate concept and angle images with Gemini Nano Banana.',
    meshyMode: process.env.MESHY_API_KEY ? 'configured' : 'offline',
    meshyNote: process.env.MESHY_API_KEY
      ? 'Meshy is configured for 3D generation and 3MF export.'
      : 'Add MESHY_API_KEY to run Meshy 3D generation and color 3MF export.',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    bambuConfigured: false,
  }
}

function nowEvent(title, detail, status = 'local') {
  return {
    id: randomUUID(),
    title,
    detail,
    status,
    createdAt: Date.now(),
  }
}

function persistJobs() {
  ensureDataDir()
  writeFileSync(JOBS_PATH, JSON.stringify([...jobs.entries()], null, 2), 'utf8')
}

function normalizeForm(input = {}) {
  return {
    prompt: String(input.prompt || '').trim(),
    colorCap: Number(input.colorCap || 3),
    targetHeight: Number(input.targetHeight || 55),
    supportPolicy: String(input.supportPolicy || 'Balanced'),
    fandomRisk: Boolean(input.fandomRisk),
    generateColor3mf: input.generateColor3mf !== false,
  }
}

function humanizeError(message) {
  if (!message) {
    return 'The request failed.'
  }

  if (message.includes('No GEMINI_API_KEY configured')) {
    return 'Gemini Nano Banana is not configured. Add a GEMINI_API_KEY to .env.local to generate concept and angle images.'
  }

  if (message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini Nano Banana image generation is quota-blocked for the current Google API project. Enable billing or image quota for this Gemini key, then try again.'
  }

  if (message.includes('No MESHY_API_KEY configured')) {
    return 'Meshy is not configured. Add a MESHY_API_KEY to .env.local to run 3D generation.'
  }

  if (message.includes('No Python runtime was found')) {
    return 'Flat-bottom normalization could not start because no Python runtime was found. Install Python 3 or set DUCK_PYTHON_BIN.'
  }

  if (message.includes('No module named')) {
    return 'Flat-bottom normalization could not start because the local Python mesh dependencies are missing.'
  }

  if (message.includes('Flat-bottom QA failed')) {
    return message
  }

  return message
}

function updateJob(jobId, patch, event) {
  const current = jobs.get(jobId)
  if (!current) return

  const next = {
    ...current,
    ...patch,
  }

  if (event) {
    next.events = [event, ...(next.events ?? [])].slice(0, 16)
  }

  jobs.set(jobId, next)
  persistJobs()
}

function recoverJobs() {
  let changed = false

  for (const [jobId, job] of jobs.entries()) {
    if (job.status === 'PENDING' || job.status === 'IN_PROGRESS') {
      jobs.set(jobId, {
        ...job,
        status: 'FAILED',
        step: 'Interrupted',
        note: 'The local Duck Ops API restarted while this job was running. Retry 3D to continue.',
        error: 'The local Duck Ops API restarted while this job was running. Retry 3D to continue.',
        events: [
          nowEvent(
            'Job interrupted',
            'The local Duck Ops API restarted while this Meshy run was in progress. Retry 3D to continue.',
            'FAILED',
          ),
          ...(job.events ?? []),
        ].slice(0, 16),
      })
      changed = true
    }
  }

  if (changed) {
    persistJobs()
  }
}

recoverJobs()

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    runtime: runtimeSnapshot(),
  })
})

app.post('/api/concepts/generate', async (req, res) => {
  const form = normalizeForm(req.body)

  if (!form.prompt) {
    return res.status(400).json({ error: 'Prompt is required.' })
  }

  try {
    const spec = await generateStructuredDuckSpec(form, {
      geminiApiKey: process.env.GEMINI_API_KEY,
    })
    const concepts = await generateConceptImages(spec, {
      geminiApiKey: process.env.GEMINI_API_KEY,
      publicBaseUrl: PUBLIC_BASE_URL,
    })

    res.json({
      spec,
      concepts,
      runtime: runtimeSnapshot(),
    })
  } catch (error) {
    res.status(500).json({
      error: humanizeError(error.message || 'Unable to generate concept images.'),
    })
  }
})

app.post('/api/model-jobs', async (req, res) => {
  const { concept, spec } = req.body || {}

  if (!(concept?.imageDataUri || concept?.imageUrl) || !spec?.viewPrompts) {
    return res.status(400).json({
      error: 'A generated concept and a structured spec are required.',
    })
  }

  const jobId = randomUUID()
  const initialJob = {
    id: jobId,
    status: 'PENDING',
    progress: 0,
    step: 'Queued',
    note: 'Waiting to create view images for the approved concept.',
    error: '',
    result: null,
    events: [
      nowEvent(
        '3D job queued',
        `Queued a Meshy build for ${concept.title}.`,
        'PENDING',
      ),
    ],
    createdAt: Date.now(),
    request: {
      conceptId: concept.id,
      conceptTitle: concept.title,
      specTitle: spec.title,
    },
  }

  jobs.set(jobId, initialJob)
  persistJobs()
  res.json({ jobId })

  let lastEventStep = ''

  void runModelPipeline({
    concept,
    geminiApiKey: process.env.GEMINI_API_KEY,
    jobId,
    spec,
    meshyApiKey: process.env.MESHY_API_KEY,
    publicBaseUrl: PUBLIC_BASE_URL,
    onProgress: (update) => {
      const step = update.step || 'Working'
      const isNewStep = step !== lastEventStep
      lastEventStep = step

      updateJob(
        jobId,
        {
          status: update.status || 'IN_PROGRESS',
          progress: update.progress ?? 0,
          step,
          note: update.note || '',
        },
        isNewStep ? nowEvent(step, update.note || '', update.status || 'IN_PROGRESS') : undefined,
      )
    },
  })
    .then((result) => {
      updateJob(
        jobId,
        {
          status: 'SUCCEEDED',
          progress: 100,
          step: 'Completed',
          note: 'Meshy returned the model artifacts successfully.',
          result,
        },
        nowEvent('3D job completed', 'All requested model artifacts are now available.', 'SUCCEEDED'),
      )
    })
    .catch((error) => {
      updateJob(
        jobId,
        {
          status: 'FAILED',
          progress: 100,
          step: 'Failed',
          note: 'The Meshy pipeline failed.',
          error: humanizeError(error.message || 'The Meshy pipeline failed.'),
        },
        nowEvent('3D job failed', humanizeError(error.message || 'The Meshy pipeline failed.'), 'FAILED'),
      )
    })
})

app.get('/api/model-jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id)

  if (!job) {
    return res.status(404).json({
      error: 'Job not found.',
    })
  }

  res.json(job)
})

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get('{*splat}', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

process.on('uncaughtException', (error) => {
  console.error('Duck dashboard API uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Duck dashboard API unhandled rejection:', reason)
})

app.listen(PORT, () => {
  console.log(`Duck dashboard API running on http://127.0.0.1:${PORT}`)
  if (existsSync(DIST_DIR)) {
    console.log(`Serving production build from ${DIST_DIR}`)
  }
})
