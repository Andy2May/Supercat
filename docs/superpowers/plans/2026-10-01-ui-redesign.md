# Psiforge UI/UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai spec redesign `docs/superpowers/specs/2026-10-01-ui-redesign-design.md`: workspace "Bàn đo đạc" + landing "Sân khấu", dark-only tokens, font tự host — không đụng engine/renderer.

**Architecture:** Foundation-first: fonts → tokens → i18n helper, rồi dựng component mới (chưa mount), một task "phẫu thuật bố cục" mount tất cả vào App.svelte, landing rewrite, meta/OG cuối. Mọi `data-testid` hiện có giữ nguyên tên để e2e chỉ đổi vị trí, không đổi selector.

**Tech Stack:** Svelte 5 runes + TypeScript, CSS custom properties (không Tailwind), vitest + @testing-library/svelte, Playwright. **Không npm dependency mới.**

**Spec:** `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (worktree `.worktrees/m2-launch`, branch `m2-launch`). Mockup tham chiếu: `.superpowers/brainstorm/36220-1790849507/content/{landing,workspace}.html` — **file cục bộ không commit** (gitignored), chỉ để implementer đối chiếu thị giác.

## Global Constraints

- Làm việc trong worktree `.worktrees/m2-launch`, branch `m2-launch`. KHÔNG push, KHÔNG merge (branch chưa từng push).
- **Không thêm npm dependency.** Font = file `.woff2` commit trong `web/public/fonts/`, không CDN runtime.
- **Bảo toàn 100% `data-testid`** hiện có (tên + ngữ nghĩa). Danh sáchCritical: `preset-tile`, `back-link`, `mode-toggle`, `tool-{brush|barrier|well|eraser|packet|measure}`, `height-slider`, `k-slider`, `preset-card`, `preset-card-toggle`, `preset-info`, `play-pause`, `step`, `reset`, `restore-potential`, `speed-slider`, `export-png`, `export-json`, `import-json`, `import-json-input`, `observables-bar`, `x-mean-value`, `y-mean-value`, `sigma-x-value`, `sigma-y-value`, `energy-value`, `energy-jump-note`, `perf-hud`, `load-error`, `load-error-dismiss`, `save-size-note`, `save-size-note-dismiss`, `momentum-caption`.
- Tokens đúng giá trị spec mục 4.1 (dark-only; `--text-3: #76808F`). Màu physics (inferno, `#F2730D`, `#1F9EB8`, `#E6C040`, sparkline `#22D3EE/#E879F9/#4ADE80`) **không đổi**.
- i18n: mọi key mới phải có cả vi + en; parity test hiện hành trong `tests/i18n.test.ts` phải xanh.
- Perf: **không thêm tác vụ vào rAF loop / worker message**; nhãn `t` đọc `simStore.t` sẵn có.
- Mỗi task UI chạy: `npx vitest run` (web/) + `npx playwright test` (web/, canh port 5173 — vite server cũ có thể squat; reuseExistingServer sẽ chạy nhầm code) + `npm run check` (0 error). Task không chạm Rust không cần cargo.
- Chuẩn commit repo: conventional commits, tiếng Anh, mô tả ngắn.

## Review Focus

Năm lớp lỗi spec ngụ ý nhưng không task-test nào tự phủ, kèm test chốt (đã rải vào task):

1. **Dấu tiếng Việt rơi fallback font** (visual break giữa chuỗi) → T1 e2e `document.fonts.check('600 16px "Space Grotesk"', 'ữ ộ ơ ẳ ế')` cho cả 2 font.
2. **Quét chuột nhanh qua dải phim landing → chồng/chảy worker** → T9 e2e hover lần lượt 5 mục trong < 1s: status cuối đúng preset cuối, không pageError; debounce 150ms là đơn vị test unit trong T9.
3. **Landing sập trên máy không WebGL2** thay vì hiện gradient tĩnh → T9 e2e `addInitScript` giả `getContext('webgl2') → null`: strip + hero vẫn click được.
4. **Viewport ngắn (720px) lại đẩy canvas khỏi tầm mắt** (lỗi T18) → T8 e2e probe khung 1280×720: canvas visible; NarrationPanel mặc định thu gọn khi `innerHeight < 800`.
5. **`prefers-reduced-motion` bị bỏ qua (blink/status chạy mãi)** → T9 e2e `emulateMedia reducedMotion: 'reduce'`: status dot `animation-name: none`.

---

### Task 1: Font woff2 tự host + probe glyph tiếng Việt

**Files:**
- Create: `web/public/fonts/` (8 file woff2: Space Grotesk 400/600/700 + JetBrains Mono 400/600, mỗi weight 2 subset `vietnamese` + `latin`)
- Create: `web/src/fonts.css` (@font-face + unicode-range)
- Modify: `web/src/app.css` (dòng đầu `@import './fonts.css';`)
- Test: `web/tests/fonts.spec.ts` (e2e)

**Interfaces:**
- Consumes: không.
- Produces: font families `"Space Grotesk"` và `"JetBrains Mono"` load được toàn app (weight 400/600/700 và 400/600); `app.css` import fonts.css.

- [ ] **Step 1: Tải 8 file woff2 + viết fonts.css**

Cách lấy (không npm): request `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap` với User-Agent hiện đại (curl -A) → CSS trả về các block `@font-face` chỉ tới URL woff2 kèm `unicode-range`; tải từng file woff2 về `web/public/fonts/`, đổi tên `<family>-<weight>-<subset>.woff2` (thường: `latin`, `latin-ext`, `vietnamese` — chỉ giữ `vietnamese` + `latin`; latin-ext bỏ). `fonts.css` chép nguyên block @font-face từ response, thay URL bằng `/fonts/<file>` (src local, `font-display: swap`).

- [ ] **Step 2: Viết e2e probe fail**

`web/tests/fonts.spec.ts`: vào trang chủ, chờ `document.fonts.ready`, assert `document.fonts.check('600 16px "Space Grotesk"', 'ữ ộ ơ ẳ ế')` và `document.fonts.check('600 16px "JetBrains Mono"', 'ữ ộ ơ ẳ ế')` đều true, và `getComputedStyle(document.body).fontFamily` chứa `Space Grotesk` (sau khi T2 đặt — ở T1 body vẫn system: chỉ assert fonts.check).

- [ ] **Step 3: Chạy e2e thấy fail (font chưa load)**

Run: `npx playwright test tests/fonts.spec.ts` — Expected: FAIL (fonts.check false).

- [ ] **Step 4: Đặt import + chạy lại cho PASS**

`app.css` dòng đầu import; body tạm thêm font-family (T2 sẽ chính thức hóa). Run lại: PASS.

- [ ] **Step 5: Commit**

`git add web/public/fonts web/src/fonts.css web/src/app.css web/tests/fonts.spec.ts && git commit -m "feat(web): self-host Space Grotesk + JetBrains Mono woff2 with vietnamese subsets"`

### Task 2: Design tokens + nền dark-only (app.css viết lại)

**Files:**
- Modify: `web/src/app.css` (viết lại toàn bộ)
- Test: `web/tests/tokens.test.ts` (vitest, đọc file)

**Interfaces:**
- Consumes: fonts.css (T1).
- Produces: biến CSS toàn cục: `--bg-0:#0B0E14; --bg-1:#0D1118; --bg-2:#11151D; --line:rgba(255,255,255,0.08); --line-strong:rgba(255,255,255,0.14); --text-1:#E8ECF1; --text-2:#9AA5B5; --text-3:#76808F; --accent:#5FD4E6; --accent-ink:#07131A` + class dùng lại: `.stage`, `.hud`, `.term`/`.tip` (giữ nguyên hành vi, đổi sang token). `:root` đặt `color-scheme: dark`, xóa mọi `@media (prefers-color-scheme)` trong app.css.

- [ ] **Step 1: Viết tokens.test.ts fail**

vitest đọc `src/app.css` bằng fs: assert 10 biến trên xuất hiện đúng giá trị; assert KHÔNG còn chuỗi `prefers-color-scheme` trong app.css; assert có `color-scheme: dark`. Thêm assert contrast (hàm WCAG ratio viết ngay trong test): `--text-1`, `--text-2`, `--text-3`, `--accent` trên `--bg-0` ≥ 4.5:1; `--accent-ink` trên `--accent` ≥ 4.5:1.

- [ ] **Step 2: Chạy fail** — `npx vitest run tests/tokens.test.ts` FAIL.

- [ ] **Step 3: Viết lại app.css**

Giữ lại các rule cấu trúc hiện có (`.stage` aspect-ratio, `canvas`, `.term`/`.tip` z-index, `.hud`) nhưng màu/xác suất quy về token; button base style (border token, radius 8px, hover border-accent, active translateY(1px)); focus-visible ring accent. Body: `background: var(--bg-0); color: var(--text-1); font-family: 'Space Grotesk', system-ui, sans-serif`.

- [ ] **Step 4: Chạy vitest + toàn suite xanh**

`npx vitest run` PASS (155+1); `npx playwright test` PASS (e2e không assert màu chrome).

- [ ] **Step 5: Commit** — `feat(web): design tokens, dark-only base styles`

### Task 3: `t(key, params)` + key redesign mới

**Files:**
- Modify: `web/src/i18n/index.ts`, `web/src/i18n/vi.ts`, `web/src/i18n/en.ts`
- Modify: 3 call site `.replace('{')`: `App.svelte:47` (mode.switchHint), `SimCanvas.svelte` legend v0 + measure toast
- Test: `web/tests/i18n.test.ts` (mở rộng)

**Interfaces:**
- Consumes: không.
- Produces: `t(key: string, params?: Record<string, string | number>): string` — mọi `{name}` trong value được thay bằng `String(params[name])`; placeholder thiếu params để nguyên; params nhưng value không có placeholder → không lỗi. Key mới (vi+en, giá trị draft trong spec Phụ lục A): `rail.tools`, `rail.briefing`, `rail.readouts`, `rail.view`, `rail.export`, `scene.label` (`THÍ NGHIỆM · {name}` / `EXPERIMENT · {name}`), `landing.kicker`, `landing.title` (1 key, chứa `\n` ngắt dòng — component `split('\n')` như PresetCard hiện tại), `landing.desc`, `landing.ctaPrimary`, `landing.ctaFree`, `landing.status` (`ĐANG CHIẾU · {name}` / `NOW SHOWING · {name}`), `landing.schrodinger` (chuỗi công thức, giống nhau 2 ngôn ngữ).

- [ ] **Step 1: Test fail** — i18n.test.ts thêm: `t('scene.label', { name: 'Khe kép' }) === 'THÍ NGHIỆM · Khe kép'`; `t('mode.switchHint', { mode: 'Explore' })` không còn chứa `{mode}`; parity test tự bắt key thiếu (đã có sẵn cơ chế — thêm key một bên là fail).
- [ ] **Step 2: Run fail.**
- [ ] **Step 3: Implement** — signature trên (thay thế inner `t`); thêm đủ key vi+en; sửa 3 call site dùng params (không đổi chuỗi dictionary hiện có trừ nơi cần).
- [ ] **Step 4: Run vitest PASS toàn bộ + check 0 error.**
- [ ] **Step 5: Commit** — `feat(web): t(key, params) interpolation + redesign i18n keys (fold-in F2)`

### Task 4: `ToolRail.svelte` — grid công cụ + tham số ngữ cảnh

**Files:**
- Create: `web/src/ui/ToolRail.svelte`
- Test: `web/tests/toolRail.test.ts`

**Interfaces:**
- Consumes: `toolState` (`sim/toolStore.svelte.js`: `tool`, `height`, `kMag`), `Tool` type, `t` key `tool.*`, `rail.tools`.
- Produces: component default export, props `{ compact?: boolean = false }` — `compact: true` ẩn khối tham số (chế độ Khâm phá dùng default, T8 truyền theo mode). Testid: `tool-<tool>`, `height-slider`, `k-slider`. Icon SVG inline mỗi nút (mockup `workspace.html` — stroke 1.75, màu: brush/barrier `#F2730D`, well `#1F9EB8`, eraser `#8b94a3`, packet `#E6C040`, measure `var(--accent)`). Nút min-height 32px. Chưa mount vào App.

- [ ] **Step 1: Test fail** — render: 6 nút đúng testid + `aria-pressed` theo `toolState.tool`; khối tham số: chọn `barrier` → có `height-slider`, không có `k-slider`; chọn `packet` → ngược lại; chọn `measure`/`eraser` → không slider nào; đổi `toolState.tool` re-render đúng; nhãn theo lang (`vi` → "Rào").
- [ ] **Step 2: Run fail.**
- [ ] **Step 3: Implement** — grid 3 cột; khối tham số `{#if}` theo nhóm tool (V-tools: brush/barrier/well → height; packet → kMag); label khối `t('rail.tools')` uppercase mono; lang mirror pattern ($effect + subscribe cleanup như Toolbar hiện tại — copy).
- [ ] **Step 4: Run PASS.**
- [ ] **Step 5: Commit** — `feat(web): ToolRail component with contextual params`

### Task 5: `NarrationPanel.svelte` (PresetCard → ray trái)

**Files:**
- Create: `web/src/ui/NarrationPanel.svelte`
- Test: `web/tests/narrationPanel.test.ts`

**Interfaces:**
- Consumes: props `{ id: PresetId }`; `t` key `preset.<id>.card` (chuỗi `\n`), `preset.card.collapse/show`; `Term` component (giữ nguyên — narration có thể chứa Term sau này, không bắt buộc).
- Produces: component default export. Testid giữ: `preset-card`, `preset-card-toggle`, `preset-info`. Hành vi copy nguyên PresetCard: mở mặc định khi mount; nút thu gọn/ⓘ mở lại; `open = $state(innerHeight >= 800)` (R4 — viewport thấp mặc định thu gọn). Style panel token, label `t('rail.briefing')`.

- [ ] **Step 1: Test fail** — mount mở mặc định (viewport mock 1280×800); toggle đóng/ⓘ mở; testid đủ 3; ngôn ngữ flip re-translate; `innerHeight < 800` (stub window) → mặc định đóng.
- [ ] **Step 2: Run fail.**
- [ ] **Step 3: Implement** (chuyển từ PresetCard + thay đổi nêu trên; KHÔNG xóa PresetCard — việc đó thuộc T8).
- [ ] **Step 4: Run PASS.**
- [ ] **Step 5: Commit** — `feat(web): NarrationPanel for left rail`

### Task 6: `ReadoutRail.svelte` — Đọc số + Hiển thị + Xuất (fold-in F1)

**Files:**
- Create: `web/src/ui/ReadoutRail.svelte`
- Test: `web/tests/readoutRail.test.ts` (chuyển từ `observablesBar.test.ts` — cũ giữ nguyên tới T8)

**Interfaces:**
- Consumes: `simStore` (`observablesHistory`, `view`, `view` setter, `requestCapture`, `send`, `contrast` hiện có — kiểm tra tên field contrast trong simStore/simLoop; nếu contrast nằm ở store khác, dùng đúng store đó), `DEFAULTS.extent` (`sim/simParams.js`), `mapSeries` (`sim/sparkline.js`), props từ App: `{ onExportPng: () => void; onSaveState: () => void; onImportFile: (file: File) => void }` (App refactor `onStateFile` nhận File trực tiếp).
- Produces: component default export. 3 khối: **ĐỌC SỐ** (labels `t('obs.*')` + 3 canvas sparkline + readouts — copy logic draw từ ObservablesBar; **F1: hằng range means = `DEFAULTS.extent / 2`**, xóa `MEANS_RANGE`); **HIỂN THỊ** (segmented 3 nút Vị trí/Xung lượng/Pha — chuyển logic + testid từ ViewToggle.svelte; slider Tương phản giữ testid + binding như hiện tại); **XUẤT** (3 nút: `export-png` → `onExportPng()`, `export-json` → `onSaveState()`, `import-json` → click hidden input `import-json-input` → `onImportFile(file)`). Testid giữ đủ danh sách Global Constraints.

- [ ] **Step 1: Test fail** — render 3 khối; readouts + 3 canvas đúng testid; segment đổi `simStore.view`; contrast slider bound; 3 nút Xuất gọi callback đúng (vi.fn); import input change → `onImportFile` nhận File; sparkline means-range dùng extent/2 (assert qua hàm pure nhỏ export từ component hoặc qua spy drawSpark — chọn cách spy).
- [ ] **Step 2: Run fail.**
- [ ] **Step 3: Implement** (chuyển mã từ ObservablesBar + ViewToggle; F1; callbacks).
- [ ] **Step 4: Run PASS + check.**
- [ ] **Step 5: Commit** — `feat(web): ReadoutRail — readouts, view segment, export block (fold-in F1)`

### Task 7: PlaybackBar restyle tại chỗ

**Files:**
- Modify: `web/src/ui/PlaybackBar.svelte`
- Test: `web/tests/playbackBar.test.ts` (mới — hiện chưa có unit)

**Interfaces:**
- Consumes: `simStore` như hiện tại; `t` như hiện tại.
- Produces: component giữ nguyên exports/testids/handlers (`play-pause`, `step`, `reset`, `restore-potential`, `speed-slider`, `export-png` tạm còn — T8 dời). Thay đổi: nút play/pause thành primary (nền accent, icon SVG pause/play + chữ), các nút còn lại icon + chữ, mọi màu qua token, nút min-height 32px.

- [ ] **Step 1: Test fail** — render: nhãn play↔pause theo `simStore.running`; disabled khi `simStore.fatal`; testid đủ; class primary đúng nút play-pause.
- [ ] **Step 2: Run fail → Step 3: Implement → Step 4: Run PASS (vitest + e2e smoke).**
- [ ] **Step 5: Commit** — `feat(web): playback bar restyle with tokens`

### Task 8: `TopBar.svelte` + App.svelte bench wiring (phẫu thuật bố cục)

**Files:**
- Create: `web/src/ui/TopBar.svelte`
- Modify: `web/src/App.svelte` (bố cục 3 vùng + mount + xóa block styles light-mode + banner restyle token + momentum-caption dời dưới stage), `web/src/ui/SimCanvas.svelte` (thêm nhãn `|ψ|² · t = {t}` overlay góc trên-trái stage — aria-hidden, cập nhật từ `simStore.t`), `web/src/ui/ErrorBanner.svelte` (restyle token — spec §12)
- Delete: `web/src/ui/Toolbar.svelte`, `web/src/ui/PresetCard.svelte`, `web/src/ui/ObservablesBar.svelte`, `web/src/ui/ViewToggle.svelte`, `web/tests/observablesBar.test.ts`
- Test: `web/tests/topBar.test.ts`; sửa `web/tests/export.spec.ts`, `web/tests/smoke.spec.ts` nếu vị trí assert; thêm case 720px vào `web/tests/smoke.spec.ts`

**Interfaces:**
- Consumes: T4 ToolRail, T5 NarrationPanel, T6 ReadoutRail (callbacks: onExportPng = `simStore.requestCapture()`, onSaveState = post `serialize-state`, onImportFile = luồng decodeState hiện tại tách từ `onStateFile`), T7 PlaybackBar, T3 `scene.label`.
- Produces: bố cục cuối: `TopBar` (full-width: `back-link`, wordmark PSI·FORGE, `t('scene.label',{name})`, segmented mode `mode-toggle`, lang, ) + body flex [ToolRail 216px | center (stage + momentum-caption + PlaybackBar) | ReadoutRail 250px `{#if advanced}`]. Explore: không ReadoutRail, không khối tham số (ToolRail prop `compact?: boolean` — ẩn khối tham số), NarrationPanel hiện. Nâng cao: đủ. Lưu/Mở rời khỏi header (vào Xuất). Responsive: media query trong App.svelte theo spec §6.3 (768–1023 ray phải xuống dưới; <768 tool rail ngang).

- [ ] **Step 1: Test fail** — topBar.test.ts: render đủ back-link + mode-toggle + scene label đúng `t('scene.label', …)` + lang toggle flip. smoke.spec.ts thêm: viewport 1280×720 → `[data-testid="preset-card"]` hoặc nút ⓘ xuất hiện, canvas `visible` không cần scroll (NarrationPanel < 800px mặc định gọn).
- [ ] **Step 2: Run fail.**
- [ ] **Step 3: Implement** — TopBar component; App.svelte: thay header + Toolbar/PresetCard/ObservablesBar/ViewToggle bằng bố cục mới; xóa 4 file cũ + test cũ; dời momentum-caption vào cột center (dưới stage, class mono token); save/load banner (`load-error`, `save-note`) style token, xóa nhánh `@media (prefers-color-scheme)` còn sót trong App; SimCanvas thêm dòng label t (đọc `simStore.t`, DOM text update qua hiệu ứng runes).
- [ ] **Step 4: Full suites** — `npx vitest run` PASS; `npx playwright test` PASS (32+ mới — sửa selector vị trí nếu assert cũ fail); `npm run check` 0/0.
- [ ] **Step 5: Commit** — `feat(web): instrument-bench workspace layout (TopBar, rails, stage)`

### Task 9: Landing "Sân khấu" — live bg + dải phim + fallback

**Files:**
- Modify: `web/src/ui/Landing.svelte` (viết lại), `web/src/ui/SimCanvas.svelte` (prop `variant: 'app' | 'landing' = 'app'` — landing: stage full-bleed bỏ radius/border, pointer handlers no-op, touch-action mặc định lại), `web/src/App.svelte` (route landing không destroy worker — Landing tự quản lý vòng đời init/destroy như hiệu ứng route của sim)
- Delete: `web/tests/landing.test.ts` (viết lại thành bản mới), `web/tests/thumbs.spec.ts`, `web/public/thumbs/`
- Test: `web/tests/landing.test.ts` (mới), `web/tests/landing.spec.ts` (viết lại)

**Interfaces:**
- Consumes: `simStore` (init/destroy/send pattern App hiện tại), `SimCanvas variant='landing'`, `PRESETS` + `LANDING_ORDER`, `hasWebGl2()`, `t` key T3 (`landing.*`, `preset.<id>.title/teaser` tái dùng cho strip).
- Produces: Landing hoàn chỉnh: (a) nền = SimCanvas landing full-bleed `pointer-events:none` **`aria-hidden`** chạy `landingPreset` ($state module-scope trong Landing, default `'double-slit'`); mount → `simStore.init(PRESETS['double-slit'])` + set observables-cadence off; unmount → destroy; (b) hover/focus strip item → `setLandingPreset` debounce 150ms (timer cleanup) → destroy + init preset mới; (c) strip 5 link `data-testid="preset-tile"` `data-preset` href `#/sim/<id>` — sandbox số "—", còn lại 01–04, hover translateX(−3px) + viền accent; (d) status `t('landing.status', { name })` + blink dot CSS (tắt khi `prefers-reduced-motion`); (e) hero theo mockup landing.html (copy T3) + **entrance một lần: fade + translateY(8px→0) 300ms, transform/opacity, tắt khi reduced-motion**; (f) không WebGL2 → render div gradient `--bg-0→--bg-1` thay SimCanvas, mọi thứ khác giữ; (g) <1024px strip thành scroller ngang.

- [ ] **Step 1: Test fail (vitest)** — landing.test.ts: render 5 link đúng data-preset + testid; status text = `ĐANG CHIẾU · Khe kép`; hàm debounce (export pure `debouncedPreset(setter)`) gọi setter 1 lần khi 5 lần liên tiếp < 150ms; không hasWebGl2 → không mount SimCanvas (mock).
- [ ] **Step 2: Test fail (e2e)** — landing.spec.ts: (1) 5 tile + click double-slit → URL `#/sim/double-slit`; (2) hover lần lượt 5 mục (force hover nhanh) → đợi 400ms → status chứa tên preset cuối, không pageError; (3) `addInitScript` override `HTMLCanvasElement.prototype.getContext` webgl2 → null: landing hiện, tile click được; (4) `emulateMedia reducedMotion` → computed `animation-name` của dot = none; (5) hero + nav + status tồn tại.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Full suites PASS** (vitest, playwright, check). Xóa thumbs.
- [ ] **Step 5: Commit** — `feat(web): theater landing with live sim background and film-strip selector`

### Task 10: index.html meta/OG + favicon + WebGlMissing + og.png

**Files:**
- Modify: `web/index.html`, `web/public/favicon.svg`, `web/src/ui/WebGlMissing.svelte`
- Create: `web/public/og.png`
- Test: thêm assert vào `web/tests/landing.spec.ts`

**Interfaces:**
- Consumes: landing hoàn chỉnh (T9).
- Produces: `<html lang="vi">`; `<title>Psiforge — Phòng thí nghiệm lượng tử 2D</title>`; meta description vi ngắn; OG title/description/type/image (`/og.png`) + `twitter:card summary_large_image`; favicon.svg = glyph ψ màu `#5FD4E6` trên nền `#0B0E14`; og.png chụp 1200×630 landing (dev server chạy, lệnh `npx playwright screenshot --viewport-size=1200,630 http://localhost:5173/#/ web/public/og.png`), commit binary; WebGlMissing restyle token.

- [ ] **Step 1: Test fail** — landing.spec.ts: `document.title` chứa "Psiforge"; meta[property="og:image"] tồn tại; `link[rel="icon"]` 200.
- [ ] **Step 2: Run fail → Step 3: Implement + chụp og.png.**
- [ ] **Step 4: e2e PASS + eyeball nhanh dev server (implementer tự xem 1 lần).**
- [ ] **Step 5: Commit** — `feat(web): meta/OG tags, psi favicon, og image`

### Task 11: units.md refresh (F4) + final full run

**Files:**
- Modify: file units hiện có (tìm bằng `git ls-files | grep -i units` — kỳ vọng `docs/**/units.md`)
- Test: full suites cuối

**Interfaces:**
- Consumes: mọi task trước.
- Produces: units.md cập nhật hậu-M2: hệ đơn vị ħ=m=1, V theo E≈k²/2, grid resolution (256²/512² giải thích cho người đọc — memory D3: đừng giả định người đọc hiểu ký hiệu), dt/substep, quy ước fftfreq k. Không đổi code.

- [ ] **Step 1: Cập nhật docs.**
- [ ] **Step 2: Full final** — `cargo test --all` (110) + `cd web && npm run check && npx vitest run && npx playwright test` — tất cả xanh, số lượng ≥ đầu phiên.
- [ ] **Step 3: Commit** — `docs: refresh units.md post-M2 (fold-in F4)`

---

## Sau plan (thuộc phiên khác)

Polish pass mắt với người dùng (chuẩn M2 §7.1 — copy chốt, tinh chỉnh spacing); perf HUD `?perf=1` trên máy thật trước launch; T20 (README/GIF/launch). Vòng review whole-branch + finishing-a-development-branch khi user chốt.
