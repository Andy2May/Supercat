# Psiforge M2 — Observables, đo đạc, preset & ra mắt: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây lớp "đo lường & hiểu" (observables, momentum space, phép đo sập sóng, preset landing, hai chế độ, glossary) lên engine 2D của M1 và hoàn tất ra mắt công khai.

**Architecture:** Ba pha (spec mục 9): Pha 1 mở rộng core Rust (observables 2D + module measurement + API wasm + perf); Pha 2 dựng trải nghiệm web (preset/landing, hai chế độ, đồ thị, momentum view, đo đạc, xuất file); Pha 3 polish từng màn + physics-audit + vật liệu ra mắt. Mọi tính năng web đi qua worker protocol `MainToWorker`/`WorkerToMain` hiện có — không thêm dependency runtime nào.

**Tech Stack:** Rust (core + wasm-bindgen), TypeScript + Svelte 5 runes + Vite + WebGL2, Vitest + Playwright, wasm-bindgen-test.

**Spec:** `docs/superpowers/specs/2026-09-30-psiforge-m2-design.md` — plan lập luận từ spec; executor đọc cả hai.

## Global Constraints

- Đơn vị tự nhiên mặc định **ħ = m = 1**; `DEFAULTS.dt = 0.005`, `DEFAULTS.extent = 40`, grid mặc định **256²**, `?grid=512` vẫn chạy (xem `web/src/sim/simParams.ts`).
- Cổng perf nghiệm thu: **≥ 60fps @256² speed 1 đo bằng `?perf=1` HUD trên máy người dùng** (local, KHÔNG phải CI gate). CI giữ nguyên các job smoke.
- **Không thêm dependency runtime npm mới** (router tự viết bằng hash; glossary tooltip CSS thuần).
- Mọi chuỗi UI qua key i18n, **vi/en có cùng tập key** (test `web/tests/i18n.test.ts` khóa tính chất này).
- Core Rust thuần `Result`/`CoreError`, không panic trên dữ liệu vật lý; mọi `CoreError` qua wasm thành `JsError` mang nguyên văn `Display`.
- Non-goals spec v1 mục 10 là hợp đồng: không WebGPU, không server, không f32 lõi vật lý, không 1D-web/ImaginaryTime/npm (M3+).
- Quy ước lõi: tích Riemann nhân `dA = dx·dy`; k-grid theo convention `fftfreq` của `core/src/fft.rs`; **y không lật** (hàng j=0 hiển thị trên cùng).
- TDD: test đỏ trước, xanh sau, commit từng task. Các suite hiện có phải xanh liên tục: `cargo test --all`, `wasm-pack test wasm --node` (qua `npm run` tương ứng), `npm test`, `npm run test:e2e`, `npm run check`.
- Môi trường dev: cargo PATH chỉ có qua `~/.bashrc`; fresh checkout web/ cần `npm ci && npm run build:wasm` một lần (đã làm trên main).

## Review Focus

Năm lớp lỗi spec ngụ ý nhưng chưa task nào phủ, kèm test ghim vào task sở hữu:

1. **Momentum view sai thứ tự bin / trục y** (fftfreq gốc thay vì fftshift, hoặc y bị lật khi hiển thị k-space) — loại sai vật lý thầm lặng. Ghim: test core `momentum_density peaks at k0 bin` (T3) + vitest `fftshift2d` (T12) + Playwright asserted hướng y trong T2 đã có sẵn nền tảng.
2. **Sập đo đạc phá chuẩn hoặc NaN khi lấy mẫu rơi vào đuôi trọng số 0 / ψ toàn số 0** (u → 1.0 biên, mẫu đầu-cuối). Ghim: core tests `sample/collapse trên ψ toàn 0 trả lỗi`, `chuẩn = 1 sau sập`, `u biên` (T4) + wasm test tương ứng (T5).
3. **Đồ thị observatives stale sau sự kiện làm mới trạng thái** (sập đo, đổi preset, load JSON — ring buffer phải reset, không vẽ nối dữ liệu cũ). Ghim: vitest `simStore` history reset (T11) + Playwright đổi preset (T9).
4. **deserialize file lạ/hỏng phải chết sạch** (sai version, sai độ dài mảng, NaN trong ψ) — báo lỗi banner, không phá sim đang chạy. Ghim: wasm test dimension/non-finite (T5) + Playwright load file rác (T17).
5. **Routing + preset re-init dơ** (landing → preset A → back → preset B còn vương tường của A). Ghim: vitest `init(preset)` reset mọi field (T8) + Playwright luồng hai preset liên tiếp (T9).

Test cho từng dòng trên nằm ngay trong task được ghi chú "(Review Focus N)".

---

## PHA 1 — LÕI ĐÚNG + PERF

### Task 1: Mẻ vệ sinh repo & CI (T0 spec mục 4.6 — phần CI/build)

**Files:**
- Modify: `wasm/Cargo.toml` (thêm `repository`)
- Create: `wasm/LICENSE` (bản sao `LICENSE` gốc)
- Modify: `.github/workflows/ci.yml` (wasm-test dùng artifact dựng sẵn; deploy dùng rust-cache — file `deploy-pages.yml` nếu job build riêng)
- Modify: `web/tsconfig.app.json` (include `tests/**` cho `tests/` nằm trong tsconfig — hiện `svelte-check` không kiểm tra được)

**Interfaces:**
- Consumes: không.
- Produces: CI không đổi hành vi verify; `wasm-pack build` hết warning thiếu `repository`.

**Steps:**

- [ ] **1.1** Xem warning thực tế: chạy `npm run build:wasm` trong `web/`, chụp warning `repository`/LICENSE (nếu có) làm cơ sở.
- [ ] **1.2** Thêm vào `wasm/Cargo.toml` mục `[package]`:

```toml
repository = "https://github.com/Andy2May/Supercat"
license = "MIT"
```

Copy `LICENSE` từ gốc: `cp LICENSE wasm/LICENSE`. Chạy lại `npm run build:wasm` — warning mất.

- [ ] **1.3** Trong `.github/workflows/ci.yml`, job wasm-test hiện dựng lại wasm-pack: chuyển thành (i) một step build-upload artifact (`actions/upload-artifact@v4`, path `web/src/wasm/psiforge-wasm`) chung với job rust, hoặc (ii) thêm step download-artifact trước khi test. Nguyên tắc: **mỗi commit chỉ build wasm-pack một lần**. Giữ nguyên tên job và lệnh verify.
- [ ] **1.4** Trong `deploy-pages.yml` (và bất kỳ job nào build lại Rust), thêm `Swatinem/rust-cache@v2` trước step build.
- [ ] **1.5** `web/tsconfig.app.json`: thêm `"tests/**/*.spec.ts"` bị loại khỏi emit nhưng được check — cách làm đúng hiện có: nếu `tsconfig` dùng `include`, thêm `"../tests"` không phù hợp; **cách chuẩn nhất**: tạo `web/tests/tsconfig.json` extends từ app config với `"compilerOptions": {"noEmit": true}`, và thêm `tsc -p tests/tsconfig.json` vào script `check`. Kiểm tra `npm run check` xanh.
- [ ] **1.6** Commit: `chore: wasm crate metadata, CI artifact/cache reuse, tests in typecheck`

### Task 2: Mẻ bền vững web (T0 — phần runtime) + test bẫy y-flip

**Files:**
- Modify: `web/src/render/renderer.ts` + `web/src/render/simLoop.ts` (context-loss)
- Modify: `web/src/ui/SimCanvas.svelte` (aria-label reactive; dropPacket guard)
- Test: `web/tests/smoke.spec.ts` (thêm 1 test định hướng y)

**Interfaces:**
- Consumes: `HeatmapRenderer`, `simStore`, `dragToPacket` hiện có.
- Produces: renderer không vẽ khi context lost và tự tái lập khi restored; `dropPacket` không gửi khi `simStore.fatal !== undefined`.

**Steps:**

- [ ] **2.1 — Test y-flip có hướng (Review Focus 1 nền tảng).** Thêm vào `web/tests/smoke.spec.ts`: vẽ rào bằng công cụ barrier ở **nửa trên** canvas (physics y > 0), chụp `read_potential` qua debug hook? — cách khả thi: dùng canvas screenshot so pixel? Đơn giản và đủ: mở `?debugFatal=0`, dùng `page.evaluate` với `window.__psiforge` (đã có) KHÔNG đủ. **Cách chuẩn:** test Playwright vẽ segment bằng chuột từ (50%, 25%) đến (75%, 25%) — sau đó screenshot canvas và assert dải pixel sáng nằm ở **vùng 1/4 trên** (mean brightness khối trên > khối dưới cùng tọa độ x). Đây là test mà nếu ai đó lật y trong shader/texture thì đỏ.

```ts
test('canvas y-axis points up: a barrier drawn in the top quarter stays on screen top', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await page.goto('/')
  // chọn công cụ barrier (data-testid có sẵn trên Toolbar; nếu chưa có thì thêm data-testid="tool-barrier")
  await page.getByTestId('tool-barrier').click()
  const canvas = page.getByTestId('sim-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.25)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.25, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const shot = await canvas.screenshot()
  // So sánh độ sáng: dải giữa tại 25% chiều cao phải SÁNG hơn dải đối xứng tại 75%.
  // (giải mã PNG bằng tool của Playwright không có — thay vào đó dùng evaluate đọc
  //  WebGL readPixels qua debug hook — thêm hàm window.__psiforgeReadRow(yFrac) trong
  //  debugHook.ts trả mean độ sáng hàng đó, dùng cho assert.)
  const top = await page.evaluate(() => window.__psiforgeReadRow?.(0.25) ?? -1)
  const bottom = await page.evaluate(() => window.__psiforgeReadRow?.(0.75) ?? -1)
  expect(top).toBeGreaterThan(bottom)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
```

Cần thêm vào `web/src/render/debugHook.ts` một hook `__psiforgeReadRow(yFrac: number): number` — dùng `gl.readPixels` hàng tương ứng (renderer expose `readRow`; gọi được vì draw giữ buffer trong cùng frame — đọc ngay sau draw trong frame kế: cache giá trị cuối của 2 hàng 0.25/0.75 mỗi frame vào debugState là đủ, không cần readPixels theo yêu cầu). **Cách gọn:** trong `draw()`, nếu `debugState.rowsWanted` không rỗng, readPixels những hàng đó vào cache. Khai báo `window.__psiforgeReadRow` đọc từ cache.

- [ ] **2.2** Chạy `npm run test:e2e` — test mới phải ĐỎ trước khi làm hook (nếu hook chưa có sẽ fail `top = -1`).
- [ ] **2.3** Implement hook trong `debugHook.ts` + gọi từ `renderer.draw()`. Chạy lại — XANH.
- [ ] **2.4** Context-loss: trong `simLoop.ts`, đăng ký trên canvas:

```ts
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true })
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; renderer.rebuild(canvas) })
```

Trong `HeatmapRenderer` tách phần tạo GL resources (program, textures, VAO) vào `private setup(gl)` gọi từ constructor, và method `rebuild(canvas)` lấy context mới + `setup()` lại (texture sẽ được frame kế tái upload nhờ potential_version tracking — **cẩn trọng**: `lastSentPotentialVersion` nằm ở worker, vẫn gửi lại vì không đổi → main phải reset `potentialMax = 0` và buộc re-upload: thêm cờ `needsFullUpload` trên renderer, `uploadField`/`uploadPotential` kiểm tra để dùng `texImage2D` thay vì `texSubImage2D` — thống nhất với Task 6). Vẽ chừa khi `contextLost`. Không test tự động được context loss trong CI — ghi trong checklist Task 18 kích hoạt thủ công (`about:gpu` disable), code được review bằng mắt.
- [ ] **2.5** `SimCanvas.svelte`: `aria-label` chuyển thành `$derived` theo lang (mẫu `active` như App.svelte), và trong `dropPacket` đầu hàm:

```ts
if (simStore.fatal !== undefined) return
```

- [ ] **2.6** `npm run check && npm test && npm run test:e2e` xanh hết. Commit: `fix(web): context-loss recovery, reactive aria-label, dropPacket guard, y-orientation e2e`

### Task 3: Core — observables 2D (TDD)

**Files:**
- Modify: `core/src/observables.rs` (thêm nhóm 2D), `core/src/lib.rs` (doc module nếu cần)
- Test: trong `core/src/observables.rs` (module `tests`, thêm mod `obs2d`)

**Interfaces:**
- Consumes: `Wavefunction2D { psi() -> &[Complex64], grid() -> &Grid2D, m(), hbar(), norm(), n_points() }`, `Potential2D { values() -> &[f64], len() }`, `Grid2D { x(i), y(j), nx(), ny(), dx(), dy(), index(i,j) }`, `crate::fft::{k_grid, scratch2_len, transform2_forward, transform2_inverse}`.
- Produces (later tasks gọi đúng tên này):

```rust
pub struct Moments2D {
    pub x: f64, pub y: f64,
    pub sigma_x: f64, pub sigma_y: f64,
    pub px: f64, pub py: f64,
    pub sigma_px: f64, pub sigma_py: f64,
}
pub fn moments_2d(wf: &Wavefunction2D) -> Moments2D;
pub fn kinetic_2d(wf: &Wavefunction2D) -> f64;
pub fn potential_energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64;
pub fn energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64;
pub fn momentum_grid_2d(grid: &Grid2D) -> (Vec<f64>, Vec<f64>); // (kx theo i, ky theo j)
pub struct ObservablesSnapshot2D {
    pub moments: Moments2D,
    pub kinetic: f64, pub potential: f64, pub energy: f64,
    /// |phi|^2 mỗi bin, f32, row-major j*nx+i (bản fftfreq gốc, CHƯA shift)
    pub momentum_density: Vec<f32>,
}
/// Một FFT duy nhất cho moments + kinetic + momentum_density — worker gọi mỗi 4 frame.
pub fn observables_snapshot_2d(wf: &Wavefunction2D, v: &Potential2D) -> ObservablesSnapshot2D;
```

**Ghi chú thiết kế (lệch có chủ đích so với chữ D6 của spec):** spec nói "harvest |ψ̃|² từ trong bước Strang". Khi viết plan, harvest mid-step cho |FFT(e^{-iV·dt/2ħ}·ψ)|² — **lệch pha O(dt·V)** so với |ψ̃(p)|² thật (không đúng ở scene có tường). Thay vào đó: `observables_snapshot_2d` làm MỘT FFT đúng của ψ hiện tại, dùng chung cho moments (đã cần FFT mọi cách) + density hiển thị. Giữ nguyên lợi ích của D6 (không FFT thêm khi view bật, zero chi phí khi tắt), đúng vật lý tuyệt đối. Ghi chú này vào doc comment của hàm.

**Steps:**

- [ ] **3.1 — Test đỏ.** Trong `core/src/observables.rs`, thêm module test `obs2d` với gói tham chiếu tách biến — grid 128×128 `[-16,16)²`, gói `(x0, y0, kx, ky, σx, σy) = (-4, 2, √2, 0, 2, 1.5)`:

```rust
#[cfg(test)]
mod obs2d {
    use super::*;
    use crate::grid::Grid2D;
    use crate::potential::{Potential2D, harmonic2d};
    use crate::states::gaussian_2d;
    use crate::wavefunction::Wavefunction2D;

    const NX: usize = 128; const NY: usize = 128;
    const X0: f64 = -4.0; const Y0: f64 = 2.0;
    const KX: f64 = std::f64::consts::SQRT_2; const KY: f64 = 0.0;
    const SX: f64 = 2.0; const SY: f64 = 1.5;

    fn packet() -> Wavefunction2D {
        let grid = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        gaussian_2d(&grid, X0, Y0, KX, KY, SX, SY, 1.0, 1.0).unwrap()
    }
    fn close(a: f64, b: f64, tol: f64, what: &str) {
        assert!((a - b).abs() < tol, "{what}: {a} vs {b} (tol {tol})");
    }

    #[test]
    fn moments_match_separable_gaussian_analytic() {
        let m = moments_2d(&packet());
        close(m.x, X0, 1e-9, "<x>");
        close(m.y, Y0, 1e-9, "<y>");
        close(m.sigma_x, SX, 1e-6, "sigma_x");
        close(m.sigma_y, SY, 1e-6, "sigma_y");
        close(m.px, KX, 1e-9, "<px>");
        close(m.py, KY, 1e-9, "<py>");
        close(m.sigma_px, 1.0 / (2.0 * SX), 1e-6, "sigma_px");
        close(m.sigma_py, 1.0 / (2.0 * SY), 1e-6, "sigma_py");
        close(m.sigma_x * m.sigma_px, 0.5, 1e-6, "sx*spx");
        close(m.sigma_y * m.sigma_py, 0.5, 1e-6, "sy*spy");
    }

    #[test]
    fn free_and_harmonic_energies() {
        let wf = packet();
        let v0 = Potential2D::zeros(NX * NY);
        // <T> = (kx^2+ky^2)/2 + 1/(8 sx^2) + 1/(8 sy^2); <V>=0.
        let t = (KX * KX + KY * KY) / 2.0 + 1.0 / (8.0 * SX * SX) + 1.0 / (8.0 * SY * SY);
        close(kinetic_2d(&wf), t, 1e-5, "<T> free");
        close(potential_energy_2d(&wf, &v0), 0.0, 1e-12, "<V> free");
        close(energy_2d(&wf, &v0), t, 1e-5, "E free");
        let grid = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        let vh = harmonic2d(&grid, 1.0, 1.0);
        // <V> = (<x^2> + <y^2>)/2 với omega=m=1.
        let pe = ((SX * SX + X0 * X0) + (SY * SY + Y0 * Y0)) / 2.0;
        close(potential_energy_2d(&wf, &vh), pe, 1e-5, "<V> harmonic");
    }

    #[test]
    fn momentum_grid_2d_follows_fftfreq() {
        let grid = Grid2D::new(8, 8, -1.0, 11.0, -1.0, 11.0).unwrap(); // dx = dy = 1.5
        let (kx, ky) = momentum_grid_2d(&grid);
        let dk = 2.0 * std::f64::consts::PI / (8.0 * 1.5);
        let expected = [0.0, 1.0, 2.0, 3.0, -4.0, -3.0, -2.0, -1.0];
        for (k, e) in kx.iter().zip(expected) { close(*k, dk * e, 1e-12, "kx bin"); }
        assert_eq!(ky.len(), 8);
    }

    #[test]
    fn momentum_density_peaks_at_k0_bin_and_parses_to_one() {
        // (Review Focus 1) Gói có kx = sqrt(2): |phi|^2 phải đỉnh ở bin i sao cho
        // kx[i] ~ sqrt(2), KHÔNG phải bin 0; tổng |phi|^2 * dk^2 = 1 (Parseval rời rạc).
        let wf = packet();
        let snap = observables_snapshot_2d(&wf, &Potential2D::zeros(NX * NY));
        let grid = wf.grid();
        let (kxg, _kyg) = momentum_grid_2d(grid);
        // tìm bin đỉnh toàn trường — phải là bin kx gần KX (j đỉnh ~ 0 vì ky = 0)
        let mut best = (0usize, 0usize, 0f32);
        for (k, &d) in snap.momentum_density.iter().enumerate() {
            if d > best.2 { best = (k % NX, k / NX, d); }
        }
        close(kxg[best.0], KX, 3.0 * (2.0 * std::f64::consts::PI / (NX as f64 * grid.dx())), "peak kx bin");
        let dk = 2.0 * std::f64::consts::PI / (NX as f64 * grid.dx());
        let total: f64 = snap.momentum_density.iter().map(|&d| d as f64).sum::<f64>() * dk * dk;
        close(total, 1.0, 1e-3, "sum |phi|^2 dk^2");
        close(snap.energy, kinetic_2d(&wf), 1e-12, "snapshot E = T khi V=0");
    }
}
```

- [ ] **3.2** `cargo test -p psiforge-core obs2d` — ĐỎ (chưa có hàm).
- [ ] **3.3** Implement trong `observables.rs` (mô phỏng đúng cấu trúc ratio-form của bản 1D):

```rust
// ===== 2D observables (M2) =====

/// Moments vị trí/động lượng của một Wavefunction2D — xem doc module cho
/// convention (dA = dx*dy; ratio-form k-space miễn nhiễm chuẩn hóa FFT).
pub struct Moments2D { /* fields như Interfaces */ }

fn position_moments_2d(wf: &Wavefunction2D) -> ((f64, f64), (f64, f64)) {
    let grid = wf.grid();
    let d = grid.dx() * grid.dy();
    let (mut m1x, mut m2x, mut m1y, mut m2y) = (0.0, 0.0, 0.0, 0.0);
    for (k, c) in wf.psi().iter().enumerate() {
        let p = c.norm_sqr();
        let (x, y) = (grid.x(k % grid.nx()), grid.y(k / grid.nx()));
        m1x += x * p; m2x += x * x * p; m1y += y * p; m2y += y * y * p;
    }
    ((m1x * d, m2x * d), (m1y * d, m2y * d)) // ((<x>, <x^2>), (<y>, <y^2>))
}

fn momentum_moments_2d(wf: &Wavefunction2D) -> (f64, f64, f64, f64) {
    // (weight, p_x moment, p_y moment, p^2 moment) — ratio form như bản 1D,
    // quét phi một lần với cả kx[i], ky[j].
    // copy psi -> scratch, transform2_forward(psi_buf, scratch, nx, ny)
    ...
}

pub fn moments_2d(wf: &Wavefunction2D) -> Moments2D { /* dùng hai helper trên */ }

pub fn kinetic_2d(wf: &Wavefunction2D) -> f64 {
    // hbar^2 * <k^2> / (2m), <k^2> ratio form
}

pub fn potential_energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64 {
    debug_assert_eq!(wf.n_points(), v.len());
    let grid = wf.grid();
    wf.psi().iter().zip(v.values())
        .map(|(c, &vk)| vk * c.norm_sqr()).sum::<f64>() * grid.dx() * grid.dy()
}

pub fn energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64 {
    kinetic_2d(wf) + potential_energy_2d(wf, v)
}

pub fn momentum_grid_2d(grid: &Grid2D) -> (Vec<f64>, Vec<f64>) {
    (k_grid(grid.nx(), grid.dx()), k_grid(grid.ny(), grid.dy()))
}

pub struct ObservablesSnapshot2D { /* fields như Interfaces */ }

/// MỘT FFT 2D duy nhất phục vụ moments + kinetic + |phi|^2 hiển thị.
/// Ghi chú thiết kế M2: spec D6 định hướng harvest giữa bước Strang, nhưng
/// phi tại điểm đó mang pha nửa-bước e^{-iV dt/(2 hbar)} (lệch |psi~(p)|^2
/// một lượng O(dt·V)); snapshot này FFT đúng psi hiện tại và dùng chung cho
/// mọi đại lượng — cùng chi phí một FFT, đúng tuyệt đối.
pub fn observables_snapshot_2d(wf: &Wavefunction2D, v: &Potential2D) -> ObservablesSnapshot2D {
    // transform psi copy một lần; rút ra (weight, m1x, m2x, m1y, m2y, m2k)
    // + ghi |phi_k|^2 vào Vec<f32>; tính moments, kinetic, potential, energy.
}
```

(Executor viết đầy đủ thân hàm theo đúng cấu trúc bản 1D cùng file — mọi công thức đã có mẫu; KHÔNG để lại `...` trong code commit.)

- [ ] **3.4** `cargo test -p psiforge-core` — XANH toàn bộ (cả suite cũ).
- [ ] **3.5** Commit: `feat(core): 2D observables — moments, energies, momentum grid, snapshot`

### Task 4: Core — module `measurement` (TDD)

**Files:**
- Create: `core/src/measurement.rs`
- Modify: `core/src/lib.rs` (`pub mod measurement;`)

**Interfaces:**
- Consumes: `Wavefunction2D` (+ `psi_mut`, `normalize`), `crate::fft::{transform2_forward, transform2_inverse, scratch2_len}`, `CoreError::InvalidSigma`.
- Produces:

```rust
/// Một bước PCG32: trả (uniform [0,1), state mới). Deterministic theo seed.
pub fn next_uniform(seed: u64) -> (f64, u64);
/// Lấy mẫu ô (ix, iy) theo |psi|^2 (các ô đồng diện → trọng số là |psi_k|^2).
/// Lỗi NormDrift{step:0, norm: tổng trọng số} khi tổng 0 hoặc không hữu hạn.
pub fn sample_position(wf: &Wavefunction2D, seed: u64) -> Result<(usize, usize), CoreError>;
/// Lấy mẫu bin (i, j) theo |phi|^2 (FFT của psi, ratio form).
pub fn sample_momentum(wf: &Wavefunction2D, seed: u64) -> Result<(usize, usize), CoreError>;
/// Nhân psi với Gauss "độ phân giải dụng cụ" tâm (ix, iy), bán kính sigma_inst
/// (đơn vị vật lý), rồi chuẩn hóa lại. sigma_inst phải > 0 hữu hạn.
pub fn collapse_position(wf: &mut Wavefunction2D, ix: usize, iy: usize, sigma_inst: f64) -> Result<(), CoreError>;
/// Đối xứng trong k-space: FFT, nhân Gauss tâm bin (i,j) bán kính sigma_k (đơn vị k),
/// FFT ngược, chuẩn hóa lại.
pub fn collapse_momentum(wf: &mut Wavefunction2D, i: usize, j: usize, sigma_k: f64) -> Result<(), CoreError>;
```

Quy ước: Gauss nhân là `exp(-r²/(2σ²))` (không cắt đuôi — nhân toàn trường rồi chuẩn hóa; ô cách xa vẫn > 0 về mặt số học f64 nhưng đóng góp < 1e-100, vô hại).

**Steps:**

- [ ] **4.1 — Test đỏ.** Trong `measurement.rs` viết module tests:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::Grid2D;
    use crate::observables::moments_2d;
    use crate::potential::Potential2D;
    use crate::states::gaussian_2d;
    use crate::wavefunction::Wavefunction2D;
    use num_complex::Complex64;

    const NX: usize = 64; const NY: usize = 64;

    fn packet() -> Wavefunction2D {
        let g = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        gaussian_2d(&g, 0.0, 0.0, 4.0, 0.0, 1.5, 1.5, 1.0, 1.0).unwrap()
    }

    #[test]
    fn pcg_is_deterministic_and_in_range() {
        let (u1, s1) = next_uniform(42);
        let (u2, s2) = next_uniform(42);
        assert_eq!(u1.to_bits(), u2.to_bits());
        assert_ne!(s1, 0);
        assert!((0.0..1.0).contains(&u1));
        let mut s = 7u64; let mut all_ok = true;
        for _ in 0..10_000 {
            let (u, ns) = next_uniform(s);
            all_ok &= (0.0..1.0).contains(&u);
            s = ns;
        }
        assert!(all_ok);
    }

    #[test]
    fn sample_distribution_matches_density_3_sigma() {
        // (Review Focus 2) 10^4 mẫu: tỉ lệ mẫu trong đĩa 3σ khớp khối |psi|^2
        // trong đĩa đó (biên 3σ của nhị thức ~1.5%).
        let wf = packet();
        let grid = wf.grid();
        let sigma = 1.5;
        let p_disk: f64 = wf.psi().iter().enumerate()
            .map(|(k, c)| {
                let (x, y) = (grid.x(k % NX), grid.y(k / NX));
                if x * x + y * y < 9.0 * sigma * sigma { c.norm_sqr() } else { 0.0 }
            }).sum::<f64>() * grid.dx() * grid.dy();
        let mut inside = 0usize;
        for seed in 0..10_000u64 {
            let (i, j) = sample_position(&wf, seed).unwrap();
            let (x, y) = (grid.x(i), grid.y(j));
            if x * x + y * y < 9.0 * sigma * sigma { inside += 1; }
        }
        let ratio = inside as f64 / 10_000.0;
        assert!((ratio - p_disk).abs() < 0.02,
            "sampled {ratio} vs density {p_disk}");
    }

    #[test]
    fn sample_on_zero_wavefunction_errors() {
        let g = Grid2D::new(8, 8, -1.0, 1.0, -1.0, 1.0).unwrap();
        let wf = Wavefunction2D::new(g, vec![Complex64::new(0.0, 0.0); 64], 1.0, 1.0).unwrap();
        assert!(matches!(sample_position(&wf, 1), Err(CoreError::NormDrift { .. })));
    }

    #[test]
    fn collapse_position_shrinks_and_keeps_norm() {
        let mut wf = packet();
        let grid = wf.grid();
        let sigma_inst = 3.0 * grid.dx();
        collapse_position(&mut wf, NX / 2, NY / 2, sigma_inst).unwrap();
        assert!((wf.norm() - 1.0).abs() < 1e-12, "norm = {}", wf.norm());
        let m = moments_2d(&wf);
        assert!(m.sigma_x < sigma_inst, "sx = {} < sigma_inst = {}", m.sigma_x, sigma_inst);
        assert!(m.sigma_y < sigma_inst);
    }

    #[test]
    fn collapse_momentum_localizes_around_chosen_k() {
        let mut wf = packet(); // kx = 4
        let grid = wf.grid();
        let dk = 2.0 * std::f64::consts::PI / (NX as f64 * grid.dx());
        let (kxg, kyg) = crate::observables::momentum_grid_2d(grid);
        let i0 = kxg.iter().enumerate().min_by(|a, b| {
            (a.1 - 4.0).abs().partial_cmp(&(b.1 - 4.0).abs()).unwrap()
        }).unwrap().0;
        let j0 = kyg.iter().enumerate().min_by(|a, b| {
            a.1.abs().partial_cmp(&b.1.abs()).unwrap()
        }).unwrap().0;
        collapse_momentum(&mut wf, i0, j0, 3.0 * dk).unwrap();
        assert!((wf.norm() - 1.0).abs() < 1e-12);
        let m = moments_2d(&wf);
        assert!((m.px - 4.0).abs() < 3.0 * dk, "<px> = {}", m.px);
        assert!(m.sigma_px < 3.0 * dk, "spx = {}", m.sigma_px);
    }

    #[test]
    fn collapse_rejects_bad_sigma_and_out_of_range_cells() {
        let mut wf = packet();
        assert!(matches!(collapse_position(&mut wf, 0, 0, 0.0), Err(CoreError::InvalidSigma { .. })));
        assert!(matches!(collapse_position(&mut wf, NX, 0, 1.0), Err(CoreError::DimensionMismatch { .. })));
    }
}
```

- [ ] **4.2** `cargo test -p psiforge-core measurement` — ĐỎ.
- [ ] **4.3** Implement `measurement.rs`:

```rust
//! Mô phỏng phép đo (M2): lấy mẫu vị trí/động lượng theo phân bố xác suất
//! và sập hàm sóng về kết quả đo với độ phân giải dụng cụ hữu hạn.

/// PCG-XSH-RR 32-bit từ state 64-bit — đủ tốt cho mô phỏng giáo dục,
//! deterministic theo seed (cùng seed, cùng dãy trên mọi build).
pub fn next_uniform(seed: u64) -> (f64, u64) {
    let state = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let xorshifted = (((state >> 18) ^ state) >> 27) as u32;
    let rot = (state >> 59) as u32;
    let value = xorshifted.rotate_right(rot);
    // +0.5 chia 2^32: kết quả luôn trong (0,1) — không chạm biên, binary
    // search CDF không trượt chỉ số cuối.
    ((value as f64 + 0.5) / 4294967296.0, state)
}
```

`sample_position`/`sample_momentum`: xây CDF lũy tiến một lượt (f64), `u * total`, tìm bằng binary search (`partition_point`). `collapse_position`: quét mọi ô, nhân `exp(-r²/(2σ²))` với r từ tâm (ix,iy) theo tọa độ vật lý; sai `InvalidSigma` nếu σ không hữu hạn/≤0, `DimensionMismatch` nếu chỉ số vượt lưới; xong gọi `wf.normalize()`. `collapse_momentum`: copy ψ → FFT forward → nhân Gauss theo (kx-kx₀)² + (ky-ky₀)² với tâm là bin chọn → FFT inverse → ghi lại psi_mut → normalize. Chiều chuẩn của round trip `transform2_forward`/`transform2_inverse` đã exact-identity (test M1) nên không cần scale thêm.

- [ ] **4.4** `cargo test -p psiforge-core` — XANH. Commit: `feat(core): measurement — deterministic sampling + finite-resolution collapse`

### Task 5: wasm — 6 API mới trên `Simulation2D`

**Files:**
- Modify: `wasm/src/lib.rs`
- Test: module `tests` trong `wasm/src/lib.rs`

**Interfaces:**
- Consumes: T3 (`observables_snapshot_2d`, `momentum_grid_2d`), T4 (`sample/collapse`).
- Produces (JS-facing, camelCase tự động bởi wasm-bindgen cho đa từ):

```rust
pub fn observables(&self) -> Float64Array; // 11 giá trị theo THỨ TỰ DOCUMENTED:
// [x, y, sigma_x, sigma_y, px, py, sigma_px, sigma_py, kinetic, potential, energy]
pub fn momentum_density(&self) -> Float32Array; // |phi|^2 fftfreq gốc, row-major j*nx+i
pub fn measure_position(&mut self, seed: u64) -> Result<JsValue, JsError>; // {ix, iy, x, y}
pub fn measure_momentum(&mut self, seed: u64) -> Result<JsValue, JsError>; // {i, j, kx, ky}
pub fn serialize_state(&self) -> JsValue; // {nx, ny, extentX, extentY, dt, m, hbar, t, potential: Float32Array, psi: Float32Array}
pub fn deserialize_state(&mut self, state: &JsValue) -> Result<(), JsError>;
```

Quy ước đo: `sigma_inst = 3.0 * dx`, `sigma_k = 3.0 * dk` (dk theo trục x) — hai hằng số `const SIGMA_INST_CELLS: f64 = 3.0; const SIGMA_K_BINS: f64 = 3.0;` có doc comment.

**Steps:**

- [ ] **5.1 — Test đỏ** (thêm vào mod tests của wasm/src/lib.rs):

```rust
#[wasm_bindgen_test]
fn observables_returns_11_documented_values() {
    let mut sim = sim();
    set_reference_packet(&mut sim);
    let obs = sim.observables().to_vec();
    assert_eq!(obs.len(), 11);
    assert!((obs[0] - 0.0).abs() < 1e-9, "<x> = {}", obs[0]);      // x0 = 0
    assert!((obs[2] - 1.5).abs() < 1e-6, "sigma_x = {}", obs[2]);  // sigma 1.5
    assert!((obs[4] - 2.0).abs() < 1e-9, "<px> = {}", obs[4]);     // kx = 2
    assert!((obs[9] - 0.0).abs() < 1e-12, "<V> = {}", obs[9]);     // V = 0
}

#[wasm_bindgen_test]
fn momentum_density_parses_and_peaks_at_k() {
    let mut sim = sim();
    sim.set_gaussian(0.0, 0.0, 3.0, 0.0, 1.5, 1.5).unwrap();
    let d = sim.momentum_density().to_vec();
    assert_eq!(d.len(), NX * NY);
    let dk = 2.0 * std::f64::consts::PI / EXTENT_X;
    let total: f64 = d.iter().sum::<f32>() as f64 * dk * dk;
    assert!((total - 1.0).abs() < 1e-3, "sum = {total}");
}

#[wasm_bindgen_test]
fn measure_position_collapses_and_keeps_norm() {
    // (Review Focus 2)
    let mut sim = sim();
    set_reference_packet(&mut sim);
    let before_sigma = sim.observables().to_vec()[2];
    let out = sim.measure_position(123).unwrap();
    let js: js_sys::Object = out.into();
    let ix = js_sys::Reflect::get(&js, &"ix".into()).unwrap().as_f64().unwrap() as usize;
    assert!(ix < NX);
    let norm = sim.norm();
    assert!((norm - 1.0).abs() < 1e-10, "norm = {norm}");
    let after_sigma = sim.observables().to_vec()[2];
    assert!(after_sigma < before_sigma, "sigma {after_sigma} < {before_sigma}");
}

#[wasm_bindgen_test]
fn measure_momentum_moves_p() {
    let mut sim = sim();
    set_reference_packet(&mut sim); // kx = 2
    sim.measure_momentum(7).unwrap();
    let obs = sim.observables().to_vec();
    assert!((sim.norm() - 1.0).abs() < 1e-10);
    // sau sập, |<px> - 2| nằm trong vài sigma_k
    assert!((obs[4] - 2.0).abs() < 0.5, "<px> = {}", obs[4]);
}

#[wasm_bindgen_test]
fn serialize_round_trip_restores_exact_state() {
    let mut sim = sim();
    sim.potential_wall(0.0, 1.25, 7.5, vec![-5.0, 5.0], vec![1.9, 1.9]).unwrap();
    set_reference_packet(&mut sim);
    sim.advance(25).unwrap();
    let state = sim.serialize_state();
    let psi_before = sim.density_phase().to_vec();
    let v_before = sim.read_potential_f32().to_vec();
    let t_before = sim.advance(0).unwrap();

    sim.advance(40).unwrap(); // chạy thêm cho khác đi
    sim.paint_disc(0.0, 0.0, 2.0, 3.0).unwrap();
    sim.deserialize_state(&state).unwrap();

    assert_eq!(sim.density_phase().to_vec(), psi_before);
    assert_eq!(sim.read_potential_f32().to_vec(), v_before);
    assert_eq!(sim.advance(0).unwrap(), t_before);
    // snapshot = psi lúc serialize: reset không đổi gì
    sim.reset_wave();
    assert_eq!(sim.density_phase().to_vec(), psi_before);
}

#[wasm_bindgen_test]
fn deserialize_rejects_wrong_shapes_cleanly() {
    // (Review Focus 4)
    let mut sim = sim();
    let state = sim.serialize_state();
    // độ dài sai
    let bad = js_sys::Object::new();
    js_sys::Reflect::set(&bad, &"nx".into(), &wasm_bindgen::JsValue::from(NX)).unwrap();
    js_sys::Reflect::set(&bad, &"ny".into(), &wasm_bindgen::JsValue::from(NY)).unwrap();
    js_sys::Reflect::set(&bad, &"psi".into(), &js_sys::Float32Array::new_with_length(3).into()).unwrap();
    let err = sim.deserialize_state(&bad.into()).unwrap_err();
    assert!(format!("{err:?}").contains("dimension"), "{err:?}");
    // trạng thái sim không bị phá
    assert!((sim.norm() - 1.0).abs() < 1e-10 || sim.norm() == 0.0);
}
```

- [ ] **5.2** `wasm-pack test wasm --node` (qua lệnh dev chuẩn của repo) — ĐỎ.
- [ ] **5.3** Implement trên `Simulation2D` (dùng `js_sys::Reflect::set` dựng object; serialize trả `{nx, ny, extentX, extentY, dt, m, hbar, t, potential, psi}` với psi là **Float32 interleaved (re, im)**; deserialize validate: mọi field hữu hạn, `psi.len() == 2·nx·ny`, `potential.len() == nx·ny` → else `JsError` chứa "dimension"/"invalid"; rồi dựng lại `v` + `base_v` = potential, `wf` từ psi, `snapshot` = psi, `t`; bump `potential_version`).
- [ ] **5.4** Test XANH; `cd web && npm run build:wasm` để binding mới xuống web.
- [ ] **5.5** Commit: `feat(wasm): observables, momentum density, measurement, state serialization`

### Task 6: Perf — texSubImage2D + vòng đo vi hiệu chỉnh

**Files:**
- Modify: `web/src/render/renderer.ts` (`uploadField`/`uploadPotential` sub-image path + `needsFullUpload`)
- Create: `docs/superpowers/notes/2026-XX-XX-m2-perf.md` (ngày thực hiện)
- Test: thủ công có kiểm số qua `npm run perf` (không CI gate — Global Constraints)

**Interfaces:**
- Consumes: Task 2 (`needsFullUpload` đã mốc cho context-restore).
- Produces: `uploadField(data, nx, ny)`/`uploadPotential` không tái cấp phát texture khi cùng kích thước; note ghi số đo trước/sau.

**Steps:**

- [ ] **6.1** Đo nền: `cd web && npm run build && npm run perf` — ghi fps @256² (mặc định) và @512² (`?grid=512`) vào note.
- [ ] **6.2** Implement sub-image:

```ts
private fieldAllocated = { w: 0, h: 0 }
private potentialAllocated = { w: 0, h: 0 }

uploadField(data: Float32Array, nx: number, ny: number): void {
  this.gridW = nx; this.gridH = ny
  const gl = this.gl
  gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
  if (this.fieldAllocated.w === nx && this.fieldAllocated.h === ny) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RG, gl.FLOAT, data)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, nx, ny, 0, gl.RG, gl.FLOAT, data)
    this.fieldAllocated = { w: nx, h: ny }
  }
}
```

`tự đổi` tương tự cho potential (`gl.RED`). `needsFullUpload()` set hai struct về `{0,0}`.

- [ ] **6.3** Đo lại; ghi bảng trước/sau vào note. Nếu @256² speed 1 còn dưới 60: áp lần lượt (mỗi lần đo lại) — (a) worker `postFrame` tái dùng 2 buffer so le (ping-pong) thay vì alloc `Float32Array` mỗi frame: giữ `let frameBuf: [Float32Array, Float32Array]`, copy bằng `.set()`, transfer luân phiên; (b) giảm tần `maxDensity` scan (mỗi 2 frame). Ghi mỗi bước vào note. **Nếu vẫn < 60: DỪNG và báo người dùng** (spec mục 8 van cuối) — không tự hạ chuẩn.
- [ ] **6.4** `npm run check && npm test && npm run test:e2e` xanh. Commit: `perf(web): texSubImage2D texture updates + measured micro-opts`

---

## PHA 2 — TRẢI NGHIỆM WEB

### Task 7: Mode store — Khám phá / Nâng cao

**Files:**
- Create: `web/src/sim/modeStore.svelte.ts`
- Modify: `web/src/App.svelte` (nút chuyển), `web/src/i18n/vi.ts` + `en.ts`
- Test: `web/tests/modeStore.test.ts`

**Interfaces:**
- Produces:

```ts
export type Mode = 'explore' | 'advanced'
export class ModeStore {
  mode: Mode                                    // $state, 'explore' mặc định
  toggle(): void                                // + persists localStorage 'psiforge.mode'
}
export const modeStore: ModeStore               // instance duy nhất
```

i18n keys: `mode.explore` ("Khám phá"/"Explore"), `mode.advanced` ("Nâng cao"/"Advanced"), `mode.switchHint`.

**Steps:**

- [ ] **7.1** Test đỏ `web/tests/modeStore.test.ts`: mặc định `explore`; `toggle()` → `advanced` và localStorage ghi; khởi tạo lại đọc được từ localStorage; giá trị rác trong localStorage → fallback `explore`.
- [ ] **7.2** Implement store (mẫu `$state` như `toolStore.svelte.ts`; localStorage qua `try/catch` — môi trường test không có DOM vẫn chạy).
- [ ] **7.3** App.svelte header: nút chuyển hiển thị nhãn chế độ KẾ TIẾP (`mode.switchHint`), `data-testid="mode-toggle"`.
- [ ] **7.4** `npm test` XANH; mở rộng `web/tests/i18n.test.ts` hai key mới có đủ vi/en. Commit: `feat(web): explore/advanced mode store + toggle`

### Task 8: Preset registry + simStore init từ preset

**Files:**
- Create: `web/src/presets/index.ts`
- Modify: `web/src/sim/simStore.svelte.ts` (`init(preset)`), `web/src/App.svelte` (truyền preset mặc định)
- Test: `web/tests/presets.test.ts`

**Interfaces:**
- Produces:

```ts
export type PresetId = 'double-slit' | 'tunneling' | 'free-packet' | 'harmonic' | 'sandbox'
export type PresetPotential =
  | { type: 'zero' }
  | { type: 'harmonic'; omega: number }
  | { type: 'wall'; xCenter: number; thickness: number; value: number; gapCenters: number[]; gapWidths: number[] }
export interface PresetConfig {
  id: PresetId
  grid: number                  // 256 cho mọi preset ra mắt
  potential: PresetPotential
  packet?: { x0: number; y0: number; kx: number; ky: number; sigmaX: number; sigmaY: number }
  autoplay: boolean
  titleKey: string              // `preset.<id>.title` (quy ước)
}
export const PRESETS: Record<PresetId, PresetConfig>
export const LANDING_ORDER: PresetId[] // ['double-slit', 'tunneling', 'free-packet', 'harmonic', 'sandbox']
```

`SimStore.init(preset: PresetConfig)`: gửi `init` + tin nhắn thế + packet theo config, autoplay theo config; **reset mọi field reactive** (t, norm, frames, fatal, observables history sau này) — Review Focus 3/5.

Cấu hình vật lý 4 preset (từ spec mục 5.1 + thực tế M1):

```ts
double-slit: wall { xCenter: 0, thickness: 0.6, value: 30, gapCenters: [-3, 3], gapWidths: [1.2, 1.2] },
  packet { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 }, autoplay: true   // scene mặc định M1 nguyên bản
tunneling: wall { xCenter: 0, thickness: 1.0, value: 24, gapCenters: [], gapWidths: [] }, // rào kín, ~6-7 cell @256²
  packet { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 }, autoplay: true    // E≈18 < V0=24
free-packet: zero, packet { x0: 0, y0: 0, kx: 3, ky: 2, sigmaX: 2, sigmaY: 2 }, autoplay: true
harmonic: harmonic omega 1, packet { x0: -6, y0: 0, kx: 0, ky: 3, sigmaX: 1.2, sigmaY: 1.2 }, autoplay: true // quỹ đạo tròn coherent
sandbox: zero, packet { x0: 0, y0: 0, kx: 0, ky: 0, sigmaX: 3, sigmaY: 3 }, autoplay: false // blob đứng yên, người dùng tự nghịch
```

**Steps:**

- [ ] **8.1** Test đỏ `presets.test.ts`: 5 preset đủ field; grid = 256; tunneling KHÔNG có gap; sandbox autoplay false; `SimStore` (dùng instanceof thật — khởi tạo được trong vitest vì chỉ đọc location khi có) `init(preset)` gửi đúng dãy tin nhắn (spy `send`), gọi hai lần với hai preset khác nhau không để lại fatal/t/frames cũ.
- [ ] **8.2** Implement registry + sửa `simStore.init(preset)` (bỏ scene double-slit hardcode; App.svelte gọi `simStore.init(PRESETS['double-slit'])` tạm cho tới Task 9 routing).
- [ ] **8.3** `npm test && npm run test:e2e && npm run check` XANH. Commit: `feat(web): preset registry + sim init from preset`

### Task 9: Landing + hash routing + thẻ lời dẫn

**Files:**
- Create: `web/src/ui/Landing.svelte`
- Modify: `web/src/App.svelte` (router), `web/src/i18n/vi.ts`/`en.ts` (thẻ lời dẫn 3–5 câu × 5 preset + teaser + nút)
- Test: `web/tests/landing.test.ts` (vitest logic router), `web/tests/smoke.spec.ts` (thêm luồng landing)

**Interfaces:**
- Consumes: T8 (`PRESETS`, `LANDING_ORDER`), T7 (`modeStore`).
- Produces: route `#/` = landing (5 ô + tiêu đề + tagline); `#/sim/<id>` = mô phỏng với preset; hash không hợp lệ → `#/sim/double-slit`. Khi vào preset: thẻ lời dẫn (`data-testid="preset-card"`) hiện 3–5 câu, nút thu gọn; mở lại bằng nút ⓘ (`data-testid="preset-info"`). i18n keys `preset.<id>.{title,teaser,card}` — card là chuỗi 3–5 câu (dùng `\n` phân tách, render từng câu một dòng).

Nội dung lời dẫn (vi; en đối dịch — viết đầy đủ trong bước implement):

- `double-slit`: gói sóng lao vào tường có hai khe hở; sau tường các vạch sáng tối xếp đều — dấu vết sóng giao thoa của một HẠT; hãy Reset xem lại từ đầu, thử vẽ tẩy bịt một khe để giao thoa biến mất.
- `tunneling`: vật lý cổ điển nói hạt năng lượng E≈18 không thể vượt rào cao 24 — hãy nhìn kỹ PHÍA SAU rào; vệt mờ xuyên qua suy giảm theo độ dày — hãy vẽ thêm một lớp rào nữa xem vệt mờ đi đâu.
- `free-packet`: gói sóng "ngồi yên" sẽ tự giãn ra và phủ kín hộp — không có ma sát, chỉ là bất định động lượng; để chạy lâu sẽ thấy mật độ phẳng đều.
- `harmonic`: gói bị "bát" giữ lại, tâm nó chạy theo quỹ đạo tròn như quả bóng lăn trong chậu — đúng dự đoán cổ điển (định lý Ehrenfest); để ý gói gần như không giãn.
- `sandbox`: vùng chơi tự do — chọn công cụ vẽ rào/giếng, thả gói sóng bằng cách kéo trên nền, và xem |ψ|² phản ứng.

**Steps:**

- [ ] **9.1** Vitest đỏ `landing.test.ts`: hàm thuần `parseRoute(hash: string): {view: 'landing'} | {view: 'sim', id: PresetId}` — `''`/`'#/'` → landing; `'#/sim/tunneling'` → sim/tunneling; `'#/sim/khong-ton-tai'` → fallback double-slit. (Hàm đặt trong `web/src/route.ts` — thuần, test được.)
- [ ] **9.2** Implement `route.ts` + `Landing.svelte` (lưới ô: mỗi ô `<a href="#/sim/<id>">` với tiêu đề, teaser, `<img src="thumbs/<id>.png">` — ảnh chưa có thì fallback `onerror` ẩn, Task 10 thay) + App.svelte: `let route = $state(parseRoute(location.hash))`, listener `hashchange`, render `Landing` hay khối sim hiện có; khi `view==='sim'` → `simStore.init(PRESETS[route.id])` trong `$effect` (destroy khi rời — **Review Focus 5**: destroy/init lại sạch sẽ).
- [ ] **9.3** Thẻ lời dẫn: component trong SimCanvas layout (dưới Toolbar), đọc `t()` theo `preset.<id>.card` split `\n`; trạng thái thu gọn `$state`, mặc định MỞ lần đầu vào preset (không nhớ giữa các lần vào — đơn giản).
- [ ] **9.4** i18n vi + en đủ key; test i18n parity xanh.
- [ ] **9.5** Playwright mới: (a) `page.goto('/')` thấy 5 ô `data-testid="preset-tile"`; (b) click ô tunneling → URL `#/sim/tunneling`, thẻ hiện, frames tăng, không lỗi console; (c) `page.goto('/#/sim/harmonic')` trực tiếp chạy; (d) back về landing → vào `free-packet` — frames tăng, **thẻ đúng preset** (không phải của harmonic). Chạy tất cả suite xanh. Commit: `feat(web): preset landing with hash routing and narration cards`

### Task 10: Thumbnail script

**Files:**
- Create: `web/tests/thumbs.spec.ts`
- Modify: `web/package.json` (`"thumbs": "playwright test tests/thumbs.spec.ts"`)

**Interfaces:**
- Consumes: T9 (route theo preset).
- Produces: `web/public/thumbs/<presetId>.png` (5 ảnh, commit vào repo — chất lượng cuối cùng chỉnh ở Task 18; đây là bản tốt đầu tiên).

**Steps:**

- [ ] **10.1** Spec: cho mỗi preset trong LANDING_ORDER: goto `/#/sim/<id>`, đợi `frames >= 90` (qua `window.__psiforge`), `page.getByTestId('sim-canvas').screenshot({ path: 'public/thumbs/<id>.png' })`. Tắt narration card trước chụp (`preset-card` nút thu gọn) để ảnh sạch.
- [ ] **10.2** `npm run thumbs` — 5 file PNG sinh ra; kiểm tra mắt nhanh (không đen, có cấu trúc).
- [ ] **10.3** Commit cả 5 PNG + spec: `feat(web): preset thumbnail capture script + first shots`

### Task 11: Observables trên wire + ObservablesBar + khung E

**Files:**
- Modify: `web/src/sim/protocol.ts` (frame + `obs?`), `web/src/sim/physics.worker.ts` (cadence), `web/src/sim/simStore.svelte.ts` (history), `web/src/App.svelte` (mount bar)
- Create: `web/src/ui/ObservablesBar.svelte`, `web/src/sim/sparkline.ts` (thuần)
- Test: `web/tests/observablesBar.test.ts` (logic), `web/tests/smoke.spec.ts` (smoke advanced)

**Interfaces:**
- Consumes: T5 (`observables()` Float64Array 11 giá trị), T7 (`modeStore`).
- Produces:

```ts
// protocol.ts
export interface ObservablesFrame {
  x: number; y: number; sigmaX: number; sigmaY: number
  px: number; py: number; sigmaPx: number; sigmaPy: number
  kinetic: number; potential: number; energy: number
}
export type MainToWorker = ... | { type: 'set-observatories-cadence'; on: boolean }
// FrameMessage thêm: obs?: ObservablesFrame
// simStore thêm: observablesHistory: {t: number} & ObservablesFrame[] ($state, ring 600)
```

Worker: cờ `obsOn`; bộ đếm frame; mỗi **4 frame** (và frame nào đó obsOn vừa bật) gọi `sim.observables()` map 11 số vào `obs`. `set-observatories-cadence` bật/tắt (App gửi theo modeStore). Ring buffer reset trong `init`.

`sparkline.ts`: thuần `mapSeries(values: number[], width: number, height: number, lo: number, hi: number): Float32Array` (points polyline) + `ringPush<T>(arr: T[], item: T, cap = 600): T[]` — test đơn thuần. `ObservablesBar.svelte`: 3 canvas nhỏ (⟨x⟩ cyan/⟨y⟩ hồng trên cùng 1 chart; σx·σpx & σy·σpy trên chart 2; E trên chart 3) + số đọc + khung E riêng (luôn E hiện số). Chỉ render khi `modeStore.mode === 'advanced'`.

**Steps:**

- [ ] **11.1** Vitest đỏ: `sparkline.ts` (`ringPush` giữ tối đa 600, bỏ cũ nhất; mapSeries đúng biên), simStore history reset khi `init` (Review Focus 3), worker mapping 11 số → object (hàm thuần `toObservables(a: number[]): ObservablesFrame` đặt trong protocol.ts — test trực tiếp: index đúng thứ tự T5).
- [ ] **11.2** Implement protocol + worker + store + bar. App gắn `<ObservablesBar />` dưới PlaybackBar (ẩn khi explore). E nhảy sau đo là đúng vật lý — thêm chú thích nhỏ `obs.energyJumpNote` (glossary task 15 sẽ nối thuật ngữ).
- [ ] **11.3** Playwright smoke mới: bật `#/sim/free-packet`, `?perf=1` không cần; chuyển mode advanced (`mode-toggle`) → `data-testid="observables-bar"` hiện; chờ 2s → E số thay đổi theo thời gian (đọc `data-testid="energy-value"` hai lần khác nhau); mode explore → bar ẩn. Chạy mọi suite xanh. Commit: `feat(web): live observables strip + energy panel`

### Task 12: Momentum view (fftshift + toggle)

**Files:**
- Create: `web/src/sim/fftshift.ts`
- Modify: `protocol.ts` (`set-momentum-view`; frame `momentumDensity?: Float32Array`), `physics.worker.ts`, `simStore.svelte.ts` (`view: 'position' | 'momentum'`), `simLoop.ts` (upload đường scalar), `PlaybackBar.svelte` hoặc component mới `ViewToggle` trong `App.svelte`, i18n
- Test: `web/tests/fftshift.test.ts`, smoke mới

**Interfaces:**
- Consumes: T5 (`momentum_density()`), T7 (advanced-only).
- Produces:

```ts
// fftshift.ts
export function fftshift2d(src: Float32Array, nx: number, ny: number): Float32Array
// dest[j*nx+i] = src[((j + ny/2) mod ny)*nx + ((i + nx/2) mod nx)] — k=0 vào giữa (n chẵn)
```

Worker: cờ `momentumView`; khi bật, mỗi frame (mỗi 4 frame cho nhẹ — cùng nhịp obs, dùng chung snapshot? **không** — `momentum_density()` là FFT riêng của wasm; nhịp 4 frame) gọi + shift + gửi `momentumDensity` (transfer). simLoop: khi frame có `momentumDensity` → interleaved (v, 0) vào scratch Float32Array tái dùng → `uploadField` (đường RG32F cũ); KHÔNG upload potential trong frame đó; renderer nhận thêm `setShowV(false/true)` (u_showV uniform — thêm ở đây) để tắt lớp V trên k-space. ViewToggle (advanced): "Vị trí | Động lượng" (`data-testid="view-toggle"`); chú thích trục `view.momentumCaption` = "kx, ky — k=0 ở giữa".

**Steps:**

- [ ] **12.1** Vitest đỏ `fftshift.test.ts`: mảng 4×4 đánh số 0..15 → shift đúng vị trí tay (viết bảng kỳ vọng tường minh); lưới 1×N biên; (Review Focus 1).
- [ ] **12.2** Implement fftshift + protocol + worker (nhịp 4 frame, gửi kèm obs frame) + simLoop scratch + u_showV trong shader (`FRAGMENT_SHADER_SRC` thêm uniform int; V overlay chỉ vẽ khi u_showV = 1) + ViewToggle + i18n vi/en.
- [ ] **12.3** Playwright: advanced → view-toggle → momentum → không lỗi console, frames vẫn tăng; caption hiển thị; toggle về position → V overlay trở lại (không assert pixel — chỉ DOM/console). Suite xanh. Commit: `feat(web): momentum-space view with fftshift display`

### Task 13: Chế độ màu pha HSV (Nâng cao)

**Files:**
- Modify: `web/src/render/shaders.ts` (u_colorMode), `renderer.ts` (`setColorMode`), `App.svelte`/ViewToggle (nút "Màu pha"), i18n
- Test: smoke mở rộng

**Interfaces:**
- Consumes: kênh φ đã có trong RG32F.
- Produces: `HeatmapRenderer.setColorMode(mode: 0 | 1)`; u_colorMode=1: màu = HSV(hue = φ, sat 0.9, value = tonemap(ρ) cùng auto-exposure). Chỉ khả dụng ở position view + advanced.

**Steps:**

- [ ] **13.1** Shader: thêm `uniform int u_colorMode;` và nhánh mode 1: `hue = fract(atan(phi)/TAU)` — φ đã là arg ∈ (−π, π] → `hue = fract((phi + PI) / TAU)`; hsv2rgb inline; value dùng chính đường tonemap inferno hiện có (đảo giá trị vào V của HSV). Renderer: `setColorMode` set uniform trong `draw()` (lưu field).
- [ ] **13.2** UI: trong ViewToggle thêm nút `view.phaseColor` (`data-testid="phase-toggle"`, chỉ hiện position+advanced); store `phaseColor: boolean`.
- [ ] **13.3** Playwright: advanced → phase-toggle → không lỗi console; explore: nút không hiện. `npm run check` (shader là chuỗi TS nên typecheck vẫn phủ) + suites xanh. Commit: `feat(web): HSV phase colormap (advanced)`

### Task 14: Đo đạc trên web — công cụ, crossfade, vòng sáng

**Files:**
- Modify: `web/src/sim/tools.ts` (Tool + 'measure'), `Toolbar.svelte` (nút, cả hai mode), `SimCanvas.svelte` (click đo), `protocol.ts` + `physics.worker.ts` (`measure-position`/`measure-momentum` → frame `measured`), `renderer.ts` + `simLoop.ts` (crossfade), `simStore.svelte.ts` (`lastMeasurement`), Create `web/src/ui/markers.ts` (vòng sáng overlay), i18n
- Test: vitest markers/protocol, smoke mới

**Interfaces:**
- Consumes: T5 (`measure_position/measure_momentum`), T2 overlay canvas.
- Produces:

```ts
// protocol.ts
| { type: 'measure-position'; seed: number }
| { type: 'measure-momentum'; seed: number }
// FrameMessage thêm: measured?: { kind: 'position' | 'momentum'; x: number; y: number } // tọa độ VẬT LÝ (position) hoặc k (momentum)
// markers.ts
export function spawnMarker(ctx: CanvasRenderingContext2D, sx: number, sy: number, now: number): boolean
// vẽ vòng nở dần 0→600ms rồi tự xóa; trả false khi hết — gọi từ rAF của SimCanvas
```

Crossfade renderer: field texture thứ hai `fadeTexture`; `beginFade()`: `gl.copyTexImage2D` field hiện tại → fadeTexture (cùng kích thước); shader `uniform float u_fade` mix(fadeTex, fieldTex, 1−u_fade) khi u_fade > 0; simLoop: khi `frame.measured !== undefined` → `renderer.beginFade()` TRƯỚC `uploadField`, rồi chạy u_fade 1→0 trong 250ms bằng rAF (các draw trung gian không có frame mới — tick vẽ thêm khi đang fade; **dùng chung một displayMax** cho cả hai texture — spec mục 5.6).

Measure tool: click (pointerup với drag < ngưỡng 3px) khi `toolState.tool === 'measure'` → `simStore.send({type:'measure-position', seed})` với `seed = Math.floor(Math.random() * 2**48)`; không drag semantic. Momentum: nút "Đo động lượng" (`data-testid="measure-momentum"`) trong ViewToggle khi momentum view bật → gửi measure-momentum. Marker: SimCanvas `$effect` theo `simStore.lastMeasurement` → đổi tọa độ (position: gridToScreen có sẵn; momentum: bin fftshifted → screen: `((i + nx/2) % nx) / nx * width`…) → spawnMarker. Nhãn kết quả: toast nhỏ "Đo tại (x, y)" / "Đo k = (kx, ky)" 2s (`data-testid="measure-toast"`).

**Steps:**

- [ ] **14.1** Vitest đỏ: `markers.ts` (thuần: tính bán kính/alpha theo t — 3 mốc thời gian), mapping bin→screen cho momentum (hàm thuần `binToScreen(i, j, nx, ny, w, h)` — Review Focus 1).
- [ ] **14.2** Implement tools/Toolbar/canvas/protocol/worker (worker: gọi wasm, postFrame kèm `measured`; momentum đo xong vẫn postFrame — view đang momentum nên crossfade trên chính |φ|² mới).
- [ ] **14.3** Implement crossfade (renderer + simLoop) + marker overlay + toast + i18n vi/en ("Đo vị trí"/"Measure position"…).
- [ ] **14.4** Playwright (Review Focus 2 ở tầng UI): chọn `tool-measure`, click giữa canvas → toast hiện, `window.__psiforge.norm` vẫn ≈ 1 (đọc debugState), frames tăng tiếp; advanced → momentum view → measure-momentum → norm ≈ 1. Suites xanh. Commit: `feat(web): position/momentum measurement with collapse animation`

### Task 15: Chú giải thuật ngữ (glossary)

**Files:**
- Create: `web/src/i18n/glossary.ts`, `web/src/ui/Term.svelte`
- Modify: `ObservablesBar.svelte`, `ViewToggle`/`App.svelte`, `Toolbar.svelte` (móc thuật ngữ), `web/tests/i18n.test.ts`
- Test: mở rộng i18n test

**Interfaces:**
- Produces:

```ts
// glossary.ts
export interface GlossaryEntry { vi: string; en: string }
export const GLOSSARY: Record<string, GlossaryEntry> // key ví dụ: 'density', 'phase', 'norm', 'mx', 'sigma', 'sigmaProduct', 'momentumSpace', 'energy', 'energyJump', 'k', 'tunneling', 'collapse'
```

`Term.svelte`: `<span class="term" tabindex="0">{label}<span class="tip">{giải thích theo lang}</span></span>` — CSS: gạch chân chấm, tooltip position absolute hiện trên hover/focus-within; KHÔNG dependency. Thuật ngữ chỉ gắn ở **Nâng cao** (spec: Khám phá không có thuật ngữ — nhưng |ψ|²-life wording cũng có thể cần chú thích đời thường: gắn term "density" với giải thích đời thường ở explore cho hint line — nội dung glossary viết hai bậc: câu đời thường đầu, câu kỹ sau).

**Steps:**

- [ ] **15.1** Viết `glossary.ts` đủ ~12 entry (vi/en; viết kèm preset theo spec 5.3 — mỗi entry 1–2 câu đời thường + 1 câu kỹ). Test đỏ: parity key vi/en + mỗi entry khác rỗng; các key được dùng trong component (`Term key="..."`) tồn tại — test quét tĩnh file `.svelte` bằng regex `key="([a-z]+)"` so với GLOSSARY (giữ đơn giản: assert tập key cứng liệt kê trong test).
- [ ] **15.2** Implement `Term.svelte` + CSS (`app.css`) + móc vào ObservablesBar (⟨x⟩, σx, E, σx·σpx), ViewToggle (kông gian động lượng, pha), Toolbar (xuyên hầm hint ở card sandbox? — chỉ nơi đã có nhãn kỹ). Kiểm tra keyboard: focus bằng Tab hiện tooltip (CSS `:focus-within`).
- [ ] **15.3** `npm test` + `npm run check` xanh. Commit: `feat(web): glossary terms with hover/focus tooltips`

### Task 16: Xuất PNG

**Files:**
- Modify: `web/src/ui/PlaybackBar.svelte` (nút), `web/src/render/simLoop.ts` (capture), `web/src/sim/simStore.svelte.ts` (cờ), i18n
- Test: smoke mới

**Interfaces:**
- Produces: `SimStore.requestCapture(): void` đặt cờ; simLoop sau `draw()` trong frame kế: `canvas.toBlob(...)` → `URL.createObjectURL` → `a.download = psiforge-<YYYYMMDD-HHmmss>.png` click + revoke. Cả hai chế độ đều có nút (`data-testid="export-png"`).

**Steps:**

- [ ] **16.1** Implement cờ + capture (toBlob đọc buffer cùng frame an toàn vì gọi ngay sau draw trong cùng callback — trước khi trình duyệt composite).
- [ ] **16.2** Playwright: click export-png → `page.waitForEvent('download')` tên file `.png`, kích thước blob > 0. Suites xanh. Commit: `feat(web): PNG canvas export`

### Task 17: Lưu/mở JSON (Nâng cao)

**Files:**
- Create: `web/src/sim/stateFile.ts` (b64 + version guard, thuần)
- Modify: `protocol.ts` (`serialize-state` / `deserialize-state`), `physics.worker.ts` (reply `state`), `simStore.svelte.ts` (loadError), `App.svelte` (2 nút + file input ẩn), i18n
- Test: `web/tests/stateFile.test.ts`, smoke mới

**Interfaces:**
- Consumes: T5 serialize/deserialize.
- Produces:

```ts
// stateFile.ts (thuần, test được)
export const STATE_VERSION = 1
export interface SavedState { version: number; nx: number; ny: number; extentX: number; extentY: number; dt: number; m: number; hbar: number; t: number; potential: string /*b64*/; psi: string /*b64 interleaved re,im*/ }
export function encodeState(raw: {nums..., potential: Float32Array, psi: Float32Array}): SavedState
export function decodeState(json: unknown): {nums..., potential: Float32Array, psi: Float32Array} // throws StateFileError khi sai version/độ dài/NaN
// b64: chunked 0x8000 btoa/atob, Uint8Array <-> Float32Array qua ArrayBuffer share
```

Wire: nút "Lưu" (`data-testid="export-json"`, advanced) → worker `serialize-state` → `WorkerToMain` mới `{type:'state', ...raw}` → encodeState → download `.json`. Nút "Mở" (`data-testid="import-json"`) → `<input type="file" accept=".json">` → decodeState → gửi `deserialize-state` (transfer hai Float32Array) → worker khôi phục + postFrame. Lỗi decode (Review Focus 4): `simStore.loadError = message` hiển thị ErrorBanner biến thể không fatal (`data-testid="load-error"`), xóa khi thành công/đổi preset; **không** dừng simulation.

**Steps:**

- [ ] **17.1** Vitest đỏ `stateFile.test.ts`: b64 roundtrip (mảng có số âm/NaN — NaN phải THROW khi encode), version 2 → throw có chữ "version", độ dài mảng sai → throw "dimension"; encode→decode identity bit-exact.
- [ ] **17.2** Implement stateFile + protocol + worker + store + UI nút.
- [ ] **17.3** Playwright: advanced → export-json (download `.json`); chạy thêm 2s; import file vừa lưu (dùng `setInputFiles` với path download) → `t` nhỏ trở lại (đọc `window.__psiforge.t` trước/sau); nạp file rác (tạo tạm JSON sai version) → load-error hiện, sim vẫn chạy (frames tăng). Suites xanh. Commit: `feat(web): JSON state save/load with version guard`

---

## PHA 3 — POLISH, AUDIT & RA MẮT

### Task 18: Polish pass từng màn hình (tương tác với người dùng — KHÔNG subagent tự duyệt)

**Files:** sửa theo phát hiện (renderer/shaders, component CSS, i18n, thumbnail re-shoot)
**Tính chất:** mỗi màn là MỘT vòng: executor áp checklist → chụp screenshot/dev-server → **người dùng duyệt bằng mắt** → lặp tới OK. Mỗi vòng OK ghi 1 dòng vào `docs/superpowers/notes/2026-XX-XX-m2-polish.md`.

**Checklist chuẩn mỗi màn** (spec 7.1): tương phản; nhãn rõ; bố cục; "tương tác chính nhìn ra trong 10 giây đầu"; không thuật ngữ chưa chú giải ở Khám phá; **chú giải V₀ trên canvas** (thêm legend nhỏ góc: "tường V₀=30" / "giếng −V" với swatch màu đúng renderer — làm ở màn mô phỏng).

**Thứ tự màn:** (1) Landing; (2) Mô phỏng Khám phá (mỗi preset một lượt: double-slit, tunneling, free-packet, harmonic, sandbox — đọc đúng thẻ lời dẫn, thumbnail khớp cảnh thật); (3) Mô phỏng Nâng cao (bar đồ thị, E, glossary); (4) Momentum view + đo động lượng; (5) Đo vị trí + crossfade + vòng sáng; (6) Xuất PNG/JSON; (7) Re-shoot thumbnails nếu preset/CSS đổi (`npm run thumbs`).

**Steps:**

- [ ] **18.1** Màn 1 landing → duyệt người dùng → ghi note.
- [ ] **18.2–18.6** Các màn còn lại, cùng vòng lặp.
- [ ] **18.7** Re-shoot thumbnails lần cuối nếu có đổi; commit: `polish(web): per-screen polish pass (see notes)`

### Task 19: Physics-audit hồi tố wave-dynamics

**Files:**
- Create: `docs/superpowers/audits/<ngày>-wave-dynamics.md`
- Fix code/test theo phán quyết LỆCH (nếu có)

**Nội dung theo `docs/superpowers/notes/2026-09-29-physics-audit-pipeline.md`**: auditor là subagent chuyên trách (general-purpose với prompt y nguyên phác thảo mục "Phác thảo nội dung audit"), phát báo cáo: mỗi tuyên bố vật lý → tái suy luận độc lập từ nguyên lý → phán quyết KHỚP/LỆCH/KHÔNG CHỨNG MINH ĐƯỢC → bằng chứng. Phạm vi: toàn bộ `core/` (1D+2D propagator, observables, measurement, fft), quy ước đơn vị docs/units.md, golden tests (đo đúng thứ tuyên bố — dung sai), "sai âm thầm" (wrap biên, aliasing, dt), interface vật lý giữa observables ↔ measurement ↔ propagator (cùng định nghĩa tích trong, cùng quy ước k, cùng ý nghĩa width/σ). **Mục LỆCH phải xử lý xong** (code fix + test) trước khi coi task xong.

**Steps:**

- [ ] **19.1** Dispatch auditor subagent (prompt chứa phác thảo note + đường dẫn crate); thu báo cáo.
- [ ] **19.2** Xử lý từng mục LỆCH: fix + test đỏ→xanh từng mục; cập nhật báo cáo ghi "đã xử lý".
- [ ] **19.3** Commit: `docs(audit): wave-dynamics retrospective physics audit + fixes`

### Task 20: README + GIF + nghiệm thu ra mắt

**Files:**
- Modify: `README.md`, `docs/superpowers/notes/2026-XX-XX-m2-perf.md` (nếu chưa chốt)
- Create: `web/public/demo.gif` (hoặc `demo.mp4` nếu người dùng chọn quay tay)

**Steps:**

- [ ] **20.1** Perf số chốt: từ note Task 6 — ghi README **số thực đo** (vd "256²: ~60fps trên laptop X; 512²: chế độ máy mạnh") — không hứa 60fps@512².
- [ ] **20.2** GIF: đường A — người dùng quay màn (đẹp hơn, spec 7.3 cho phép); đường B — playwright `recordVideo` trên kịch bản double-slit 8s + tunneling 4s, ghép bằng ffmpeg nếu có trên máy (`ffmpeg -i in.webm -vf "fps=12,scale=640:-1" out.gif`). Chọn đường nào xác nhận với người dùng tại lúc làm.
- [ ] **20.3** README: section Presets (ảnh thumbnail), GIF demo, quickstart web (đã có — rà), link Pages.
- [ ] **20.4** Nghiệm thu toàn diện: `cargo test --all`, wasm node test, `npm run check`, `npm test`, `npm run test:e2e`, `npm run perf` — tất cả xanh; HUD 60fps@256² xác nhận bởi người dùng trên máy thật (cổng spec điều kiện 2).
- [ ] **20.5** Merge về main (nếu làm trên worktree/branch — theo quy trình finishing-a-development-branch), push; kiểm tra deploy Pages sống (**tiền đề: người dùng đã đặt Pages source = GitHub Actions** — nhắc nếu chưa).
- [ ] **20.6** Checklist việc người dùng (không phải executor): Pages setting; bài Show HN/Reddit (code chỉ cung cấp GIF + link). Commit cuối: `docs(readme): launch materials — demo GIF, perf numbers, presets`

---

## Self-Review (đã chạy sau khi viết)

1. **Spec coverage:** spec mục 4.1→T3; 4.2→T4; 4.3→(gộp vào T3 `observables_snapshot_2d` — ghi chú lệch có chủ đích trong T3); 4.4→T5; 4.5→T6 (+van an toàn trong 6.3); 4.6→T1+T2; 5.1→T8/T9/T10; 5.2→T7; 5.3→T15; 5.4→T11; 5.5→T12+T13; 5.6→T14; 5.7→T16/T17; 6→tests trong T3/T4/T5/T11/T12/T14/T17 + smoke mở rộng; 7.1→T18; 7.2→T19; 7.3→T20. Không còn gap.
2. **Placeholder scan:** các khối code phác thảo cấu trúc (T3 mục 3.3, T4 mục 4.3) ghi rõ ràng ràng "executor viết đầy đủ thân hàm theo mẫu bản 1D cùng file, không để `...` trong code commit" — đây là chỉ dẫn có mẫu cụ thể, không phải TBD; mọi task đều có test code thật.
3. **Type consistency:** `Moments2D`/`observables_snapshot_2d` (T3) khớp dùng trong T5; thứ tự 11 số của `observables()` T5 khớp `toObservables` T11; `fftshift2d` T12 khớp `binToScreen` T14; `SavedState` T17 khớp serialize fields T5; `Tool` mở rộng `'measure'` T14 khớp tools.ts T2 hiện có.
4. **Review Focus:** cả 5 dòng đều có test được trỏ đến task cụ thể (T2, T3, T4/T5, T8/T9/T11, T17).
