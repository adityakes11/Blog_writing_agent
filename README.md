# Inkline Blog Studio

Inkline is a production-style, research-backed blog writing workspace. Enter a topic, choose the audience and tone, and get a complete article together with its research sources and outline.

The application uses a FastAPI web server and a LangGraph writing pipeline. It does **not** use Streamlit or an image-generation LLM. When enabled, the cover image is sourced from Unsplash.

The attached LangSmith screenshot shows the optional observability view: a successful trace count with no errors. Enable the LangSmith variables below to get the same monitoring experience for your deployed pipeline.

## What it includes

- A responsive browser UI built with HTML, CSS, and JavaScript
- Research routing for closed-book, hybrid, and current/news topics
- Complete research output with source URLs, snippets, and publication metadata
- Structured blog planning and section-by-section drafting
- Optional web-sourced cover images from Unsplash
- Copy-ready Markdown output
- FastAPI health endpoint for deployment monitoring
- Optional LangSmith tracing for pipeline runs

## Architecture

```text
Browser
  |
  v
FastAPI (web_app.py)
  |-- HTML/CSS/JavaScript UI
  |-- /api/health
  `-- /api/generate
        |
        v
LangGraph pipeline (bwa_backend.py)
  router -> research (optional) -> planner -> workers -> reducer
        |                         |
        v                         v
     Tavily                    Ollama

Optional cover image: Unsplash web image URL
Optional observability: LangSmith
```

## Requirements

- Python 3.10 or newer
- Ollama with a compatible chat model
- An Ollama model pulled locally for development
- Tavily API key for live web research
- Optional Unsplash access key for keyword-based image search
- Optional LangSmith API key for tracing

## Local development

### 1. Clone the repository

```powershell
git clone https://github.com/adityakes11/Blog_writing_agent.git
cd Blog_writing_agent
```

### 2. Create and activate a virtual environment

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run the project with the interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Install dependencies

```powershell
python -m pip install -r requirements.txt
```

### 4. Configure environment variables

```powershell
copy .env.example .env
```

Then edit `.env`. Never commit `.env`.

### 5. Start Ollama

Install Ollama, start it, and pull the configured model:

```powershell
ollama serve
ollama pull qwen2.5:3b
```

The default local endpoint is:

```text
http://127.0.0.1:11434
```

### 6. Start Inkline

```powershell
.\.venv\Scripts\python.exe -m uvicorn web_app:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000>.

If port 8000 is already in use, use another port:

```powershell
.\.venv\Scripts\python.exe -m uvicorn web_app:app --reload --host 127.0.0.1 --port 8001
```

Check the server:

```powershell
curl http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok","service":"blog-writing-agent"}
```

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `OLLAMA_MODEL` | Yes | Ollama chat model, for example `qwen2.5:3b` |
| `OLLAMA_BASE_URL` | Yes | Ollama HTTP endpoint; local default is `http://127.0.0.1:11434` |
| `TAVILY_API_KEY` | Recommended | Enables live web research |
| `UNSPLASH_ACCESS_KEY` | No | Enables Unsplash keyword search; a deterministic Unsplash URL is used without it |
| `LANGCHAIN_TRACING_V2` | No | Set to `true` to send traces to LangSmith |
| `LANGCHAIN_ENDPOINT` | No | Usually `https://api.smith.langchain.com` |
| `LANGCHAIN_API_KEY` | No | LangSmith authentication |
| `LANGCHAIN_PROJECT` | No | LangSmith project name |

## Deploying to Render

### Important: Render and Ollama

Render cannot reach an Ollama process running on your personal computer. Before deploying, provide a publicly reachable Ollama-compatible endpoint through `OLLAMA_BASE_URL`, or host Ollama on a separate server with appropriate authentication and network controls.

Do not expose an unauthenticated Ollama server directly to the public internet.

### Option A: Deploy from `render.yaml`

This repository includes [`render.yaml`](./render.yaml), which defines the web service, build command, start command, health check, and environment variable names.

1. Push the project to GitHub.
2. Open <https://dashboard.render.com>.
3. Select **New +** → **Blueprint**.
4. Connect the GitHub repository.
5. Select the branch containing `render.yaml`.
6. Review the service and click **Apply**.
7. In the Render service, open **Environment**.
8. Add the secret values:
   - `OLLAMA_MODEL`
   - `OLLAMA_BASE_URL`
   - `TAVILY_API_KEY`
   - `UNSPLASH_ACCESS_KEY` if used
   - `LANGCHAIN_API_KEY` if tracing is enabled
9. Deploy or wait for the automatic deploy to finish.
10. Open the generated Render URL and verify:

   ```text
   https://YOUR-SERVICE.onrender.com/api/health
   ```

### Option B: Create the service manually

Create a **Web Service** with:

| Render setting | Value |
|---|---|
| Environment | Python 3 |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn web_app:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |

Add the same environment variables in Render's **Environment** section. Use Render's secret fields rather than committing keys to GitHub.

### Render deployment notes

- Render supplies the `PORT` variable; always bind Uvicorn to `0.0.0.0` and `$PORT`.
- A free Render service may sleep after inactivity, so the first request can be slow.
- The service writes generated Markdown files to its ephemeral filesystem. Treat the API response as the source of truth or add persistent storage before building saved-blog features.
- Keep Tavily and LangSmith keys private.
- CORS is currently permissive for the browser app. Restrict `allow_origins` to your deployed domain before exposing the API publicly.

## Pushing the project to GitHub

Run these commands from the repository root:

```powershell
git status
git add .
git commit -m "Prepare Inkline for Render deployment"
git push origin main
```

If the branch is not `main`, check it with:

```powershell
git branch --show-current
```

Then push that branch:

```powershell
git push origin YOUR_BRANCH_NAME
```

Before pushing, confirm `.env` is ignored:

```powershell
git status --short --ignored .env
```

The `.env` file must never appear as a staged file.

## Troubleshooting

### `WinError 10013`

Port 8000 is already occupied. Use port 8001 or identify the listener:

```powershell
Get-NetTCPConnection -LocalPort 8000
```

### Homepage returns `500` with `unhashable type: 'dict'`

Update to the current repository version. The FastAPI template call must use:

```python
templates.TemplateResponse(request, "index.html", context)
```

### Blog generation fails

Check that Ollama is running and that the model exists:

```powershell
ollama list
ollama pull qwen2.5:3b
```

For Render, verify that `OLLAMA_BASE_URL` points to a reachable compatible endpoint.

### Research shows no sources

Set `TAVILY_API_KEY` and restart the application. Without a Tavily key, the app can still generate evergreen content, but live research results will be empty.

## Security checklist

- Never commit `.env`, API keys, or tokens.
- Use HTTPS for remote Ollama endpoints.
- Add authentication before exposing a remote Ollama server.
- Restrict CORS to trusted frontend origins in production.
- Rotate any key that was accidentally published.
- Do not treat generated content as automatically fact-checked; review sources before publishing.

## License

Add the license selected for this project before publishing it as an open-source repository.
