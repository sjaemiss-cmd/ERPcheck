# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev**: `npm run dev` — starts Vite dev server + Electron window (runs `chcp 65001` for UTF-8 on Windows)
- **Build**: `npm run build` — runs `tsc && vite build && electron-builder` (produces Windows NSIS installer in `dist_electron_builder/`)
- **Type check only**: `tsc` (noEmit is set in tsconfig)
- No lint or test scripts are configured.

## Architecture

**Electron + React + Vite** desktop app ("Operation Master") that automates interactions with a café24-hosted ERP site (`sook0517.cafe24.com`) using Playwright browser automation.

### Process Model

```
┌─────────────────────┐       IPC (contextBridge)       ┌──────────────────────┐
│   Main Process       │ ◄──────────────────────────────► │  Renderer Process    │
│   electron/main.ts   │                                  │  src/ (React + Vite) │
│                      │                                  │                      │
│  ┌─────────────────┐ │                                  │  App.tsx (5 tabs):   │
│  │ ErpService      │ │  ← Playwright headless browser   │  - Dashboard         │
│  │ ScraperService  │ │  ← Naver/Kakao scraping          │  - EducationManager  │
│  │ LlmService      │ │  ← Gemini AI for chat parsing    │  - ReservationCollect│
│  │ SignatureService│ │  ← SQLite (better-sqlite3)       │  - SignatureManager  │
│  └─────────────────┘ │                                  │  - Settings          │
└─────────────────────┘                                  └──────────────────────┘
         │                                                         │
    electron/preload.ts ── exposes window.api.{erp, scraper, settings, member, signature}
```

### IPC Pattern

All IPC uses `ipcMain.handle` / `ipcRenderer.invoke` (async request-response). The preload script (`electron/preload.ts`) exposes a typed `window.api` object via `contextBridge`. Types are declared in `src/vite-env.d.ts`.

### Key Services (electron/services/)

- **ErpService.ts** (~2500 lines) — Core automation: login, schedule reading, memo CRUD, reservation CRUD, batch operations. Uses Playwright to interact with the ERP web UI (clicking modals, filling forms, reading FullCalendar `clientEvents`).
- **ScraperService.ts** — Scrapes Naver/Kakao booking platforms for new reservations. Persists session cookies.
- **LlmService.ts** — Google Gemini integration to parse customer KakaoTalk messages into structured reservation data.
- **SignatureService.ts** — 전자서명 모듈. better-sqlite3로 로컬 SQLite DB(`userData/signature.db`) 관리. 동의서 양식 CRUD, 서명 수집/검색, 약관 버전 관리.

### State Management

- **Zustand** (`src/store/useEducationStore.ts`) — Global UI state: students, selected date, pending history edits, loading flags.
- **Zustand** (`src/store/useSignatureStore.ts`) — 전자서명 UI state: 서브뷰 전환, 양식 목록, 서명 검색 결과, 통계.
- **electron-store** — Persistent storage in main process for credentials (`erp.id`, `erp.password`) and member lists.

### ERP Automation Flow (critical path)

`EducationManager` → `writeMemosBatch` IPC → `ErpService.writeMemosBatch()`:
1. Launches Playwright browser, logs in once
2. For each student: navigates FullCalendar to target date → clicks event by ID → opens modify modal → adds memo row (+button) → fills date/comment inputs → clicks save → handles JS alert dialog
3. Returns `Record<index, boolean>` success map

### Important Conventions

- All dates use `YYYY-MM-DD` format; times use `HH:mm`
- Korean text encoding: Windows requires `chcp 65001`; server responses decoded with `iconv-lite`
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters` enforced
- Playwright and better-sqlite3 are marked as external in Vite config (not bundled into the app)
- Logging via `electron/utils/logger.ts` — writes to `logs/app.log` with ISO timestamps and timer utilities

### Known Gotchas

- The `.vite/deps` cache can get locked by OneDrive sync on Windows, causing EPERM errors on dev startup. Delete `node_modules/.vite` to fix.
- ERP form inputs require aggressive event dispatching (input + change + blur + jQuery trigger) to be recognized by the ERP site's validation.
- The ERP site uses jQuery + Bootstrap modals extensively; modal cleanup uses `$('.modal').modal('hide')` after each operation.
- Credentials are checked from both electron-store and `.env` (`ERP_ID`, `ERP_PASSWORD`).

### Signature Module (전자서명)

Integrated from the `signiture/` (Next.js) project, adapted for Electron.

#### Architecture

SignatureManager (탭 컴포넌트) uses useState-based sub-view switching:
```
SignatureManager
├── SignatureDashboard  - 통계 + 최근 서명 (기본 뷰)
├── FormList            - 양식 목록 + 생성/수정/삭제/토글
├── FormEditor          - 양식 생성/수정 폼
├── SignForm            - 고객용 서명 UI (SignaturePad 사용)
├── SignatureList       - 서명 기록 검색/필터/페이지네이션
└── SignatureDetail     - 서명 상세 조회 + 인쇄
```

#### IPC Channels (signature:*)

| Channel | Method | Description |
|---------|--------|-------------|
| `signature:getActiveForms` | GET | 활성 양식 목록 |
| `signature:getAllForms` | GET | 전체 양식 목록 (버전/서명 수 포함) |
| `signature:getFormById` | GET | 양식 상세 (버전 목록 포함) |
| `signature:createForm` | POST | 양식 생성 (버전 1 자동 생성) |
| `signature:updateForm` | PUT | 양식 수정 (내용 변경 시 새 버전 생성) |
| `signature:toggleFormActive` | PUT | 활성/비활성 토글 |
| `signature:deleteForm` | DELETE | 양식 삭제 (서명 있으면 거부) |
| `signature:submit` | POST | 서명 제출 |
| `signature:getById` | GET | 서명 상세 조회 |
| `signature:search` | GET | 서명 검색 (이름/연락처/양식/기간 필터) |
| `signature:delete` | DELETE | 서명 삭제 |
| `signature:getStats` | GET | 통계 (총 양식, 총 서명, 오늘 서명, 최근 5건) |

#### SQLite Schema

```sql
consent_forms (id, title, is_active, created_at, updated_at)
form_versions (id, form_id FK, version_number, content, created_at) -- UNIQUE(form_id, version_number)
signatures (id, form_id FK, form_version_id FK, customer_name, customer_phone, signature_image [Base64], agreed_content [snapshot], signed_at, ip_address)
```

Key design decisions:
- **버전 관리**: 약관 내용 수정 시 새 버전 자동 생성, 기존 서명의 약관 내용 보존 (법적 효력)
- **서명 이미지**: Base64 PNG로 DB 직접 저장 (수 KB, 파일 관리 불필요)
- **삭제 보호**: 서명이 있는 양식은 삭제 불가 (비활성화만 허용)

#### Source Reference

원본: `/home/hp/dev/ERPcheck/signiture/` (Next.js + Prisma + Turso)
