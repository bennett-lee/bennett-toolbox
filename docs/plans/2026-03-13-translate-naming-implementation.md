# Translate Naming Dual-Direction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the existing translate-naming tool to support online bidirectional translation while preserving naming generation in the same module.

**Architecture:** Keep all work inside the current React module and extract the new translation-direction behavior into small helper functions local to the feature. Add a lightweight test setup first, then implement the feature with strict red-green-refactor steps.

**Tech Stack:** React 18, TypeScript, Vite 5, CSS modules by conventionless stylesheet import, Vitest, React Testing Library, jsdom

---

### Task 1: Add test infrastructure

**Files:**
- Modify: `package.json`
- Create: `src/test/setup.ts`
- Create: `vite.config.ts` or `vitest.config.ts` if needed
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import TranslateNaming from './index'

test('shows chinese-to-english copy by default', () => {
  render(<TranslateNaming />)
  expect(screen.getByPlaceholderText(/请输入中文/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx`
Expected: FAIL because Vitest and Testing Library are not configured.

**Step 3: Write minimal implementation**

Add the minimum dev dependencies and test setup needed for jsdom-based React component tests.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx`
Expected: PASS for the initial smoke assertion.

**Step 5: Commit**

```bash
git add package.json src/test/setup.ts vite.config.ts src/modules/translate-naming/index.test.tsx
git commit -m "test: add frontend test setup"
```

### Task 2: Add direction-switch behavior

**Files:**
- Modify: `src/modules/translate-naming/index.tsx`
- Modify: `src/modules/translate-naming/styles/index.css`
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
test('switches ui copy when direction changes to english-to-chinese', async () => {
  render(<TranslateNaming />)
  await userEvent.click(screen.getByRole('button', { name: /英 -> 中/i }))
  expect(screen.getByPlaceholderText(/请输入英文/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /翻译并生成/i })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "switches ui copy"`
Expected: FAIL because the direction toggle does not exist yet.

**Step 3: Write minimal implementation**

Add:
- `direction` state
- two direction toggle buttons
- direction-aware placeholder and helper copy

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "switches ui copy"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/translate-naming/index.tsx src/modules/translate-naming/styles/index.css src/modules/translate-naming/index.test.tsx
git commit -m "feat: add translation direction switch"
```

### Task 3: Add successful chinese-to-english translation rendering

**Files:**
- Modify: `src/modules/translate-naming/index.tsx`
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
test('renders translated english text and naming results for chinese input', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({
      responseStatus: 200,
      responseData: { translatedText: 'user status' },
    }),
  }))

  render(<TranslateNaming />)
  await userEvent.type(screen.getByRole('textbox'), '用户状态')
  await userEvent.click(screen.getByRole('button', { name: /翻译并生成/i }))

  expect(await screen.findByText(/user status/i)).toBeInTheDocument()
  expect(screen.getByText(/userStatus/)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "renders translated english text"`
Expected: FAIL because there is no dedicated translation result rendering yet.

**Step 3: Write minimal implementation**

Add:
- shared online translation helper
- `translatedText` state
- translation result card for `中 -> 英`

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "renders translated english text"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/translate-naming/index.tsx src/modules/translate-naming/index.test.tsx
git commit -m "feat: show chinese-to-english translation result"
```

### Task 4: Add successful english-to-chinese translation rendering

**Files:**
- Modify: `src/modules/translate-naming/index.tsx`
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
test('renders chinese translation and naming results from english input', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({
      responseStatus: 200,
      responseData: { translatedText: '用户状态' },
    }),
  }))

  render(<TranslateNaming />)
  await userEvent.click(screen.getByRole('button', { name: /英 -> 中/i }))
  await userEvent.type(screen.getByRole('textbox'), 'user-status')
  await userEvent.click(screen.getByRole('button', { name: /翻译并生成/i }))

  expect(await screen.findByText(/用户状态/)).toBeInTheDocument()
  expect(screen.getByText(/userStatus/)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "renders chinese translation"`
Expected: FAIL because english-to-chinese flow does not exist yet.

**Step 3: Write minimal implementation**

Add:
- direction-aware API language pair
- english-input normalization helper
- translation result card for `英 -> 中`

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "renders chinese translation"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/translate-naming/index.tsx src/modules/translate-naming/index.test.tsx
git commit -m "feat: support english-to-chinese translation"
```

### Task 5: Remove fallback behavior and show online error state

**Files:**
- Modify: `src/modules/translate-naming/index.tsx`
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
test('shows an online translation error and clears results on failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

  render(<TranslateNaming />)
  await userEvent.type(screen.getByRole('textbox'), '用户状态')
  await userEvent.click(screen.getByRole('button', { name: /翻译并生成/i }))

  expect(await screen.findByText(/在线翻译失败/i)).toBeInTheDocument()
  expect(screen.queryByText(/userStatus/)).not.toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "shows an online translation error"`
Expected: FAIL because the current code falls back to a local dictionary.

**Step 3: Write minimal implementation**

Remove the fallback dictionary path and return a user-facing online translation error instead.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "shows an online translation error"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/translate-naming/index.tsx src/modules/translate-naming/index.test.tsx
git commit -m "feat: remove local translation fallback"
```

### Task 6: Refine layout and run verification

**Files:**
- Modify: `src/modules/translate-naming/styles/index.css`
- Modify: `src/modules/translate-naming/index.tsx`
- Test: `src/modules/translate-naming/index.test.tsx`

**Step 1: Write the failing test**

```tsx
test('keeps result sections visible and direction-specific helper text', async () => {
  render(<TranslateNaming />)
  expect(screen.getByText(/在线翻译/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx -t "keeps result sections visible"`
Expected: FAIL until the final helper copy is rendered.

**Step 3: Write minimal implementation**

Polish:
- helper text
- result section titles
- spacing for direction toggle and translation card

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/translate-naming/index.test.tsx`
Expected: PASS for all feature tests.

**Step 5: Commit**

```bash
git add src/modules/translate-naming/index.tsx src/modules/translate-naming/styles/index.css src/modules/translate-naming/index.test.tsx
git commit -m "style: polish translate naming bidirectional ui"
```

## Verification Checklist

- Run: `npm run build`
- Run: `npx vitest run`
- Manually verify both directions in the app UI
- Confirm copy-to-clipboard still works after the refactor

## Notes

- If `fetch` payloads differ from current assumptions, adjust the response parsing in the smallest possible way
- If network restrictions block live manual verification, keep tests as the primary confidence signal
- If the workspace remains outside git, skip commit steps and note that explicitly in the delivery summary
