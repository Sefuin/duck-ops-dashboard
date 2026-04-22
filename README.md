# Duck Ops Dashboard

Standalone duck workflow app with a local backend that uses Gemini for structured spec and image generation, Meshy for 3D jobs, and a local `trimesh` pass to normalize flat bottoms on returned `GLB` files.

## Run

Install dependencies first:

```bash
npm install
python -m pip install -r server/requirements.txt
```

Then start the app:

```bash
npm run dev
```

The dev command starts:

- the duck API on `http://127.0.0.1:3020`
- the Vite UI on `http://127.0.0.1:4174`

Build the dashboard:

```bash
npm run build
```

## Scope

- Structured duck spec generation with Gemini when `GEMINI_API_KEY` is configured
- Gemini Nano Banana concept image generation
- Gemini Nano Banana angle render generation
- Real Meshy multi-image-to-3D job launch
- Local `trimesh` flat-bottom normalization and QA on the returned `GLB`
- Optional Meshy multi-color 3MF generation
- Honest UI state for anything not wired yet, including Bambu Studio slicing

## Environment

Copy `.env.example` to `.env.local` and add your real keys there.

If the local flat-bottom worker needs an explicit Python path, set `DUCK_PYTHON_BIN`. The Python dependencies for the worker are listed in `server/requirements.txt`.
