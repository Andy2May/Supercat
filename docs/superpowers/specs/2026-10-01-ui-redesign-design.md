# Spec — Psiforge UI/UX Redesign: "Instrument Bench × Theater"

- **Ngày:** 2026-10-01
- **Tài liệu mẹ:** spec v1 `2026-09-29-psiforge-design.md`; spec M1 `2026-09-30-psiforge-m1-design.md`; spec M2 `2026-09-30-psiforge-m2-design.md`. Non-goals v1 mục 10 và mọi cam kết vật lý/perf M2 còn nguyên hiệu lực.
- **Trạng thái:** thiết kế duyệt qua brainstorm 2026-10-01 (mockup trực quan 3 vòng + 3 section tổng hợp, phê duyệt từng phần). Base = branch `m2-launch` @ 741b5cd (M2 execution closed).
- **Mockup tham chiếu:** `.superpowers/brainstorm/36220-1790849507/content/` (directions.html, landing.html, workspace.html) — mô phỏng nền trong mockup là giả minh họa (cos² hai nguồn, không phải solver); mọi hình ảnh thật lấy từ renderer hiện có.

## 1. Mục tiêu & định nghĩa hoàn thành

Redesign toàn diện **lớp trình bày (chrome)** của Psiforge sau khi M2 đóng: landing kiểu "sân khấu" (B) + workspace kiểu "bàn đo đạc" (A), dark-only, đúng vibe **cơ học lượng tử × playground × khám phá**, độ tinh xảo **Linear/Vercel × oscilloscope**. Engine, vật lý, renderer không đổi.

**Hoàn thành khi:**

1. Landing + workspace triển khai đúng thiết kế mục 5–6; **100% `data-testid` hiện có còn nguyên tên và ngữ nghĩa sử dụng**.
2. Cả ba suite xanh với số lượng **chỉ tăng không giảm**: cargo (110, kỳ vọng không đổi), wasm-pack (27, kỳ vọng không đổi), vitest ≥ 155, Playwright ≥ 32.
3. Perf không suy giảm: sim loop, worker, renderer không bị chạm; điều kiện nghiệm thu perf M2 §1.2 (HUD 60fps@256² trên máy người dùng) được đo lại TRƯỚC khi launch (thuộc đợt T20, không thuộc spec này).
4. i18n vi/en đối xứng hoàn toàn (parity test) — kể cả mọi nhãn mới; font hiển thị đúng dấu tiếng Việt (không rơi fallback).
5. Người dùng duyệt bằng mắt từng màn hình theo chuẩn polish pass M2 §7.1.

## 2. Phạm vi

**Trong phạm vi:**

- Tái bố cục + reskin hai khung nhìn (landing, workspace) theo mục 5–6.
- Design tokens (mục 4) thay thế style rải rác hiện tại; bỏ hẳn light mode.
- Font self-hosted `.woff2` (không npm dependency mới, không CDN runtime).
- Icon SVG inline (tools + playback + xuất).
- `index.html`: title, meta description, OG tags, OG image (chụp sau build), favicon mới.
- Ba fold-in từ final review M2 (mục 11 F1, F2, F4).

**Ngoài phạm vi (nguyên tắc: KHÔNG thêm tính năng mới):**

- Tham số vật lý mới — kể cả slider "Hướng (góc)" xuất hiện trong mockup workspace: hướng gói **đã** do kéo đặt từ M1 (`packet.ts`: kx,ky = unit(drag)·kMag); thêm slider là trùng cơ chế. Bỏ; ứng viên M3 nếu cần.
- Renderer/shader/colormap/legend V₀ (đã đúng bản sắc — D8); engine Rust; worker protocol; format save file.
- Crossfade chuyển trang; PWA; light mode; đổi hệ preset (vẫn 4 + sandbox).

## 3. Quyết định chốt trong brainstorm

| # | Quyết định |
|---|---|
| D1 | Phạm vi = reskin + tái bố cục, không tính năng mới |
| D2 | Dark-only — bỏ `prefers-color-scheme`, một theme duy nhất |
| D3 | Gu thị giác = hiện đại tinh tế (Linear/Vercel) × dụng cụ đo (oscilloscope); không cosmic, không đồ-chơi PhET |
| D4 | Workspace = hướng A "Bàn đo đạc": thanh trên + ray trái (điều khiển) + canvas giữa + ray phải (đọc số, chỉ Nâng cao) + thanh phát |
| D5 | Landing = hướng B "Sân khấu": full-bleed, nền là mô phỏng thật đang chạy |
| D6 | Bộ chọn thí nghiệm = V2 "dải phim" bên phải; hover/focus đổi nền sang preset tương ứng (debounce 150ms); không dùng thumbnail tĩnh |
| D7 | Thuyết minh = N1: panel cuối ray trái (không đè canvas, không đẩy canvas xuống — tránh lỗi viewport 720px của T18) |
| D8 | Colormap \|ψ\|² **giữ inferno** — chốt luôn câu hỏi viridis treo từ M2 |
| D9 | Sandbox trong dải phim đánh số "—" (không phải thí nghiệm) |
| D10 | Font: Space Grotesk (UI/display) + JetBrains Mono (số/readout/label) — self-hosted woff2 |

## 4. Design system (tokens)

Định nghĩa một lần trong `app.css` dưới CSS custom properties; mọi component chỉ dùng token (không hex rải).

### 4.1 Màu

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg-0` | `#0B0E14` | nền trang |
| `--bg-1` | `#0D1118` | panel/ray/thanh |
| `--bg-2` | `#11151D` | surface nổi (hover, track slider, input) |
| `--line` | `rgba(255,255,255,0.08)` / `0.14` khi nổi | hairline 1px |
| `--text-1` | `#E8ECF1` | chữ chính |
| `--text-2` | `#9AA5B5` | chữ phụ |
| `--text-3` | `#76808F` | micro-label, hint (≥4.8:1 — đạt AA chữ nhỏ) |
| `--accent` | `#5FD4E6` | accent duy nhất: nút primary, active, focus ring, link |
| `--accent-ink` | `#07131A` | chữ trên nền accent |

- **Màu ngữ nghĩa vật lý giữ nguyên (không đụng renderer):** colormap inferno; rào `#F2730D`; giếng `#1F9EB8`; gói `#E6C040`; sparkline `#22D3EE` / `#E879F9` / `#4ADE80`; eraser `#888`.
- Nguyên tắc hai thế giới: **canvas ấm = mẫu vật, chrome lạnh = dụng cụ.** Không đưa accent cyan vào sắc ấm của physics và ngược lại (trừ focus ring/border — viền, không phải nội dung).
- Cấm: `#000` thuần, glow ngoài (outer glow), gradient text, accent thứ hai.

### 4.2 Typography

- Space Grotesk 400/600/700 — display, tiêu đề, nút, nhãn UI, thân bài.
- JetBrains Mono 400/600 — **mọi** con số/readout/micro-label/công thức/trạng thái; micro-label luôn uppercase, letter-spacing 0.15–0.2em, màu `--text-3`.
- Quy ước cỡ: hero 44–48px; section title 1.4rem; nút 13px; micro-label 9–10px; readout số 12px mono.
- File woff2 phải chứa **subset vietnamese + latin** cho cả hai font (điểm kiểm ngay task đầu tiên — Rủi ro R1); `font-display: swap`; fallback stack `system-ui` / `ui-monospace`.

### 4.3 Icon

- 6 icon tool: SVG inline, stroke 1.75, viewBox 24, hiển thị 17px, mang màu ngữ nghĩa của tool (như mockup workspace). Không thư viện icon.
- Icon dòng cho playback (play/pause/step/reset/restore) + xuất (PNG/lưu/mở): SVG inline stroke cùng chuẩn.
- `favicon.svg` mới: glyph ψ màu accent trên nền `--bg-0`.

### 4.4 States, viền, bán kính, spacing

- Hover: viền sáng dần về accent (0.15–0.2s ease); `:active`: `translateY(1px) scale(0.985)`; focus-visible: ring accent 1px offset 2px; disabled: opacity 0.45.
- Panel không đổ bóng trong app — phân tầng bằng `bg-0 → bg-1 → bg-2` + hairline. Glass (`backdrop-filter: blur`) **chỉ** ở landing nav + nút ghost hero; cấm trong workspace.
- Radius: 8px control / 10–12px panel / 14px khung lớn. Spacing hệ 4px (4/8/12/16/24).

## 5. Landing — "Sân khấu"

### 5.1 Cấu trúc

`<section class="landing">` cao `100dvh`, position relative:

1. **Nền live** — tái sử dụng `SimCanvas` (một instance worker + renderer thật) absolute full-bleed, `pointer-events: none`, cadence như explore (observables off). Preset chạy = mục đang được focus/hover trong dải phim; mặc định `double-slit`. Tương tác đổi nền: hover hoặc keyboard focus → debounce 150ms → destroy worker cũ rồi init preset mới (pattern destroy-then-init sẵn có của App.svelte).
2. **Nav kính** — hàng trên: wordmark `PSI·FORGE` (ψ cyan) + dòng mono "2D QUANTUM LAB"; phải: VI/EN (giữ nút ngôn ngữ hiện có), link GitHub repo.
3. **Hero lệch trái** (max-width ~400px, dọc giữa): kicker mono uppercase "PHÒNG THÍ NGHIỆM LƯỢNG TỬ" → tiêu đề 2 dòng (copy Phụ lục A) → đoạn mô tả ~2 câu → CTA primary "Bắt đầu thí nghiệm →" (`#/sim/double-slit`) + ghost kính "Tự do khám phá" (`#/sim/sandbox`) → dòng mono công thức Schrödinger làm chi tiết trang trí (`aria-hidden`).
4. **Dải phim phải (V2)** — 5 link `<a>` dọc: số mono (01–04; sandbox "—"), tên preset, mô-tả-một-dòng. Mỗi link giữ `data-testid="preset-tile"` + `data-preset=<id>` (e2e hiện hành dựa vào 2 атрибute này). Mục đang chiếu nền: viền accent.
5. **Status dưới trái** — "● ĐANG CHIẾU · {tên}" (blink 1.6s) + "|ψ|² · ħ = m = 1" — mono, `--text-3`.

### 5.2 Responsive & fallback

- < 1024px: dải phim chuyển thành scroller ngang dưới hero (5 pill); hero max-width nới.
- Không WebGL2 (probe sẵn có): nền thay bằng gradient tĩnh `bg-0 → bg-1`; nav/hero/dải phim hoạt động bình thường; người dùng vẫn vào sim được để gặp trang `WebGlMissing` đúng thiết kế hiện tại.
- `prefers-reduced-motion`: tắt blink + entrance.

### 5.3 Meta & thương hiệu (làm trong spec này)

`index.html`: `<title>` = "Psiforge — Phòng thí nghiệm lượng tử 2D"; meta description (vi, ngắn); OG title/description + OG image (chụp landing sau khi build xong, lưu `public/og.png`); favicon mới (4.3).

## 6. Workspace — "Bàn đo đạc"

### 6.1 Bố cục ba vùng + mapping component

Thanh trên full-width; dưới là body 3 cột flex: **ray trái** (216px) · **trung tâm** (flex) · **ray phải** (250px, chỉ Nâng cao).

| Vùng | Component hiện tại | Thành phần mới | Ghi chú testid |
|---|---|---|---|
| Thanh trên | header trong App.svelte | `TopBar.svelte`: ← Trang chủ (link `#/`), wordmark nhỏ, "THÍ NGHIỆM · {preset}" (t(key,params)), segmented **KHÁM PHÁ/NÂNG CAO**, VI/EN | `mode-toggle` giữ |
| Ray trái — Công cụ | Toolbar.svelte (nút chữ + chấm màu) | `ToolRail.svelte`: grid 3×2 nút icon + nhãn, active = viền accent + nền accent 8% | `tool-{tool}` giữ |
| Ray trái — Tham số ngữ cảnh | 2 slider luôn hiện trong Toolbar | Khối tham số theo tool active: brush/barrier/well → chiều cao; packet → \|k\|; eraser/measure → ẩn cả khối | `height-slider`, `k-slider` giữ |
| Ray trái — Thuyết minh | PresetCard.svelte (card giữa trang) | `NarrationPanel.svelte` cuối ray trái: mở/Thu gọn như hiện tại; Term tooltip nguyên hành vi | `preset-card`, `preset-card-toggle`, `preset-info` giữ |
| Canvas trung tâm | SimCanvas.svelte | Giữ nguyên render logic; stage có nhãn mono "\|ψ²\| · t = {t}" góc trên-trái + legend V₀ (đã có) góc trên-phải; momentum caption → dòng mono dưới stage | canvas/overlay như cũ |
| Thanh phát | PlaybackBar.svelte | Restyle: nút primary (Chạy/Tạm dừng icon), "Một bước", "Đặt lại sóng", "Khôi phục V", tốc độ | `play-pause`, `step`, `reset`, `restore-potential`, `speed-slider` giữ |
| Ray phải — Đọc số | ObservablesBar.svelte | `ReadoutRail.svelte` khối "ĐỌC SỐ": 3 sparkline (⟨x⟩/⟨y⟩, σ·σ có vạch mức ħ/2, E) + readout + ghi chú E | `observables-bar`, `x-mean-value`… giữ |
| Ray phải — Hiển thị | ViewToggle.svelte + contrast (nâng cao) | Khối "HIỂN THỊ": segmented Vị trí/Xung lượng/Pha + slider Tương phản | view/contrast testid giữ |
| Ray phải — Xuất | nút PNG trong PlaybackBar + Lưu/Mở trong header | Khối "XUẤT": PNG · LƯU · MỞ hàng ngang | `export-png` dời từ PlaybackBar; `export-json`, `import-json`(+input) dời từ header |

### 6.2 Hai chế độ

- **Khám phá:** không ray phải; canvas nở toàn chiều ngang; ray trái = Công cụ + Thuyết minh; khối tham số ẩn (dùng default). Công cụ Đo vẫn có (D8 M2).
- **Nâng cao:** đủ ba ray; mọi testid nâng cao tại vị trí mới.
- NarrationPanel **mở mặc định** khi vào preset (giữ hành vi remount T9); viewport cao < 800px mặc định thu gọn (R4).
- Mode vẫn persist localStorage (hiện trạng, không đổi).

### 6.3 Responsive workspace

- ≥ 1024px: đúng mockup. 768–1023px: ray phải tách thành panel ngang dưới thanh phát (grid 3 cột nội dung). < 768px: ray trái thành dải cuộn ngang phía trên canvas (chỉ icon + nhãn); NarrationPanel thành collapsible dưới canvas; ray phải thành bottom-sheet mở từ nút "Đọc số"; canvas luôn giữ tỉ lệ 1:1 (yêu cầu isotropic của renderer).
- E2E chạy khung 1280×800 (hiện hành); thêm probe 720px cao cho workspace dọc (Rủi ro R4).

## 7. Chuyển động

- **Nguyên tắc: vật lý là chuyển động duy nhất.** Workspace tĩnh ngoài hover/active/focus; không animation lặp trong workspace.
- Landing: blink status 1.6s; entrance hero một lần (fade + translateY 8px, 300ms, transform/opacity); hover dải phim translateX(-3px) + viền accent.
- Chỉ animate `transform`/`opacity`/`border-color`/`background-color`; cấm `top/left/width/height`. `prefers-reduced-motion` tắt toàn bộ (kể cả blink).
- Không crossfade landing→sim (YAGNI, để M3+ nếu launch cần).

## 8. i18n

- Mọi nhãn/chữ mới: key vi + en + parity test (quy ước hiện hành). Key cũ tái dùng khi ngữ nghĩa không đổi (`playback.*`, `tool.*`, `view.*`, `obs.*`, glossary…).
- Key mới chính: landing (kicker, hero title/desc, CTA×2, status, strip mô-tả một dòng), ray labels (CÔNG CỤ/THUYẾT MINH/ĐỌC SỐ/HIỂN THỊ/XUẤT), "THÍ NGHIỆM · {name}".
- Fold-in F2: helper `t(key, params)` nội suy `{name}`-style thay vì `.replace()` rải rác — helper này là nền cho các key tham số mới.

## 9. Kiểm thử

- **Bảo toàn 100% data-testid** — chỉ di chuyển vị trí DOM, không đổi tên/ngữ nghĩa.
- vitest: viết lại spec của component đổi tên (ToolRail/ReadoutRail/NarrationPanel/TopBar); giữ spec logic thuần (sparkline, stateFile, i18n parity mở rộng key mới); spec token (contrast cặp màu chính tĩnh).
- Playwright: cập nhật landing spec (DOM mới: dải phim, hero, status; thêm case hover-đổi-nền + fallback không WebGL2 bằng route chặn); cập nhật vị trí Lưu/Mở; thêm case narration thu gọn trong ray; giữ 32 hiện hành xanh (chỉ đổi selector vị trí nếu cần).
- Perf: `?perf=1` HUD đo trên máy người dùng trước launch (điều kiện M2 §1.2 — không lặp lại ở đây nhưng redesign KHÔNG được làm giảm: không thêm tác vụ vào rAF loop).

## 10. Trợ năng

- Contrast trên `--bg-0` (đo bằng công thức WCAG): `--text-1` ≈ 16:1, `--text-2` ≈ 7.5:1, `--text-3` ≈ 4.8:1 (chỉ dùng cho micro-label; thông tin thiết yếu dùng `--text-2` trở lên), `--accent` ≈ 11:1, `--accent-ink` trên accent ≈ 10.5:1 — ≥ WCAG AA toàn bảng, phần lớn AAA.
- Segmented control = buttons `aria-pressed` (pattern ViewToggle hiện hành); dải phim = links thật (focus-visible ring + preview đổi nền qua focus — không chỉ hover); Term tooltip giữ focus-visible + aria-describedby (T18); canvas nền landing `aria-hidden`; mọi pointer target ≥ 32px chiều cao nút.
- Dark-only bỏ nhánh `prefers-color-scheme` — giảm nhánh CSS, giảm rủi ro lệch màu (mục tiêu quality, không phải cắt chức năng: app chưa từng có người dùng light-only).

## 11. Fold-in từ final review M2

| # | Mục | Xử lý |
|---|---|---|
| F1 | `MEANS_RANGE` magic → `DEFAULTS.extent/2` | ✔ làm trong ReadoutRail |
| F2 | `t(key, params)` tổng quát thay 4 chỗ `.replace('{mode}')` | ✔ task đầu (i18n nền) |
| F3 | RLE cho V trong save file | ⏭️ bỏ (điều kiện "512² save phổ biến" chưa đạt) |
| F4 | docs/units.md refresh | ✔ đợt docs cuối |
| F5 | (mở rộng) colormap viridis | ✔ chốt giữ inferno (D8) |

## 12. File chạm / không chạm

**Chạm:** `web/src/app.css` (viết lại thành tokens) · `App.svelte` (tách TopBar + bố cục bench) · `Landing.svelte` (viết lại sân khấu) · `ui/Toolbar.svelte → ui/ToolRail.svelte` · `ui/PresetCard.svelte → ui/NarrationPanel.svelte` · `ui/ObservablesBar.svelte → ui/ReadoutRail.svelte` · `ui/ViewToggle.svelte`, `ui/PlaybackBar.svelte`, `ui/Term.svelte`, `ui/ErrorBanner.svelte`, `ui/WebGlMissing.svelte` (restyle theo token) · `i18n/vi.ts`, `i18n/en.ts`, `i18n/index.ts` (t params) · `web/index.html` · `web/public/fonts/` (mới) · `web/public/favicon.svg` · `web/public/og.png` (mới, chụp) · `docs/superpowers/units.md` (F4).

**Không chạm:** `render/*` (renderer, shaders, simLoop) · `sim/*` (worker, stores, protocol, stateFile, sparkline logic, packet, tools) — trừ import-path rename nếu component đổi tên gọi chúng · `core/*` · `wasm/*` · CI workflows (trừ khi test count đổi tên job không đổi).

## 13. Rủi ro & giảm nhẹ

| # | Rủi ro | Giảm nhẹ |
|---|---|---|
| R1 | woff2 thiếu glyph tiếng Việt (dấu rơi fallback, xấu) | Kiểm subset ngay task cài font (render chuỗi probe "ữ ộ ơ ẳ ế ữộng" trên cả hai font, so pixel với hệ font); nếu thiếu — dùng bản full thay subset |
| R2 | Landing live bg nặng máy yếu | Cadence = explore (đã nhẹ nhất); fallback gradient khi không WebGL2; chấp nhận mức tiêu thụ ngang một tab sim |
| R3 | e2e vỡ do đổi DOM | testid bảo toàn; chạy full e2e mỗi task chạm UI (chuẩn hiện hành); landing spec viết lại trước (task riêng) |
| R4 | Workspace dọc chật viewport ngắn (720px) — lỗi T18 | N1 không đẩy canvas; e2e probe 720px; narration mặc định thu gọn ở < 800px cao |
| R5 | Hero copy phóng đại ("viral slop") | Copy dè dặt, đúng tinh thần narration M2 (đã qua physics-audit); review copy trong polish pass mắt |
| R6 | Hover-swap thrash worker khi quét chuột nhanh | Debounce 150ms + destroy-then-init tuần tự (không bao giờ 2 worker cùng lúc) |

## Phụ lục A — Draft copy (vi / en)

| Vị trí | vi | en |
|---|---|---|
| Kicker | PHÒNG THÍ NGHIỆM LƯỢNG TỬ | 2D QUANTUM LAB |
| Hero title | Nhìn thấy / cái vô hình. | See the / invisible. |
| Hero desc | Vẽ rào chắn, bắn gói sóng, đo vị trí — và xem cơ học lượng tử tự diễn ra dưới con mắt bạn. Không cài đặt, không đăng ký. | Draw barriers, fire wave packets, take measurements — and watch quantum mechanics unfold before your eyes. No install, no signup. |
| CTA primary | Bắt đầu thí nghiệm → | Start experimenting → |
| CTA ghost | Tự do khám phá | Free exploration |
| Status | ĐANG CHIẾU · {name} | NOW SHOWING · {name} |
| Công thức (trang trí) | i·ħ ∂ψ/∂t = −ħ²/2m ∇²ψ + Vψ | (như nhau) |
| Ray trái | CÔNG CỤ / THUYẾT MINH | TOOLS / BRIEFING |
| Ray phải | ĐỌC SỐ / HIỂN THỊ / XUẤT | READOUTS / VIEW / EXPORT |
| Scene label | THÍ NGHIỆM · {name} | EXPERIMENT · {name} |
| `<title>` | Psiforge — Phòng thí nghiệm lượng tử 2D | Psiforge — 2D Quantum Lab |

*Copy cuối cùng chốt trong polish pass mắt; các dòng trên là mốc để parity test khởi tạo key.*
