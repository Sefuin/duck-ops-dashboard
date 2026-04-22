import { generateViewImages } from './gemini-image-client.js'
import { normalizeFlatBottom } from './mesh-normalizer.js'

const MESHY_BASE_URL = 'https://api.meshy.ai/openapi/v1'

function resolvedMeshyKey(apiKey) {
  const key = apiKey?.trim()
  if (!key) {
    throw new Error('No MESHY_API_KEY configured. Add a real key to .env.local to use 3D generation.')
  }
  return key
}

async function readMeshyError(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = await response.json()
    return payload?.message || payload?.error || JSON.stringify(payload)
  }

  return response.text()
}

async function meshyRequest(path, { apiKey, body, method = 'GET' } = {}) {
  const response = await fetch(`${MESHY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resolvedMeshyKey(apiKey)}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(await readMeshyError(response))
  }

  return response.json()
}

async function createTask(path, payload, apiKey) {
  const response = await meshyRequest(path, {
    apiKey,
    method: 'POST',
    body: payload,
  })

  return response.result
}

async function getTask(path, id, apiKey) {
  return meshyRequest(`${path}/${id}`, { apiKey })
}

async function waitForTask({
  apiKey,
  id,
  label,
  onProgress,
  path,
  pollMs = 3000,
  timeoutMs = 8 * 60 * 1000,
}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const task = await getTask(path, id, apiKey)

    onProgress?.({
      step: label,
      progress: task.progress ?? 0,
      note: task.status === 'SUCCEEDED' ? `${label} complete.` : `${label} is ${task.status.toLowerCase()}.`,
      status: task.status,
    })

    if (task.status === 'SUCCEEDED') {
      return task
    }

    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(task.task_error?.message || `${label} failed.`)
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollMs)
    })
  }

  throw new Error(`${label} timed out.`)
}

export async function runModelPipeline({
  concept,
  geminiApiKey,
  jobId,
  meshyApiKey,
  onProgress,
  publicBaseUrl,
  spec,
}) {
  const referenceImage = concept?.imageDataUri || concept?.imageUrl

  if (!referenceImage) {
    throw new Error('The selected concept does not include a usable concept image.')
  }

  onProgress({
    step: 'Generating view images',
    progress: 8,
    note: 'Creating consistent reference angles with Gemini Nano Banana.',
    status: 'IN_PROGRESS',
  })

  const viewStatus = new Map([
    ['front', 'pending'],
    ['three-quarter', 'pending'],
    ['side', 'pending'],
  ])

  function viewSummary() {
    const done = [...viewStatus.values()].filter((s) => s === 'done').length
    return `${done}/${viewStatus.size} views complete`
  }

  const viewImages = await generateViewImages({
    geminiApiKey,
    publicBaseUrl,
    referenceImage,
    spec,
    onImage: (view, completedCount, totalCount) => {
      viewStatus.set(view.key, 'done')
      onProgress({
        step: `View images (${viewSummary()})`,
        progress: Math.min(38, 10 + Math.round((completedCount / totalCount) * 28)),
        note: `${view.label} complete.`,
        status: 'IN_PROGRESS',
      })
    },
  })

  onProgress({
    step: 'Launching Meshy 3D',
    progress: 42,
    note: 'Submitting the Gemini angle pack to Meshy Multi-Image to 3D.',
    status: 'IN_PROGRESS',
  })

  const threeDTaskId = await createTask(
    '/multi-image-to-3d',
    {
      ai_model: 'latest',
      image_urls: viewImages.map((view) => view.imageDataUri || view.imageUrl),
      should_remesh: true,
      should_texture: Boolean(spec.generateColor3mf),
      symmetry_mode: 'on',
      image_enhancement: true,
      remove_lighting: true,
      texture_prompt: [
        `A ${spec.targetHeight}mm collectible duck with a flat stable base.`,
        'Preserve the fused costume silhouette and bold color blocking from the input images.',
        `Keep the physical color count suitable for a ${spec.colorCap}-color print package.`,
      ].join(' '),
      target_formats: spec.generateColor3mf ? ['glb'] : ['glb', '3mf'],
    },
    meshyApiKey,
  )

  const modelTask = await waitForTask({
    apiKey: meshyApiKey,
    id: threeDTaskId,
    label: 'Meshy 3D build',
    path: '/multi-image-to-3d',
    onProgress: (update) => {
      onProgress({
        ...update,
        progress: Math.min(86, 42 + Math.round((update.progress ?? 0) * 0.44)),
      })
    },
  })

  const normalization = await normalizeFlatBottom({
    jobId,
    modelTask,
    onProgress,
    publicBaseUrl,
    spec,
  })

  let printTask = null

  if (spec.generateColor3mf) {
    onProgress({
      step: 'Generating colored 3MF',
      progress: 96,
      note: `Converting the model to a ${spec.colorCap}-color 3MF print package from Meshy's original model.`,
      status: 'IN_PROGRESS',
    })

    const printTaskId = await createTask(
      '/print/multi-color',
      {
        input_task_id: threeDTaskId,
        max_colors: spec.colorCap,
        max_depth: 4,
      },
      meshyApiKey,
    )

    printTask = await waitForTask({
      apiKey: meshyApiKey,
      id: printTaskId,
      label: 'Colored 3MF build',
      path: '/print/multi-color',
      onProgress: (update) => {
        onProgress({
          ...update,
          progress: Math.min(99, 96 + Math.round((update.progress ?? 0) * 0.03)),
        })
      },
    })
  }

  return {
    modelTask,
    normalization,
    printTask,
    viewImages: viewImages.map((view) => ({
      key: view.key,
      label: view.label,
      imageUrl: view.imageUrl,
      assetId: view.assetId,
      provider: 'gemini-nano-banana',
    })),
  }
}
