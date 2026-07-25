const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();

  if (!fs.existsSync('/home/jules/verification/videos')) fs.mkdirSync('/home/jules/verification/videos', { recursive: true });
  if (!fs.existsSync('/home/jules/verification/screenshots')) fs.mkdirSync('/home/jules/verification/screenshots', { recursive: true });

  // Test index.html
  const contextIndex = await browser.newContext({ recordVideo: { dir: '/home/jules/verification/videos/' } });
  const pageIndex = await contextIndex.newPage();
  await pageIndex.goto('http://localhost:3000/index.html');
  await pageIndex.waitForTimeout(2000);
  await pageIndex.locator('#searchInput').fill('asdfasdfasdf');
  await pageIndex.waitForTimeout(1000);
  await pageIndex.screenshot({ path: '/home/jules/verification/screenshots/index-empty-state.png', fullPage: true });
  await pageIndex.getByRole('button', { name: 'Clear Filters' }).click();
  await pageIndex.waitForTimeout(1000);
  await contextIndex.close();

  // Test player.html
  const contextPlayer = await browser.newContext({ recordVideo: { dir: '/home/jules/verification/videos/' } });
  const pagePlayer = await contextPlayer.newPage();
  await pagePlayer.goto('http://localhost:3000/player.html');
  await pagePlayer.waitForTimeout(2000);
  await pagePlayer.locator('#searchInput').fill('asdfasdfasdf');
  await pagePlayer.waitForTimeout(1000);
  await pagePlayer.screenshot({ path: '/home/jules/verification/screenshots/player-empty-state.png', fullPage: true });
  await pagePlayer.getByRole('button', { name: 'Clear Filters' }).click();
  await pagePlayer.waitForTimeout(1000);
  await contextPlayer.close();
  await browser.close();
})();
