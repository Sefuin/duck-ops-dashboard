import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const JOB_ARTIFACTS_DIR = path.join(DATA_DIR, 'job-artifacts')
const NORMALIZER_PATH = path.join(__dirname, 'normalize_flat_bottom.py')
const execFileAsync = promisify(execFile)

const QA_DEFAULTS = {
  maxCutMm: 2.0,
  maxCutRatio: 0.04,
  maxVolumeLossRatio: 0.03,
  minContactAreaRatio: 0.06,
  planarityToleranceMm: 0.05,
  baseFaceToleranceMm: 0.08,
  candidateCount: 11,
}

async function resolvePythonCommand() {
  const candidates = []

  if (process.env.DUCK_PYTHON_BIN?.trim()) {
    candidates.push({
      command: process.env.DUCK_PYTHON_BIN.trim(),
      args: [],
    })
  }

  candidates.push({ command: 'python', args: [] })

  if (process.platform === 'win32') {
    candidates.push({ command: 'py', args: ['-3'] })
  }

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate.command, [...candidate.args, '--version'])
      return candidate
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(
    'No Python runtime was found for flat-bottom normalization. Install Python 3 or set DUCK_PYTHON_BIN.',
  )
}

function ensureJobArtifactDir(jobId) {
  const dir = path.join(JOB_ARTIFACTS_DIR, jobId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function artifactUrl(jobId, filename, publicBaseUrl) {
  const base = String(publicBaseUrl || '').replace(/\/$/, '')
  return `${base}/api/job-artifacts/${jobId}/${filename}`
}

async function downloadArtifact(url, destinationPath) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Unable to download the Meshy GLB artifact (${response.status}).`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(destinationPath, buffer)
}

function readJson(pathname) {
  return JSON.parse(readFileSync(pathname, 'utf8'))
}

export async function normalizeFlatBottom({
  jobId,
  modelTask,
  onProgress,
  publicBaseUrl,
  spec,
}) {
  const remoteGlbUrl = modelTask?.model_urls?.glb || modelTask?.model_url

  if (!remoteGlbUrl) {
    throw new Error('Meshy did not return a GLB artifact to normalize.')
  }

  const artifactDir = ensureJobArtifactDir(jobId)
  const originalFilename = 'meshy-original.glb'
  const normalizedFilename = 'flat-bottom-normalized.glb'
  const reportFilename = 'flat-bottom-report.json'
  const originalPath = path.join(artifactDir, originalFilename)
  const normalizedPath = path.join(artifactDir, normalizedFilename)
  const reportPath = path.join(artifactDir, reportFilename)

  onProgress?.({
    step: 'Downloading Meshy GLB',
    progress: 88,
    note: 'Downloading Meshy GLB so the flat-bottom pass can run locally.',
    status: 'IN_PROGRESS',
  })

  await downloadArtifact(remoteGlbUrl, originalPath)

  onProgress?.({
    step: 'Normalizing flat bottom',
    progress: 91,
    note: 'Cutting and capping the base with trimesh, then scaling back to target height.',
    status: 'IN_PROGRESS',
  })

  const python = await resolvePythonCommand()
  const args = [
    ...python.args,
    NORMALIZER_PATH,
    '--input',
    originalPath,
    '--output',
    normalizedPath,
    '--report',
    reportPath,
    '--target-height',
    String(spec.targetHeight),
    '--max-cut-mm',
    String(QA_DEFAULTS.maxCutMm),
    '--max-cut-ratio',
    String(QA_DEFAULTS.maxCutRatio),
    '--max-volume-loss-ratio',
    String(QA_DEFAULTS.maxVolumeLossRatio),
    '--min-contact-area-ratio',
    String(QA_DEFAULTS.minContactAreaRatio),
    '--planarity-tolerance-mm',
    String(QA_DEFAULTS.planarityToleranceMm),
    '--base-face-tolerance-mm',
    String(QA_DEFAULTS.baseFaceToleranceMm),
    '--candidate-count',
    String(QA_DEFAULTS.candidateCount),
  ]

  try {
    await execFileAsync(python.command, args, {
      cwd: path.resolve(__dirname, '..'),
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 5,
    })
  } catch (error) {
    const report = (() => {
      try {
        return readJson(reportPath)
      } catch {
        return null
      }
    })()

    if (report?.qa) {
      throw new Error(
        [
          'Flat-bottom QA failed.',
          report.qa.cut_depth_mm != null
            ? `Cut depth: ${report.qa.cut_depth_mm.toFixed(2)} mm.`
            : null,
          report.qa.contact_area_ratio != null
            ? `Contact patch: ${(report.qa.contact_area_ratio * 100).toFixed(1)}%.`
            : null,
          report.qa.removed_volume_ratio != null
            ? `Volume removed: ${(report.qa.removed_volume_ratio * 100).toFixed(1)}%.`
            : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
    }

    const stderr = error.stderr?.trim()
    throw new Error(stderr || error.message || 'Flat-bottom normalization failed.')
  }

  const report = readJson(reportPath)
  const warnings = [
    'Meshy colored 3MF output does not include the local flat-bottom normalization yet.',
  ]

  if (!report.qa.watertight) {
    warnings.push(
      'The normalized GLB still reports as non-watertight in trimesh, so treat it as QA-improved geometry rather than a final print package.',
    )
  }

  onProgress?.({
    step: 'Flat-bottom QA passed',
    progress: 94,
    note: `Base contact patch ${(report.qa.contact_area_ratio * 100).toFixed(1)}%; cut depth ${report.qa.cut_depth_mm.toFixed(2)} mm.`,
    status: 'IN_PROGRESS',
  })

  return {
    status: report.status,
    qa: report.qa,
    thresholds: report.thresholds,
    originalModelUrl: remoteGlbUrl,
    downloadedOriginalUrl: artifactUrl(jobId, originalFilename, publicBaseUrl),
    normalizedModelUrl: artifactUrl(jobId, normalizedFilename, publicBaseUrl),
    reportUrl: artifactUrl(jobId, reportFilename, publicBaseUrl),
    warnings,
  }
}
