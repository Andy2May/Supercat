# Audit vật lý & toán học — module wave-dynamics (M2, Task 19)

- **Ngày:** 2026-10-01
- **Auditor:** physics auditor (Task 19), đọc-ghi: CHỈ ĐỌC code
- **Phạm vi:** toàn bộ module wave-dynamics như ship ở M2 — `core/` (fft, grid, wavefunction, states, potential, propagator, observables, measurement, error), golden tests (1D + 2D) và test trong module, ranh giới `wasm/`, văn bản vật lý hướng người dùng (`web/src/i18n/*`, glossary, legend, caption), `docs/units.md`.
- **Phương pháp:** với MỖI tuyên bố vật lý, auditor suy luận lại từ nguyên lý đầu (viết lời giải trước, rồi mới so code); các giá trị "đo được" được kiểm chứng bằng cách chạy các test có sẵn với `--nocapture` (không sửa gì): `cargo test -p psiforge-core --test golden`, `--test golden2d`, `--lib`, `--doc` — tất cả pass (6 + 5 + 98 + 1). Một phép tính kiểm chứng độc lập ngoài repo (Python, `/tmp`) cho tuyên bố dung sai T3.
- **Phán quyết:** KHỚP / LỆCH / KHÔNG CHỨNG MINH ĐƯỢC (KCĐB). LỆCH luôn kèm chỉnh sửa cụ thể.

---

## 1. `core/src/fft.rs` — lưới k và chuẩn hóa FFT

### 1.1 Quy ước lưới k = fftfreq × 2π — **KHỚP**

**Suy luận độc lập.** Lấy mẫu sóng phẳng `e^{ikx}` tại `x_i = xmin + i·dx`: mẫu là `e^{ik·xmin}·e^{i k i dx}`. DFT (`F_q = Σ_i f_i e^{-2πi q i/n}`, không chuẩn hóa) chỉ khác 0 tại bin `q` khi `q/n ≡ k·dx/(2π) (mod 1)`, tức bin `q` tương ứng wavenumber

```
k_q = (2π/(n·dx))·q',   q' = q (q < n/2),  q' = q − n (q ≥ n/2, n chẵn)
```

để đưa k về khoảng Nyquist `(−π/dx, π/dx]`. Với `n` chẵn, bin `n/2` nhận `−π/dx` (âm Nyquist) — đúng quy ước `numpy.fft.fftfreq`. Với `n` lẻ, `cutoff = ceil(n/2)` cho phía dương `(n+1)/2` giá trị — cũng đúng fftfreq (kiểm tra n=5: [0,1,2,−2,−1]).

**Đối chiếu.** `fft.rs:82-95` (`k_grid`), `cutoff = n.div_ceil(2)` — trùng suy luận ở cả hai trường hợp chẵn/lẻ. Test `propagator.rs:507-516` và `observables.rs:490-511` khớp bảng tay. Doc `fft.rs:69-81` phát biểu đúng.

### 1.2 Chuẩn hóa round trip (inverse áp 1/n; 2D áp 1/n mỗi trục) — **KHỚP**

Suy luận: DFT tiến không chuẩn hóa, inverse nhân `1/n` → round trip là đồng nhất; 2D tách biến theo hàng rồi cột nên tổng scale `1/(nx·ny)` — code `fft.rs:44-55, 104-128` đúng như vậy, và đây là điều kiện để bước Strang "thuần nhân pha" giữ unitarity chính xác tới sai số làm tròn. Test round trip 16×12 và test đối chiếu DFT trực tiếp 6×4 (không vuông, cố ý bắt lỗi hoán vị trục) đều pass.

---

## 2. `core/src/grid.rs`, `wavefunction.rs` — lưới nửa mở và chuẩn Riemann

### 2.1 Lưới `[xmin, xmax)`, `dx = (xmax−xmin)/n` — **KHỚP**

Điểm cuối nằm tại `xmax − dx`; hợp lý với điều kiện biên tuần hoàn của FFT (điểm tại `xmax` sẽ trùng lặp `xmin`). `grid.rs:10-54, 56-162`.

### 2.2 Chuẩn `‖ψ‖ = sqrt(Σ|ψᵢ|²·dx)` (2D: `·dx·dy`) — **KHỚP**

Tích trong rời rạc phải mang trọng số thể tích để xấp xỉ `∫|ψ|²dx`. Trên lưới tuần hoàn, tổng Riemann trái với bước đều chính là quy tắc hình thang tuần hoàn — chính xác cấp phổ với hàm trơn. `wavefunction.rs:100-104, 222-227`. Test `norm_carries_da_weight_on_non_unit_spacing` (dx=dy=0.5) chốt đúng trọng số dA.

---

## 3. `core/src/states.rs` — Gaussian 1D/2D

### 3.1 Gaussian 1D: hệ số `4σ²`, σ là độ lệch chuẩn vị trí, pha `k₀x` không có ħ — **KHỚP**

**Suy luận độc lập.** Gói tối thiểu-bất-định: `ψ(x) = (2πσ²)^{−1/4} exp(−(x−x0)²/(4σ²) + i k₀ x)`. Khi đó `|ψ|² ∝ exp(−(x−x0)²/(2σ²))` → phương sai `σ²` (σ là std vị trí). Động lượng trung bình: `⟨p⟩ = ∫ψ*(−iħ∂ₓ)ψ = ħk₀` — pha mũ `k₀x` KHÔNG chứa ħ vì `k₀` là wavenumber (rad/độ dài), `p = ħk`.

**Đối chiếu.** `states.rs:58-67`: `d = (x−x0)/(2σ)`, `from_polar(exp(−d²), k₀·x)` rồi chuẩn hóa bằng chuẩn rời rạc — đúng từng thành phần. Doc `states.rs:9-24` phát biểu đúng cả ba điểm. Test `discrete_width_matches_sigma` (đo 2.0 ± 1e-6) và `expectation_p_is_hbar_k0` xác nhận.

### 3.2 Gaussian 2D tách biến, độ rộng từng trục — **KHỚP**

`ψ ∝ exp(−(x−x0)²/4σx² − (y−y0)²/4σy² + i(kx·x + ky·y))` — `states.rs:139-155`; hai biên độ nhân, hai pha cộng trong `from_polar`. Chuẩn hóa bằng chuẩn dA. `|ψ|²` tách theo trục với std (σx, σy). Test 256×256 với dx≠1 đo đúng (1.5, 2.5) ± 1e-6.

### 3.3 Doctest lib.rs "coherent state không giãn, ⟨x⟩ = 3cos t" — **KHỚP**

σ = 1/√2 = √(ħ/2mω) đúng độ rộng nền HO (m=ω=ħ=1); gói dịch tới x₀=3, k₀=0 là coherent state thực → σ_x bất biến, Ehrenfest chính xác với HO: `⟨x⟩(t) = x₀cos ωt`. Doctest chạy pass với hai assert 1e-6 (t = 0.1).

---

## 4. `core/src/potential.rs` — các builder thế

### 4.1 Harmonic `½mω²x²` và `½mω²(x²+y²)` — **KHỚP**

`potential.rs:69-77, 225-235`. Hiển nhiên từ định nghĩa; test đối chiếu tay tại các điểm mẫu.

### 4.2 Cửa sổ nửa mở `|x−c| < w/2` cho mọi builder; wall + gaps; well_chain hợp nhất (không nhân đôi độ sâu) — **KHỚP**

Một quy ước duy nhất `inside_window` (`potential.rs:83-85`) được finite_well, barrier, well_chain, finite_wel2d, wall, và gap dùng chung; điểm nằm đúng biên là NGOÀI. Với wall, gap ghi đè (V=0) trên dải x — đúng ngữ nghĩa "khe hở xuyên qua tường". well_chain: điểm trong bất kỳ giếng nào nhận `−depth` (union, không cộng) — được doc và test chốt. Quy ước nửa mở nhất quán với quy ước lưới `[xmin, xmax)` — hai "nửa mở" không mâu thuẫn nhau (một cái về hình học cửa sổ, một về bao lưới).

---

## 5. `core/src/propagator.rs` — Strang splitting

### 5.1 Thành phần Strang `e^{−iVdt/2ħ}·e^{−iTdt/ħ}·e^{−iVdt/2ħ}` — **KHỚP**

**Suy luận độc lập.** TDSE `iħ∂ₜψ = (T+V)ψ`, nghiệm chính xác `e^{−i(T+V)dt/ħ}`. Strang đối xứng bậc 2:

- Ở biểu diễn x, V chéo: `ψ(x) ← e^{−iV(x)dt/(2ħ)}ψ(x)`.
- Ở biểu diễn k, sóng phẳng `e^{ikx}` là hàm riêng của T với giá trị riêng `ħ²k²/2m` ⇒ nhân tử `e^{−iħk²dt/(2m)}`.
- Thứ tự áp dụng nửa-vế → trôi → nửa-vế cho tích `e^{−iVdt/2ħ}·e^{−iTdt/ħ}·e^{−iVdt/2ħ}` (nhân tử phải nhất tác dụng trước), sai số cục bộ O(dt³).

**Đối chiếu.** `propagator.rs:135-155`: `half_kick = −dt/(2ħ)`, `cis(half_kick·Vᵢ)`; bảng pha động học `cis(−ħk²dt/(2m))` dựng một lần trong `new` (`:92-95`) trên đúng `k_grid` của fft; 2D: `cis(−ħ(kx²+ky²)dt/2m)` tại flat bin `j·nx+i` (`:228-236`). Dấu, thứ tự, các hệ số ħ/m — tất cả trùng. Doc module (`:3-11`) phát biểu đúng.

### 5.2 Unitarity chính xác + norm guard (kể cả NaN) — **KHỚP**

Mọi nhân tử có modulus 1; round trip FFT đồng nhất ⇒ chuẩn được bảo toàn tới làm tròn. Guard `|Σ|ψ|²dx − 1| ≤ 1e-10` mỗi bước, với nhánh `!g.is_finite()` vì so sánh NaN luôn false (`:157-168`). Test norm 4 sau khi nhân đôi, test NaN, test thế không hữu hạn trước khi đụng ψ — đều pass và đo đúng như tuyên bố.

### 5.3 Luồng ħ/m giữa Wavefunction và Propagator — **KHỚP** (với cảnh báo)

`SplitOperator::new` nhận (m, ħ) riêng và `step()` KHÔNG kiểm tra khớp với `wf.m()/wf.hbar()` — về lý thuyết một caller thư viện có thể dựng cặp không khớp và vật lý im lặng sai lệch (động học theo ħ của propagator, observables theo ħ của wf). Kiểm tra mọi đường đi đang ship: app truyền cùng hằng số (`simStore init` → constructor + `set_gaussian` kế thừa `wf.m()/hbar()` — `wasm/src/lib.rs:274-284`); `deserialize_state` không dựng lại propagator nhưng doc khai báo rõ ràng giới hạn này và worker dựng lại simulation mới khi khác lưới (`physics.worker.ts:343-363`). Không có đường ship nào lệch. **Cảnh báo ghi nhận:** core chưa có hàng rào cho caller ngoài.

---

## 6. `core/src/observables.rs`

### 6.1 Dạng tỉ số của các mô-men động lượng — miễn nhiễm chuẩn hóa FFT — **KHỚP**

**Suy luận độc lập.** Trong `ℂⁿ`, cơ sở DFT `u_j(i) = e^{2πiji/n}/√n` trực chuẩn; khai triển `ψ = Σ c_j u_j` với `c_j = φ_j/√n` (φ = DFT không chuẩn hóa), nên `Σ|c_j|² = Σ|φ_j|²/n = Σᵢ|ψᵢ|²` (Parseval rời rạc). Trên lưới tuần hoàn, `−iħ∂ₓ` chéo đúng trong cơ sở này với giá trị riêng `ħk_j` (đúng với hàm e^{ik_jx} giới hạn lên lưới, bất kể pha toàn cục `e^{−ik_j·xmin}`). Do đó

```
⟨p⟩ = ħ·Σ k_j |φ_j|² / Σ|φ_j|²,   ⟨p²⟩ = ħ²·Σ k_j²|φ_j|² / Σ|φ_j|²
```

Mọi hằng số chuẩn hóa của FFT (và cả pha `xmin`) triệt tiêu trong tỉ số — kết quả thực, chính xác cho bài toán rời rạc. **Đối chiếu:** `observables.rs:75-92` (1D), `:270-279` (2D), đúng công thức; doc module và doc hàm phát biểu đúng tính chất "immune".

### 6.2 σ, động năng `ħ²⟨k²⟩/2m`, thế năng `ΣV|ψ|²dA` — **KHỚP**

σ = √(⟨x²⟩−⟨x⟩²) đúng định nghĩa; T = p²/2m = ħ²⟨k²⟩/2m (2D: (px²+py²)/2m); V = ΣVₖ|ψₖ|²·dx(dy) — tích trong trọng số đúng như chuẩn. `observables.rs:99-135, 282-327`. Các giá trị giải tích trong test (σ_p = 1/2σ; σxσp = 1/2; ⟨T⟩ = (k₀²+1/4σ²)/2; harmonic ⟨V⟩ = (σ²+x₀²)/2; erf(3/√2) = 0.9973002) — auditor suy luận lại hết, đều đúng.

### 6.3 `momentum_density` và hệ số Parseval `(dA/2π)²` — **KHỚP**

**Suy luận độc lập.** ψ̃(k) = (1/2π)∫ψ e^{−i(kx x+ky y)}dA (mỗi trục góp 1/√2π). Rời rạc hóa: `ψ̃(k_ij) = (dA/2π)·e^{−i(kx x_min+ky y_min)}·φ_ij` (đến pha lưới) ⇒ `|ψ̃(k_ij)|² = (dA/2π)²·|φ_ij|²`. Do đó density := `|φ|²·(dA/2π)²` thỏa `Σ density·dkx·dky = ∫|ψ̃|²dk = ∫|ψ|²dA = 1`. Kiểm chứng đại số thuần (n = nx·ny, dkx = 2π/(nx·dx), Σ|φ|² = nΣ|ψ|², Σ|ψ|² = 1/dA): tích số rút gọn về đúng 1 — đẳng thức CHÍNH XÁC, không xấp xỉ. **Đối chiếu:** `observables.rs:240-241` (`scale = dx·dy/(2π)`, bình phương) và test `momentum_density_peaks_at_k0_bin_and_parses_to_one` (tổng = 1 ± 1e-3, đỉnh tại bin kx ≈ √2).

### 6.4 `observables_snapshot_2d` và ghi chú thiết kế "một FFT đúng thay vì gặt giữa Strang" (O(dt·V)) — **KHỚP**

**Suy luận độc lập cho lập luận sai lệch pha.** ψ giữa Strang = `e^{−iVdt/(2ħ)}ψ`. Biến đổi Fourier của nó: `φ'(k) = φ(k) − i(dt/2ħ)·FT[Vψ](k) + O((dt·V)²)`. Số hiệu chỉnh tỉ lệ `dt·V/ħ` — bậc nhất trong dt·V, không triệt tiêu vì chỉ MỘT nửa-vế đã tác dụng. Với tường V₀ = 30, dt = 0.005: dt·V/ħ ≈ 0.075 — lệch khả kiến trong |φ(p)|². Lập luận của doc (`observables.rs:353-362`) là đúng vật lý; một FFT đúng của ψ hiện tại thì không có lệch này.

### 6.5 Dung sai 2e-8 cho ⟨x⟩ của test 2D (cờ T3 của ledger) — **KHỚP** (kiểm chứng lại tới chữ số)

**Kiểm chứng độc lập ngoài repo:** tính đúng tổng Riemann cho hằng số test (n=128 trên [−16,16), x₀=−4, σx=2): `⟨x⟩ = −3.999999991855775`, dịch chuyển +8.144e-9 — trùng KHỚP TỪNG CHỮ SỐ với giá trị "verified independently" trong comment (`observables.rs:544-548`). Dung sai 1e-9 đúng là không thể đạt (8.1e-9 > 1e-9); 2e-8 có biên 2.5× và vẫn nhỏ hơn 6 bậc độ so với mọi lỗi rời rạc thực sự (lỗi cỡ dx sẽ ~0.06). Cơ chế (đuôi bị cắt ở 6σ) đúng về bản chất; lưu ý ước lượng bậc nhất Mills cho 2.4e-8 — giá trị đúng nhỏ hơn vì tổng Riemann trên lưới lệch tâm bù một phần; giá trị "đo" là chuẩn.

---

## 7. `core/src/measurement.rs`

### 7.1 PCG32 XSH-RR — đúng tham chiếu; đủ cho mô phỏng giáo dục — **KHỚP**

Hằng số LCG 6364136223846793005 / 1442695040888963407 và phép xuất XSH-RR (`xorshifted = ((s>>18)^s)>>27`, `rot = s>>59`, xuất `rotate_right`) trùng cài đặt tham chiếu PCG (rotate-right chính là dạng viết lại của `(x>>r)|(x<<((−r)&31))`). Test determinism + 10⁴ mẫu trong (0,1) pass.

### 7.2 Lấy mẫu nghịch-CDF trên ô đẳng diện — đúng Born — **KHỚP**

Xác suất ô k = `|ψₖ|²·dA/Σ|ψⱼ|²·dA = |ψₖ|²/Σ|ψⱼ|²` (dA triệt tiêu vì ô đẳng diện) — đúng quy tắc Born trên ô; `partition_point(|&c| c <= target)` trả về ô chứa `u·total` theo khoảng nửa mở `[c_{k−1}, c_k)`. Nhất quán với tích trong dA của observables: hai đường dùng "trọng số khác nhau" nhưng đều đúng vì bài toán của mỗi bên khác nhau (kỳ vọng liên tục cần dA; lấy mẫu rời rạc không cần). `measurement.rs:73-106` + doc `:24-27`.

### 7.3 `collapse_position` = chiếu lên Gaussian dụng cụ + chuẩn hóa lại — đúng trạng thái hậu đo có độ phân giải hữu hạn — **KHỚP**

**Suy luận độc lập.** Mô hình đo vị trí mờ (unsharp/finite-resolution): toán tử Kraus `M(r₀) ∝ G_{σ_inst}(r̂ − r₀)` (nhân với Gaussian tâm tại kết quả đọc), trạng thái hậu đo điều kiện là `M(r₀)ψ/‖M(r₀)ψ‖` — chính là "nhân Gaussian rồi chuẩn hóa lại" của code. Tương đương hình thức von Neumann: phép đo vị trí xấp xỉ = chiếu ψ lên gói định vị dụng cụ tạo được. Hoàn tất POVM: `∫G²_σ(r̂−r₀)dr₀` là hằng số (Gaussian bình phương tích phân được hằng) — mô hình tự nhất quán. Ghi nhận một lựa chọn mô hình (không phải lỗi): kết quả đọc được lấy mẫu từ |ψ|² "nhọn" chứ không từ phân phối làm mờ `‖M(r₀)ψ‖²`; tổ hợp "đo đúng điểm – tạo trạng thái độ phân giải hữu hạn" là mô hình giáo dục tiêu chuẩn, khác biệt chỉ cấp σ_inst/σ_gói. NaN-guard `r²==0` (σ² underflow) đúng và được doc lý giải (`:162-168`).

### 7.4 `collapse_momentum` — ảnh gương k — **KHỚP**

Nhân φ bằng Gaussian quanh (kx₀,ky₀) trên lưới fftfreq, FFT ngược (round trip đồng nhất — không cần scale thêm), chuẩn hóa. Vì Fourier là unitary, phép chiếu trong k của trạng thái chuẩn là ảnh gương chính xác của phép chiếu trong x. Test `collapse_momentum_localizes_around_chosen_k`: auditor tính lại — sau dập, σ'_px = (1/(2σ₁²)+1/σ_k²)^{−1/2} với σ₁ = 1/3, σ_k = 3dk ≈ 0.589 ⇒ σ' ≈ 0.368 < 3dk ✓ và ⟨px⟩ giữ ~k₀ ✓ — assert đo đúng thứ nó tuyên bố (định vị trong k VẬT LÝ qua moments, không phải khoảng cách chỉ số).

### 7.5 Test `collapse_position_shrinks_and_keeps_norm` không phân biệt được dập theo khoảng cách vật lý hay chỉ số — xác nhận, và cài đặt là vật lý — **KHỚP**

Kiểm chứng lại luận cứ ledger T4: với σ_inst = 3dx = 1.5 và gói σ = 1.5, độ rộng tích sau dập = (1/(2·1.5²)+1/1.5²)^{−1/2} = 1.2247 < 1.5 (pass); nếu cài đặt nhầm theo chỉ số (độ rộng hiệu dụng vật lý 1.5·dx = 0.75) thì σ' = 0.67 — cũng < 1.5 (vẫn pass). Test KHÔNG phân biệt được. Cài đặt thực (`measurement.rs:192-201`) dùng `xs[i] − xc` trên tọa độ VẬT LÝ — đúng. Ghi nhận để test tương lai bổ một assert định lượng (ví dụ σ_x trong khoảng [0.6, 1.3]·σ_inst).

### 7.6 Hợp đồng tất định "mọi phép toán — kể cả exp IEEE-754 — đều exact" — **LỆCH (nhẹ, lỗi lời văn doc)**

Phần outcome (chỉ số ô/bin) chỉ dùng số nguyên + nhân/cộng f64 — IEEE-754 định nghĩa chính xác, tất định thật. Nhưng `exp` KHÔNG được IEEE-754 yêu cầu làm tròn đúng (chỉ "khuyến nghị"); libm khác nền tảng khác nhau vài ulp — `measurement.rs:29-37` tuyên bố "same outcome and successor state on every build and platform" là quá mạnh ở mức ulp (trên wasm, `f64::exp` phụ thuộc runtime trình duyệt). **Sửa:** phát biểu lại thành "chuỗi outcome tất định bit-kém trên mọi nền tảng; trạng thái hậu đo tất định tới sai số làm tròn exp (≤ vài ulp libm)". Không có hệ quả vật lý nhìn thấy được.

---

## 8. Golden tests — mỗi test có đo đúng thứ nó tuyên bố?

Chạy `--nocapture`; đối chiếu từng giá trị in với suy luận độc lập.

### 8.1 `golden_free_gaussian_spreading` — **KHỚP**

σ(t) = σ₀√(1+(ħt/2mσ₀²)²), τ = 2, σ(2) = √2. Đo: 1.41421356, sai số tương đối **1.338e-13** — comment "grid discretization and FFT round-off only" đúng như in. ⟨x⟩ = −4.7e-13 (đúng 0 theo đối xứng lưới chẵn). Dung sai 1e-2 lỏng so với 1e-13 đo được nhưng sai vật lý ở bất kỳ thành phần nào sẽ cho lệch O(1) — không pass vì lý do sai.

### 8.2 `golden_coherent_state_oscillation` — **KHỚP**

Ehrenfest chính xác với HO: ⟨x⟩(t) = 3cos t. Đo 3cos(1.571) = −0.00061102 so với −0.00061122 (t=1.571 ≠ π/2 nên giá trị giải tích ≠ 0 — test tính đúng như vậy); t=3.142: −2.99999975 so với −2.99999975 (khớp tới chữ số in).

### 8.3 `golden_barrier_transmission` — **KHỚP** (biên mỏng, ghi nhận)

Công thức T của rào chữ nhật (Griffiths 2.173-2.175) đúng cả ba nhánh kể cả nhánh degenerate E=V₀ (auditor suy luận lại; nhánh E=V₀ là giới hạn của cả hai nhánh kia). Kiểm tra tay T(E₀=1) = 1/(1+2.25·sinh²(1)/2) = 0.391583 — trùng số in. Trung bình theo động lượng (tuyến tính của TDSE + tách gói) hợp lệ; thời điểm t=13 với khối tâm ±8.4 đúng động học nhóm k₀=√2. Đo: T_sim = 0.389099, T̄ = 0.397730, hiệu 0.008631 < 0.01 — phần dư 0.0057 quanh rào được in ra và là vật lý thực (gói chưa tách hết). **Ghi nhận:** biên chỉ còn 14%; nếu về sau đổi hằng số cảnh quan (σ, t) cần chạy lại. Test pass vì đúng lý do.

### 8.4 `golden_norm_and_energy_conservation` — **KHỚP** (van đã kiểm chứng lại về số)

- E(0) = 5.0 giải tích (⟨T⟩ = σ_p²/2 = 0.25; ⟨V⟩ = (9+0.5)/2 = 4.75) — đo in 5.0000000000 ✓.
- Chuẩn: đo 6.162e-13 @5000 bước, 1.158e-12 @1e4 bước — đúng tuyến tính 1.16e-16/bước như doc; cơ chế "đi bộ làm tròn hệ thống" là thuộc tính đo được (không suy luận được thuần đại số) — ghi nhận mức KHỚP-theo-đo-được, và mức 1e-12@5000 có biên an toàn so với giá trị đo. Van "assert tại 5000, in 1e4 cho hồ sơ" đúng như ledger mô tả.
- Năng lượng dt=1e-5: drift 7e-15·5 ≈ 7e-13 đo được — nhất quán với biên độ dao động O(dt²) của Hamiltonian bóng (shadow Hamiltonian bảo toàn chính xác; E thật dao động quanh nó — phân tích sai lạc ngược là lập luận đúng của comment).

### 8.5 `golden_dt_scaling_order` — **KHỚP**

Mô hình metaplectic: mỗi bước Strang cho HO là xoay pha không gian góc θ = arccos(1−dt²/2) = 2arcsin(dt/2) = dt(1+dt²/24+…) (auditor kiểm: ma trận bước [[1−dt²/2, dt],[−dt(1−dt²/4), 1−dt²/2]] có det 1, vết 2−dt²). Sai số góc tích lũy Δφ = t·dt²/24; tại điểm quay của cos, sai số ⟨x⟩ ≈ |độ dốc|·Δφ = 1.22e-3·1.309e-7 = 1.6e-10 (dt=1e-3) và 4.0e-11 (dt=5e-4) — đo được 1.572e-10 / 3.420e-11, tỉ số 4.596 ∈ (2.5, 5.5) ✓. Tham chiếu 3cos(3.142) (không phải −3) là điều kiện cần để cô lập sai số splitting — luận cứ trong comment đúng (đối chiếu −3 sẽ cho tỉ số ≈ 1.0005).

### 8.6 `golden_boundary_is_periodic` — **KHỚP**

v_g = ħk₀/m = 8; t=3 → khối tâm 24 → wrap về −16. Đo: xác suất trên [−20,−15) = 0.6955, ⟨x⟩ = −15.48 — đúng arrangement (gói σ(t)=√3.25≈1.8 quanh tâm −16).

### 8.7 `golden2d` (5 test) — **KHỚP**, với một comment dự đoán sai (mục 8.8)

- Spreading từng trục: 1.64147630 / 2.53179778 — khớp giải tích tới 1e-13. Luận cứ phản bác giá trị 2.6926 của brief (lỗi bỏ một σ₀) đúng.
- Norm 2D: 4.967e-13 < 3e-12 ✓.
- Quỹ đạo tròn: cả 4 số đo khớp dự đoán metaplectic của test ở 2-3 chữ số có nghĩa: |⟨x⟩(π/2)| đo −1.963e-7 vs 3(π/2)dt²/24 = 1.9605e-7; |⟨y⟩(π)+3| đo −3.749e-7 vs 3dt²/8 = 3.7456e-7; ⟨y⟩(π) đo +3.926e-7 vs 3·Δφ = 3.92e-7 (auditor tái suy luận công thức (3/r)sin(Nθ) — khớp). Việc hạ dt để đáp đúng t = π/2 là cần thiết về toán (lệch đáp 2e-4 × độ dốc ~3 sẽ lấn át gate 1e-6 — luận cứ comment đúng).
- Energy: E(0) = 3.0 đúng giải tích (⟨V⟩ = (4+0.5+0.5)/2 = 2.5, ⟨T⟩ = 0.5); drift 1.2e-12.
- dt order 2D: đo 1.497705e-6 / 3.744273e-7 — công thức nén e = 3/r−3 ≈ 3dt²/8 cho 1.49771e-6 / 3.7443e-7 — khớp tới 6 chữ số; tỉ số 4.0000. Đây là kiểm chứng mạnh nhất rằng bảng pha động học 2D và cấu trúc Strang 2D đúng ký hiệu/trục.

### 8.8 Comment dự đoán `|⟨x⟩(π)+3| ~ 3e-14` vs đo 4.534e-12 — **LỆCH (nhẹ, chỉ comment)**

Suy luận lại: sai số metaplectic tại cực ⟨x⟩ là bậc hai trong Δφ (~2.6e-14) — đúng như comment; nhưng giá trị đo 4.534e-12 bị chi phối bởi sàn làm tròn của tổng moments trên 256² điểm (~1e-12), cao hơn 170×. Comment phát biểu sai mức (bỏ qua sàn làm tròn) dù gate 1e-6 không bị đe dọa (dư 3 bậc độ). **Sửa:** đổi "~3e-14" thành "~3e-14 về mặt splitting, bị che bởi sàn làm tròn ~5e-12 của tổng moments 256² (đo 4.5e-12)". Bằng chứng: `golden2d.rs:341` và dòng in tương ứng.

---

## 9. Các chế độ "sai âm thầm" (charter mục 3)

### 9.1 Wrap biên tuần hoàn — hiện tượng đúng, lời giải thích đúng — **KHỚP**

FFT-based kinetic step áp chính xác động học trên hình xuyến — wrap là tính chất toán học của phương pháp, không phải bug; narration (double-slit / free-packet card: "sóng chạm mép sẽ quay lại từ mép đối diện... không mất đi đâu") mô tả đúng và kèm bảo toàn xác suất. Golden test 6 chốt.

### 9.2 Aliasing gần-Nyquist vs tường mỏng ("<4 cell bị xuyên") — cơ chế **KHỚP**; ngưỡng "4 cell" — **KHÔNG CHỨNG MINH ĐƯỢC**

**Suy luận cơ chế.** Trên lưới, mọi mode Fourier tới Nyquist đều là nghiệm lan truyền của bước động học; mode gần Nyquist mang E_k = ħ²k²/2m tới (π/dx)²/2 ≈ 202 (dx = 40/256) ≫ V₀ = 30 — chúng "bay qua" rào thay vì bị chặn. Tường dày `a` lấy mẫu thành box rời rạc; phổ của nó tại Δk ≈ Nyquist bị triệt tiêu như `sinc(Δk·a/2)`: với a ≈ 4dx, |sinc| ~ 3e-3; với tường 1 cell (Kronecker delta) phổ PHẲNG — mọi Δk nối đều nhau kể cả Nyquist ⇒ biên độ lan sang mode gần-Nyquist rồi truyền qua rào: "bị xuyên" là hệ quả tất yếu. Cơ chế của ghi chú preset (`presets/index.ts:45-47`) là đúng vật lý. **Ngưỡng "4 cell"** là con số kinh nghiệm (cần quét độ dày × đo truyền xuyên giả mới chứng minh được sắc tách) — đặt KCĐB; độ dày ship (0.6 ≈ 3.84 cell) nằm cùng phía an toàn với biên dự phòng lớn.

### 9.3 dt lớn → sai số Strang O(dt²) — **KHỚP** (đã đóng dấu bằng 2 test dt-order và phân tích shadow-Hamiltonian; dt mặc định app 0.005 có sai số splitting ~ (dt²)·V·dt/bước ≈ 1e-4·bước-vész, không nhìn thấy được ở tốc độ phát 1×)

### 9.4 Trôi chuẩn dưới ngưỡng guard tích lũy — **KHỚP** (đo 1.16e-16/bước tuyến tính; 1e4 bước ≈ 1.2e-12, dưới guard từng bước 1e-10 hai bậc độ; được test in ra và tài liệu hóa)

### 9.5 f32 trong `momentum_density`/`serialize` — docs không quá tuyên bố — **KHỚP**

`momentum_density` f32 chỉ để vận chuyển hiển thị (thang hiển thị tự chuẩn hóa theo đỉnh khung); doc nói đúng "f32 for transport economy". `serialize` f32 → load chuẩn hóa lại: kiểm chứng lại luận cứ Ruling 5 bằng ước lượng độc lập — sai số chuẩn bình phương sau round trip f32 ~ std(ε)·√(Σpᵢ²) với ε ~ 6e-8: với ~600 ô có khối ⇒ ~1.4e-9, cùng cấp với "~2e-9" của doc và > guard 1e-10 — chuẩn hóa lại khi load là bắt buộc, như cài đặt.

### 9.6 "Một FFT đúng thay vì gặt giữa Strang" — **KHỚP** (mục 6.4)

---

## 10. Giao diện vật lý giữa các module (charter mục 4)

| Kiểm tra | Kết quả |
|---|---|
| Cùng tích trong: observables dA / measurement trọng số thô trên ô đẳng diện | Nhất quán về mặt toán — mỗi bên đúng bài toán của nó (kỳ vọng liên tục vs phân phối rời rạc); dA triệt tiêu trong tỉ số lấy mẫu. **KHỚP** |
| Cùng quy ước k: `propagator` dùng `fft::k_grid`; `observables::momentum_grid(_2d)` gọi đúng hàm đó và doc khai báo sự trùng khớp | **KHỚP** (`observables.rs:44-46, 170-172`) |
| Ý nghĩa σ: gaussian σ (đơn vị vị trí, là std của \|ψ\|²), σ_inst = 3·dx (vị trí), σ_k = 3·dk (k) | Không tìm thấy chỗ trộn đơn vị; mỗi chỗ dùng đều mang đúng đơn vị và được doc. **KHỚP** |
| ħ/m: wf metadata vs tham số propagator | Không đường ship nào lệch (mục 5.3); core không có hàng rào chặn caller ngoài — ghi nhận cảnh báo. **KHỚP (có cảnh báo)** |

---

## 11. Ranh giới wasm + web hướng vật lý (charter mục 5)

### 11.1 Thứ tự 11 float của `observables()` — **KHỚP**

`wasm/src/lib.rs:505-521` đóng gói đúng thứ tự `[x, y, σx, σy, px, py, σpx, σpy, T, V, E]` của `observables_snapshot_2d`; `protocol.ts:246-260` (`toObservables`) map đúng từng chỉ số; test wasm (`lib.rs:1193-1202`) chốt các chỉ số nhạy cảm (0=x, 2=σx, 4=px, 9=V).

### 11.2 σ_inst = 3·dx, σ_k = 3·dk với dk = 2π/(nx·dx) — **KHỚP**

`lib.rs:83-91, 553, 581-582`: σ_inst mang đơn vị vị trí (nhân dx), σ_k mang đơn vị k (nhân dk của trục x — hạn chế dx≠dy được doc thẳng thắn).

### 11.3 deserialize chuẩn hóa lại (Ruling 5) — **KHỚP** (mục 9.5)

### 11.4 fftshift hiển thị và tuyên bố "k = 0 ở giữa" — **KHỚP**

**Suy luận:** với n chẵn, dịch chuyển `dest[i] = src[(i+n/2) mod n]` đưa bin k=0 vào giữa (kiểm n=4: [0,+1,−2,−1] → [−2,−1,0,+1]) — `fftshift.ts:23-35` đúng; phép dịch là tự nghịch đảo nên `binToScreen` (`markers.ts:103-114`) dùng cùng công thức `(i+n/2) mod n` để ánh xạ bin đo được lên texel hiển thị là đúng (cộng n/2 ≡ trừ n/2 mod n). Worker áp shift trước khi chuyển (`physics.worker.ts:171`) ⇒ caption `view.momentumCaption` ("k = 0 ở giữa" / "k = 0 at the center") đúng với cái hiển thị.

### 11.5 EMA phơi sáng riêng cho momentum view — **KHỚP** (chỉ hiển thị)

`simLoop.ts:112, 230-238, 323`: EMA chỉ normalize tonemap; không đại lượng vật lý nào dẫn xuất từ nó. Tách hai EMA là đúng vì |φ|² sau scale Parseval có thang khác hẳn |ψ|² — nhận xét trong comment đúng.

### 11.6 V-legend "V₀ ≈ {v}" — **LỆCH (nhẹ, lỗi lời văn)**

`{v}` là **max|V|** (`simLoop.ts:32-39 maxAbs` → `store.potentialMax` → `SimCanvas.svelte:62`), còn màu fill của shader tham chiếu **một nửa** giá trị đó (`shaders.ts:150`, `vScale = 0.5·u_potentialMax`). Với các preset, max|V| = V₀ đúng (tường 30/24) nên chip đúng; với cảnh vẽ tay (rào + giếng), "V₀" không được định nghĩa và giá trị là max|V| của cả hai dấu. **Sửa (chọn 1):** đổi nhãn thành `max|V| ≈ {v}` (giữ nguyên logic), hoặc giữ "V₀" nhưng chỉ hiển thị khi thế có một "cao độ đặt tên" duy nhất. Ưu tiên phương án đầu vì rẻ.

### 11.7 Tonemap và tuyên bố "sáng gấp đôi = xác suất gấp đôi" (glossary) — **LỆCH**

Shader: `b = (ρ/ρ_max)^{0.45/contrast}`, contrast mặc định 2.5 ⇒ mũ 0.18 (`shaders.ts:109`, `simStore.svelte.ts:259`). Nhân đôi ρ làm độ sáng hiển thị tăng 2^0.18 ≈ **1.13×** (kể cả contrast = 1 thì 2^0.45 ≈ 1.37×). Mục glossary `density` (`glossary.ts:24-25`) phát biểu "twice as bright means twice the probability density / sáng gấp đôi nghĩa là mật độ xác suất gấp đôi" — sai với chính bộ hiển thị này ở mọi cài đặt. **Sửa:** "Chỗ sáng hơn là nơi khả năng tìm thấy hạt cao hơn" / "Brighter areas are where the particle is more likely to be found" (bỏ định lượng 2×), hoặc nói rõ phép so sánh chỉ đúng trên thang ρ trước tonemap.

---

## 12. Văn bản vật lý hướng người dùng (charter mục 6)

### 12.1 Preset tunneling — **KHỚP**

"E≈18" (k=6 ⇒ E = k²/2 = 18 ✓), "rào cao 24" ✓, "vệt mờ suy giảm theo độ dày" (T ~ e^{−2κa}, κ = √12 ✓), "bên trong rào hàm sóng tắt dần" (evanescent ✓). Hạn chế nhỏ không cần sửa: ~0.3% khối động lượng có E > V₀ (k > 6.93 = k₀+2.8σ_k) — "tunneling proper" vẫn là mô tả đúng.

### 12.2 Preset double-slit — **KHỚP**

Giao thoa của "một hạt với chính nó" ✓; bịt một khe thì vạch mất ✓ (cơ chế giao thoa hai đường đi); hộp tuần hoàn ✓ (9.1).

### 12.3 Preset harmonic — narration "gần như không giãn" — **LỆCH (vừa-nhẹ, user-facing)**

**Định lượng lại (ledger flag).** Preset: σ = 1.2, độ rộng nền của HO = 1/√2 ≈ 0.7071 ⇒ KHÔNG phải coherent state. Với Gaussian tối thiểu-bất-định trong HO, hàm Wigner quay cứng trong mặt phẳng pha: `σ_x(t)² = σ₀²cos²ωt + (1/(2σ₀))²sin²ωt` ⇒ σ dao động giữa **1.2 và 0.4167** — biên độ "thở" 2.9×, chu kỳ π/ω = 3.14 (hai nhịp mỗi chu kỳ quỹ đạo 2π = 6.28; ở tốc độ phát 1× người dùng thấy gói co/phình rõ rệt). Về mặt từ ngữ, "không giãn" ĐÚNG theo nghĩa hẹp (σ(t) ≤ σ₀ luôn — gói không bao giờ rộng hơn lúc thả, không giãn net), nhưng câu "Để ý gói gần như không giãn" hướng người xem tới một hiện tượng tĩnh trong khi cái họ THẤY là co-phình mạnh — câu văn làm người đọc nghi ngờ độ tin cậy. (Phần "quỹ đạo elip" và "đúng dự đoán cổ điển/Ehrenfest" thì đúng tuyệt đối — Ehrenfest chính xác với HO với bất kỳ σ.) **Sửa (chọn 1):**
1. Đổi σ preset → 1/√2 ≈ 0.7071 (coherent state thực: hoàn toàn không thở, narration thành đúng đen trắng; lưu ý presets/index.ts:6-7 tuyên bố "changing a number here is a product decision");
2. Giữ σ = 1.2, đổi narration thành dạng: "Gói không giãn net — nó 'thở' (co rồi phình) vì độ rộng ban đầu khác độ rộng nền của bát thế" (EN tương ứng).

### 12.4 Preset free-packet — narration "đứng yên" — **LỆCH (vừa, user-facing)**

Preset có **k = (3, 2)** (`presets/index.ts:84`, được phẳng qua `simStore.svelte.ts:293` tới `set-gaussian`) ⇒ tốc độ nhóm (kx, ky) = (3,2), |v| = √13 ≈ 3.6 đơn vị/s — gói băng qua hộp 40 trong ~11 s, người dùng thấy nó dời rõ rệt. Teaser "Đứng yên vẫn tự giãn ra" (vi) / "A packet at rest still spreads out" (en) và card 'Gói sóng "ngồi yên"' mô tả một cảnh KHÔNG tồn tại trong scene này. Vật lý cốt lõi (giãn vì bất định động lượng) đúng và không phụ thuộc hệ quy chiếu, nhưng tiền đề "đứng yên" sai về tham số. **Sửa (chọn 1):**
1. Đổi preset `kx: 0, ky: 0` — khi đó narration đúng đen trắng, gói nằm giữa giãn ra và wrap đối xứng (cảnh đẹp hơn cho thông điệp này);
2. Giữ k, đổi narration: bỏ "đứng yên/ngồi yên", thay bằng "Gói sóng tự giãn ra khi bay — không ma chống lại sự giãn ấy, chỉ có bất định động lượng" (EN tương ứng) — dòng wrap-box giữ nguyên.
Cũng lưu ý câu "Để chạy lâu sẽ thấy mật độ phẳng đều": đúng ở khoảng thời gian xem điển hình (σ ~ 10 cần t ≈ 30), nhưng trên hình xuyến có hồi sinh đầy đủ tại t = L²/π ≈ 509 (≈ 8.5 phút phát) — không cần sửa, chỉ ghi nhận để trả lời nếu ai báo "mật độ tự co lại".

### 12.5 Glossary 13 mục — **KHỚP** (12/13), **LỆCH** (mục `density`, xem 11.7)

Từng mục được suy luận lại: Born (|ψ|² xác suất/đơn vị diện tích sau chuẩn hóa ✓), pha (mô tả giáo dục chấp nhận được: pha quay theo thời gian, giao thoa từ lệch pha ✓), chuẩn = 1 ✓, ⟨x⟩/⟨y⟩ hội tụ trung bình đo + quỹ đạo elip preset harmonic ✓ (hệ (6,3) từ (x₀,k_y) = (−6,3) ✓), σ = √phương sai ✓, σx·σpx ≥ ħ/2 ✓, không gian động lượng + k=0 tâm ✓ + Fourier qua lại ✓, E = ⟨T⟩+⟨V⟩ ✓, energyJump: dập vị trí → chập Gaussian dụng cụ với φ ⇒ σ_p TĂNG ⇒ ⟨T⟩ nhảy — đúng cơ chế đã cài đặt (auditor kiểm: tích trong x với Gaussian ⇔ chập trong k với Gaussian) ✓, k: p = ħk ✓, tunneling e^{-2κa}/evanescent ✓, collapse: đo → co quanh kết quả → tiếp tục diễn tiến ✓ (đúng model 7.3).

### 12.6 `obs.energyJumpNote`, caption động lượng, nhãn 'Động lượng |k|' — **KHỚP**

"E có thể nhảy vọt sau phép đo — điều đó đúng vật lý" ✓ (cơ chế ở 12.5). Caption k=0 ✓ (11.4). 'tool.kMag: Động lượng |k|' — trong hệ đơn vị không chiều ħ=1 thì p = k số học bằng nhau; glossary 'k' giải thích p = ħk — chấp nhận được, không sai.

---

## 13. `docs/units.md` — **KHỚP** (một ghi chú nhỏ về tính cũ "1D")

Suy luận lại từng số:
- Tổ hợp không chiều: mL²/(ħT) ✓; T = mL²/ħ ✓.
- ħ = 6.582120e-16 eV·s = 0.658212 eV·fs ✓.
- mₑ = 9.109384e-31 kg = 5.68563 eV·fs²/nm² — kiểm chứng hai cách (kg = E·T²/L² với 1 J = 6.241509e18 eV; và mₑc²/c² với c = 299.792458 nm/fs) — cả hai cho 5.6856 ✓.
- ħ²/(2mₑ) = 0.658212²/(2·5.68563) = 0.038101 eV·nm² ✓ (giá trị giáo trình 3.81 eV·Å²).
- 1 E-unit = ħ²/(mL²) = 76.20 meV ✓; 1 T-unit = mL²/ħ = 8.638 fs ✓.

Ghi chú: câu mở đầu "psiforge-core solves the 1D TDSE" — module giờ ship cả 2D; nên đổi thành "the 1D and 2D TDSE". Không sai về số liệu.

---

## 14. Bảng tổng kết

| Nhóm | Số tuyên bố audit | KHỚP | LỆCH | KCĐB |
|---|---|---|---|---|
| core: fft/grid/wavefunction | 4 | 4 | 0 | 0 |
| core: states | 3 | 3 | 0 | 0 |
| core: potential | 2 | 2 | 0 | 0 |
| core: propagator (gồm luồng ħ/m) | 3 | 3 | 0 | 0 |
| core: observables (gồm T3 tolerance) | 5 | 5 | 0 | 0 |
| core: measurement | 6 | 5 | 1 | 0 |
| Golden + in-module tests | 8 | 7 | 1 | 0 |
| Chế độ sai âm thầm | 7 | 6 | 0 | 1 |
| Giao diện liên module | 4 | 4 | 0 | 0 |
| wasm + web render | 7 | 5 | 2 | 0 |
| i18n preset/glossary/narration | 6 | 4 | 2 | 0 |
| docs/units.md | 1 | 1 | 0 | 0 |
| **Tổng** | **56** | **49** | **6** | **1** |

(Ghi chú: mục glossary `density` bị LỆCH đếm MỘT lần ở nhóm "wasm + web render" — §11.7 đặt nó cạnh tonemap; §12.5 chỉ tham chiếu chéo.)

### Danh sách LỆCH, xếp theo mức nghiêm trọng

1. **[vừa — user-facing sai mô tả cảnh]** free-packet narration "đứng yên / sits still" trong khi preset chạy k=(3,2), |v|≈3.6. Sửa: k=(0,0) hoặc đổi lời (chi tiết §12.4). `web/src/i18n/vi.ts:107-113`, `web/src/i18n/en.ts:107-113`, `web/src/presets/index.ts:84`.
2. **[nhẹ-vừa — user-facing phát biểu sai về bộ hiển thị]** glossary `density` "sáng gấp đôi = mật độ xác suất gấp đôi" sai với tonemap gamma (2×ρ → +13% sáng ở contrast 2.5; +37% ở contrast 1). Sửa: "sáng hơn = xác suất cao hơn" (§11.7). `web/src/i18n/glossary.ts:24-25`, `web/src/render/shaders.ts:109`.
3. **[nhẹ-vừa — user-facing dễ gây nghi ngờ]** harmonic narration "gần như không giãn / barely spreads" trong khi σ(t) thở giữa 1.2 ↔ 0.417 (2.9×, hai nhịp/chu kỳ quỹ đạo). Sửa: σ=1/√2 hoặc narration nói rõ sự "thở" (§12.3). `web/src/i18n/vi.ts:119`, `en.ts:119`, `web/src/presets/index.ts:93`.
4. **[nhẹ — lời văn legend]** "V₀ ≈ {v}" thực tế hiển thị max|V| (và fill tham chiếu nửa giá trị đó). Sửa nhãn thành "max|V| ≈ {v}" (§11.6). `web/src/i18n/{vi,en}.ts:49`, `web/src/ui/SimCanvas.svelte:62`, `web/src/render/simLoop.ts:32-39`.
5. **[nhẹ — doc overclaim]** measurement determinism: `exp` không được IEEE-754 đảm bảo làm tròn đúng; outcome tất định thật, trạng thái hậu đo chỉ tất định tới ulp libm. Sửa câu phát biểu (§7.6). `core/src/measurement.rs:29-37`.
6. **[nhẹ — comment trong test]** dự đoán 3e-14 cho |⟨x⟩(π)+3| bị sàn làm tròn (~5e-12) lấn át; đo 4.534e-12. Sửa comment (§8.8). `core/tests/golden2d.rs:341`.
7. *(gộp trong số trên — docs/units.md "1D" cũ: câu chữ, không sai số liệu, đề cập ở §13 — không lập mục LỆCH riêng vì không sai phát biểu vật lý, chỉ thiếu cập nhật phạm vi.)*

### KCĐB

- Ngưỡng kinh nghiệm "tường ≥ 4 cell thì near-Nyquist không xuyên" — cơ chế aliasing được suy luận đúng (§9.2) nhưng số ngưỡng cần thí nghiệm quét; độ dày ship (3.84 cell) ở phía an toàn.

## 15. Kết luận

Phần lõi vật lý của module — Strang splitting, lưới k fftfreq, chuẩn Riemann trọng số, dạng tỉ số động lượng, Parseval (dA/2π)², mô hình đo Born + dập độ phân giải hữu hạn — **đạt KHỚP trên toàn bộ suy luận độc lập**, và các golden test không chỉ pass mà các giá trị in ra khớp lời giải giải tích tới 2-13 chữ số có nghĩa (mạnh nhất: dt-order 2D khớp công thức nén 3dt²/8 tới 6 chữ số; T3 2D khớp từng chữ số của tổng Riemann độc lập). Cả 6 LỆCH đều ở lớp văn bản/lời văn (narration preset, glossary, legend, doc comment), không có lỗi số học hay cấu trúc nào trong code vật lý. Ba LỆCH user-facing (free-packet "đứng yên", glossary "sáng gấp đôi", harmonic "gần như không giãn") nên được xử lý trước khi đăng Show HN theo đúng mốc của charter.
