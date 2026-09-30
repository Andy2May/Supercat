# Spec M2 — Psiforge: Observables, đo đạc, preset & ra mắt công khai

- **Ngày:** 2026-09-30
- **Tài liệu mẹ:** spec v1 `2026-09-29-psiforge-design.md`; spec M1 `2026-09-30-psiforge-m1-design.md`. Mọi nguyên tắc v1 còn nguyên hiệu lực; non-goals v1 mục 10 là hợp đồng.
- **Trạng thái:** thiết kế đã duyệt qua brainstorm 2026-09-30 (3 phần, phê duyệt từng phần).

## 1. Mục tiêu & định nghĩa hoàn thành

M2 là mốc **ra mắt công khai** theo roadmap v1 mục 9: bổ sung lớp "đo lường & hiểu" lên engine 2D đã đúng đắn của M1 — observables thời gian thực, không gian động lượng, mô phỏng phép đo sập hàm sóng, thư viện preset có lời dẫn, hai chế độ trình bày, chú giải thuật ngữ — kết thúc bằng polish pass thị giác chuyên sâu và xuất bản.

**Hoàn thành khi:**

1. Toàn bộ tính năng mục 2.1 hoạt động, các bộ test hiện hữu không hỏng (số lượng chỉ tăng).
2. Perf: **≥ 60fps @ lưới 256², speed 1, đo bằng HUD trên máy người dùng** (không phải cam kết CI). 512² vẫn chọn được ở Nâng cao, có nhãn "lưới lớn" + hiển thị fps, không hứa 60.
3. Physics-audit hồi tố module wave-dynamics chạy xong, không còn mục LỆCH (mục 7.2).
4. README có GIF demo + số perf thực đo; Pages deploy sống.
5. Người dùng duyệt polish pass từng màn hình bằng mắt (mục 7.1).

## 2. Phạm vi

**Trong phạm vi** (đúng hàng M2 của roadmap v1):

- API observables 2D trong core + dải đồ thị thời gian thực + khung E trên web.
- Không gian động lượng |ψ̃(p)|²: harvest từ propagator + khung nhìn chuyển đổi trên web.
- Mô phỏng phép đo vị trí/động lượng: lấy mẫu theo phân bố xác suất, sập hàm sóng, hoạt ảnh.
- Landing = thư viện preset + thẻ lời dẫn vi/en (4 preset + ô tự do khám phá, mục 5.1).
- Hai chế độ Khám phá / Nâng cao; chú giải thuật ngữ dạng data file.
- Polish pass thị giác; xuất PNG (mọi chế độ) / JSON (Nâng cao); GIF README.
- Perf ở mức điều kiện 2 (mục 1): texSubImage2D, batch FFT, throttle observables.
- Mẻ fix nhà T0 từ triage review M1 (mục 4.6).
- Physics-audit pipeline (cam kết đứng, chạy cuối M2 — note `2026-09-29-physics-audit-pipeline.md`).

**Không thuộc M2 (hoãn sang M3+):** renderer 1D trên web; solver ImaginaryTime (trạng thái riêng); publish npm; mọi thứ trong non-goals v1 mục 10 (WebGPU, server, 3D…). Không viết lại engine; không hạ lõi vật lý xuống f32.

## 3. Quyết định chốt trong brainstorm

| # | Quyết định |
|---|---|
| D1 | Scope = đúng hàng M2 của v1; 1D-web, ImaginaryTime, npm → M3+ |
| D2 | 4 preset ra mắt: gói tự do, xuyên hầm, khe kép, dao động điều hòa (+ ô "Tự do khám phá" không phải preset vật lý) |
| D3 | Điều kiện nghiệm thu perf: 60fps@256² đo local trên máy người dùng; 512² = best-effort có nhãn |
| D4 | Tổ chức 3 pha: lõi đúng + perf → trải nghiệm web → polish + audit + ra mắt |
| D5 | Sập phép đo = Gauss "độ phân giải dụng cụ" σ_inst (mặc định ≈ 3 ô), không phải δ 1 ô |
| D6 | |ψ̃|² harvest từ trong bước Strang (không FFT riêng khi view bật) |
| D7 | Momentum view hiển thị dịch fftshift (k=0 ở giữa) |
| D8 | Công cụ đo có mặt ở cả hai chế độ (thấy sóng sập là khoảnh khắc sư phạm chính) |

## 4. Thiết kế lõi vật lý (Pha 1)

### 4.1 Observables 2D — mở rộng `core/src/observables.rs`

Song song nhóm 1D, **cùng convention**: tích Riemann nhân dA = dx·dy; moment động năng qua ratio-form trong k-space (miễn nhiễm quy ước chuẩn hóa FFT, như doc module 1D hiện có).

- `moments_2d(wf: &Wavefunction2D) -> Moments2D { x, y, σx, σy, px, py, σpx, σpy }` — một lần quét vị trí + một FFT 2D lấy hết mọi moment; worker gọi đúng một hàm mỗi lần tính.
- `kinetic_2d`, `potential_energy_2d` (nhận `&Potential2D`), `energy_2d`.
- `momentum_grid_2d(grid) -> (kx, ky)` theo convention fftfreq (khớp k-grid nội bộ của propagator).
- Golden test: Gaussian 2D tách biến so giải tích — ⟨x⟩ = x₀, σx = σₓ₀, σx·σpx = ½ (từng trục), ⟨E⟩ gói tự do; đối chiếu moment vào test coherent-harmonic 2D sẵn có của M1.

### 4.2 Module mới `measurement` — thuần, deterministic

RNG là PCG nội bộ khởi tạo từ `seed: u64` truyền vào; core không giữ trạng thái ngẫu nhiên → cùng seed cho cùng kết quả trên mọi build (cross-build test được).

- `sample_position(wf, seed) -> (usize, usize)` — inverse-CDF trên |ψ|².
- `collapse_position(wf, cell, σ_inst)` — nhân ψ với Gauss độ phân giải dụng cụ tâm tại điểm lấy mẫu, chuẩn hóa lại. σ_inst nhỏ dần → tiệm cận δ; mặc định ≈ 3 ô.
- `collapse_momentum(wf, bin, σ_k)` — đối xứng trong không gian k (FFT → nhân Gauss → FFT ngược → chuẩn hóa).
- Test: chuẩn = 1 sau mọi sập; histogram 10⁴ lần lấy mẫu khớp |ψ|² (so từng bin); σx co về ≈ σ_inst sau sập vị trí; phổ |ψ̃|² tập trung quanh k đã chọn sau sập động lượng.

### 4.3 Harvest |ψ̃|² từ propagator

Split-operator Strang có ψ nằm ở k-space ngay trước FFT ngược. Khi view động lượng bật, propagator ghi |φ|² vào buffer tại thời điểm đó (một phép nhân phức + abs mỗi ô) — không tốn FFT riêng. View tắt = không tốn gì. wasm cache buffer này; `SplitOperator2D` mở API lấy mật độ động lượng của bước gần nhất (thiết kế API cụ thể thuộc plan).

### 4.4 API wasm mới trên `Simulation2D`

1. `observables() -> JsValue` — struct số (các trường `Moments2D` + ⟨T⟩ ⟨V⟩ E).
2. `momentum_density() -> Float32Array` — từ harvest buffer.
3. `measure_position(seed)` — lấy mẫu + sập vị trí + trả điểm đo (cho hoạt ảnh).
4. `measure_momentum(seed)` — lấy mẫu + sập động lượng + trả (kx, ky).
5. `serialize_state()` / `deserialize_state()` — phục vụ xuất/nạp JSON (mục 5.7).

### 4.5 Perf — hướng tới cổng 60fps@256²

- `texSubImage2D` thay `texImage2D` full-frame cho upload density + V (không tái cấp phát texture mỗi frame).
- Batch FFT: gộp planner/scratch cho các biến đổi hàng + cột, giảm overhead mỗi bước.
- Observables tính cách quãng **mỗi 4 frame** khi Nâng cao bật; gửi kèm frame message.
- Đo: HUD trên máy người dùng + bench script in số ra hồ sơ. CI không cửa perf.
- Nếu vẫn thiếu sau các món trên: van theo thứ tự throttle → tái dùng buffer → **báo lại người dùng quyết định**, không tự hạ chuẩn.

### 4.6 Mẻ fix nhà T0 (từ triage review M1)

`repository` field + bản sao LICENSE cho wasm; test bẫy y-flip có hướng (không có test nào hiện thời bắt được y-flip tương lai); xử lý `webglcontextlost`/`restored`; aria-label reactive; dropPacket fatal guard; deploy job dùng rust-cache; job wasm-test dùng artifact wasm-pack dựng sẵn; đưa `tests/` vào tsconfig.

## 5. Thiết kế web (Pha 2)

### 5.1 Landing & preset

- Routing hash, không thêm dependency: `#/` = landing, `#/sim/<presetId>` = mô phỏng.
- Thư mục `web/src/presets/`: registry id → cấu hình (grid, thế, gói ban đầu, tốc độ); thẻ lời dẫn 3–5 câu vi/en nằm trong data i18n, hiện khi vào preset (thu gọn được, mở lại bằng nút ⓘ).
- Thumbnail PNG tĩnh chụp một lần từ engine thật bằng script Playwright; đổi cấu hình preset ⇒ phải chụp lại (có mục trong checklist polish).
- 4 preset: **khe kép** (cấu hình scene mặc định M1), **xuyên hầm** (rào kín không khe, dày ≥ 4 ô, V₀ ≈ 22–25 > E ≈ 18), **gói tự do** (V = 0), **điều hòa** (bát harmonic, gói lệch tâm → quỹ đạo coherent). Số cuối tinh chỉnh trong vòng làm preset, chốt bằng mắt người dùng.
- Ô thứ 5 **"Tự do khám phá"**: thế rỗng + sẵn công cụ vẽ/thả gói; không có thẻ lời dẫn vật lý (một vài câu hướng dẫn dùng công cụ).

### 5.2 Hai chế độ Khám phá / Nâng cao

Một mô phỏng, khác lớp trình bày (v1 2.1). Nút chuyển luôn hiển thị; ghi nhớ qua localStorage. Khám phá (mặc định): nhãn đời thường ("Xác suất tìm thấy hạt ở đây"), không pha/momentum/đồ thị/tham số lưới/JSON. Nâng cao mở khóa toàn bộ (v1 2.1). Không tồn tại chế độ "đồ chơi" giảm độ chính xác.

### 5.3 Chú giải thuật ngữ

Data file glossary trong i18n (~10 thuật ngữ ra mắt: |ψ|², ⟨x⟩, ⟨p⟩, σ, pha, chuẩn hàm sóng, không gian động lượng, E, k, xuyên hầm). Ở Nâng cao thuật ngữ gạch chân chấm, hover/click mở tooltip (CSS thuần, không dependency; keyboard/touch dùng focus). Nội dung viết **kèm từng preset** khi làm preset đó.

### 5.4 Dải đồ thị observables & khung E (Nâng cao)

`ui/ObservablesBar.svelte` dưới canvas: sparkline canvas-2D cho ⟨x⟩, ⟨y⟩, và σx·σpx ∥ σy·σpy (hai đường trên một chart) + số đọc cạnh mỗi đồ thị. Khung E riêng, thường trực trong Nâng cao. Dữ liệu: worker tính mỗi 4 frame, gửi kèm frame message; main thread giữ ring buffer ~600 điểm. Sau sập phép đo, E nhảy là đúng vật lý — có chú giải tại chỗ (mục 8).

### 5.5 Momentum view & pha HSV (Nâng cao)

- Nút "Vị trí | Động lượng": worker gửi |ψ̃|² harvest thay ρ (cùng kích thước grid, tái dụng pipeline texture). **Hiển thị dịch fftshift** (k=0 ở giữa) — dịch trong worker trước khi gửi.
- Pha HSV: shader đã nhận kênh φ (RG32F) — thêm uniform `u_colorMode`; hue = pha, độ sáng = ρ tonemap, dùng lại auto-exposure hiện có.

### 5.6 Đo đạc trên web

- Công cụ "Đo" trên toolbar, **có ở cả hai chế độ** (D8); nhãn Khám phá dùng ngôn ngữ đời thường.
- Đo vị trí: click canvas → lấy mẫu (seed từ `Math.random`) → sập → **crossfade ~250 ms** giữa mật độ trước/sau (renderer giữ texture frame cũ, uniform blend; hai frame dùng **chung một exposure** để không nhấp nháy) + vòng sáng đánh dấu điểm đo.
- Đo động lượng (chỉ Nâng cao): nút trong momentum view, sập k-space, crossfade trên chính view đó.
- Lặp lại tùy ý; Reset quay về trạng thái đầu của preset (đường reset hiện có).

### 5.7 Xuất PNG / JSON

- PNG: chụp canvas chính, cả hai chế độ (render-then-capture trong cùng frame).
- JSON (Nâng cao): `{ version, params, V (nén RLE), ψ (Float32 base64), t }`; tải xuống/mở lại qua serialize/deserialize; lệch version → lỗi rõ ràng. Kích thước ~0,5–1 MB ở 256² — chấp nhận; cảnh báo nếu 512².

## 6. Kiểm thử & nghiệm thu

### 6.1 Core & cross-build

- Golden 2D observables so giải tích (4.1); thống kê & bất biến sập (4.2); harvest |φ|² khớp FFT riêng làm chuẩn đối chứng; năng lượng vẫn bảo toàn khi không đo (bảo vệ không hỏng tính chất M1).
- Test wasm cho 5 API mới: cùng seed → cùng kết quả giữa node test và core test.

### 6.2 Web

- Vitest: preset registry, glossary, mode store, roundtrip serialize (mock wasm).
- Playwright (mở rộng 5 smoke hiện có): landing hiện đủ ô → bấm từng preset chạy không crash; chuyển chế độ; đo đạc giữ chuẩn; bật momentum view; PNG có blob; JSON lưu–mở lại; smoke cả vi lẫn en.

### 6.3 Perf

Nghiệm thu = HUD ≥ 60fps @256² speed 1 trên máy người dùng + bench script in số lưu hồ sơ. CI giữ nguyên các job smoke (rust/wasm/web + Pages deploy).

## 7. Polish pass, physics-audit & ra mắt (Pha 3)

### 7.1 Polish pass từng màn hình (v1 2.4)

Mỗi màn = một task loop: sửa → người dùng duyệt bằng mắt → lặp tới OK (quy trình đã chứng minh qua 3 vòng fix render sau M1). Danh sách màn: landing; mô phỏng ở cả hai chế độ; từng preset một lượt (đọc đúng thẻ lời dẫn của nó); momentum view; đo đạc + hoạt ảnh; xuất file. Checklist mỗi màn: tương phản, nhãn, bố cục, "tương tác chính nhìn ra trong 10 giây đầu", không thuật ngữ chưa chú giải ở Khám phá, **chú giải V₀ trên canvas** (khắc phục việc nhầm tường cam là phần tử UI). Mỗi vòng polish chốt checklist trước, không lan man.

### 7.2 Physics-audit pipeline (chạy trước bài đăng công khai)

Theo note `2026-09-29-physics-audit-pipeline.md`: auditor chuyên trách tái suy luận độc lập từng công thức từ nguyên lý; soát nhất quán đơn vị & quy ước (docs/units.md, fftfreq, biên nửa mở, nhân dx); golden test đo đúng thứ nó tuyên bố; các chế độ "sai âm thầm" (wrap biên FFT, aliasing, dt lớn); phạm vi hiệu lực từng xấp xỉ; khớp interface vật lý giữa module. Báo cáo `docs/superpowers/audits/<ngày>-wave-dynamics.md`, phán quyết từng tuyên bố KHỚP / LỆCH / KHÔNG CHỨNG MINH ĐƯỢC. Hết LỆCH mới coi module đạt.

### 7.3 Vật liệu ra mắt

- GIF demo README: quay bằng script Playwright (tái lập được) hoặc ghi màn của người dùng nếu đẹp hơn; đặt cạnh screenshot landing.
- README cập nhật: số perf **thực đo** (không hứa 60fps@512²), phần preset, link Pages.
- Việc người dùng: đặt GitHub Pages source = "GitHub Actions" (đang treo từ M1); viết và đăng Show HN / Reddit.

## 8. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| 60fps@256² chưa đạt sau texSubImage2D + batch FFT | Van thứ tự: throttle observables → tái dùng buffer → báo người dùng quyết định; không tự hạ chuẩn |
| Sập đo làm E nhảy (đúng vật lý, ΔE ~ 1/σ_inst²) — người xem tưởng lỗi | Nhãn + chú giải ngay tại khung E |
| Crossfade trước/sau sập nhấp nháy do hai trạng thái khác peak density | Hai frame dùng chung một exposure |
| Đổi cấu hình preset mà quên chụp lại thumbnail | Mục "re-shoot thumbnail" trong checklist polish |
| Polish lan man / scope creep | Non-goals v1 mục 10 là hợp đồng; checklist chốt trước mỗi vòng |
| JSON state lớn ở 512² | Cảnh báo kích thước trong UI khi mở/luu ở lưới lớn |

## 9. Thứ tự thực thi

- **Pha 1 — lõi đúng + perf:** mẻ fix T0 → observables 2D (TDD) → module measurement (TDD) → harvest |ψ̃|² → 5 API wasm → texSubImage2D + batch FFT + throttle → cổng 60fps@256² đo trên máy người dùng.
- **Pha 2 — trải nghiệm:** landing + preset registry + 4 preset + ô tự do + script thumbnail → hai chế độ → glossary → ObservablesBar + khung E → momentum view + pha HSV → công cụ đo + hoạt ảnh → PNG/JSON.
- **Pha 3 — polish & ra mắt:** polish từng màn (loop duyệt mắt) → physics-audit hồi tố → GIF/README → đóng gói, deploy, xuất bản.

Chi tiết nhiệm vụ (task list, thứ tự commit, reviewer) thuộc implementation plan — viết bằng skill writing-plans sau khi spec này được duyệt.
