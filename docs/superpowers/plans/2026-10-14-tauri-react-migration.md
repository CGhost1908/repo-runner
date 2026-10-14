# Tauri + React Migration & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a decoupled React Single Page Application (Vite + JavaScript) with comprehensive client-side routing and error handling, bundled into a desktop application via Tauri (`tauri/`), communicating with the existing 100% Python FastAPI backend.

**Architecture:** A modular side-by-side architecture where the React app lives in `frontend/` with `react-router-dom`, connecting via REST and WebSocket to `http://localhost:8000` FastAPI. Tauri lives in `tauri/` directly, managing native window creation and packaging.

**Tech Stack:** React 18, Vite, React Router DOM v6, Tauri v2, Rust / Cargo, Python 3.14 (FastAPI), Semantic CSS.

## Global Constraints
- React code must be pure JavaScript (JSX), not TypeScript (per user decision).
- Tauri folder must be `tauri/` (directly in project root, NOT `src-tauri/`).
- Semantic CSS styling matching the existing sleek dark glass theme (`style.css`), no Tailwind.
- Client-side routes: `/` (Home), `/runner` (Runner), `/projects` (Projects List), `/projects/:id` (Project Detail), `/settings` (Settings), `*` (NotFound 404).
- Global React `ErrorBoundary` must catch rendering errors and provide recovery action.
- Existing Python backend tests (13/13) must remain 100% passing.

---

### Task 1: Rust Toolchain Setup & Verification

**Files:**
- System level: Rustup installer via winget

- [ ] **Step 1: Install Rustup using winget**
Run command: `winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements`
- [ ] **Step 2: Verify rustc and cargo are accessible**
Run command: `rustc --version` and `cargo --version`. If needed, refresh environment PATH (`$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`).
- [ ] **Step 3: Document Rust toolchain status in plan logs**

---

### Task 2: React (Vite) Project Scaffolding & Proxy Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css` (migrated from `backend/static/style.css`)

**Interfaces:**
- Vite dev server runs at `http://localhost:5173`.
- Proxy `/api` and `/ws` to `http://localhost:8000`.

- [ ] **Step 1: Scaffold Vite React project in `frontend/`**
Initialize `frontend/` with Vite template and install dependencies (`react`, `react-dom`, `react-router-dom`).
- [ ] **Step 2: Configure `frontend/vite.config.js` with proxy**
Add server proxy for `/api` and `/ws` (with `ws: true`) to `http://127.0.0.1:8000`.
- [ ] **Step 3: Migrate CSS stylesheets to `frontend/src/index.css`**
Port existing high-fidelity semantic dark theme CSS into `frontend/src/index.css`.
- [ ] **Step 4: Verify build succeeds**
Run `npm.cmd run build` inside `frontend/` and verify `frontend/dist` is produced.

---

### Task 3: Layout, Routing & Error Handling Components

**Files:**
- Create: `frontend/src/components/ErrorBoundary.jsx`
- Create: `frontend/src/components/Layout.jsx`
- Create: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/components/Topbar.jsx`
- Create: `frontend/src/components/UserProfileModal.jsx`
- Create: `frontend/src/pages/NotFound.jsx`
- Create: `frontend/src/App.jsx`

**Interfaces:**
- `ErrorBoundary`: Catches child component errors and shows fallback UI with "Reload" and "Return Home".
- `Sidebar`: Uses `NavLink` from `react-router-dom` for active link state and displays Live pill indicator.
- `Topbar`: Displays dynamic route title, server pulse dot, and Quick Run action.
- `NotFound`: Catch-all route component rendering 404 message and navigation button.

- [ ] **Step 1: Implement `ErrorBoundary.jsx`**
Class component implementing `getDerivedStateFromError` and `componentDidCatch`.
- [ ] **Step 2: Implement `Sidebar.jsx`, `Topbar.jsx`, and `UserProfileModal.jsx`**
Functional components with state hooks and localStorage profile synchronization.
- [ ] **Step 3: Implement `Layout.jsx` and `NotFound.jsx`**
Layout with `<Outlet />` and dedicated 404 error page with clear navigation.
- [ ] **Step 4: Configure `App.jsx` with `BrowserRouter` and routes**
Define routes for `/`, `/runner`, `/projects`, `/projects/:id`, `/settings`, and `*`.

---

### Task 4: Core Pages Implementation

**Files:**
- Create: `frontend/src/pages/Home.jsx`
- Create: `frontend/src/pages/Projects.jsx`
- Create: `frontend/src/pages/ProjectDetail.jsx`
- Create: `frontend/src/pages/Settings.jsx`

**Interfaces:**
- `Home`: Fetches `/api/system/stats` and `/api/projects`, shows KPI cards and system specs.
- `Projects`: Fetches `/api/projects`, shows project cards with "View Details", "Run", and "Delete".
- `ProjectDetail`: Reads `:id` from `useParams()`, shows project metadata, entrypoint, framework badge, and direct "Launch in Runner" button that navigates to `/runner?path=...`.
- `Settings`: Fetches and updates `/api/settings` for Ollama, OpenAI/Gemini keys, and port pool.

- [ ] **Step 1: Implement `Home.jsx`**
Includes welcome hero, stats grid (Active, Total, Saved, AI Engine), recent projects list, and system specs.
- [ ] **Step 2: Implement `Projects.jsx`**
Card grid with delete modal/confirmation and navigation to `/projects/:id` or `/runner`.
- [ ] **Step 3: Implement `ProjectDetail.jsx`**
Shows individual project card, path, framework detector output, and quick action to launch.
- [ ] **Step 4: Implement `Settings.jsx`**
Full configuration form with toast alerts on save.

---

### Task 5: Runner Execution, Terminal & Web Preview

**Files:**
- Create: `frontend/src/components/Terminal.jsx`
- Create: `frontend/src/components/Preview.jsx`
- Create: `frontend/src/pages/Runner.jsx`

**Interfaces:**
- `Terminal`: WebSocket log consumer + status polling fallback, color-coded lines, auto-scroll, copy and clear.
- `Preview`: Dynamic iframe renderer on port detection, with external browser link.
- `Runner`: Prepopulates path from URL query param (`useSearchParams`), manages active run state, stop/reset triggers.

- [ ] **Step 1: Implement `Terminal.jsx`**
Terminal view with copy, clear, and styled log stream lines.
- [ ] **Step 2: Implement `Preview.jsx`**
Web preview iframe with refresh button and open in browser button.
- [ ] **Step 3: Implement `Runner.jsx`**
Integrates form fields, mode selectors, `Terminal`, `Preview`, and dual-channel WebSocket/HTTP polling.

---

### Task 6: Tauri Desktop Shell Configuration (`tauri/`)

**Files:**
- Create: `tauri/Cargo.toml`
- Create: `tauri/tauri.conf.json`
- Create: `tauri/src/main.rs`
- Modify: `package.json` (add root npm scripts)

**Interfaces:**
- Tauri v2 configured with folder `tauri/`.
- Window points to `http://localhost:5173` in development and `../frontend/dist` in production.

- [ ] **Step 1: Initialize Tauri configuration in `tauri/`**
Setup `tauri.conf.json` with correct window dimensions, title, and build targets.
- [ ] **Step 2: Setup Rust window manager `tauri/src/main.rs`**
Standard Tauri builder initializing native WebView2 window on Windows.
- [ ] **Step 3: Add launcher scripts in `package.json`**
Add `"tauri": "tauri --config tauri/tauri.conf.json"` and dev scripts.

---

### Task 7: End-to-End Verification & Python Integration

**Files:**
- Test: `tests/` (all 13 pytest tests)
- Verification: `frontend` build test, route navigation test

- [ ] **Step 1: Run full pytest suite**
Ensure all existing backend tests pass (`python -m pytest tests/ -v`).
- [ ] **Step 2: Build React frontend**
Verify `npm.cmd run build` passes with zero errors and clean bundle output.
- [ ] **Step 3: Verify route management and error pages**
Test all routes (`/`, `/runner`, `/projects`, `/projects/:id`, `/settings`, `/unknown-404`).
- [ ] **Step 4: Git commit all changes**
Stage and commit completed Tauri + React migration.
