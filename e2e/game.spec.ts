import { devices, expect, test, type Browser, type Page } from '@playwright/test';

// One host and two players on separate "phones" (browser contexts) play a face-off,
// a round with a steal, and the board display follows along.

async function newPhone(browser: Browser): Promise<Page> {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...phone, baseURL: 'http://localhost:5174' });
  return ctx.newPage();
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/join/${code}`);
  await page.getByPlaceholder('e.g. Jordan').fill(name);
  await page.getByRole('button', { name: 'Let’s play!' }).click();
  await expect(page.getByText(`You’re in, ${name}!`)).toBeVisible();
}

test('face-off, round, steal and board display', async ({ browser }) => {
  const host = await newPhone(browser);
  await host.goto('/');
  await host.getByRole('button', { name: /Host a game/ }).click();
  await host.waitForURL(/\/play\/[A-Z0-9]{4}$/);
  const code = host.url().slice(-4);

  const ann = await newPhone(browser);
  const bea = await newPhone(browser);
  await join(ann, code, 'Ann');
  await join(bea, code, 'Bea');

  const board = await newPhone(browser);
  await board.goto(`/board/${code}`);
  await expect(board.getByText(code)).toBeVisible();

  await host.getByRole('button', { name: 'Move Ann to team A' }).click();
  await host.getByRole('button', { name: 'Move Bea to team B' }).click();
  await expect(board.getByText('Ann')).toBeVisible();
  await host.getByRole('button', { name: /Start the game/ }).click();

  // Face-off: Bea buzzes first, misses; Ann gets it.
  await expect(bea.getByText('You’re in the face-off!')).toBeVisible();
  await host.getByRole('button', { name: /Open Buzzers/ }).click();
  await bea.getByRole('button', { name: 'Buzz in' }).click();
  await ann.getByRole('button', { name: 'Buzz in' }).click();
  await expect(host.getByText('First to buzz')).toBeVisible();
  await host.getByRole('button', { name: /Wrong/ }).click();
  await expect(host.getByText('Their chance to answer')).toBeVisible();
  await host.getByRole('button', { name: /Correct/ }).click();
  await host.getByRole('button', { name: /^Answer 1:/ }).click();

  await ann.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(host.getByRole('button', { name: /Strike/ })).toBeVisible();

  // Three strikes, then Bea's team steals with answer 2.
  for (let i = 0; i < 3; i++) {
    await host.getByRole('button', { name: /Strike/ }).click();
    if (i < 2) await expect(host.getByLabel(`${i + 1} strikes`)).toBeVisible();
  }
  await expect(bea.getByText('You’re the captain', { exact: false })).toBeVisible();
  await host.getByRole('button', { name: /^Answer 2:/ }).click();
  await expect(host.getByText(/steals/)).toBeVisible();
  await expect(board.getByText(/steals/)).toBeVisible();

  // Players never receive unrevealed answers.
  const stateJson = await bea.evaluate(async (c) => {
    const r = await fetch('/api/state', { method: 'POST', body: JSON.stringify({ code: c }), headers: { 'Content-Type': 'application/json' } });
    return JSON.stringify((await r.json()).state.round.board);
  }, code);
  const hidden = JSON.parse(stateJson).filter((b: { revealed: boolean }) => !b.revealed);
  expect(hidden.every((b: { text: string | null }) => b.text === null)).toBe(true);
});
