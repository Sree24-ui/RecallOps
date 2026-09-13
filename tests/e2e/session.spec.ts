import { test, expect } from '@playwright/test';
const base = process.env.RECALLOPS_AUTH_URL;
const key = process.env.RECALLOPS_TEST_ACCESS_KEY;
test.describe('Owner sessions', () => {
  test.skip(
    !base || !key,
    'Uses a separate authentication test server and database.',
  );
  test.use({ baseURL: base });
  test('signed-out workspace is a sign-in screen; correct key survives reload and sign out removes access', async ({
    page,
    context,
  }) => {
    await page.goto('/workspace');
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await expect(
      page.getByText('Workspace unavailable', { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel('Owner access key', { exact: true })
      .fill('incorrect-isolated-test-key');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('not recognized');
    await page.getByLabel('Owner access key', { exact: true }).fill(key!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Inventory units: 0', exact: true }),
    ).toBeVisible();
    const cookies = await context.cookies();
    const session = cookies.find(
      (cookie) => cookie.name === 'recallops_session',
    )!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Strict');
    expect(session.value).not.toContain(key!);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'recallops_session',
    );
    expect(
      await page.evaluate(() =>
        JSON.stringify(
          [localStorage, sessionStorage].map((storage) =>
            Object.keys(storage).map((key) => storage.getItem(key)),
          ),
        ),
      ),
    ).not.toContain(key!);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Inventory units: 0', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Workspace settings' }),
    ).toBeVisible();
    await expect(
      page.getByText('Server configuration', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('.dev.vars', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Compact', exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Compact', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    expect((await page.request.get('/api/workspace')).status()).toBe(401);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  });
  test('session creation rejects cross-origin requests and malformed credentials', async ({
    request,
  }) => {
    const origin = new URL(base!).origin;
    const cross = await request.post('/api/session', {
      headers: { Origin: 'https://unrelated.example' },
      data: { token: key },
    });
    expect(cross.status()).toBe(400);
    expect(
      (await request.post('/api/session', { data: { token: key } })).status(),
    ).toBe(400);
    expect(
      (
        await request.post('/api/session', {
          headers: { Origin: origin },
          data: { token: '' },
        })
      ).status(),
    ).toBe(400);
    const signed = await request.post('/api/session', {
      headers: { Origin: origin },
      data: { token: key },
    });
    expect(signed.status()).toBe(200);
    const mutation = await request.post('/api/workspace', {
      data: { action: 'judge' },
    });
    expect(mutation.status()).toBe(400);
    expect((await mutation.json()).error).toContain('Cross-origin');
    await request.delete('/api/session', { headers: { Origin: origin } });
  });
  test('mobile sign-in and settings are usable without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/workspace');
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByLabel('Owner access key', { exact: true }).fill(key!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your safety workspace.' }),
    ).toBeVisible();
    await page.goto('/workspace#view=settings');
    await expect(
      page.getByRole('heading', { name: 'Workspace settings' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
  test('concurrent invalid attempts are rate limited before reaching an unbounded sign-in path', async ({
    request,
  }) => {
    const origin = new URL(base!).origin;
    await request.post('/api/session', {
      headers: { Origin: origin },
      data: { token: key },
    });
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () =>
        request.post('/api/session', {
          headers: { Origin: origin },
          data: { token: 'wrong-isolated-test-key' },
        }),
      ),
    );
    expect(
      attempts.filter((response) => response.status() === 401).length,
    ).toBeLessThanOrEqual(10);
    expect(attempts.some((response) => response.status() === 429)).toBe(true);
  });
});
