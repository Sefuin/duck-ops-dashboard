const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'A short internal title for the duck concept.',
    },
    summary: {
      type: 'string',
      description: 'One concise summary paragraph for ops.',
    },
    riskTag: {
      type: 'string',
      description: 'Use either Fandom risky or Original-safe.',
    },
    guardrails: {
      type: 'array',
      items: { type: 'string' },
      minItems: 4,
      maxItems: 6,
    },
    qaChecklist: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 5,
    },
    concepts: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          supportLoad: { type: 'string' },
          accent: { type: 'string' },
          colors: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 4,
          },
          prompt: { type: 'string' },
        },
        required: ['id', 'title', 'summary', 'supportLoad', 'accent', 'colors', 'prompt'],
      },
    },
    viewPrompts: {
      type: 'object',
      properties: {
        front: { type: 'string' },
        threeQuarter: { type: 'string' },
        side: { type: 'string' },
      },
      required: ['front', 'threeQuarter', 'side'],
    },
  },
  required: ['title', 'summary', 'riskTag', 'guardrails', 'qaChecklist', 'concepts', 'viewPrompts'],
}

const HEX_TO_NAME = {
  '#000000': 'Black', '#ffffff': 'White', '#ff0000': 'Red', '#00ff00': 'Green',
  '#0000ff': 'Blue', '#ffff00': 'Yellow', '#ffa500': 'Orange', '#800080': 'Purple',
  '#ffd700': 'Gold', '#c0c0c0': 'Silver', '#808080': 'Gray', '#4f4f4f': 'Dark Gray',
  '#36454f': 'Charcoal', '#2c3539': 'Gunmetal', '#0a0a0a': 'Near Black',
  '#a52a2a': 'Brown', '#ff69b4': 'Pink', '#00ced1': 'Teal', '#8b0000': 'Dark Red',
  '#006400': 'Dark Green', '#00008b': 'Navy', '#f5f5dc': 'Beige', '#fffff0': 'Ivory',
}

function normalizeColorName(color) {
  if (!color || typeof color !== 'string') return color
  const lower = color.toLowerCase().trim()
  if (!lower.startsWith('#')) return color
  if (HEX_TO_NAME[lower]) return HEX_TO_NAME[lower]
  const r = parseInt(lower.slice(1, 3), 16)
  const g = parseInt(lower.slice(3, 5), 16)
  const b = parseInt(lower.slice(5, 7), 16)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (lum > 200) return 'Light'
  if (lum < 50) return 'Dark'
  if (r > g && r > b) return 'Warm'
  if (b > r && b > g) return 'Cool'
  return 'Muted'
}

function titleCase(input) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildFallbackSpec(form) {
  const title = titleCase(form.prompt.trim() || 'Mystery duck')
  const riskTag = form.fandomRisk ? 'Fandom risky' : 'Original-safe'
  const colorPlan = form.colorCap <= 3 ? 'Keep the palette disciplined.' : 'Use the fourth color only where it improves readability.'

  return {
    title,
    summary: `${title} is being shaped as a dashboard-scale geek duck with a stable base, fused costume cues, and a clean silhouette that avoids fragile props.`,
    riskTag,
    targetHeight: form.targetHeight,
    colorCap: form.colorCap,
    generateColor3mf: form.generateColor3mf,
    supportPolicy: form.supportPolicy,
    guardrails: [
      `Lock the body around ${form.targetHeight} mm tall with a flat bottom and no separate stand.`,
      'Fuse all fandom cues into the body silhouette instead of using thin floating accessories.',
      `Keep support posture ${form.supportPolicy.toLowerCase()} and avoid awkward internal support towers.`,
      `Cap the physical palette at ${form.colorCap} colors and favor bold color blocking over tiny accent zones.`,
    ],
    qaChecklist: [
      'Check that the duck sits upright with a broad contact patch.',
      'Check that the beak, tail, and costume cues are thick enough for a 0.4 mm nozzle profile.',
      'Reject any concept that reads as printable only with heavy hidden supports.',
      form.generateColor3mf
        ? 'Generate a colored 3MF only after the shape build succeeds.'
        : 'Request a plain 3MF directly from the shape build.',
    ],
    concepts: [
      {
        id: 'signal',
        title: 'Signal',
        summary: 'Most balanced version with the safest silhouette and readable geek cues.',
        supportLoad: form.supportPolicy === 'Light' ? 'Low support' : 'Low to medium support',
        accent: 'midnight',
        colors: ['Black', 'Yellow', 'White'].slice(0, form.colorCap),
        prompt: `A collectible rubber duck themed as ${form.prompt}, front-facing hero render, fused costume details, stable flat base, single-piece body, no props, no text, premium product photo, clean studio lighting, print-friendly silhouette, simple bold color blocking. ${colorPlan}`,
      },
      {
        id: 'dash',
        title: 'Dash',
        summary: 'Softer costume treatment with extra manufacturing forgiveness.',
        supportLoad: 'Low support',
        accent: 'steel',
        colors: ['Charcoal', 'Gold', 'Warm white'].slice(0, form.colorCap),
        prompt: `A dashboard-friendly rubber duck inspired by ${form.prompt}, softer costume lines, fused accessories, compact body, flat stable base, no floating parts, no text, clean studio background, product render, optimized for support-limited FDM printing. ${colorPlan}`,
      },
      {
        id: 'crest',
        title: 'Crest',
        summary: 'Higher visual punch with slightly more assertive costume relief.',
        supportLoad: form.supportPolicy === 'Forgiving' ? 'Medium support' : 'Medium support',
        accent: 'amber',
        colors: ['Black', 'Gold', 'Gray'].slice(0, form.colorCap),
        prompt: `A geek collectible duck based on ${form.prompt}, bold emblem-like costume cues, fused cape or mask relief only, flat stable bottom, no weapons, no separate stand, print-safe body proportions, crisp product render on a neutral backdrop. ${colorPlan}`,
      },
    ],
    viewPrompts: {
      front:
        'Turn the same duck into a straight-on front view. Preserve the identical colors, silhouette, costume cues, and proportions. Keep the duck centered, upright, and alone on a plain background.',
      threeQuarter:
        'Turn the same duck into a front three-quarter product render. Preserve the exact same duck, colors, and costume details. Keep the base visible and the object centered on a plain background.',
      side:
        'Turn the same duck into a clean side view. Preserve the exact same duck, colors, and silhouette. Show the full side profile clearly with a plain background and no extra props.',
    },
  }
}

async function generateWithGemini(form, geminiApiKey) {
  const prompt = [
    'You are designing a 3D printable geek-themed rubber duck for Jeep ducking.',
    `User theme: ${form.prompt}.`,
    `Target height: ${form.targetHeight} mm.`,
    `Color cap: ${form.colorCap}.`,
    `Support posture: ${form.supportPolicy}.`,
    `Risk tag should be ${form.fandomRisk ? 'Fandom risky' : 'Original-safe'}.`,
    `Generate color 3MF after 3D success: ${form.generateColor3mf ? 'yes' : 'no'}.`,
    'Important print rules:',
    '- single-piece only',
    '- flat stable bottom',
    '- fused accessories only',
    '- no floating props, no thin spikes, no weapons, no text',
    '- strong silhouette and bold color blocking',
    '- references should feel premium and collectible, not childish clipart',
    'Return exactly 3 concept prompts that are distinct in mood but still represent the same duck brief.',
    'The view prompts should describe how to turn the approved concept image into front, three-quarter, and side views of the exact same duck.',
  ].join('\n')

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: SPEC_SCHEMA,
        },
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini request failed: ${errorText}`)
  }

  const payload = await response.json()
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini returned an empty structured spec.')
  }

  return JSON.parse(text)
}

export async function generateStructuredDuckSpec(form, { geminiApiKey }) {
  const fallback = buildFallbackSpec(form)

  if (!geminiApiKey) {
    return fallback
  }

  try {
    const structured = await generateWithGemini(form, geminiApiKey)

    if (Array.isArray(structured.concepts)) {
      for (const concept of structured.concepts) {
        if (Array.isArray(concept.colors)) {
          concept.colors = concept.colors.map(normalizeColorName)
        }
      }
    }

    return {
      ...structured,
      targetHeight: form.targetHeight,
      colorCap: form.colorCap,
      generateColor3mf: form.generateColor3mf,
      supportPolicy: form.supportPolicy,
      riskTag: form.fandomRisk ? 'Fandom risky' : structured.riskTag,
    }
  } catch {
    return fallback
  }
}
