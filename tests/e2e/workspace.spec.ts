import { test, expect } from '@playwright/test';
import type { Data } from '../../lib/ui/workspace';

test('slow background polling still delivers data during an action', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  let releaseAction!: () => void;
  const hold = new Promise<void>((resolve) => {
    releaseAction = resolve;
  });
  let reads = 0;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'POST') {
      await hold;
      await route.fulfill({ json: { message: 'Controlled test complete.' } });
    } else {
      reads++;
      if (reads > 1) await new Promise((resolve) => setTimeout(resolve, 3200));
      await route.fulfill({
        json:
          reads > 1 ? { ...state, inventory: state.inventory.slice(1) } : state,
      });
    }
  });
  try {
    await page.goto('/workspace');
    await page
      .getByRole('button', { name: 'Run RecallOps Judge Demo', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: `Inventory units: ${state.inventory.length - 1}`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 11000 });
    expect(reads).toBe(2);
  } finally {
    releaseAction();
  }
});

test('live totals filter inventory and no-match state recovers', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  await page.goto('/workspace');
  await expect(
    page.getByRole('button', {
      name: `Inventory units: ${state.inventory.length}`,
      exact: true,
    }),
  ).toBeVisible();
  const held = state.inventory.filter((x) => x.quarantined);
  await page
    .getByRole('button', {
      name: `Quarantine holds: ${held.length}`,
      exact: true,
    })
    .click();
  for (const item of held)
    await expect(
      page.getByRole('button', { name: item.assetTag, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Assessment filter' }),
  ).toContainText('Quarantined');
  await page
    .getByRole('textbox', { name: 'Search inventory' })
    .fill('NO-MATCH-UNIQUE');
  await expect(
    page.getByRole('heading', { name: 'No matching units' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Search inventory' }),
  ).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: 'Assessment filter' }),
  ).toContainText('All assessments');
});

test('case and source survive reload and browser back; skip link preserves context', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  const item = state.inventory.find((x) => x.assessment?.versionId)!;
  await page.goto(`/workspace#view=case&item=${item.id}`);
  await expect(
    page.getByRole('heading', { name: item.title, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inspect source version' }).click();
  await expect(page.locator('pre.source-text')).not.toBeEmpty();
  const sourceUrl = page.url();
  await page.reload();
  await expect(page.locator('pre.source-text')).not.toBeEmpty();
  expect(page.url()).toBe(sourceUrl);
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await skip.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(page.url()).toBe(sourceUrl);
  await page
    .getByRole('button', { name: `Back to ${item.assetTag}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: item.title, exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator('pre.source-text')).not.toBeEmpty();
});

test('mobile case uses readable criteria cards and announces safety state', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  const item = state.inventory.find(
    (x) => x.assessment?.status === 'affected',
  )!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace#view=inventory');
  const unit = page.getByRole('button', { name: item.assetTag, exact: true });
  await expect(unit).toHaveAccessibleDescription(/Affected.*Quarantined/);
  await unit.click();
  await expect(page.locator('.criterion-card').first()).toBeVisible();
  await page.locator('.criterion-card summary').first().click();
  await expect(page.locator('.criterion-card[open]').first()).toContainText(
    'Inventory',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('CSV review freezes edits and imports the reviewed content', async ({
  page,
}) => {
  let finishReview!: () => void;
  const hold = new Promise<void>((resolve) => {
    finishReview = resolve;
  });
  let reviewed = '',
    imported = '';
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'import') {
        if (body.reviewOnly) {
          reviewed = body.csv;
          await hold;
          await route.fulfill({
            json: {
              rows: [{ assetTag: 'REVIEWED-UNIT', title: 'USB adapter' }],
            },
          });
        } else {
          imported = body.csv;
          await route.fulfill({ json: { inserted: 1 } });
        }
        return;
      }
    }
    await route.continue();
  });
  await page.goto('/workspace#view=import');
  const csv = page.getByLabel('Or paste CSV');
  await csv.fill('assetTag,title\nREVIEWED-UNIT,USB adapter');
  await page
    .getByRole('button', { name: 'Review import', exact: true })
    .click();
  await expect(csv).toBeDisabled();
  await expect(page.getByLabel('Choose CSV file')).toBeDisabled();
  finishReview();
  await page
    .getByRole('button', { name: 'Import 1 units', exact: true })
    .click();
  await expect.poll(() => imported).toBe(reviewed);
});

test('task conflicts retain the local draft, reject stale writes and export the case audit', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  const task = state.tasks[0];
  expect(task).toBeTruthy();
  const item = state.inventory.find((x) => x.caseId === task.caseId)!;
  await page.goto('/workspace#view=actions');
  const row = page
    .locator('.task-row')
    .filter({
      has: page.getByRole('textbox', {
        name: `Owner for ${task.title}`,
        exact: true,
      }),
    })
    .first();
  const owner = row.getByRole('textbox', {
    name: `Owner for ${task.title}`,
    exact: true,
  });
  await owner.fill('Local unsaved owner');
  const update = {
    action: 'task',
    taskId: task.id,
    revision: task.revision,
    status: task.status,
    owner: 'Other saved owner',
    dueDate: task.dueDate,
    priority: task.priority,
  };
  const result = await page.request.post('/api/workspace', { data: update });
  expect(result.status()).toBe(200);
  const stale = await page.request.post('/api/workspace', {
    data: { ...update, owner: 'Stale overwrite' },
  });
  expect(stale.status()).toBe(409);
  await page
    .getByRole('button', { name: 'Refresh workspace', exact: true })
    .click();
  await expect(row).toContainText('This task changed elsewhere');
  await expect(owner).toHaveValue('Local unsaved owner');
  await expect(row.getByRole('button', { name: 'Save task' })).toBeDisabled();
  await row.getByRole('button', { name: 'Discard draft' }).click();
  await expect(owner).toHaveValue('Other saved owner');
  await owner.fill('Reviewed owner');
  await row.getByRole('button', { name: 'Save task' }).click();
  await expect(row.getByRole('button', { name: 'Save task' })).toBeDisabled();
  await expect
    .poll(async () => {
      const next: Data = await (
        await page.request.get('/api/workspace')
      ).json();
      return next.tasks.find((x) => x.id === task.id)?.owner;
    })
    .toBe('Reviewed owner');
  const packet = await page.request.get(
    `/api/export?type=packet&itemId=${item.id}`,
  );
  expect(await packet.text()).toContain('task.updated');
});

test('confirmed task save stays successful when the follow-up refresh fails', async ({
  page,
}) => {
  const state: Data = await (await page.request.get('/api/workspace')).json();
  const task = state.tasks[1];
  let saved = false;
  await page.route('**/api/workspace', async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();
      saved = response.ok();
      await route.fulfill({ response });
    } else if (saved)
      await route.fulfill({
        status: 503,
        json: { error: 'Saved, but refresh unavailable' },
      });
    else await route.continue();
  });
  await page.goto('/workspace#view=actions');
  const row = page.locator('.task-row').nth(1);
  const owner = row.getByRole('textbox', {
    name: `Owner for ${task.title}`,
    exact: true,
  });
  const nextOwner = `Confirmed owner ${Date.now()}`;
  await owner.fill(nextOwner);
  await row.getByRole('button', { name: 'Save task' }).click();
  await expect(
    page.getByText('Task update completed.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Saved, but refresh unavailable', { exact: false }),
  ).toBeVisible();
  await expect(owner).toHaveValue(nextOwner);
  await expect(row.getByRole('button', { name: 'Save task' })).toBeDisabled();
  await expect(row.getByText('Unsaved changes')).toHaveCount(0);
});

test('unrelated packets omit the INIU link and empty retry reports no work', async ({
  request,
}) => {
  const state: Data = await (await request.get('/api/workspace')).json();
  const item = state.inventory.find(
    (x) => !x.assessment?.versionId && x.brand !== 'INIU',
  )!;
  const packet = await request.get(`/api/export?type=packet&itemId=${item.id}`);
  expect(packet.status()).toBe(200);
  const html = await packet.text();
  expect(html).toContain(item.assetTag);
  expect(html).not.toContain('iniushop.com');
  const retry = await request.post('/api/workspace', {
    data: { action: 'retry_events' },
  });
  expect(await retry.json()).toMatchObject({
    attempted: 0,
    succeeded: 0,
    remaining: 0,
    message: 'No pending or failed events to retry.',
  });
});

test('loading and failed refresh do not present invented workspace data', async ({
  page,
}) => {
  let finishLoad!: () => void;
  const hold = new Promise<void>((resolve) => {
    finishLoad = resolve;
  });
  let failing = false;
  await page.route('**/api/workspace', async (route) => {
    await hold;
    if (failing)
      await route.fulfill({
        status: 503,
        json: { error: 'Temporary connection failure' },
      });
    else await route.continue();
  });
  await page.goto('/workspace');
  await expect(
    page.getByText('● Anakin connecting…', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('● Anakin key not configured', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Inventory units:/ }),
  ).toHaveCount(0);
  finishLoad();
  const total = page.getByRole('button', { name: /^Inventory units:/ });
  await expect(total).toBeVisible();
  const label = await total.getAttribute('aria-label');
  failing = true;
  await page
    .getByRole('button', { name: 'Refresh workspace', exact: true })
    .click();
  await expect(
    page.getByText('Temporary connection failure', { exact: false }),
  ).toBeVisible();
  await expect(total).toHaveAttribute('aria-label', label!);
});
