import { test, expect } from '@playwright/test';

// Clear planner storage before each test so tests are independent.
// sessionStorage guard prevents the script from re-running on page.reload() within a test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__test_init')) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('planner-'))
        .forEach(k => localStorage.removeItem(k));
      sessionStorage.setItem('__test_init', '1');
    }
  });
  const consoleLogs = [];
  page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));
  await page.goto('/');
  await page.waitForFunction(() => window.__plannerReady === true);
  test.info().annotations.push({ type: 'console', description: consoleLogs.join('\n') });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

test.describe('Tab navigation', () => {
  test('Today panel is active on load', async ({ page }) => {
    await expect(page.locator('#panel-today')).toBeVisible();
    await expect(page.locator('.tab[data-tab="today"]')).toHaveClass(/active/);
  });

  const tabs = ['week', 'month', 'homework', 'helper', 'setup'];
  for (const tab of tabs) {
    test(`clicking ${tab} tab shows its panel`, async ({ page }) => {
      await page.locator(`.tab[data-tab="${tab}"]`).click();
      await expect(page.locator(`#panel-${tab}`)).toBeVisible();
    });
  }

  test('only one panel is visible at a time', async ({ page }) => {
    await page.locator('.tab[data-tab="homework"]').click();
    await expect(page.locator('.panel:visible')).toHaveCount(1);
  });

  test('navigating back to Today works', async ({ page }) => {
    await page.locator('.tab[data-tab="homework"]').click();
    await page.locator('.tab[data-tab="today"]').click();
    await expect(page.locator('#panel-today')).toBeVisible();
    await expect(page.locator('#panel-homework')).not.toBeVisible();
  });
});

// ─── Today panel ──────────────────────────────────────────────────────────────

test.describe('Today panel', () => {
  test('stats render with zero counts', async ({ page }) => {
    await expect(page.locator('#statClasses')).toHaveText('0');
    await expect(page.locator('#statHwToday')).toHaveText('0');
    await expect(page.locator('#statHwOpen')).toHaveText('0');
  });

  test('arrow navigation shifts day forward and back', async ({ page }) => {
    const nav = page.locator('#panel-today');
    const label = page.locator('#dayNavLabel');
    const initial = await label.textContent();
    await nav.locator('button', { hasText: 'Next →' }).click();
    const after = await label.textContent();
    expect(after).not.toBe(initial);
    await nav.locator('button', { hasText: '← Prev' }).click();
    expect(await label.textContent()).toBe(initial);
  });

  test('Today button resets navigation to current day', async ({ page }) => {
    const nav = page.locator('#panel-today');
    await nav.locator('button', { hasText: 'Next →' }).click();
    await nav.locator('button', { hasText: 'Today' }).click();
    await expect(page.locator('#todayTitle')).toContainText('Today');
  });
});

// ─── Setup — subjects ─────────────────────────────────────────────────────────

test.describe('Subject management', () => {
  test('can add a subject', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'Mathematics');
    await page.locator('button[onclick="addSubject()"]').click();
    await expect(page.locator('.subject-chip')).toContainText('Mathematics');
  });

  test('added subject appears in homework subject dropdown', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'Science');
    await page.locator('button[onclick="addSubject()"]').click();

    await page.locator('.tab[data-tab="homework"]').click();
    await page.locator('#panel-homework button[onclick="openHwModal()"]').click();
    await expect(page.locator('#hwSubject option', { hasText: 'Science' })).toBeAttached();
  });

  test('can remove a subject', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'Latin');
    await page.locator('button[onclick="addSubject()"]').click();
    await expect(page.locator('.subject-chip')).toContainText('Latin');

    page.on('dialog', d => d.accept());
    await page.locator('.subject-chip .x').click();
    await expect(page.locator('.subject-chip')).not.toBeAttached();
  });
});

// ─── Homework ─────────────────────────────────────────────────────────────────

test.describe('Homework', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'English');
    await page.locator('button[onclick="addSubject()"]').click();
    await page.locator('.tab[data-tab="homework"]').click();
  });

  test('can add an assignment', async ({ page }) => {
    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Write essay');
    await page.selectOption('#hwSubject', { label: 'English' });
    await page.locator('button[onclick="saveHw()"]').click();
    await expect(page.locator('#hwList .hw-item')).toContainText('Write essay');
  });

  test('can mark assignment done', async ({ page }) => {
    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Read chapter 5');
    await page.locator('button[onclick="saveHw()"]').click();
    await page.locator('#hwList .hw-check').first().click();
    await expect(page.locator('#hwList .hw-item.done')).toBeVisible();
  });

  test('filter chips narrow the list', async ({ page }) => {
    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Open task');
    await page.locator('button[onclick="saveHw()"]').click();

    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Done task');
    await page.locator('button[onclick="saveHw()"]').click();
    await page.locator('#hwList .hw-check').last().click();

    await page.locator('#hwFilters .filter-chip', { hasText: 'Open' }).click();
    await expect(page.locator('#hwList .hw-item')).toHaveCount(1);
    await expect(page.locator('#hwList .hw-item')).toContainText('Open task');

    await page.locator('#hwFilters .filter-chip', { hasText: 'Done' }).click();
    await expect(page.locator('#hwList .hw-item')).toHaveCount(1);
    await expect(page.locator('#hwList .hw-item')).toContainText('Done task');
  });

  test('can delete an assignment', async ({ page }) => {
    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Delete me');
    await page.locator('button[onclick="saveHw()"]').click();
    page.on('dialog', d => d.accept());
    await page.locator('#hwList .btn.ghost', { hasText: 'Del' }).click();
    await expect(page.locator('#hwList .hw-item')).not.toBeAttached();
  });
});

// ─── Review tasks ─────────────────────────────────────────────────────────────

test.describe('Review tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('.tab[data-tab="homework"]').click();
  });

  test('empty state message shows', async ({ page }) => {
    await expect(page.locator('#allReviewsList .empty')).toBeVisible();
  });

  test('can add a review task', async ({ page }) => {
    await page.locator('button[onclick="openReviewModal()"]').click();
    await page.fill('#reviewModalText', 'Flashcards — vocab');
    await page.locator('button[onclick="saveReview()"]').click();
    await expect(page.locator('#allReviewsList .hw-item')).toContainText('Flashcards — vocab');
  });

  test('can mark review task done', async ({ page }) => {
    await page.locator('button[onclick="openReviewModal()"]').click();
    await page.fill('#reviewModalText', 'Re-read chapter 3');
    await page.locator('button[onclick="saveReview()"]').click();
    await page.locator('#allReviewsList .hw-check').click();
    await expect(page.locator('#allReviewsList .hw-item.done')).toBeVisible();
  });

  test('filter chips narrow the list', async ({ page }) => {
    await page.locator('button[onclick="openReviewModal()"]').click();
    await page.fill('#reviewModalText', 'Open review task');
    await page.locator('button[onclick="saveReview()"]').click();

    await page.locator('button[onclick="openReviewModal()"]').click();
    await page.fill('#reviewModalText', 'Done review task');
    await page.locator('button[onclick="saveReview()"]').click();
    await page.locator('#allReviewsList .hw-check').last().click();

    await page.locator('#reviewFilters .filter-chip', { hasText: 'Open' }).click();
    await expect(page.locator('#allReviewsList .hw-item')).toHaveCount(1);
    await expect(page.locator('#allReviewsList')).toContainText('Open review task');

    await page.locator('#reviewFilters .filter-chip', { hasText: 'Done' }).click();
    await expect(page.locator('#allReviewsList .hw-item')).toHaveCount(1);
    await expect(page.locator('#allReviewsList')).toContainText('Done review task');
  });
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

test.describe('Schedule', () => {
  test('bulk parse adds classes and subjects', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#bulkSchedule', 'Mon 9:00 Math\nTue 10:30 Science (Rm 7)');
    await page.locator('button[onclick="parseBulk()"]').click();
    await expect(page.locator('.subject-chip', { hasText: 'Math' })).toBeVisible();
    await expect(page.locator('.subject-chip', { hasText: 'Science' })).toBeVisible();
    await expect(page.locator('.day-col').first()).toContainText('Math');
  });

  test('Saturday column is present in the schedule grid', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    const dayHeads = page.locator('.day-head');
    await expect(dayHeads).toHaveCount(6);
    await expect(dayHeads.last()).toContainText('Sat');
  });
});

// ─── Persistence ──────────────────────────────────────────────────────────────

test.describe('Persistence', () => {
  test('subjects survive a page reload', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'History');
    await page.locator('button', { hasText: 'Add subject' }).click();

    await page.reload();
    await page.waitForFunction(() => window.__plannerReady === true, { timeout: 10000 });

    await page.locator('.tab[data-tab="setup"]').click();
    await expect(page.locator('.subject-chip')).toContainText('History');
  });

  test('homework survives a page reload', async ({ page }) => {
    await page.locator('.tab[data-tab="setup"]').click();
    await page.fill('#newSubjName', 'Physics');
    await page.locator('button', { hasText: 'Add subject' }).click();

    await page.locator('.tab[data-tab="homework"]').click();
    await page.locator('button', { hasText: '+ New assignment' }).click();
    await page.fill('#hwTitle', 'Lab report');
    await page.locator('button[onclick="saveHw()"]').click();

    await page.reload();
    await page.waitForFunction(() => window.__plannerReady === true, { timeout: 10000 });

    await page.locator('.tab[data-tab="homework"]').click();
    await expect(page.locator('#hwList .hw-item')).toContainText('Lab report');
  });
});
