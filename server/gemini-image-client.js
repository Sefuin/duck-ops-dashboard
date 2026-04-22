import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GENERATED_ASSETS_DIR = path.resolve(__dirname, '../data/generated-assets')
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'

function resolvedGeminiKey(apiKey) {
  const key = apiKey?.trim()
  if (!key) {
    throw new Error(
      'No GEMINI_API_KEY configured. Add a Gemini Nano Banana key to .env.local to generate concept and angle images.',
    )
  }
  return key
}

function resolvedImageModel(modelName) {
  return String(modelName || process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL).trim()
}

function ensureGeneratedAssetsDir() {
  mkdirSync(GENERATED_ASSETS_DIR, { recursive: true })
}

function extensionForMimeType(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/png':
    default:
      return 'png'
  }
}

function parseDataUri(dataUri) {
  const match = /^data:(.+?);base64,(.+)$/s.exec(String(dataUri || '').trim())
  if (!match) {
    throw new Error('The provided image is not a valid base64 data URI.')
  }

  return {
    mimeType: match[1],
    data: match[2],
  }
}

async function imageSourceToInlinePart(imageSource) {
  const source = String(imageSource || '').trim()

  if (!source) {
    throw new Error('An image source was required but missing.')
  }

  if (source.startsWith('data:')) {
    const parsed = parseDataUri(source)
    return {
      inline_data: {
        mime_type: parsed.mimeType,
        data: parsed.data,
      },
    }
  }

  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Unable to fetch the reference image (${response.status}).`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const mimeType = response.headers.get('content-type') || 'image/png'

  return {
    inline_data: {
      mime_type: mimeType,
      data: Buffer.from(arrayBuffer).toString('base64'),
    },
  }
}

async function readGeminiError(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = await response.json()
    return payload?.error?.message || payload?.message || JSON.stringify(payload)
  }

  return response.text()
}

function extractImagePart(payload) {
  for (const candidate of payload?.candidates ?? []) {
    for (const part of candidate?.content?.parts ?? []) {
      const inline = part.inlineData || part.inline_data
      if (inline?.data) {
        return {
          mimeType: inline.mimeType || inline.mime_type || 'image/png',
          data: inline.data,
        }
      }
    }
  }

  return null
}

function persistGeneratedImage(imagePart, publicBaseUrl) {
  ensureGeneratedAssetsDir()

  const extension = extensionForMimeType(imagePart.mimeType)
  const filename = `${randomUUID()}.${extension}`
  const filePath = path.join(GENERATED_ASSETS_DIR, filename)
  const buffer = Buffer.from(imagePart.data, 'base64')

  writeFileSync(filePath, buffer)

  const normalizedBase = String(publicBaseUrl || '').replace(/\/$/, '')

  return {
    assetId: filename,
    imageUrl: `${normalizedBase}/api/generated-assets/${filename}`,
    imageDataUri: `data:${imagePart.mimeType};base64,${imagePart.data}`,
  }
}

async function generateGeminiImage({
  aspectRatio = '1:1',
  geminiApiKey,
  modelName,
  prompt,
  publicBaseUrl,
  referenceImages = [],
}) {
  const parts = [{ text: prompt }]

  for (const imageSource of referenceImages) {
    parts.push(await imageSourceToInlinePart(imageSource))
  }

  const model = resolvedImageModel(modelName)
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': resolvedGeminiKey(geminiApiKey),
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(await readGeminiError(response))
  }

  const payload = await response.json()
  const imagePart = extractImagePart(payload)

  if (!imagePart) {
    throw new Error('Gemini Nano Banana returned no image payload.')
  }

  return persistGeneratedImage(imagePart, publicBaseUrl)
}

export async function generateConceptImages(spec, { geminiApiKey, publicBaseUrl }) {
  const concepts = []

  for (const concept of spec.concepts) {
    const image = await generateGeminiImage({
      geminiApiKey,
      prompt: concept.prompt,
      publicBaseUrl,
    })

    concepts.push({
      ...concept,
      ...image,
      provider: 'gemini-nano-banana',
    })
  }

  return concepts
}

export async function generateViewImages({
  geminiApiKey,
  onImage,
  publicBaseUrl,
  referenceImage,
  spec,
}) {
  const viewDefinitions = [
    { key: 'front', label: 'Front view', prompt: spec.viewPrompts.front },
    {
      key: 'three-quarter',
      label: 'Three-quarter view',
      prompt: spec.viewPrompts.threeQuarter,
    },
    { key: 'side', label: 'Side view', prompt: spec.viewPrompts.side },
  ]

  const images = []

  for (const view of viewDefinitions) {
    const image = await generateGeminiImage({
      geminiApiKey,
      prompt: view.prompt,
      publicBaseUrl,
      referenceImages: [referenceImage],
    })

    const payload = {
      key: view.key,
      label: view.label,
      ...image,
    }

    images.push(payload)
    onImage?.(payload, images.length, viewDefinitions.length)
  }

  return images
}
