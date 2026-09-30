# Psiforge M1 — Thiết kế chi tiết: 2D, renderer WebGL, vẽ thế bằng chuột

- **Ngày:** 2026-09-30
- **Trạng thái:** Thiết kế đã duyệt từng phần trong hội thoại; chờ duyệt bản viết
- **Tài liệu mẹ:** spec v1 (`2026-09-29-psiforge-design.md`). Mọi nguyên tắc của v1 còn nguyên hiệu lực: đúng vật lý trước — đẹp ngay sau; đơn vị tự nhiên ħ = m = 1 mặc định; không server; non-goals mục 10 v1 là hợp đồng. Tài liệu này mở rộng chi tiết cho mốc M1, không thay đổi v1.

## 1. Phạm vi M1

**Kết quả nghiệm thu:** mở trang web → gói Gauss 2D bay vào tường khe kép, giao thoa hiện trên heatmap WebGL2 ở 60fps — rồi tự tay vẽ thêm tường bằng chuột ngay khi sóng đang chạy và thấy nó phản ứng theo. Mốc "wow" nội bộ theo roadmap v1.

Các quyết định đã duyệt trong hội thoại:

| Quyết định | Chốt |
|---|---|
| Phạm vi màn hình web | Một màn hình mô phỏng 2D: heatmap + vẽ thế chuột (4 công cụ) + thả gói sóng click-kéo + play/pause/step/reset/tốc độ. Renderer 1D, landing preset, đo đạc, hai chế độ → M2 |
| Stack web | Svelte 5 + Vite + WebGL2; renderer viết imperative thuần, Svelte lo phần DOM quanh canvas |
| GitHub | Bạn tạo repo (remote) đầu M1; CI Rust chạy thật từ đó; deploy GitHub Pages bật cuối M1 |
| Trình tự | H2 — xương sống dọc sớm: core 2D tối thiểu (đã có test vàng) → slice wasm/worker/heatmap → đo perf 512×512 → hoàn thiện phần còn lại |

**Không thuộc M1 (để M2):** API observables 2D (⟨x⟩, σx, năng lượng dạng thư viện) và dải đồ thị; không gian động lượng |ψ̃(p)|²; mô phỏng phép đo + sập hàm sóng; hai chế độ Khám phá/Nâng cao (kể cả hue-pha); landing preset + thẻ lời dẫn; chú giải thuật ngữ; polish pass thị giác; xuất PNG/JSON; renderer 1D trên web; solver ImaginaryTime; publish npm. Moments trong test vàng 2D tính cục bộ trong test, không thêm API thư viện.

## 2. Trình tự H2 (xương sống dọc sớm)

1. **Core 2D tối thiểu + test vàng:** Grid2D, Wavefunction2D, gaussian_2d, FFT 2D, SplitOperator2D; test giãn nở + bảo toàn chuẩn + FFT round-trip.
2. **Slice dọc:** crate `wasm` (Simulation2D: new / set_gaussian / advance / density_phase) + worker + heatmap thô chưa tương tác. **Đo ngay hiệu năng 512×512** (Perf HUD / script perf): đạt 60fps → tiếp; không đạt → quyết định khi chi phí thay đổi còn rẻ (hạ lưới mặc định, tối ưu FFT, chỉnh ngân sách substep).
3. **Hoàn thiện core 2D:** builders Potential2D (harmonic2d, finite_well, wall có khe), test vàng đầy đủ (coherent quỹ đạo tròn, bảo toàn năng lượng, đối chiếu DFT trực tiếp).
4. **Tương tác:** vẽ thế 4 công cụ, thả gói sóng, playback, reset, khôi phục thế gốc, i18n VN/EN.
5. **CI + Pages:** job web (build + vitest + Playwright smoke), job wasm-test, cuối cùng deploy GitHub Pages khi push main.

Trình tự này là khung cho implementation plan — plan sẽ bẻ thành task TDD cụ thể.

## 3. Core 2D (`core/src/`)

### 3.1 Quy ước đặt tên

Hai họ type song song, không generic: 1D giữ nguyên tên M0 (`Grid1D`, `Wavefunction`, `Potential`); 2D thêm hậu tố (`Grid2D`, `Wavefunction2D`, `Potential2D`).

### 3.2 Grid & trạng thái

- `Grid2D { nx, ny, xmin, xmax, ymin, ymax }` — validate như Grid1D (nx, ny ≥ 2; max > min; hữu hạn). `dx()`, `dy()`, `x(i)`, `y(j)`; index phẳng row-major `k = j·nx + i`; ψ và V dùng cùng thứ tự.
- `Wavefunction2D` — `psi: Vec<Complex64>` (f64), `m`, `hbar`; validate giống 1D (độ dài, hữu hạn, m > 0, ħ > 0); `norm()` với trọng số dA = dx·dy, `normalize()` (norm 0 là no-op có tài liệu hóa, như M0).

### 3.3 FFT 2D

Module `fft` vẫn giữ private: biến đổi 2D = FFT 1D theo từng hàng rồi từng cột, scratch buffer tái sử dụng; k-grid `kx`, `ky` theo đúng convention fftfreq của M0. Chỉ public hóa khi M2 cần |ψ̃(p)|².

### 3.4 Bộ truyền

- Trait `Propagator` của M0 được nâng lên associated types (`type Field; type Pot;`), để một trait phục vụ cả `SplitOperator` (1D) và `SplitOperator2D`. Đây là refactor chữ ký duy nhất đụng code M0 — không đổi hành vi; toàn bộ test M0 phải xanh nguyên vẹn.
- `SplitOperator2D::new(grid, dt, m, hbar)` — Strang splitting như 1D: nửa bước V trong không gian vị trí → trọn bước động năng trong không gian (kx, ky) bằng FFT 2D → nửa bước V. Norm guard: từ chối nếu ‖ψ‖² không hữu hạn hoặc lệch 1 quá 1e-10, trả `NormDrift` mang ‖ψ‖²; đếm bước u64.

### 3.5 Thế 2D

`Potential2D { values: Vec<f64> }` + `add` để trộn; builders:

- `harmonic2d(grid, m, omega)` — ½mω²r² radial;
- `finite_well(grid, cx, cy, width, height, depth)` — giếng chữ nhật;
- `wall(grid, x_center, thickness, height, gaps)` — tường dọc tại x = x_center, danh sách khe (center_y, width) — nguyên liệu cho khe kép.

### 3.6 Trạng thái ban đầu

`states::gaussian_2d(grid, x0, y0, kx, ky, sigma_x, sigma_y, m, hbar)` — cho phép σx ≠ σy để test giãn nở độc lập theo từng trục.

### 3.7 Test vàng 2D (`core/tests/golden2d.rs`)

| Hiện tượng | Chuẩn so sánh |
|---|---|
| Giãn nở Gauss tự do | σx(t), σy(t) = σ₀√(1+(ħt/2mσ₀²)²) theo từng trục, chạy với σx ≠ σy để bắt lỗi tráo trục |
| Coherent trong bẫy điều hòa tròn | ⟨x⟩, ⟨y⟩ đi quỹ đạo tròn bán kính r₀ (moments tính cục bộ trong test) |
| Bảo toàn chuẩn | ≤ 1e-12 sau 5×10³ bước (floor f64, theo §8.1 v1 đã chỉnh) |
| Bảo toàn năng lượng (V tĩnh) | ΔE/⟨E⟩ ≤ 1e-10 sau 10⁴ bước trên lưới vừa (moments cục bộ) |
| FFT 2D đúng | round-trip forward ↔ inverse; đối chiếu DFT trực tiếp O(n⁴) trên lưới 8×8 |

## 4. Crate `wasm` (`psiforge-wasm`)

Lớp mỏng wasm-bindgen: một class `Simulation2D` nắm toàn bộ trạng thái (grid, ψ, V, bộ truyền, snapshot ψ ban đầu). Build bằng wasm-pack `--target web`; worker import như ES module.

- `new(nx, ny, extent_x, extent_y, dt, m, hbar)`
- `set_gaussian(x0, y0, kx, ky, sigma_x, sigma_y)` — đặt ψ và lưu snapshot reset
- `reset_wave()` — ψ về snapshot
- `potential_zero()` / `potential_harmonic(omega)` / `potential_wall(x_center, thickness, height, gap_centers, gap_widths)` — đặt thế nền giải tích và lưu làm "thế gốc"
- `restore_potential()` — V về thế gốc, xóa hết nét vẽ
- **Paint-op trong Rust, không truyền mảng V từ JS:** `paint_disc(cx, cy, r, value)`, `paint_segment(x1, y1, x2, y2, thickness, value)` — bút tự do = chuỗi segment theo đường chuột; rào = segment giá trị dương; giếng = segment giá trị âm; tẩy = disc giá trị 0. Vẽ được trong khi mô phỏng đang chạy (bước tiếp theo đọc V mới ngay — tính chất `step` của M0)
- `advance(substeps) -> Result<f64, JsError>` — chạy đúng substeps bước dt cố định, trả thời gian mô phỏng; `CoreError` → exception kèm thông điệp hữu ích (§3.2 v1); NormDrift là lỗi chết
- `density_phase() -> Float32Array` — interleaved [ρ, φ] × N điểm, hạ f64→f32 đúng ở ranh giới renderer (§4.1 v1), layout khớp texture `RG32F`
- `read_potential_f32() -> Float32Array` — chỉ gửi khi V vừa thay đổi (dirty flag)
- `norm() -> f64` — cho HUD

## 5. Worker & luồng dữ liệu

- `web/src/sim/physics.worker.ts` sở hữu `Simulation2D`; protocol typed trong `protocol.ts`:
  - main → worker: `init`, `set-gaussian`, `potential-*`, `restore-potential`, `paint-*`, `advance{substeps}`, `reset-wave`
  - worker → main: `frame{densityPhase (Float32Array transferable — zero-copy), potential?, t, norm}` hoặc `fatal{message}`
- **Main thread dẫn dắt bằng requestAnimationFrame:** mỗi frame tính `substeps = clamp(speed × dt_wall / dt, 0, MAX)` (tick vật lý tách tick render, mô phỏng không phụ thuộc tốc độ máy — §3.1 v1); nếu worker còn đang bận thì bỏ frame mới, không xếp hàng — render luôn dùng kết quả mới nhất. Pause = main ngừng gửi advance. MAX chặn "xoắn ốc chết" khi tab bị throttle.
- Lỗi chết (NormDrift, worker crash): banner đỏ rõ ràng + nút reset; thiết bị thiếu WebGL2 → trang lỗi thay vì ứng dụng.

## 6. Web UI

Cấu trúc `web/` (npm repo riêng ngoài cargo workspace; `node_modules` gitignore): `src/sim/` (worker + protocol), `src/render/` (renderer WebGL2 thuần), `src/ui/` (Svelte: `SimCanvas`, `Toolbar`, `PlaybackBar`, `ErrorBanner`), `src/i18n/` (`vi.ts`, `en.ts` — mọi nhãn qua key; ngôn ngữ theo `navigator.language`, có nút chuyển — §6.5 v1).

**Renderer:** texture `RG32F` (ρ, φ) + texture `R32F` (V, cập nhật theo dirty flag). Fragment shader M1: độ sáng = tonemap mật độ theo colormap đơn giản; V là lớp nền mờ cường độ theo chiều cao. Không viết sẵn hue-pha (để M2 — tránh code chết). Lọc texture float: NEAREST mặc định, bật `OES_texture_float_linear` khi có.

**Tương tác canvas:**

- **Vẽ thế (4 công cụ §6.3 v1):** bút tự do, rào (kéo thẳng đoạn giá trị dương), giếng (đoạn giá trị âm), tẩy (disc 0 theo đường chuột); slider "độ cao ±" chung; preview nét đang kéo vẽ trên canvas 2D overlay mỏng phía trên.
- **Thả gói sóng:** công cụ riêng, click-kéo. Điểm nhấn = tâm (x₀, y₀); hướng kéo = hướng động lượng; độ dài kéo = σ; độ lớn |k| chỉnh bằng slider "động lượng" (hiển thị số). Khi kéo hiện mũi tên hướng + vòng tròn bán kính σ. Semantic này được rà lại ở polish pass M2.
- **Playback:** play / pause / step (đúng một bước dt) / reset (ψ về snapshot, **giữ nguyên V hiện tại**) / tốc độ; nút "Khôi phục thế gốc".
- **Khởi tạo mặc định:** lưới 512×512 (hạ cấp qua `?grid=`), gói Gauss bay vào tường khe kép — mở link 5 giây là thấy giao thoa.

## 7. Kiểm thử, CI, hiệu năng

- **core:** cargo test như M0 + criterion bench `step2d` (128², 256², 512²) chạy cục bộ.
- **wasm:** bộ golden 2D tối thiểu chạy lại bằng wasm-bindgen-test trong CI — chứng minh cùng một vật lý trên bản build WASM (§8.2 v1).
- **web:** vitest cho phần thuần (protocol, tính substeps, đổi tọa độ chuột ↔ lưới); Playwright smoke (§8.3 v1): mở trang, chạy ~2 giây, density ≠ 0, không console error, không crash.
- **Hiệu năng (mục tiêu 60fps @512×512 laptop phổ thông):** Perf HUD ẩn qua `?perf=1` (fps, substeps/frame, thời gian compute worker); `npm run perf` chạy Playwright đo 5 giây và in số liệu (§6.5 v1 — benchmark cục bộ, CI không fail theo perf).
- **CI:** giữ job Rust của M0; thêm job `web` (npm ci → build → vitest → Playwright) và job `wasm-test`; cuối M1 bật workflow deploy GitHub Pages khi push vào main.

## 8. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| 512×512 không giữ 60fps | H2 đo ngay sau slice đầu; phương án sẵn có: hạ lưới mặc định, tối ưu FFT (scratch, batch), giảm ngân sách substep (§11 v1) |
| Chuỗi công cụ wasm trên Windows (wasm-pack, target wasm32) | Cài đặt và xác thực ngay trong task đầu của giai đoạn slice; CI pin cùng phiên bản |
| Svelte 5 còn mới | UI M1 nhỏ (4 component); phần nặng (canvas, worker, renderer) là TypeScript thuần |
| Playwright CI flaky | Smoke tối giản, retry 1 lần, không assert timing chặt |
| `RG32F` không lọc tuyến tính trên một số GPU | NEAREST + nội suy trong shader khi cần |
