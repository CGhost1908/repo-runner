# Tauri + React Migration & Routing Architecture Design Spec

**Date:** 2026-10-14  
**Project:** Repo Runner  
**Goal:** Migrate frontend to a modern, decoupled React (Vite + JavaScript) Single Page Application with robust routing and error boundaries, bundled into a desktop application via Tauri (`tauri/`), powered by the existing 100% Python FastAPI backend.

---

## 1. Architecture Overview

```
+-------------------------------------------------------------------------+
|                  Tauri Native Desktop Shell (`tauri/`)                 |
|             (Rust Window Manager, Webview2 on Windows, System IPC)      |
+-------------------------------------------------------------------------+
                                     │
                                     ▼
+-------------------------------------------------------------------------+
|                 Frontend: React + Vite + React Router DOM               |
|                                                                         |
|  - App Layout: Sidebar + Topbar + ToastProvider + ErrorBoundary         |
|  - Routes:                                                              |
|      /                 -> HomePage (Dashboard, KPIs, quick links)       |
|      /runner           -> RunnerPage (Pipeline form, terminal, preview) |
|      /projects         -> ProjectsPage (Grid of saved workspaces)       |
|      /projects/:id     -> ProjectDetailPage (Files, stack info, actions)|
|      /settings         -> SettingsPage (AI model, port pool, env config)|
|      *                 -> NotFoundPage (404 fallback with safe redirect)|
+-------------------------------------------------------------------------+
                                     │
                       (REST API & WebSocket Stream)
                                     ▼
+-------------------------------------------------------------------------+
|                Backend: Python FastAPI Service (`backend/`)             |
|                                                                         |
|  - REST Endpoints: /api/run, /api/stop, /api/projects, /api/settings...  |
|  - WebSockets: /ws/logs/{run_id}                                        |
|  - Services: RepoManager, Detector, EnvManager, ProcessRunner, AIPlanner|
+-------------------------------------------------------------------------+
```

---

## 2. Frontend Project Structure (`frontend/`)

- **Tooling:** Vite, React 18, React Router DOM v6, Lucide React (or SVG icons).
- **Language:** JavaScript (ES6+ / JSX) per user decision.
- **Directory Layout:**
  ```
  frontend/
  ├── package.json
  ├── vite.config.js
  ├── index.html
  └── src/
      ├── main.jsx
      ├── App.jsx                     # Router, Layout wrapper, Toast container
      ├── index.css                   # Semantic CSS theme & styles
      ├── components/
      │   ├── Layout.jsx              # App Shell (Sidebar + Topbar + Content outlet)
      │   ├── Sidebar.jsx             # Active nav links, Live status, User badge
      │   ├── Topbar.jsx              # Breadcrumbs, server status dot, quick actions
      │   ├── Terminal.jsx            # Live colored log output with auto-scroll & copy
      │   ├── Preview.jsx             # Iframe preview with port detector & browser launch
      │   ├── UserProfileModal.jsx    # User details editor
      │   └── ErrorBoundary.jsx       # Component crash fallback card
      └── pages/
          ├── Home.jsx                # KPIs, recent repos, architecture summary
          ├── Runner.jsx              # Repo input, mode toggles, Terminal & Preview
          ├── Projects.jsx            # Workspace project card grid with delete/run
          ├── ProjectDetail.jsx       # Dedicated project page (files, stack, run button)
          ├── Settings.jsx            # AI engine, API keys, port pool configurations
          └── NotFound.jsx            # 404 page with clean design and "Return Home" CTA
  ```

---

## 3. Route Hierarchy & Error Handling

1. **Route Definitions:**
   - `/` -> `Home`: Displays total runs, running processes, recent projects, and environment stats.
   - `/runner` -> `Runner`: Main pipeline execution. If accessed with query params (e.g. `/runner?path=...`), automatically pre-populates the project path.
   - `/projects` -> `Projects`: Lists all projects saved in `~/.repo-runner/workspaces`.
   - `/projects/:id` -> `ProjectDetail`: Detailed view for a specific workspace folder, showing detected framework, entrypoint, files list, and a direct "Launch in Runner" trigger.
   - `/settings` -> `Settings`: Configuration for Ollama, OpenAI/Gemini keys, ports, and isolation env.
   - `*` -> `NotFound`: Dedicated 404 page when navigating to invalid URLs.

2. **Fault Tolerance & Error Boundaries:**
   - Global React `ErrorBoundary` captures rendering exceptions and displays an actionable error screen ("Something went wrong") with a button to safely reload or navigate back to Home.
   - Network failure guards: REST requests display user-friendly toast errors without breaking the UI.
   - Dual-channel log recovery: If WebSocket disconnects, polling `/api/status/{run_id}` ensures zero dropped lines.

---

## 4. Desktop Shell Integration (`tauri/`)

- Custom folder named `tauri/` directly in the project root.
- `tauri/tauri.conf.json`:
  - `build.devUrl`: `http://localhost:5173`
  - `build.frontendDist`: `../frontend/dist`
  - `app.windows[0].title`: `Repo Runner`
  - `app.windows[0].width`: 1320, `height`: 840, `minWidth`: 1024, `minHeight`: 700.
- System prerequisites:
  - Rustup (`winget install Rustlang.Rustup`)
  - MSVC C++ Build Tools

---

## 5. Development & Execution Strategy

1. **Development Mode:**
   - Terminal 1: `python run.py` (FastAPI backend at `http://localhost:8000`).
   - Terminal 2: `npm run tauri dev` inside `frontend/` (or root script) which starts Vite and opens the native Tauri window.
2. **Production Mode:**
   - React builds to static assets in `frontend/dist`.
   - Tauri compiles into an optimized Windows executable (`.exe`) in `tauri/target/release/`.
