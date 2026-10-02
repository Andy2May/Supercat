# Uses Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm overlay "Uses" vào workspace Supercat: 8 thẻ ứng dụng của phương trình Schrödinger (hiện tại + tương lai), hai tầng độ sâu, chip "Xem thử" trung thực nối sang preset.

**Architecture:** Overlay modal mở theo yêu cầu từ 2 cửa (chip TopBar + hook cuối NarrationPanel), state trong store runes mini `usesStore`; cấu trúc thẻ là data thuần `usesData.ts`; copy 100% trong i18n `uses.*`. Không đụng worker/protocol/route/shader.

**Tech Stack:** Svelte 5 runes + TypeScript; vitest (jsdom, @testing-library/svelte) + Playwright (en-US).

**Spec:** `docs/superpowers/specs/2026-10-02-uses-overlay-design.md`. Plan lập luận từ spec: copy chuỗi lấy NGUYÊN VĂN từ spec mục 5; cấu trúc `usesData` + `usesStore` đúng spec mục 6.1; bản đồ "Xem thử" spec mục 4.4. Đọc cả hai trước khi bắt đầu.

## Global Constraints

- Mọi lệnh chạy trong `web/` (Rust không đụng, cargo/wasm-pack không chạy).
- **KHÔNG em dash (U+2014)** trong bất kỳ chuỗi i18n, comment, test, commit message nào.
- i18n: `vi.ts`/`en.ts` cùng bộ key; copy chép **nguyên văn** spec mục 5 (giữ `→`, dấu trừ `−`, khoảng trắng trong `9 192 631 770`).
- E2e chỉ assert testid + copy tiếng Anh (Playwright boot en-US).
- Không npm dependency mới; không sửa `protocol.ts`, `physics.worker.ts`, `route.ts`, `shaders.ts`, `core/`, `wasm/`.
- 100% `data-testid` hiện có giữ nguyên tên + ngữ nghĩa; số lượng test mỗi suite chỉ tăng.
- Svelte 5 runes; re-translate qua lang-mirror pattern (subscribe trong `$effect`, return cleanup).
- Màu qua CSS token (`--bg-1`, `--line-strong`, `--text-1/2/3`, `--accent`); ngoại lệ duy nhất: nền backdrop `rgba(9, 12, 17, 0.72)` theo spec 4.2.
- `prefers-reduced-motion: reduce` tắt animation vào của overlay.
- Commit theo conventional commits, chỉ add đúng file của task; **không bao giờ** `git add` file ở repo root (Cat_Meme.png là file cá nhân của user).

## Review Focus

Năm lớp lỗi spec ngụ ý nhưng không có task test nào đụng, kèm test pin về task sở hữu:

1. **Key drift** giữa id trong `usesData.ts` và key i18n (`uses.<id>.*`): typo im lặng render ra chính chuỗi key (fallback của `t`). Pin: Task 1 test 3 quét cả hai dictionary cho đủ 9 key UI + 3 key/thẻ.
2. **Focus lạc** sau khi đóng overlay (keyboard user bị bỏ lại trên body) hoặc Tab thoát ra nền. Pin: Task 3 test 6 (wrap Tab) + test 7 (unmount trả focus opener).
3. **Overlay còn dính** sau khi chip "Xem thử" đổi hash (đè lên cảnh mới). Pin: Task 3 test 5 (store đóng sau click) + Task 5 e2e 2 (overlay count 0 sau khi URL đổi).
4. **Copy stale** khi đổi ngôn ngữ lúc overlay đang mở. Pin: Task 3 test 8 (flip `setLang('vi')` + tick, heading đổi).
5. **Hook xuất hiện ở chỗ sai / mở chồng**: hook trên stub ⓘ thu gọn, hoặc `openFrom` hai lần làm mất focus gốc. Pin: Task 4 test 2 (absent khi thu gọn) + Task 2 test 4 (mở lần nữa: vẫn open, opener = element mới nhất).

---

### Task 1: Data thẻ + copy i18n

**Files:**
- Create: `web/src/ui/usesData.ts`
- Modify: `web/src/i18n/en.ts`, `web/src/i18n/vi.ts`
- Test: `web/tests/usesData.test.ts`

**Interfaces:**
- Consumes: `PresetId` từ `web/src/presets/index.ts`.
- Produces: `USES_CARDS: UsesCard[]`, `type UsesCardId`, `type UsesGroup`, `interface UsesCard { id: UsesCardId; group: UsesGroup; watch?: PresetId }` (đúng spec 6.1); bộ key `uses.*` trong cả hai dictionary.

- [ ] **Step 1: Viết test fail**

```ts
import { describe, expect, it } from 'vitest'

import { USES_CARDS } from '../src/ui/usesData.js'
import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

describe('USES_CARDS', () => {
  it('carries 8 cards in registry order: 6 today then 2 tomorrow', () => {
    expect(USES_CARDS.map((c) => c.id)).toEqual([
      'flash', 'stm', 'chips', 'gps', 'chemistry', 'sun', 'qcompute', 'qsensing',
    ])
    expect(USES_CARDS.filter((c) => c.group === 'today')).toHaveLength(6)
    expect(USES_CARDS.filter((c) => c.group === 'tomorrow')).toHaveLength(2)
  })

  it('gives exactly 5 cards a watch preset, with the honest map (spec 4.4)', () => {
    expect(
      USES_CARDS.filter((c) => c.watch !== undefined).map((c) => [c.id, c.watch]),
    ).toEqual([
      ['flash', 'tunneling'],
      ['stm', 'tunneling'],
      ['chips', 'sandbox'],
      ['sun', 'tunneling'],
      ['qcompute', 'double-slit'],
    ])
  })

  it('has every uses.* key in BOTH dictionaries (9 UI keys + 3 per card)', () => {
    const uiKeys = [
      'uses.open', 'uses.hook', 'uses.title', 'uses.intro',
      'uses.groupToday', 'uses.groupTomorrow', 'uses.physicsLabel',
      'uses.watch', 'uses.close',
    ]
    for (const dict of [en, vi]) {
      for (const key of uiKeys) expect(dict[key], `${dict === en ? 'en' : 'vi'} ${key}`).toBeDefined()
      for (const card of USES_CARDS)
        for (const part of ['title', 'easy', 'physics'])
          expect(dict[`uses.${card.id}.${part}`]).toBeDefined()
    }
  })

  it('parameterizes the watch template on {name}', () => {
    expect(en['uses.watch']).toContain('{name}')
    expect(vi['uses.watch']).toContain('{name}')
  })
})
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npx vitest run tests/usesData.test.ts` (trong `web/`)
Expected: FAIL, lỗi resolve module `../src/ui/usesData.js`.

- [ ] **Step 3: Tạo `usesData.ts` đúng nguyên văn spec 6.1**

Nội dung là code block trong spec (import `PresetId` từ `'../presets/index.js'`; 8 dòng card đúng thứ tự test pin).

- [ ] **Step 4: Thêm block key `uses.*` vào cuối cả hai dictionary**

Chép nguyên văn bảng spec mục 5.1 (9 key UI) + 5.2 (24 key thẻ) vào `en.ts` và `vi.ts`, kèm comment header mô tả nhóm theo style comment có sẵn trong file (kiểu block `// V-overlay legend (...)`). Không đổi key cũ.

- [ ] **Step 5: Chạy test xác nhận pass (kèm parity)**

Run: `npx vitest run tests/usesData.test.ts tests/i18n.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/usesData.ts web/src/i18n/en.ts web/src/i18n/vi.ts web/tests/usesData.test.ts
git commit -m "feat(web): uses card data + bilingual copy"
```

---

### Task 2: usesStore

**Files:**
- Create: `web/src/sim/usesStore.svelte.ts`
- Test: `web/tests/usesStore.test.ts`

**Interfaces:**
- Produces: `usesStore: UsesStore` (instance duy nhất); class `UsesStore` với `open: boolean` ($state), `openFrom(el: HTMLElement): void`, `close(): void`, `get opener(): HTMLElement | null`. Tasks 3-4 dùng đúng các tên này.

- [ ] **Step 1: Viết test fail**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { usesStore } from '../src/sim/usesStore.svelte.js'

beforeEach(() => {
  usesStore.close()
})

describe('usesStore', () => {
  it('starts closed', () => {
    expect(usesStore.open).toBe(false)
  })

  it('openFrom(el) opens and records the opener', () => {
    const el = document.createElement('button')
    usesStore.openFrom(el)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(el)
  })

  it('close() clears open; opener stays readable for the overlay destroy hook', () => {
    const el = document.createElement('button')
    usesStore.openFrom(el)
    usesStore.close()
    expect(usesStore.open).toBe(false)
    expect(usesStore.opener).toBe(el)
  })

  it('openFrom while already open: stays open, opener = the latest element', () => {
    const first = document.createElement('button')
    const second = document.createElement('button')
    usesStore.openFrom(first)
    usesStore.openFrom(second)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(second)
  })
})
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npx vitest run tests/usesStore.test.ts`
Expected: FAIL, cannot resolve `usesStore.svelte.js`.

- [ ] **Step 3: Implement đúng nguyên văn spec 6.1**

Class `UsesStore` với `#opener` private, `$state open`; export instance `usesStore`. Không localStorage, không persistence.

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `npx vitest run tests/usesStore.test.ts`
Expected: PASS 4 test.

- [ ] **Step 5: Commit**

```bash
git add web/src/sim/usesStore.svelte.ts web/tests/usesStore.test.ts
git commit -m "feat(web): usesStore open/close with focus origin"
```

---

### Task 3: Component UsesOverlay + mount trong App

**Files:**
- Create: `web/src/ui/UsesOverlay.svelte`
- Modify: `web/src/App.svelte` (render `{#if usesStore.open}`)
- Test: `web/tests/usesOverlay.test.ts`

**Interfaces:**
- Consumes: `USES_CARDS` (Task 1), `usesStore` (Task 2), `t`/`lang`/`getLang` từ i18n, `PresetId` titles qua `t('preset.<id>.title')`.
- Produces: component default export; testid contract cho Task 5: `uses-overlay` (panel), `uses-backdrop`, `uses-close`, `uses-card-<id>`, `uses-watch-<id>`.

**DOM order pin (Tab test phụ thuộc):** trong panel, thứ tự focusable là `uses-close` trước tiên, sau đó các anchor watch theo thứ tự card: flash, stm, chips, sun (nhóm today), qcompute (nhóm tomorrow). Heading `h2` mang `id="uses-title-heading"`.

- [ ] **Step 1: Viết test fail**

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import UsesOverlay from '../src/ui/UsesOverlay.svelte'
import { usesStore } from '../src/sim/usesStore.svelte.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'
import { USES_CARDS } from '../src/ui/usesData.js'

beforeEach(() => {
  setLang('en')
  location.hash = ''
})

afterEach(() => {
  cleanup()
  usesStore.close()
  setLang(getLang() === 'vi' ? 'en' : getLang())
  location.hash = ''
})

describe('UsesOverlay structure', () => {
  it('renders a labelled modal dialog with heading, intro and both group labels', () => {
    render(UsesOverlay)

    const dialog = screen.getByTestId('uses-overlay')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('uses-title-heading')
    expect(screen.getByText(enDict['uses.title']).id).toBe('uses-title-heading')
    expect(screen.getByText(enDict['uses.intro'])).toBeTruthy()
    expect(screen.getByText(enDict['uses.groupToday'])).toBeTruthy()
    expect(screen.getByText(enDict['uses.groupTomorrow'])).toBeTruthy()
  })

  it('renders all 8 cards, each with title, easy copy, physics line and label', () => {
    const { container } = render(UsesOverlay)

    for (const card of USES_CARDS) {
      const el = screen.getByTestId(`uses-card-${card.id}`)
      expect(el.textContent).toContain(enDict[`uses.${card.id}.title`])
      expect(el.textContent).toContain(enDict[`uses.${card.id}.easy`])
      expect(el.textContent).toContain(enDict[`uses.${card.id}.physics`])
    }
    expect(container.textContent).toContain(enDict['uses.physicsLabel'])
  })
})

describe('UsesOverlay watch chips', () => {
  it('renders chips on exactly the 5 honest cards, with the right href and label', () => {
    render(UsesOverlay)

    for (const card of USES_CARDS.filter((c) => c.watch !== undefined)) {
      const chip = screen.getByTestId(`uses-watch-${card.id}`) as HTMLAnchorElement
      expect(chip.tagName).toBe('A')
      expect(chip.getAttribute('href')).toBe(`#/sim/${card.watch}`)
      expect(chip.textContent).toBe(
        enDict['uses.watch'].replace('{name}', enDict[`preset.${card.watch}.title`]),
      )
    }
    expect(screen.queryByTestId('uses-watch-gps')).toBeNull()
    expect(screen.queryByTestId('uses-watch-chemistry')).toBeNull()
    expect(screen.queryByTestId('uses-watch-qsensing')).toBeNull()
  })
})

describe('UsesOverlay close paths', () => {
  it('Escape keydown and backdrop click both close the store', () => {
    render(UsesOverlay)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(usesStore.open).toBe(false)

    cleanup()
    render(UsesOverlay)
    fireEvent.click(screen.getByTestId('uses-backdrop'))
    expect(usesStore.open).toBe(false)
  })

  it('clicking a watch chip navigates the hash AND closes the store', () => {
    render(UsesOverlay)
    fireEvent.click(screen.getByTestId('uses-watch-flash'))
    expect(location.hash).toBe('#/sim/tunneling')
    expect(usesStore.open).toBe(false)
  })
})

describe('UsesOverlay focus management', () => {
  it('mounts focused on the close button; Shift+Tab wraps to the last focusable', () => {
    render(UsesOverlay)
    expect(document.activeElement).toBe(screen.getByTestId('uses-close'))

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('uses-watch-qcompute'))
  })

  it('unmount restores focus to the recorded opener', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    usesStore.openFrom(opener)

    const view = render(UsesOverlay)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('UsesOverlay translations', () => {
  it('re-translates the heading and copy when the language flips while open', async () => {
    render(UsesOverlay)
    expect(screen.getByText(enDict['uses.title'])).toBeTruthy()

    setLang('vi')
    await tick()

    expect(screen.getByText(viDict['uses.title'])).toBeTruthy()
    expect(screen.queryByText(enDict['uses.title'])).toBeNull()
    expect(screen.getByTestId('uses-card-flash').textContent).toContain(
      viDict['uses.flash.title'],
    )
  })
})
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `npx vitest run tests/usesOverlay.test.ts`
Expected: FAIL, cannot resolve `UsesOverlay.svelte`.

- [ ] **Step 3: Implement `UsesOverlay.svelte`**

Không props. Yêu cầu: lang-mirror pattern với cleanup; `{#if usesStore.open}` không nằm trong component (App gate); `svelte:window onkeydown` xử lý Escape (`usesStore.close()`) và Tab-trap (query focusables trong panel `a[href], button`; Tab từ cuối về đầu, Shift+Tab từ đầu về cuối, còn lại default); `$effect` mount focus `uses-close`; focus `usesStore.opener` trong cleanup của effect mount (guard null + element.isConnected); backdrop là div sibling panel; panel chứa: hàng header (`h2 id="uses-title-heading"` + nút `uses-close`), intro `p`, nhóm today (label + 6 card), nhóm tomorrow (label + 2 card); mỗi card: `h3` title, `p` easy, dòng physics (label mono + text mono), chip `<a>` khi `card.watch` có (label `t('uses.watch', {name: t(\`preset.${card.watch}.title\`)})`, onclick gọi `usesStore.close()` trước khi anchor default navigation chạy). Style theo spec 4.2/4.3: panel token màu, `min(560px, calc(100vw - 32px))`, `max-height: min(86dvh, 720px)`, cuộn trong panel, backdrop `rgba(9, 12, 17, 0.72)`; animation vào fade + translateY(8px) 200ms, tắt trong `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Mount trong App**

`App.svelte`: import `UsesOverlay` + `usesStore`; chèn vào `<main>` của nhánh sim, ngay sau block `{#if simStore.fatal !== undefined}` (trước HUD perf), nội dung `{#if usesStore.open}<UsesOverlay />{/if}`. Không đổi gì khác.

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `npx vitest run tests/usesOverlay.test.ts`
Expected: PASS 8 test.

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/UsesOverlay.svelte web/src/App.svelte web/tests/usesOverlay.test.ts
git commit -m "feat(web): uses overlay dialog with focus trap"
```

---

### Task 4: Hai cửa vào (chip TopBar + hook NarrationPanel)

**Files:**
- Modify: `web/src/ui/TopBar.svelte`, `web/src/ui/NarrationPanel.svelte`
- Test: `web/tests/topBar.test.ts`, `web/tests/narrationPanel.test.ts` (mở rộng)

**Interfaces:**
- Consumes: `usesStore.openFrom(el)` (Task 2); key `uses.open`, `uses.hook` (Task 1).
- Produces: testid `uses-open` (TopBar), `uses-hook` (NarrationPanel) cho Task 5.

- [ ] **Step 1: Viết test fail (topBar.test.ts)**

Thêm vào `beforeEach`/`afterEach` hiện có dòng reset `usesStore.close()` (store module-global, cùng lý do modeStore). Thêm describe mới:

```ts
describe('TopBar uses chip', () => {
  it('renders the uses chip labeled uses.open', () => {
    render(TopBar, { props: { id: 'double-slit' } })
    const chip = screen.getByTestId('uses-open')
    expect(chip.tagName).toBe('BUTTON')
    expect(chip.textContent).toBe(enDict['uses.open'])
  })

  it('clicking the chip opens the store with the chip as focus origin', async () => {
    render(TopBar, { props: { id: 'double-slit' } })
    const chip = screen.getByTestId('uses-open')
    await fireEvent.click(chip)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(chip)
  })
})
```

(import thêm `usesStore`.)

- [ ] **Step 2: Viết test fail (narrationPanel.test.ts)**

Thêm describe mới (file đã stub `innerHeight` theo kiểu `vi.stubGlobal`):

```ts
describe('NarrationPanel uses hook', () => {
  it('renders the hook on the open panel, labeled uses.hook', () => {
    vi.stubGlobal('innerHeight', TALL)
    render(NarrationPanel, { props: { id: 'double-slit' } })
    expect(screen.getByTestId('uses-hook').textContent).toBe(enDict['uses.hook'])
  })

  it('hides the hook on the collapsed stub', () => {
    vi.stubGlobal('innerHeight', 768)
    render(NarrationPanel, { props: { id: 'double-slit' } })
    expect(screen.queryByTestId('uses-hook')).toBeNull()
  })

  it('clicking the hook opens the store with the hook as focus origin', async () => {
    vi.stubGlobal('innerHeight', TALL)
    render(NarrationPanel, { props: { id: 'double-slit' } })
    const hook = screen.getByTestId('uses-hook')
    await fireEvent.click(hook)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(hook)
  })
})
```

(reset `usesStore.close()` trong `afterEach` của file.)

- [ ] **Step 3: Chạy test xác nhận fail**

Run: `npx vitest run tests/topBar.test.ts tests/narrationPanel.test.ts`
Expected: FAIL ở các test mới (không tìm thấy testid).

- [ ] **Step 4: Implement chip + hook**

`TopBar.svelte`: nút `uses-open` đặt giữa segmented mode và nút ngôn ngữ, style trùng chip `.lang` (dùng chung class), `onclick` gọi `usesStore.openFrom(e.currentTarget)`; label derived theo lang-mirror pattern sẵn có.
`NarrationPanel.svelte`: sau `{#each lines}` thêm nút ghost `uses-hook` (label `t('uses.hook')` derived), style ghost như nút collapse trong `.head` (không viền, `text-3`, hover `text-1`), chỉ nằm trong nhánh `{#if open}`.

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `npx vitest run tests/topBar.test.ts tests/narrationPanel.test.ts`
Expected: PASS toàn bộ (cũ + mới).

- [ ] **Step 6: Commit**

```bash
git add web/src/ui/TopBar.svelte web/src/ui/NarrationPanel.svelte web/tests/topBar.test.ts web/tests/narrationPanel.test.ts
git commit -m "feat(web): uses entry points in top bar and briefing"
```

---

### Task 5: E2e + cổng local đầy đủ

**Files:**
- Test: `web/tests/uses.spec.ts`

**Interfaces:**
- Consumes: toàn bộ testid Task 3-4; route `#/sim/<preset>`; copy tiếng Anh Task 1.

- [ ] **Step 1: Viết e2e spec**

Hai test, mỗi test gắn collector `expectNoErrors` (copy pattern từ `tests/vLegend.spec.ts`). Lưu ý quan trọng: viewport mặc định 720px cao nên NarrationPanel **khởi động thu gọn** (R4: mở iff `innerHeight >= 800`), và sau khi chuyển preset bằng chip "Xem thử", panel của preset mới cũng thu gọn; vì vậy scene assert bằng heading thay vì `preset-card` (ghi đè thông suốt hơn bước 4 spec 8.2).

```ts
import { expect, test } from '@playwright/test'

// expectNoErrors: copy nguyên văn helper từ tests/vLegend.spec.ts

test('uses overlay: top-bar chip opens, Esc closes; groups and cards render', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await page.goto('/#/sim/double-slit')

  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  await page.getByTestId('uses-open').click()

  const overlay = page.getByTestId('uses-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('What this equation does for you')
  await expect(overlay).toContainText('IN USE TODAY')
  await expect(overlay).toContainText('TOMORROW')
  await expect(page.getByTestId('uses-card-flash')).toContainText('Flash memory')
  await expect(page.getByTestId('uses-card-qcompute')).toContainText('Quantum computers')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('uses overlay: briefing hook opens it; see-it navigates to the preset', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await page.goto('/#/sim/double-slit')

  // 720px tall: expand the collapsed briefing, then use its hook.
  await page.getByTestId('preset-info').click()
  await page.getByTestId('uses-hook').click()
  await expect(page.getByTestId('uses-overlay')).toBeVisible()

  await page.getByTestId('uses-watch-flash').click()
  await expect(page).toHaveURL(/#\/sim\/tunneling$/)
  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  // The new preset's briefing remounts collapsed at 720px: the scene heading
  // names it instead of the open card.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tunneling')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
```

- [ ] **Step 2: Chạy riêng spec này**

Run: `npx playwright test tests/uses.spec.ts`
Expected: PASS 2 test.

- [ ] **Step 3: Chạy full gate**

Run: `npm run test` rồi `npm run test:e2e` rồi `npm run check` rồi `npm run build` (trong `web/`)
Expected: vitest toàn xanh (208 cũ + 21 mới); Playwright 29+1skip cũ + 2 mới; `npm run check` chỉ 2 error có sẵn trong `node_modules/esrap` (không diagnostic project-code mới); build OK.

- [ ] **Step 4: Commit**

```bash
git add web/tests/uses.spec.ts
git commit -m "test(web): uses overlay e2e"
```

- [ ] **Step 5: Báo cáo + đợi user polish pass**

Task cuối không tự merge/push (main push = Pages deploy, cần user duyệt). Mời user duyệt mắt trên desktop + mobile: mở overlay từ 2 cửa, Esc/backdrop/X đóng, đổi ngôn ngữ lúc đang mở, chip "Xem thử" ở 5 thẻ.
