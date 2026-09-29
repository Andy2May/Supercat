# Psiforge — Design Spec

- **Ngày:** 2026-09-29
- **Trạng thái:** Thiết kế đã duyệt trong hội thoại; chờ duyệt bản viết
- **Tên tạm:** *Psiforge* ("rèn hàm sóng ψ") — có thể đổi trước khi ra mắt công khai

---

## 1. Tóm tắt & mục tiêu

**Psiforge** là nền tảng mô phỏng cơ học lượng tử open-source kết hợp hai vai trò trong một dự án:

1. **Sandbox giáo dục tương tác** chạy trong browser — mở link là chơi được ngay, không cài đặt, không tài khoản.
2. **Thư viện tính toán nghiên cứu** qua Python API — cùng một lõi vật lý với bản web.

Phiên bản đầu tiên (v1) đi sâu vào **một mảng vật lý: động lực học sóng** — phương trình Schrödinger phụ thuộc thời gian (TDSE) trên lưới 1D/2D. Các mảng khác (spin & entanglement, hệ lượng tử mở, mạch qubit) là các *topic module* mở rộng về sau, không thuộc v1.

**Thước đo thành công (6–12 tháng):**
- Hoàn thiện và đúng vật lý: test khớp nghiệm giải tích, không có kết quả rác.
- Gây tiếng vang: demo đủ ấn tượng để đăng Show HN / Reddit và được dùng thật.
- Chỉ số nghiệm thu trải nghiệm: **người lạ mở link → tương tác được trong 10 giây**; người biết QM → thấy số liệu khớp giải tích trong bộ test.

**Nguyên tắc xuyên suốt:** đúng vật lý trước, đẹp ngay sau — không bao giờ hi sinh tính đúng đắn cho hiệu ứng hình ảnh.

## 2. Đối tượng & phân tầng trải nghiệm

Dự án phục vụ đồng thời người mới lần đầu nghe về QM và người đã am hiểu. Cùng một engine mô phỏng, hai lớp trải nghiệm:

### 2.1 Hai chế độ hiển thị

- **Khám phá** (mặc định): giản dị, không thuật ngữ — nhãn "Xác suất tìm thấy hạt ở đây" thay vì "|ψ|²", không colormap pha, ít nút bấm.
- **Nâng cao** (một nút chuyển): mở khóa tất cả — pha màu HSV, không gian động lượng, đại lượng quan sát ⟨x⟩ ⟨p⟩ σx σp, tham số lưới & bước thời gian, xuất dữ liệu.
- Không tồn tại phiên bản "đồ chơi" giảm độ chính xác: hai chế độ chỉ khác lớp trình bày, chạy đúng cùng một mô phỏng.

### 2.2 Preset có lời dẫn

Mỗi preset mở kèm thẻ 3–5 câu: "Bạn đang nhìn thấy gì — thử làm gì — để ý điều gì". Viết một lần cho mỗi preset, không phải giáo trình cấu trúc. Ví dụ preset xuyên hầm: *"Vật lý cổ điển nói hạt không đủ năng lượng sẽ bật lại. Xem điều gì thực sự xảy ra."*

### 2.3 Chú giải thuật ngữ

Hover/click thuật ngữ bất kỳ (⟨x⟩, pha, chuẩn hàm sóng…) hiện giải thích ngắn bằng ngôn ngữ đời thường. Nội dung dạng data file — cộng đồng có thể dịch và đóng góp.

### 2.4 Yêu cầu UI/UX hạng nhất (chỉ thị của người duyệt thiết kế)

Giao diện phải **đủ cuốn hút, trực quan và dễ hiểu** — đây là yêu cầu nghiệm thu, không phải mong muốn chung. Cụ thể:

- Chất lượng thiết kế thị giác (bố cục, màu, chuyển động) được đầu tư như một tính năng, ngang hàng với tính năng vật lý.
- Không có thuật ngữ chưa giải thích nào xuất hiện ở chế độ Khám phá.
- Mọi tương tác chính (thả gói sóng, vẽ thế, đo) đều khả trực quan trong 10 giây đầu, không cần đọc tài liệu.
- Trước khi ra mắt M2, có một vòng rà soát thiết kế thị giác chuyên sâu (polish pass) trên từng màn hình chính.

## 3. Kiến trúc tổng thể

Monorepo bốn thành phần — "một lõi, ba mặt tiền":

```
psiforge/
├── core/      crate Rust — toàn bộ vật lý & số học, không phụ thuộc I/O
├── wasm/      crate Rust — lớp mỏng bind core ra JavaScript (wasm-bindgen)
├── python/    crate Rust — bind core ra Python (pyo3), đóng gói wheel lên PyPI
└── web/       TypeScript + Vite + WebGL2 — chỉ lo vẽ và tương tác, không tính toán
```

### 3.1 Luồng dữ liệu (web)

JS gửi tham số → wasm chạy nhiều substep vật lý với dt cố định mỗi frame → trả `Float32Array` (mật độ |ψ|² + pha) → upload thành texture WebGL → vẽ. Tick vật lý tách khỏi tick render: số substep tự điều chỉnh theo thời gian thực để mô phỏng không phụ thuộc tốc độ máy.

### 3.2 Xử lý lỗi

- Core Rust thuần `Result`, không panic trên dữ liệu vật lý xấu.
- Lớp bind đổi `Result` thành exception (JS) / `RuntimeError` (Python), kèm thông điệp hữu ích.
- **Hàng rào chuẩn (norm guard):** mỗi bước kiểm tra chuẩn hàm sóng; nếu trôi khỏi 1 quá 1e-10 thì dừng mô phỏng và báo lỗi rõ ràng — tuyệt đối không hiển thị kết quả rác.

## 4. Lõi vật lý (`core/`)

### 4.1 Biểu diễn trạng thái

- `Wavefunction`: trường số phức **f64** trên lưới đều (1D vector / 2D row-major), kèm siêu dữ liệu: dx, dt, khối lượng m, ħ.
- Chỉ hạ xuống f32 ở bước gửi dữ liệu cho renderer.
- Đơn vị: hệ đơn vị không chiều — mặc định **ħ = 1, m = 1** (cấu hình được qua siêu dữ liệu `Wavefunction`); bảng quy đổi tài liệu hóa trong `docs/units.md`.

### 4.2 Bộ truyền thời gian — trait `Propagator`

v1 cài đặt hai bộ:

1. **`SplitOperator`** (bộ truyền chính): chia Strang — nửa bước thế V trong không gian vị trí → trọn bước động năng T trong không gian động lượng bằng FFT → nửa bước V. Bảo toàn chuẩn, O(N log N), phương pháp chuẩn mực cho TDSE trên lưới. FFT dùng thư viện `rustfft`.
2. **`ImaginaryTime`** (solver trạng thái riêng): truyền theo thời gian ảo để hội tụ về trạng thái nền; các trạng thái kích thích cao hơn tìm bằng trực giao hóa Gram-Schmidt với các trạng thái đã tìm.

### 4.3 Thế (potential)

- Dạng giải tích: dao động điều hòa, giếng hữu hạn, rào chữ nhật, chuỗi giếng (mô hình tinh thể) — là các hàm V(x) hoặc V(x,y).
- `GridPotential`: mảng giá trị tùy ý trên lưới — là thứ người dùng vẽ bằng chuột trên web. Có thể soạn trộn: nền giải tích + nét vẽ tay cộng thêm.

### 4.4 Đại lượng quan sát & đo đạc

- Observables: ⟨x⟩, ⟨p⟩, ⟨x²⟩, ⟨p²⟩, σx, σp, tích bất định σx·σp; năng lượng ⟨T⟩, ⟨V⟩, E.
- Biến đổi Fourier sang không gian động lượng: |ψ̃(p)|².
- **Mô phỏng phép đo:** lấy mẫu vị trí theo phân bố |ψ|² (hoặc động lượng theo |ψ̃(p)|²) → sập hàm sóng về kết quả đo → chuẩn hóa lại. Đi kèm hoạt ảnh để người học *thấy* được sự sập.

## 5. Kiến trúc topic module

Trait `Topic` — mỗi topic tự khai báo:

- `id`, tên, mô tả;
- cấu hình mô phỏng mặc định (lưới, thế, trạng thái ban đầu, bộ truyền);
- danh sách công cụ tương tác mà web cần bật cho topic đó;
- danh sách preset ("thí nghiệm gợi ý") kèm thẻ lời dẫn.

v1 đóng gói đúng một topic `wave-dynamics`. Các topic tương lai (spin & entanglement, hệ mở Lindblad, mạch qubit) implement cùng trait — việc thêm topic không đụng code lõi. Đây là cam kết mở rộng được mã hóa trong kiến trúc, theo yêu cầu của người duyệt thiết kế.

## 6. Ứng dụng web

### 6.1 Bố cục

- **Landing = thư viện preset** — các ô thumbnail (gói sóng tự do, xuyên hầm, khe kép 2D, dao động điều hòa, khám phá trạng thái riêng). Bấm một ô là vào mô phỏng ngay.
- **Màn hình mô phỏng:** canvas chính ở giữa; thanh công cụ bên (công cụ vẽ thế, thả gói sóng, đo); dải dưới là đồ thị trực tiếp ⟨x⟩, ⟨p⟩, σx·σp theo thời gian + nút chuyển không gian động lượng; khung năng lượng E hiển thị thường trực (chỉ ở chế độ Nâng cao).
- Điều khiển phát: play/pause/step/reset, tốc độ.

### 6.2 Canvas & render

- WebGL2 heatmap: độ sáng = mật độ xác suất; **hue = pha** (chế độ Nâng cao; chế độ Khám phá chỉ có mật độ).
- Thế V vẽ chồng: đường/địa hình phía dưới (1D) hoặc lớp nền mờ (2D).

### 6.3 Tương tác trực tiếp trên canvas

- Vẽ thế bằng chuột: bút tự do, rào, giếng, tẩy.
- Thả gói sóng: click-kéo — độ dài kéo = độ rộng, hướng kéo = động lượng ban đầu.
- Đo vị trí: quét vùng → hàm sóng sập với hoạt ảnh tại điểm lấy mẫu.

### 6.4 Xuất & chia sẻ

- PNG chụp canvas; JSON tải/lưu trạng thái mô phỏng để mở lại hoặc chia sẻ.

### 6.5 Kỹ thuật web

- Không server; hosting tĩnh GitHub Pages; CI tự deploy khi push vào main.
- Nhãn UI tách resource file, có VN/EN từ đầu.
- Mục tiêu hiệu năng: 60fps ở lưới 1024 điểm (1D) / 512×512 (2D) trên laptop phổ thông (4 nhân, ~2020 trở lên); benchmark trong repo chạy cục bộ để kiểm chứng, không cần máy CI đặc biệt.

## 7. Python API (`python/`)

```python
import psiforge as pf

sim = pf.Simulation(
    grid=pf.Grid1D(n=2048, extent=40.0),
    potential=pf.potentials.barrier(width=2.0, height=1.5),
    state=pf.states.gaussian(x0=-10.0, k0=5.0, sigma=1.5),
)
for step in sim.run(dt=0.001, steps=5000):
    print(step.t, step.energy(), step.expectation_x(), step.uncertainty())
```

- Trao đổi dữ liệu với NumPy trực tiếp, zero-copy khi có thể.
- Đóng gói bằng maturin: wheel đa nền tảng lên PyPI; bản WASM phát hành trên npm.
- Thông điệp chính: kết quả web và Python nằm trong cùng một lõi, cùng một bộ test — công cụ giáo dục có uy tín nghiên cứu.

## 8. Kiểm thử, tính đúng đắn & CI

Tính đúng đắn là tính năng bán hàng của dự án.

### 8.1 Test nghiệm vàng so với nghiệm giải tích

| Hiện tượng | Chuẩn so sánh |
|---|---|
| Gói Gauss tự do giãn nở | công thức giãn σ(t) giải tích |
| Năng lượng riêng dao động điều hòa | Eₙ = (n+½)ħω (từ ImaginaryTime) |
| Trạng thái coherent | dao động theo quỹ đạo cổ điển |
| Truyền qua rào chữ nhật | hệ số truyền giải tích |
| Bảo toàn chuẩn | trôi ≤ 1e-12 sau 5×10³ bước (floor f64 ≈ 0.5 ulp/bước: sau 10⁴ bước ≈ 1.2e-12, không thể thấp hơn trong f64) |
| Bảo toàn năng lượng (V tĩnh) | ΔE/⟨E⟩ ≤ 1e-10 sau 10⁴ bước |

### 8.2 Chạy cross-build

Cùng bộ test chạy trên ba bản build: core thuần (cargo test), WASM (wasm-bindgen-test), Python (pytest gọi bindings) — chứng minh web và nghiên cứu dùng đúng một vật lý.

### 8.3 CI (GitHub Actions)

- Rust: fmt + clippy + test trên mỗi PR.
- Web: build + smoke test Playwright (mở preset, chạy vài giây, không crash) + deploy GitHub Pages khi merge vào main.
- Python: build wheel khi release.

## 9. Roadmap

| Giai đoạn | Tuần | Nội dung | Kết quả |
|---|---|---|---|
| M0 | 1–3 | Khung repo, CI, `SplitOperator` 1D + test giải tích | Nền móng đúng đắn |
| M1 | 4–7 | 2D, renderer WebGL, vẽ thế bằng chuột | Mốc "wow" nội bộ |
| M2 | 8–11 | Observables, không gian động lượng, đo đạc, preset + lời dẫn, hai chế độ, chú giải, **polish pass thị giác** | **Ra mắt công khai** |
| M3 | 12–14 | Python bindings, PyPI | Mặt tiền nghiên cứu |
| M4 | trở đi | Topic #2: spin & entanglement | Chứng minh kiến trúc mở rộng |

Ra mắt M2 kèm GIF demo trong README + bài đăng Show HN / Reddit (r/physics, r/QuantumMechanics). Giấy phép MIT.

## 10. Ngoài phạm vi v1 (non-goals)

- Giáo trình cấu trúc, bài tập tự chấm (có thể thêm về sau dưới dạng module).
- Topic spin & entanglement, hệ lượng tử mở, mạch qubit — các topic M4+.
- 3D, QM tương đối tính (Dirac), trường lượng tử.
- Bất kỳ thành phần server, tài khoản người dùng, hay cơ sở dữ liệu nào.
- Tối ưu GPU/WebGPU cho mô phỏng (chỉ dùng GPU để render).

## 11. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Chưa quen Rust | M0 giới hạn ở 1D thuần số học, đường cong học trải ra trước khi đụng tầng web |
| Hiệu năng 2D chưa đạt 60fps | Lưới 2D mặc định 512² có thể hạ cấp tự động; split-operator vốn nhanh; measurable ở M1 nên phát hiện sớm |
| Scope creep (thêm tính năng trước M2) | Non-goals ở mục 10 là hợp đồng; mọi đề nghị mới phải chờ sau khi ra mắt |
| Chuẩn bị nội dung lời dẫn/chú giải kéo dài | Viết kèm từng preset khi làm preset đó, không dồn về cuối |
