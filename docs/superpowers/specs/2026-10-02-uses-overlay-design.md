# Spec: Supercat Uses Overlay ("Phương trình này làm gì cho bạn")

- **Ngày:** 2026-10-02
- **Trạng thái:** thiết kế duyệt qua brainstorm 2026-10-02 (2 section duyệt từng phần: UX + nội dung, kỹ thuật); base = `main` @ bccf978; chờ duyệt spec.
- **Tài liệu tham chiếu:** audit vật lý `docs/superpowers/audits/2026-10-01-wave-dynamics.md` (chuẩn văn phong và độ chính xác của mọi phát biểu vật lý); quy ước `docs/units.md`; quy tắc repo `AGENTS.md` (em dash, i18n parity, testid, runes).

## 1. Mục tiêu & định nghĩa hoàn thành

Thêm vào workspace một phần nội dung giáo dục: **"ứng dụng của phương trình Schrödinger trong thế giới hiện đại, những thứ đang dùng, và tương lai"**, dạng overlay mở theo yêu cầu, hai tầng độ sâu (câu dễ trước, dòng vật lý thật sau), liên kết hai chiều với chính các preset đang có.

**Hoàn thành khi:**

1. Overlay triển khai đúng mục 4-6; 100% `data-testid` hiện có còn nguyên tên và ngữ nghĩa.
2. Cả ba suite web xanh với số lượng chỉ tăng không giảm: vitest, Playwright, `npm run check` (chỉ 2 error `node_modules/esrap` có sẵn), `npm run build`. Không đụng Rust (cargo/wasm-pack không đổi kỳ vọng).
3. i18n vi/en đối xứng hoàn toàn (parity test tự phủ key mới); không có em dash (U+2014) trong bất kỳ chuỗi hay comment nào.
4. Mọi phát biểu vật lý trong copy đối chiếu được với nguồn ở mục 7.
5. Người dùng duyệt bằng mắt (polish pass) trên desktop + mobile fold.

## 2. Phạm vi

**Trong phạm vi:**

- Overlay "Uses" trong nhánh sim của `App.svelte`, mở từ 2 cửa: chip TopBar + link cuối NarrationPanel.
- Component mới `UsesOverlay.svelte`, store mới `usesStore.svelte.ts`, data module `usesData.ts`.
- Key i18n `uses.*` (định nghĩa đầy đủ ở mục 5, đây là nguồn copy duy nhất).
- Test: vitest component + e2e Playwright mới.

**Ngoài phạm vi:**

- Đụng landing (không thêm scroll, không thêm link từ landing; khách chỉ ghé landing không thấy phần này, trade-off đã chốt).
- Worker, protocol, Rust, shader, route contract (không thêm route).
- Preset mới, asset ảnh mới, deep-link tới từng thẻ (overlay luôn mở ở đầu), ghi nhớ trạng thái mở giữa các lần vào.
- Đề xuất treo "thêm giải thích momentum vào narration": vấn đề riêng, không gộp.

## 3. Quyết định chốt trong brainstorm

| # | Quyết định |
|---|---|
| D1 | Vị trí: panel mở theo yêu cầu trong workspace (overlay), không phải section cuộn dưới landing (landing giữ nguyên theater một màn hình) |
| D2 | Độ sâu: hai tầng, đoạn dễ cho người tò mò + một dòng "VẬT LÝ" kỹ hơn cho người học |
| D3 | Hình thức: hybrid, chip TopBar + dòng hook cuối NarrationPanel cùng mở một overlay; overlay là modal dialog phủ bench, mô phỏng vẫn chạy phía sau |
| D4 | Chip "Xem thử" chỉ ở thẻ có preset trung thực minh họa hiện tượng (5/8 thẻ); không gượng nối |
| D5 | Copy nằm 100% trong i18n (`uses.*`), cấu trúc thẻ (id, nhóm, preset liên kết) nằm trong `usesData.ts` thuần TypeScript |
| D6 | Không dependency mới: focus trap, Esc, animation tự viết (pattern Landing) |
| D7 | Overlay không gửi message nào tới worker; sim chạy tiếp phía sau |

## 4. UX

### 4.1. Hai cửa vào

1. **TopBar:** chip mono cạnh nút ngôn ngữ, style trùng chip `.lang` hiện có. Nhãn `uses.open` = "Uses" / "Ứng dụng". `data-testid="uses-open"`.
2. **NarrationPanel:** dòng link ghost sau dòng cuối của thẻ BRIEFING, style ghost như nút "Thu gọn" (không viền, `text-3`, hover `text-1`). Nhãn `uses.hook` = "This equation out in the world →" / "Phương trình này ngoài kia →". `data-testid="uses-hook"`. Chỉ hiện khi panel đang mở (dạng thu gọn ⓘ không thêm gì).

### 4.2. Overlay

- Modal phủ toàn bench: nền tối `rgba(9, 12, 17, 0.72)` (cùng họ màu scrim landing), panel `--bg-1` viền `--line-strong`, radius 12px, rộng `min(560px, calc(100vw − 32px))`, cao tối đa `min(86dvh, 720px)`, **cuộn nội dung trong panel**. Mô phỏng vẫn chạy và thấy mờ phía sau.
- Vào bằng fade + translateY(8px) 200ms, chỉ transform/opacity; tắt hoàn toàn dưới `prefers-reduced-motion: reduce` (pattern ruling 3/4 của landing).
- Đóng: nút X góc phải panel (`uses-close`), phím Esc, click nền tối. Bấm chip `uses-open` khi đang mở: no-op.
- Cấu trúc trong panel: heading `h2` (`uses-title`, id để `aria-labelledby`) + intro 1 đoạn + nhóm "IN USE TODAY / ĐANG DÙNG HÔM NAY" (6 thẻ) + nhóm "TOMORROW / TƯƠNG LAI" (2 thẻ).

### 4.3. Giải phẫu thẻ

- Tiêu đề (đậm, 13px).
- Đoạn dễ (`uses.<id>.easy`): 2-3 câu, chữ thường, `text-2`.
- Dòng VẬT LÝ: micro label mono `PHYSICS` / `VẬT LÝ` + dòng mono 10px `text-3` (`uses.<id>.physics`).
- Chip "Xem thử" (nếu có): link màu accent `uses.watch` = "See it: {name} →" / "Xem thử: {name} →" với `{name}` là tên preset đã localize; bấm thì `location.hash = '#/sim/<preset>'` và đóng overlay. `data-testid="uses-watch-<id>"`.
- Cả thẻ bọc trong `data-testid="uses-card-<id>"`.

### 4.4. Bản đồ "Xem thử" (chỉ 5 thẻ)

| Thẻ | Preset | Lý do trung thực |
|---|---|---|
| flash | tunneling | Electron xuyên rào chắn: đúng hiện tượng ghi dữ liệu |
| stm | tunneling | Dòng tunneling chính là tín hiệu STM đo |
| chips | sandbox | Vẽ một giếng thế trong Free play: mô phỏng quantum well |
| sun | tunneling | Xuyên hầm hệ số Gamow: cùng cơ chế hợp hạch và phân rã alpha |
| qcompute | double-slit | Một hạt chồng chập hai đường: đúng nền tảng qubit |

GPS, hóa học tính toán, truyền tin/cảm biến lượng tử: không có preset trung thực, không có chip.

## 5. Copy song ngữ đầy đủ (nguồn duy nhất, chép vào i18n khi implement)

### 5.1. Chuỗi UI

| Key | en | vi |
|---|---|---|
| `uses.open` | Uses | Ứng dụng |
| `uses.hook` | This equation out in the world → | Phương trình này ngoài kia → |
| `uses.title` | What this equation does for you | Phương trình này làm gì cho bạn |
| `uses.intro` | Schrödinger's equation is not locked in a lab. It runs in your pocket, keeps GPS on time, and is busy building tomorrow's machines. | Phương trình Schrödinger không nằm mãi trong phòng thí nghiệm. Nó chạy trong túi bạn, giữ GPS đúng giờ, và đang dựng những cỗ máy của ngày mai. |
| `uses.groupToday` | IN USE TODAY | ĐANG DÙNG HÔM NAY |
| `uses.groupTomorrow` | TOMORROW | TƯƠNG LAI |
| `uses.physicsLabel` | PHYSICS | VẬT LÝ |
| `uses.watch` | See it: {name} → | Xem thử: {name} → |
| `uses.close` | Close | Đóng |

### 5.2. Tám thẻ

**flash (today, watch: tunneling)**

| Key | en | vi |
|---|---|---|
| `uses.flash.title` | Flash memory | Bộ nhớ flash |
| `uses.flash.easy` | Every photo you save on a phone, SSD or memory card is written by tunneling: electrons slip through an insulating oxide layer onto a floating gate, and stay there for years. | Mỗi tấm ảnh bạn lưu trên điện thoại, SSD hay thẻ nhớ đều được ghi bằng xuyên hầm: electron lọt qua lớp oxit cách điện, đỗ lên cổng nổi và nằm đó nhiều năm. |
| `uses.flash.physics` | Fowler-Nordheim tunneling: the write current rides the same tail you see behind the barrier, ~ e^(−2κd). | Fowler-Nordheim: dòng ghi đi qua đúng cái đuôi mờ sau rào chắn, ~ e^(−2κd). |

**stm (today, watch: tunneling)**

| Key | en | vi |
|---|---|---|
| `uses.stm.title` | Scanning tunneling microscope | Kính hiển vi quét tunneling |
| `uses.stm.easy` | The STM maps surfaces atom by atom. The tunneling current between its tip and the surface decays so steeply with distance that a shift of 0.1 nm changes the signal roughly tenfold. | STM vẽ bề mặt từng nguyên tử một. Dòng tunneling giữa mũi dò và bề mặt giảm dốc theo khoảng cách: chỉ dịch 0,1 nm là tín hiệu đổi chừng mười lần. |
| `uses.stm.physics` | I ∝ e^(−2κz): exponential sensitivity turns a distance probe into an atom viewer. | I ∝ e^(−2κz): độ nhạy theo hàm mũ biến thước đo khoảng cách thành kính soi nguyên tử. |

**chips (today, watch: sandbox)**

| Key | en | vi |
|---|---|---|
| `uses.chips.title` | Chips, LEDs, lasers | Chip, LED, laser |
| `uses.chips.easy` | Solving the equation for electrons in a crystal lattice yields energy bands with forbidden gaps. Transistors switch by band design, an LED's color is a chosen gap, a laser amplifies a chosen transition. | Giải phương trình cho electron trong mạng tinh thể ra các dải năng lượng xen khoảng cấm. Transistor đóng mở nhờ thiết kế dải, màu LED là một khoảng cấm được chọn, laser khuếch đại đúng một bước chuyển được chọn. |
| `uses.chips.physics` | Bloch theorem: a periodic V(x) produces band structure; the gap sets the photon energy, ħω = E_gap. | Định lý Bloch: V(x) tuần hoàn cho cấu trúc dải; khoảng cấm định năng lượng photon, ħω = E_gap. |

**gps (today, không watch)**

| Key | en | vi |
|---|---|---|
| `uses.gps.title` | Atomic clocks and GPS | Đồng hồ nguyên tử và GPS |
| `uses.gps.easy` | The second itself is defined by a quantum jump between two energy levels of the cesium atom. GPS satellites carry such clocks; without them your position would drift by kilometers each day. | Chính đơn vị giây được định nghĩa bằng một bước nhảy lượng tử giữa hai mức năng lượng của nguyên tử cesi. Vệ tinh GPS mang theo những đồng hồ đó; thiếu chúng, vị trí của bạn sẽ trôi hàng cây số mỗi ngày. |
| `uses.gps.physics` | 1 s = 9 192 631 770 cycles of the Cs-133 hyperfine ground-state transition. | 1 giây = 9 192 631 770 chu kỳ của bước chuyển siêu tinh tế giữa hai mức nền của Cs-133. |

**chemistry (today, không watch)**

| Key | en | vi |
|---|---|---|
| `uses.chemistry.title` | Computational chemistry | Hóa học tính toán |
| `uses.chemistry.easy` | Most of computational chemistry is this equation solved approximately for electrons in molecules: screening drug candidates and designing materials before any lab work begins. | Phần lớn hóa học tính toán là giải gần đúng chính phương trình này cho electron trong phân tử: sàng lọc ứng viên thuốc và thiết kế vật liệu trước khi phòng thí nghiệm bắt đầu. |
| `uses.chemistry.physics` | Density functional theory (Nobel Prize in Chemistry 1998) makes approximate solutions cheap enough to run at scale. | Lý thuyết phi hàm mật độ DFT (Nobel Hóa học 1998) làm lời giải gần đủ rẻ để chạy đại trà. |

**sun (today, watch: tunneling)**

| Key | en | vi |
|---|---|---|
| `uses.sun.title` | The sun and radioactivity | Mặt Trời và phóng xạ |
| `uses.sun.easy` | The sun shines because protons tunnel through their mutual electric repulsion to fuse; the core is not hot enough to cross that barrier classically. Alpha particles escape unstable nuclei the same way. | Mặt Trời sáng vì proton xuyên hầm qua lực đẩy điện cùng dấu để hợp hạch; lõi Mặt Trời chưa đủ nóng để vượt rào theo vật lý cổ điển. Hạt alpha thoát khỏi hạt nhân không bền cũng bằng con đường đó. |
| `uses.sun.physics` | Gamow factor: fusion and alpha-decay rates lie inside e^(−2κd), exponentially sensitive to barrier width and height. | Hệ số Gamow: tốc độ hợp hạch và phân rã alpha nằm trong e^(−2κd), nhạy theo hàm mũ với bề rộng và độ cao rào. |

**qcompute (tomorrow, watch: double-slit)**

| Key | en | vi |
|---|---|---|
| `uses.qcompute.title` | Quantum computers | Máy tính lượng tử |
| `uses.qcompute.easy` | A qubit carries a wavefunction, and every gate is unitary evolution: a quantum computer runs this equation as its law of motion. Results are read out with the same Born rule this sandbox uses to measure. | Qubit mang một hàm sóng, và mỗi cổng lượng tử là một bước tiến hóa unita: máy tính lượng tử vận hành theo đúng phương trình này như định luật chuyển động của nó. Kết quả được đọc bằng đúng quy tắc Born mà sandbox này dùng để đo. |
| `uses.qcompute.physics` | Superposition plus interference: the double slit, scaled up into circuits. | Chồng chập cộng giao thoa: khe đôi được mở rộng thành mạch. |

**qsensing (tomorrow, không watch)**

| Key | en | vi |
|---|---|---|
| `uses.qsensing.title` | Quantum communication and sensing | Truyền tin và cảm biến lượng tử |
| `uses.qsensing.easy` | Quantum key distribution catches eavesdroppers because measuring disturbs the state. Matter-wave sensors turn interference into measurements of gravity and magnetic fields beyond classical limits. | Phân phối khóa lượng tử bắt được người nghe lén vì phép đo làm xáo trộn trạng thái. Cảm biến sóng vật chất biến giao thoa thành phép đo trọng trường và từ trường vượt giới hạn cổ điển. |
| `uses.qsensing.physics` | Security from the measurement postulate; sensitivity from interference between superposed paths. | An toàn đến từ tiên đề về phép đo; độ nhạy đến từ giao thoa giữa các đường chồng chập. |

## 6. Kỹ thuật

### 6.1. File mới

**`web/src/sim/usesStore.svelte.ts`** (pattern `modeStore`):

```ts
class UsesStore {
  open = $state(false)
  #opener: HTMLElement | null = null
  openFrom(el: HTMLElement) { this.#opener = el; this.open = true }
  close() { this.open = false }
  /** Overlay đọc một lần lúc destroy để trả focus; null nếu opener đã unmount. */
  get opener(): HTMLElement | null { return this.#opener }
}
export const usesStore = new UsesStore()
```

**`web/src/ui/usesData.ts`:**

```ts
import type { PresetId } from '../presets/index.js'
export type UsesCardId = 'flash' | 'stm' | 'chips' | 'gps' | 'chemistry' | 'sun' | 'qcompute' | 'qsensing'
export type UsesGroup = 'today' | 'tomorrow'
export interface UsesCard { id: UsesCardId; group: UsesGroup; watch?: PresetId }
export const USES_CARDS: UsesCard[] = [
  { id: 'flash', group: 'today', watch: 'tunneling' },
  { id: 'stm', group: 'today', watch: 'tunneling' },
  { id: 'chips', group: 'today', watch: 'sandbox' },
  { id: 'gps', group: 'today' },
  { id: 'chemistry', group: 'today' },
  { id: 'sun', group: 'today', watch: 'tunneling' },
  { id: 'qcompute', group: 'tomorrow', watch: 'double-slit' },
  { id: 'qsensing', group: 'tomorrow' },
]
```

**`web/src/ui/UsesOverlay.svelte`:** render khi `usesStore.open` (App điều kiện `{#if}`; không render ẩn). Nội bộ: lang-mirror pattern (subscribe cleanup) để đổi ngôn ngữ lúc mở vẫn dịch lại; `svelte:window onkeydown` cho Esc và bẫy Tab (cycle focusable trong panel); mount focus nút đóng; destroy focus `usesStore.opener` (guard null); backdrop là sibling của panel, click đóng; chip "Xem thử" là `<a href="#/sim/<preset>">` + onclick gọi `usesStore.close()`, để hashchange drive route như mọi navigation của app.

### 6.2. File sửa

- `TopBar.svelte`: thêm chip `uses-open` (style `.lang`), `onclick={() => usesStore.openFrom(btnEl)}`.
- `NarrationPanel.svelte`: thêm link ghost `uses-hook` sau `{#each lines}`.
- `App.svelte`: `{#if usesStore.open}<UsesOverlay />{/if}` trong `<main>` của nhánh sim (WebGL đã gate ở nhánh này), sau khối bench/error, cùng cấp ErrorBanner; không phụ thuộc `renderError` (TopBar vẫn hiện khi lỗi render, overlay vẫn mở được).
- `i18n/en.ts`, `i18n/vi.ts`: thêm 9 key UI + 24 key thẻ (mục 5), giữ nguyên bộ key cũ; parity test tự bắt thiếu lệch.

### 6.3. A11y

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` trỏ heading `h2`.
- Esc đóng; Tab/Shift+Tab cycle trong panel (tự viết, không thư viện).
- Focus: mount vào nút đóng; destroy trả về opener (nếu còn trong DOM).
- Đổi ngôn ngữ đang mở: re-translate qua lang mirror (không cần đóng mở lại).
- Nền tối là sibling click-target, panel `role="dialog"` không nhận click-out.

### 6.4. Responsive

- Desktop: panel giữa màn hình 560px.
- <768px (mobile fold, trang cuộn): overlay `position: fixed; inset: 0` nên vẫn hoạt động; panel `calc(100vw − 32px)`, cuộn trong panel.

### 6.5. Biên

- Mở rồi bấm chip TopBar lần nữa: no-op (store đã open).
- Chip "Xem thử" đổi hash sang preset: route effect của App destroy/init worker như thường; overlay đóng trước (close() chạy trong onclick, trước hashchange).
- Đi landing khi overlay mở (back-link): overlay unmount theo route; cleanup unsub listener; focus trả về element có thể đã unmount: guard null, bỏ qua.
- NarrationPanel thu gọn (ⓘ): không có hook (chỉ panel mở mới có).

## 7. Kiểm chứng vật lý (checklist đối chiếu khi implement + review)

| Phát biểu | Nguồn chuẩn |
|---|---|
| Flash ghi bằng Fowler-Nordheim tunneling, dòng ~ e^(−2κd) | Lý thuyết field emission chuẩn; κ = √(2mΦ)/ħ |
| STM: I ∝ e^(−2κz), ~1 thập phân / 0,1 nm với Φ ≈ 4-5 eV | Tersoff-Hamann; giáo trình STM |
| Bloch: V tuần hoàn cho band, ħω = E_gap cho photon LED | Giáo trình vật lý chất rắn |
| 1 s = 9 192 631 770 chu kỳ Cs-133 hyperfine | Định nghĩa SI giây (CGPM 1967) |
| GPS trôi km/ngày không có đồng hồ nguyên tử + hiệu tương đối | Tài liệu GPS chuẩn (khoảng 10 km/ngày) |
| DFT Nobel Hóa 1998 (Kohn) | Nobel Prize 1998 |
| Hợp hạch Mặt Trời + alpha decay nhờ tunneling (Gamow) | Gamow 1928; lõi ~1,5×10⁷ K, kT ~ 1,3 keV, rào Coulomb ~ MeV: cổ điển không vượt nổi |
| Qubit: cổng = unitary, đọc = Born | Chuẩn information lượng tử |

Văn phong: theo audit 2026-10-01, chỉ phát biểu thứ kiểm chứng được; không phóng đại ("vận hành theo đúng phương trình" thay vì "chạy bằng Schrödinger" tuyệt đối hóa).

## 8. Test (TDD pin-first)

### 8.1. Vitest (jsdom)

File `web/tests/usesOverlay.test.ts` + mở rộng test TopBar/NarrationPanel hiện có:

1. `usesData`: 8 thẻ; today 6, tomorrow 2; watch đúng 5 thẻ với đúng preset (flash/stm/sun = tunneling, chips = sandbox, qcompute = double-slit).
2. Overlay đóng: không render khi `usesStore.open = false`.
3. Overlay mở: có `role="dialog"`, heading đúng, đủ 8 `uses-card-*`, nhãn 2 nhóm, chip watch chỉ ở 5 thẻ đúng, 3 thẻ còn lại không có.
4. Esc: sau keydown Escape, `usesStore.open` false và overlay biến mất khỏi DOM.
5. Chip "Xem thử": click set `location.hash = '#/sim/tunneling'` và store đóng.
6. Đổi ngôn ngữ: `setLang` flip, tiêu đề re-translate trong DOM.
7. TopBar: click `uses-open` mở store. NarrationPanel: mở panel trước (click `preset-info`; jsdom innerHeight < 800 nên panel khởi động thu gọn), thấy `uses-hook`, click mở store.

### 8.2. E2e (Playwright, en-US)

Spec mới (cùng thư mục spec e2e hiện có), testid + copy tiếng Anh:

1. Vào `#/sim/double-slit`, click `uses-open`: `uses-overlay` hiện, heading "What this equation does for you", thẻ `uses-card-flash` có "Flash memory".
2. Esc: overlay biến mất.
3. Click `preset-info` (ⓘ) để mở BRIEFING (viewport mặc định 720px cao nên panel khởi động thu gọn), rồi click `uses-hook`: overlay hiện lại.
4. Click `uses-watch-flash`: URL `#/sim/tunneling`, overlay biến mất, `preset-card` của tunneling hiện.

### 8.3. Cổng local trước khi kết thúc

`npm run test` + `npm run test:e2e` + `npm run check` + `npm run build`, tất cả xanh; số test chỉ tăng; không diagnostic project-code mới từ svelte-check (2 error esrap trong node_modules là có sẵn).

## 9. Checklist implement (tóm tắt thứ tự)

1. Viết test failing (usesData, overlay, topbar hook, narration hook).
2. `usesData.ts` + key i18n hai file (chép đúng mục 5).
3. `usesStore.svelte.ts`.
4. `UsesOverlay.svelte` + render trong App.
5. Chip TopBar + hook NarrationPanel.
6. E2e spec mới; chạy full gate.
