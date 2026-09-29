# Psiforge M0 — Nền móng core Rust (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây nền móng đúng đắn cho Psiforge: cargo workspace, crate `core` chứa biểu diễn hàm sóng 1D, thế, bộ truyền SplitOperator, observables tối thiểu, và bộ test nghiệm vàng so với nghiệm giải tích — kèm CI chạy fmt/clippy/test.

**Architecture:** Monorepo dạng cargo workspace, milestone này chỉ chứa crate `psiforge-core` (thuần số học, không I/O). Toàn bộ API trả `Result<_, CoreError>`, không panic trên dữ liệu vật lý. Bộ truyền SplitOperator dùng Strang splitting (nửa bước V → trọn bước T bằng FFT → nửa bước V) với rustfft.

**Tech Stack:** Rust edition 2024; dependencies đúng 3 crate: `rustfft` 6, `num-complex` 0.4, `thiserror` 2. CI: GitHub Actions (ubuntu-latest).

**Spec:** `docs/superpowers/specs/2026-09-29-psiforge-design.md` — plan này hiện thực các mục 3.2, 4.1, 4.2 (SplitOperator), 4.3, 4.4 (tập con), 8.1 (4/6 dòng), 8.3 (phần Rust), roadmap M0.

## Quyết định về phạm vi (lưu ý trước khi đọc task)

1. **Workspace M0 chỉ chứa `core/`.** Các crate `wasm/`, `python/` và app `web/` sẽ được thêm bằng plan riêng ở M1/M3. Lý do: stub crate pyo3/wasm-bindgen kéo theo toolchain phức tạp (wasm target, Python linking) mà M0 không cần, và dễ làm CI đỏ ngay ngày đầu.
2. **`dt` nằm trên propagator, không nằm trong metadata `Wavefunction`** (spec 4.1 liệt kê dt trong siêu metadata). Lý do: Strang splitting vốn precompute các thừa số pha cho một dt cố định; hàm sóng là *trạng thái*, không phải *lịch trình*. Đây là lệch nhỏ so với spec — cần người duyệt spec chấp nhận.
3. **Đóng gói thế dạng mảng giá trị trên lưới** (`Potential` = `Vec<f64>` + các hàm dựng giải tích), không dùng trait/enum đóng thế. Lý do: propagator chỉ cần V lấy mẫu trên lưới; thế vẽ tay bằng chuột (M1) chính là mảng; việc soạn trộn "giải tích + vẽ tay" chỉ là cộng mảng.
4. **Golden test hoãn sang plan M2:** dòng "Năng lượng riêng dao động điều hòa Eₙ=(n+½)ħω từ ImaginaryTime" (spec 8.1) — propagator `ImaginaryTime` không thuộc M0. Còn lại 4 nhóm test giải tích đều có trong Task 8.

## Global Constraints

- Đơn vị không chiều, mặc định **ħ = 1, m = 1**, cấu hình được qua tham số; bảng quy đổi ghi trong `docs/units.md` (spec 4.1).
- Tính toán **f64** xuyên suốt; f32 chỉ xuất hiện ở bước render (không có ở M0) (spec 4.1).
- Core thuần `Result`, **không panic trên dữ liệu vật lý xấu**; mọi validation trả `Err(CoreError)` (spec 3.2).
- **Norm guard:** sau mỗi bước, |‖ψ‖−1| > 1e-10 → `Err(CoreError::NormDrift)` (spec 3.2).
- Dung sai nghiệm thu của spec 8.1: chuẩn trôi ≤ 1e-12 sau 10⁴ bước; ΔE/⟨E⟩ ≤ 1e-10 sau 10⁴ bước.
- Dependencies M0 giới hạn đúng: `rustfft = "6"`, `num-complex = "0.4"`, `thiserror = "2"`. Không thêm gì khác.
- Rust edition 2024, workspace `resolver = "3"`.
- Commit theo conventional commits (khớp lịch sử repo: `feat:`, `test:`, `ci:`, `docs:`), commit nhỏ sau mỗi task.
- Giấy phép **MIT** (spec 9). Code, định danh, comment tiếng Anh; README tiếng Anh (đối tượng open-source), ghi chú i18n VN/EN chỉ là yêu cầu của web (M1+).
- CI: mỗi PR và push vào main chạy `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --all` (spec 8.3, phần Rust).

## Review Focus

Năm lớp đầu vào/chế độ hỏng mà spec ngụ ý nhưng không có task test trực tiếp, kèm test ghim vào task sở hữu:

1. **Giá trị không hữu hạn (NaN/inf) trong ψ, V, m, ħ** → phải báo lỗi validation, không để lan truyền âm thầm. Test: Task 3 (`NonFinite`, `InvalidMassOrHbar`) và Task 6 (`step` với V chứa NaN → `Err(NonFinite)`).
2. **Lưới suy biến** (n < 2, xmax ≤ xmin, khoảng cách 0) → lỗi trước khi có bất kỳ phép chia nào. Test: Task 2 (`new` với các bộ số suy biến).
3. **Độ dài không khớp** (V hoặc ψ khác số điểm lưới) → `DimensionMismatch`, không panic bởi index. Test: Task 6 (step với V sai độ dài).
4. **dt quá lớn vẫn bảo toàn chuẩn nhưng SAI âm thầm** (split-operator unitary vô điều kiện — sai số nằm ở độ chính xác, không ở ổn định) → test co giãn bậc: giảm một nửa dt thì sai số giảm ~4 lần (O(dt²)) — phát hiện ngay nếu implement sai thứ tự Strang. Test: Task 8 (dt-scaling).
5. **Hàm sóng chạm biên lưới sẽ wrap quanh theo điều kiện tuần hoàn của FFT** — vật lý "rác" không báo động → hành vi này phải được pin bằng test tài liệu hóa để tầng web (M1) biết mà phát hiện. Test: Task 8 (boundary periodic).

---

### Task 1: Cargo workspace + crate skeleton + CI + LICENSE

**Files:**
- Create: `Cargo.toml` (workspace root), `core/Cargo.toml`, `core/src/lib.rs`
- Create: `.github/workflows/ci.yml`, `.gitignore`, `LICENSE`, `README.md`

**Interfaces:**
- Consumes: không có (task đầu).
- Produces: workspace với member `core` = crate `psiforge-core` (lib name `psiforge_core`); CI pipeline xanh cho commit sau đó.

- [ ] **Step 1: Tạo workspace và crate**

`Cargo.toml` (root):

```toml
[workspace]
resolver = "3"
members = ["core"]
```

`core/Cargo.toml`:

```toml
[package]
name = "psiforge-core"
version = "0.1.0"
edition = "2024"
license = "MIT"
description = "Quantum wave-dynamics core for Psiforge (TDSE on uniform grids)"

[dependencies]
rustfft = "6"
num-complex = "0.4"
thiserror = "2"
```

`core/src/lib.rs`: doc comment crate (`//! Psiforge physics core …`) khai báo mô-đun `pub mod error;` sẽ thêm ở Task 2 — trước mắt chỉ doc comment, build được.

`.gitignore`: `/target`, `Cargo.lock` được commit (workspace có binary? chưa có — nhưng keep lock cho CI ổn định: commit `Cargo.lock`).

- [ ] **Step 2: Thêm LICENSE (MIT, "Copyright (c) 2026 Psiforge contributors") và README.md**

README M0: một đoạn mô tả dự án (sandbox QM + Python API), cấu trúc repo dự kiến 4 thành phần (core/wasm/python/web, trích spec mục 3), hướng dẫn `cargo test -p psiforge-core`.

- [ ] **Step 3: Thêm CI**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo clippy --all-targets -- -D warnings
      - run: cargo test --all
```

- [ ] **Step 4: Verify cục bộ**

Run: `cargo build && cargo test --all && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings`
Expected: build thành công, 0 tests, fmt/clippy sạch.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml Cargo.lock core .gitignore LICENSE README.md .github
git commit -m "chore: cargo workspace with psiforge-core skeleton, CI, MIT license"
```

---

### Task 2: `Grid1D` + module lỗi `CoreError`

**Files:**
- Create: `core/src/grid.rs`, `core/src/error.rs`
- Modify: `core/src/lib.rs` (thêm `pub mod grid; pub mod error;`)
- Test: `core/src/grid.rs` (unit tests trong file, `#[cfg(test)]`)

**Interfaces:**
- Consumes: không có.
- Produces:

```rust
// error.rs
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid grid: n={n}, xmin={xmin}, xmax={xmax} (need n >= 2 and xmax > xmin, all finite)")]
    InvalidGrid { n: usize, xmin: f64, xmax: f64 },
    #[error("dimension mismatch: expected {expected} points, got {got}")]
    DimensionMismatch { expected: usize, got: usize },
    #[error("non-finite value in {what} at index {index}")]
    NonFinite { what: &'static str, index: usize },
    #[error("mass and hbar must be positive, got m={m}, hbar={hbar}")]
    InvalidMassOrHbar { m: f64, hbar: f64 },
    #[error("norm drifted from 1: {norm} at step {step}")]
    NormDrift { step: u64, norm: f64 },
}
pub type Result<T> = std::result::Result<T, CoreError>;
```

(Chi tiết message sửa được; tên variant và trường là hợp đồng cho task sau. `NormDrift` dùng từ Task 6 nhưng khai báo sẵn một lần ở đây.)

```rust
// grid.rs
pub struct Grid1D { n: usize, xmin: f64, xmax: f64 }
impl Grid1D {
    pub fn new(n: usize, xmin: f64, xmax: f64) -> Result<Self>;
    pub fn n(&self) -> usize;
    pub fn dx(&self) -> f64;          // (xmax - xmin) / n
    pub fn x(&self, i: usize) -> f64; // xmin + i * dx, i = 0..n-1
    pub fn xmin(&self) -> f64;
    pub fn xmax(&self) -> f64;
}
```

Quy ước lưới: n điểm cách đều, điểm đầu tại `xmin`, bước `dx = (xmax−xmin)/n` (điểm cuối ở `xmax − dx`; nửa mở bên phải — khớp điều kiện tuần hoàn của FFT).

- [ ] **Step 1: Write failing tests** — `x(0)==xmin`; `x(n−1)==xmax−dx`; `dx` đúng với n=2048, [−24,24]; `new` từ chối: n=0, n=1, xmax==xmin, xmax<xmin, xmin=NaN.

- [ ] **Step 2: Run** `cargo test -p psiforge-core` → FAIL (module chưa tồn tại).

- [ ] **Step 3: Implement** `Grid1D` + `CoreError` như trên. `new` validate trước khi dựng.

- [ ] **Step 4: Run** `cargo test -p psiforge-core` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(core): Grid1D uniform grid with validation and CoreError"`

---

### Task 3: `Wavefunction` + `docs/units.md`

**Files:**
- Create: `core/src/wavefunction.rs`, `docs/units.md`
- Modify: `core/src/lib.rs`
- Test: `core/src/wavefunction.rs` (`#[cfg(test)]`)

**Interfaces:**
- Consumes: `Grid1D`, `CoreError` (Task 2).
- Produces:

```rust
use num_complex::Complex64;

pub struct Wavefunction { grid: Grid1D, psi: Vec<Complex64>, m: f64, hbar: f64 }
impl Wavefunction {
    /// psi.len() phải bằng grid.n(); mọi phần phần thực/ảo phải hữu hạn; m, hbar > 0.
    pub fn new(grid: Grid1D, psi: Vec<Complex64>, m: f64, hbar: f64) -> Result<Self>;
    pub fn n(&self) -> usize;
    pub fn grid(&self) -> &Grid1D;
    pub fn psi(&self) -> &[Complex64];
    pub fn psi_mut(&mut self) -> &mut [Complex64];
    pub fn m(&self) -> f64;
    pub fn hbar(&self) -> f64;
    /// ‖ψ‖ = sqrt(Σ|ψᵢ|² · dx)  (tổng Riemann)
    pub fn norm(&self) -> f64;
    pub fn normalize(&mut self);
}
```

`docs/units.md`: hệ đơn vị không chiều (ħ=m=1 mặc định), cách truyền m/hbar khác qua constructor, một ví dụ quy đổi sang đơn vị thật (ví dụ electron-nm) — nửa trang, nội dung do implementer viết theo khung đó.

- [ ] **Step 1: Write failing tests:**
  - `new` với `psi.len() != n` → `Err(DimensionMismatch)`;
  - `new` với một phần tử NaN → `Err(NonFinite { .. })`;
  - `new` với m=0 hoặc hbar=−1 → `Err(InvalidMassOrHbar)`;
  - `normalize` trên vector hằng số 1.0 (grid n=8) → `norm()` bằng 1 trong 1e-15 (kỳ vọng tay: Σ|c|²dx = 8·|c|²·dx = |c|²·(xmax−xmin) = 1 ⇒ c = 1/√L).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** + viết `docs/units.md`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(core): Wavefunction with validation, norm, normalization; units doc`

---

### Task 4: Trạng thái ban đầu — `states::gaussian`

**Files:**
- Create: `core/src/states.rs`
- Modify: `core/src/lib.rs`
- Test: `core/src/states.rs`

**Interfaces:**
- Consumes: `Wavefunction`, `Grid1D` (Task 2–3).
- Produces:

```rust
/// Gói Gauss chuẩn hóa: ψ(x) ∝ exp(−(x−x0)²/(4σ²) + i·k0·x)
/// Trả về wavefunction ĐÃ normalize (sau khi lấy mẫu rời rạc). k0 là số sóng; p0 = ħ·k0.
pub fn gaussian(grid: &Grid1D, x0: f64, k0: f64, sigma: f64, m: f64, hbar: f64)
    -> Result<Wavefunction>;
```

Validate: sigma > 0 và hữu hạn; các đại lượng khác kế thừa validation của `Wavefunction::new`.

- [ ] **Step 1: Write failing tests** (grid n=2048, [−24,24], x0=−10, k0=√2, sigma=2, m=hbar=1):
  - `norm()` bằng 1 trong 1e-12 ngay sau khi dựng;
  - |ψᵢ|² đạt cực đại tại điểm lưới gần x0;
  - độ rộng rời rạc tính tay trong test `sqrt(Σ(xᵢ−x̄)²|ψᵢ|²dx)` (với x̄ tính cùng công thức) ≈ sigma trong 1e-6 (lưới đủ mịn so với σ=2 nên sai số lấy mẫu rất nhỏ).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (lấy mẫu công thức liên tục rồi gọi `normalize`).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(core): gaussian wavepacket initial state`

---

### Task 5: `Potential` + bộ dựng giải tích

**Files:**
- Create: `core/src/potential.rs`
- Modify: `core/src/lib.rs`
- Test: `core/src/potential.rs`

**Interfaces:**
- Consumes: `Grid1D` (Task 2).
- Produces:

```rust
/// Thế lấy mẫu trên lưới: values.len() == grid.n(). V = 0 nghĩa là hạt tự do.
pub struct Potential { values: Vec<f64> }
impl Potential {
    pub fn zeros(n: usize) -> Self;
    pub fn values(&self) -> &[f64];
    pub fn len(&self) -> usize;          // + is_empty()
    /// Cộng elementwise hai thế (soạn trộn "giải tích + vẽ tay"). Sai độ dài → Err.
    pub fn add(&self, other: &Potential) -> Result<Potential>;
}

/// V(xᵢ) = ½ m ω² xᵢ²
pub fn harmonic(grid: &Grid1D, m: f64, omega: f64) -> Potential;
/// V = −depth trong |x − center| < width/2, else 0
pub fn finite_well(grid: &Grid1D, center: f64, width: f64, depth: f64) -> Potential;
/// V = +height trong |x − center| < width/2, else 0
pub fn barrier(grid: &Grid1D, center: f64, width: f64, height: f64) -> Potential;
/// count giếng cách đều period (giếng đầu tâm tại xmin + period/2), mỗi giếng như finite_well
pub fn well_chain(grid: &Grid1D, count: usize, width: f64, depth: f64, period: f64) -> Potential;
```

Quy ước cửa sổ chữ nhật: nửa mở `|x − center| < width/2` (điểm đúng biên thuộc vùng ngoài) — một quy ước duy nhất, ghi doc comment.

- [ ] **Step 1: Write failing tests:**
  - `harmonic` với m=1, ω=1: giá trị tại vài index khớp `0.5·x(i)²` đúng 1e-12;
  - `barrier(center=0, width=1, height=1.5)` trên grid [−24,24]: V=1.5 tại x=−0.49, V=1.5 tại x=+0.49, V=0 tại x=±0.5 (theo quy ước nửa mở);
  - `well_chain(count=5)`: đếm đúng số đoạn liên tục có V=−depth, tâm giếng đầu tại `xmin + period/2`;
  - `add`: cộng đúng elementwise; độ dài lệch → `Err(DimensionMismatch)`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(core): sampled potential with analytic builders`

---

### Task 6: `Propagator` trait + `SplitOperator`

**Files:**
- Create: `core/src/propagator.rs`, `core/src/fft.rs`
- Modify: `core/src/lib.rs`
- Test: `core/src/propagator.rs`

**Interfaces:**
- Consumes: `Wavefunction`, `Potential`, `CoreError`, `Grid1D` (Task 2–5).
- Produces:

```rust
// propagator.rs
pub trait Propagator {
    /// Tiến trạng thái đúng một bước dt. Mutate ψ in-place.
    fn step(&mut self, wf: &mut Wavefunction, v: &Potential) -> Result<(), CoreError>;
}

pub struct SplitOperator { /* n, dx, dt, m, hbar, kinetic phase per k, scratch, step counter */ }
impl SplitOperator {
    /// dt > 0, m > 0, hbar > 0; precompute thừa số pha động năng theo k.
    pub fn new(grid: &Grid1D, dt: f64, m: f64, hbar: f64) -> Result<Self>;
}
impl Propagator for SplitOperator { /* */ }
```

```rust
// fft.rs — wrapper rustfft, toàn crate dùng chung
pub(crate) fn transform_forward(buf: &mut [Complex64], scratch: &mut [Complex64]);
pub(crate) fn transform_inverse(buf: &mut [Complex64], scratch: &mut [Complex64]);
/// Lưới động lượng kiểu fftfreq: k_j = 2π/(n·dx) · j', j' = j (j < n/2), j' = j − n (j ≥ n/2). n chẵn.
pub(crate) fn k_grid(n: usize, dx: f64) -> Vec<f64>;
```

Dùng `FftPlanner` dựng plan một lần trong `SplitOperator::new` (cấp cho forward và inverse), scratch cấp độ dài `fft.get_inplace_scratch_len()`.

Thuật toán `step` (viết đúng thứ tự này — sai thứ tự là sai vật lý):

1. Validate trước khi đụng dữ liệu: `wf.n() == n` và `v.len() == n` (không → `DimensionMismatch`); mọi `v.values()` hữu hạn (không → `NonFinite { what: "potential", index }`).
2. Nửa bước thế: `ψᵢ *= exp(−i·Vᵢ·dt/(2ħ))`.
3. Trọn bước động năng: `φ = FFT(ψ)`; `φⱼ *= exp(−i·ħ·kⱼ²·dt/(2m))`; `ψ = IFFT(φ)` (rustfft: forward không chuẩn hóa, inverse nhân N — round-trip là identity; các thừa số pha có mô-đun 1 → bảo toàn chuẩn chính xác đến sai số làm tròn).
4. Nửa bước thế lần hai (như bước 2).
5. **Norm guard:** `g = Σ|ψᵢ|²·dx`; nếu `|g − 1| > 1e-10` → `Err(NormDrift { step, norm: g })` (step là bộ đếm từ 0, tăng mỗi lần step thành công). Đầu vào chưa chuẩn hóa sẽ bị guard này bắt ngay bước đầu — đúng chủ ý "không chạy kết quả rác".

- [ ] **Step 1: Write failing tests:**
  - **Trạng thái riêng chỉ đổi pha:** dựng trạng thái nền giải tích của dao động điều hòa `ψ₀(x) = π^(−1/4)·exp(−x²/2)` (m=ω=ħ=1, grid n=2048 [−20,20], normalize), thế `harmonic(m=1, omega=1)`, dt=0.01, chạy 100 bước: mỗi điểm `||ψᵢ|² − |ψᵢ,0|²| < 1e-10` và `norm()` = 1.
  - **Norm guard bắt input xấu:** ψ chưa normalize (nhân 2) → step đầu trả `Err(NormDrift)` (hoặc norm sai rõ ràng).
  - **V chứa NaN** → `Err(NonFinite)`.
  - **V sai độ dài** → `Err(DimensionMismatch)`.
  - **dt = 0 hoặc m ≤ 0 trong `new`** → `Err`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `fft.rs` rồi `propagator.rs` theo thuật toán trên.

- [ ] **Step 4: Run** → PASS (test trạng thái riêng là kiểm chứng vật lý mạnh: sai thứ tự Strang hay sai lưới k đều làm |ψᵢ| đổi).

- [ ] **Step 5: Commit** — `feat(core): SplitOperator propagator (Strang splitting) with norm guard`

---

### Task 7: Observables

**Files:**
- Create: `core/src/observables.rs`
- Modify: `core/src/lib.rs`
- Test: `core/src/observables.rs`

**Interfaces:**
- Consumes: `Wavefunction`, `Potential`, FFT helpers (Task 3, 5, 6).
- Produces (free functions, lấy wf chuẩn hóa làm vào):

```rust
pub fn momentum_grid(grid: &Grid1D) -> Vec<f64>;            // fftfreq, pub cho M2 dùng (|ψ̃(p)|²)
pub fn expectation_x(wf: &Wavefunction) -> f64;             // Σ xᵢ|ψᵢ|²dx
pub fn sigma_x(wf: &Wavefunction) -> f64;                   // sqrt(⟨x²⟩−⟨x⟩²)
pub fn expectation_p(wf: &Wavefunction) -> f64;              // theo không gian động lượng, xem dưới
pub fn sigma_p(wf: &Wavefunction) -> f64;
pub fn kinetic(wf: &Wavefunction) -> f64;                   // ⟨T⟩ = ⟨p²⟩/2m
pub fn potential_energy(wf: &Wavefunction, v: &Potential) -> f64;  // Σ Vᵢ|ψᵢ|²dx
pub fn energy(wf: &Wavefunction, v: &Potential) -> f64;     // kinetic + potential_energy
pub fn norm_in_range(wf: &Wavefunction, a: f64, b: f64) -> f64;    // Σ_{a≤xᵢ<b} |ψᵢ|²dx
```

Công thức động lượng (miễn nhiễm chuẩn hóa của FFT, dùng dạng tỉ số — nhưng bất biến crate là ψ đã chuẩn hóa): `φ = FFT(ψ)`; `⟨p⟩ = ħ·Σkⱼ|φⱼ|² / Σ|φⱼ|²`; `⟨p²⟩ = ħ²·Σkⱼ²|φⱼ|² / Σ|φⱼ|²` (các đại lượng vô hướng thực).

- [ ] **Step 1: Write failing tests** (gaussian n=2048 [−24,24], x0=−10, k0=√2, sigma=2, ħ=m=1 — giá trị giải tích của gói Gauss tối thiểu bất định):
  - `expectation_x` ≈ −10 (1e-9);
  - `sigma_x` ≈ 2 (1e-6);
  - `expectation_p` ≈ √2 (1e-9);
  - `sigma_p` ≈ 1/(2·2) = 0.25 (1e-6);
  - `sigma_x·sigma_p` ≈ 0.5 = ħ/2 (1e-6);
  - `kinetic` ≈ (k0² + 1/(4σ²))/2 = (2 + 0.0625)/2 = 1.03125 (1e-6); `potential_energy` với V=0 bằng 0; `energy` = kinetic;
  - `norm_in_range(wf, −16, −4)` ≈ xác suất Gauss trong ±3σ = 0.9973 (1e-3).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat(core): observables — position/momentum/energy, norm in range`

---

### Task 8: Golden tests — nghiệm giải tích (integration tests)

**Files:**
- Create: `core/tests/golden.rs`
- Test: chính file đó.

**Interfaces:**
- Consumes: toàn bộ public API Task 2–7. Không produces API mới — đây là nghi thức nghiệm thu spec 8.1.

Chạy độc lập qua `cargo test -p psiforge-core --test golden`. Mỗi test là một hàm `#[test]` riêng, đặt tên `golden_<hiện tượng>`.

- [ ] **Step 1: Viết 5 test hỏng trước** (tham số đã chốt dưới — là một phần của plan, không đổi khi implement):

  1. `golden_free_gaussian_spreading` — grid n=2048, [−20,20], ψ₀: gaussian(x0=0, k0=0, sigma=1), V = zeros, dt=1e-3, 2000 bước (t=2). Giãn nở: σ(t) = σ₀·√(1 + (ħt/(2mσ₀²))²), với τ = 2mσ₀²/ħ = 2 ⇒ σ(2) = √2. Assert `|sigma_x − √2|/√2 < 1e-2` và `|expectation_x| < 1e-6`. (Sai số đo được phải ≪ 1e-2 — ngưỡng lỏng chỉ chặn biến động nền tảng; nếu đo được > 1e-3 thì tra nguyên nhân trước khi kết luận.)

  2. `golden_coherent_state_oscillation` — harmonic(m=1, omega=1), gaussian(x0=3, k0=0, sigma=1/√2) (σ đúng độ rộng nền → coherent state thật), dt=1e-3. Ehrenfest với HO là chính xác: ⟨x⟩(t) = 3·cos(t). Assert sau 1571 bước (t≈π/2): `|expectation_x| < 0.01`; sau 3142 bước (t≈π): `|expectation_x + 3| < 0.01`.

  3. `golden_barrier_transmission` — grid n=2048, [−24,24]; ψ₀: gaussian(x0=−10, k0=√2 (E₀=1), sigma=2 (σk=1/(2σ)=0.25)); V = barrier(center=0, width=1, height=1.5); dt=0.005, 2600 bước (t=13; gói truyền tâm ≈ +17.4, gói phản xạ ≈ −17.4 — cả hai cách biên ±24 hơn 3σ, phần wrap quanh < 0.1%). `T_sim = norm_in_range(wf, 0.5, 24)`. So với trung bình theo phân bố động lượng (tính đúng nhờ tính tuyến tính của Schrödinger):
     `T̄ = Σⱼ w(kⱼ)·T(E(kⱼ))`, w = Gauss(μ=k0, σ=σk) rời rạc hóa trên lưới k tự chọn trong [k0−4σk, k0+4σk], `E(k) = ħ²k²/2m`, hệ số truyền giải tích rào chữ nhật:
     - E < V₀: `T = 1/(1 + V₀²·sinh²(κ₁a)/(4E(V₀−E)))`, `κ₁ = √(2m(V₀−E))/ħ`
     - E > V₀: `T = 1/(1 + V₀²·sin²(κ₂a)/(4E(E−V₀)))`, `κ₂ = √(2m(E−V₀))/ħ`
     - |E − V₀| < 1e-12: dùng giới hạn `T = 1/(1 + m·V₀·a²/(2ħ²))`
     với a = 1, V₀ = 1.5. Assert `|T_sim − T̄| < 0.01`.

  4. `golden_norm_and_energy_conservation` — hai run trên coherent setup như test 2:
     - dt=1e-3, 10⁴ bước: `|norm − 1| ≤ 1e-12` (spec 8.1);
     - dt=1e-5, 10⁴ bước (t=0.1): `|E(t) − E(0)|/E(0) ≤ 1e-10` (spec 8.1). Ghi chú quy trình: nếu ngưỡng 1e-10 chỉ suýt fail, kiểm tra bậc hội tụ bằng cách giảm dt một nửa (sai số phải giảm ~4×), rồi giảm dt đến khi đạt và ghi giá trị cuối vào test — không nới dung sai.

  5. `golden_dt_scaling_order` — coherent setup test 2, chạy tới t=π với dt=1e-3 và dt=5e-4; sai số `err(dt) = |expectation_x − (−3)|`. Assert tỉ số `err(1e-3)/err(5e-4)` nằm trong (2.5, 5.5) — ghim bậc O(dt²) của Strang (implement sai thứ tự splitting sẽ ra O(dt) và fail).

  6. `golden_boundary_is_periodic` (test tài liệu hóa hành vi, thuộc Review Focus #5) — gaussian(x0=0, k0=8, sigma=1) tự do trên [−20,20], dt=1e-3, 3000 bước (t=3, tâm đã đi qua xmax và wrap về ≈ −16): assert `norm_in_range(wf, −20, −15) > 1e-3` — gói đã wrap sang biên trái. Comment trong test: "FFT tuần hoàn — tầng web phải phát hiện và cảnh báo; xem spec 3.2".

- [ ] **Step 2: Chạy và đối chiếu số đo với giải tích**

Task 2–7 đã dựng đủ API nên golden tests có thể PASS ngay — vì vậy vòng TDD "xem test đỏ" thay bằng kiểm chứng ngược: mỗi test phải in giá trị đo được (dùng `println!` + `cargo test --test golden -- --nocapture`) và đối chiếu tay với bảng kỳ vọng ở Step 3 trước khi chấp nhận PASS. PASS mà không nhìn số đồng nghĩa chưa kiểm chứng gì. Nếu assert fail: tra nguyên nhân vật lý/tham số trước, chỉ điều chỉnh tham số khi đã hiểu sai số đến từ đâu.

- [ ] **Step 3: Bảng kỳ vọng đối chiếu** — σ(2) = 1.41421…; ⟨x⟩(π) = −3.0000 (nếu trội quá 1e-3 thì tra dt/lưới); T(E₀=1) = 0.39142… (T̄ tính trong test sẽ lệch T(E₀) một chút do độ rộng gói — đó là điều nó đo); E(0) của coherent = ⟨T⟩+⟨V⟩ = 0.25 + 4.75 = 5.0; err(dt) giảm ~4× khi dt giảm một nửa.

- [ ] **Step 4: Verify toàn cục** — `cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test --all` → PASS toàn bộ, runtime tổng < 30s.

- [ ] **Step 5: Commit** — `test(core): golden tests vs analytic solutions (spreading, coherent, transmission, conservation, dt-order, periodic BC)`

---

### Task 9: Hoàn thiện README + crate docs + rà soát CI

**Files:**
- Modify: `README.md`, `core/src/lib.rs` (doc comment tổng quan + ví dụ dùng API dạng ```rust,ignore)

**Interfaces:**
- Consumes: API Task 2–7.
- Produces: README mô tả cách dựng/test, ví dụ code trỏ đúng API thật.

- [ ] **Step 1:** Viết lại phần README "Quickstart": đoạn code ví dụ dựng grid → gaussian → SplitOperator → 100 bước → in `sigma_x` (khớp tên hàm thật đã implement — rà lại từng tên).
- [ ] **Step 2:** `cargo test --doc` nếu có doctest (để ```rust,ignore hoặc viết doctest chạy được).
- [ ] **Step 3: Verify** — fmt/clippy/test toàn bộ xanh; push branch và xem CI chạy xanh trên GitHub (nếu có quyền push; không thì ghi chú để CI xác nhận khi merge).
- [ ] **Step 4: Commit** — `docs: README quickstart and crate overview from real API`

---

## Tự kiểm tra plan (self-review đã chạy)

- **Spec coverage (M0):** mục 3.2 (Result + norm guard) → Task 2/3/6; 4.1 (Wavefunction, đơn vị, units.md) → Task 3; 4.2 SplitOperator → Task 6; 4.3 thế → Task 5; 4.4 tập con observables → Task 7; 8.1: 4/6 dòng → Task 8 (dòng ImaginaryTime hoãn M2, đã ghi ở "Quyết định về phạm vi"); 8.3 Rust CI → Task 1; roadmap M0 "khung repo, CI, SplitOperator 1D + test giải tích" → đủ.
- **Type consistency:** tên `Grid1D/Wavefunction/Potential/SplitOperator/CoreError` và chữ ký qua các task đã rà một lượt; `norm_in_range(a, b)` dùng cùng thứ tự tham số ở Task 7 và 8.
- **Review Focus:** cả 5 dòng đều có test ghim vào task sở hữu.
- **Proportion:** plan ngắn hơn số code nó mô tả — các code block chỉ là chữ ký/assert/giải thuật, không phải transcript.
