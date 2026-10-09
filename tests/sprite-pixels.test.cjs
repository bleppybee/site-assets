/* Run: node tests/sprite-pixels.test.cjs
 * Requires the same Playwright and Chrome installation as combined-game.test.cjs.
 * Compare rendered RGBA pixels with the actual PNG frames, using a local server
 * so browser canvas reads are available even when the game normally opens as a file.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.tmpdir(), 'codex-game-shuu-tools/node_modules/playwright'));

(async () => {
  const root = path.resolve(__dirname, '..');
  const files = new Set(['sprites.js', 'shuu_animation_sheet_cropped.png', 'madoka_animation_sheet_cropped.png']);
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (!name) {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><script src="/sprites.js"></script>');
      return;
    }
    if (!files.has(name)) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const data = await fs.readFile(path.join(root, name));
      response.writeHead(200, { 'Content-Type': name.endsWith('.png') ? 'image/png' : 'text/javascript' });
      response.end(data);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true
    });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => GameSprites.ready);
    const result = await page.evaluate(async () => {
      const failures = [];
      const directions = [{ name: 'down', row: 0 }, { name: 'up', row: 1 }, { name: 'right', row: 3 }, { name: 'left', row: 2 }];
      const characters = [
        { key: 'shuu', heights: [36, 40], doubleHeight: 84 },
        { key: 'madoka', heights: [32, 34, 42], doubleHeight: 68 }
      ];
      let checked = 0;
      let comparedPixels = 0;
      for (const character of characters) {
        const sheet = new Image();
        sheet.src = '/' + character.key + '_animation_sheet_cropped.png';
        await sheet.decode();
        const source = document.createElement('canvas');
        source.width = sheet.naturalWidth;
        source.height = sheet.naturalHeight;
        const sourceContext = source.getContext('2d', { willReadFrequently: true });
        sourceContext.drawImage(sheet, 0, 0);
        for (let direction = 0; direction < directions.length; direction++) {
          const { name, row } = directions[direction];
          for (let frame = 0; frame < 3; frame++) {
            const original = sourceContext.getImageData(frame * 32, row * 48, 32, 48).data;
            let left = 32, top = 48, right = -1, bottom = -1;
            for (let y = 0; y < 48; y++) {
              for (let x = 0; x < 32; x++) {
                if (!original[(y * 32 + x) * 4 + 3]) continue;
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
              }
            }
            if (right < left) throw new Error('Empty source frame: ' + character.key + ' ' + name + ' ' + frame);
            const sourceWidth = right - left + 1;
            const sourceHeight = bottom - top + 1;
            const cases = character.heights.map(height => ({ height, scale: 1 }));
            cases.push({ height: character.doubleHeight, scale: 2 });
            for (const { height, scale } of cases) {
              const label = character.key + ' ' + name + ' frame ' + frame + ' at height ' + height;
              const canvas = document.createElement('canvas');
              canvas.width = 128; canvas.height = 128;
              const context = canvas.getContext('2d', { willReadFrequently: true });
              // Deliberately start with smoothing enabled: the sprite renderer
              // must enforce nearest-neighbor sampling and restore caller state.
              context.imageSmoothingEnabled = true;
              const moving = frame !== 0;
              const walkTime = row < 2 ? (frame - 1) / 8 : frame / 8;
              if (!GameSprites.draw(context, character.key, 64.25, 112.25, height, direction, moving, walkTime)) {
                failures.push(label + ': sprite did not draw');
                continue;
              }
              if (!context.imageSmoothingEnabled) failures.push(label + ': caller smoothing setting changed');
              const width = sourceWidth * scale;
              const heightInPixels = sourceHeight * scale;
              const originX = Math.round(64.25 - width / 2);
              const originY = Math.round(112.25 - heightInPixels);
              const rendered = context.getImageData(0, 0, canvas.width, canvas.height).data;
              let mismatch = '';
              for (let y = 0; y < canvas.height && !mismatch; y++) {
                for (let x = 0; x < canvas.width && !mismatch; x++) {
                  const within = x >= originX && x < originX + width && y >= originY && y < originY + heightInPixels;
                  const sourceX = left + Math.floor((x - originX) / scale);
                  const sourceY = top + Math.floor((y - originY) / scale);
                  const sourceOffset = (sourceY * 32 + sourceX) * 4;
                  const offset = (y * canvas.width + x) * 4;
                  for (let channel = 0; channel < 4; channel++) {
                    const expected = within ? original[sourceOffset + channel] : 0;
                    if (rendered[offset + channel] !== expected) {
                      mismatch = 'pixel ' + x + ',' + y + ', channel ' + channel + ': expected ' + expected + ', got ' + rendered[offset + channel];
                      break;
                    }
                  }
                  comparedPixels++;
                }
              }
              checked++;
              if (mismatch) failures.push(label + ': ' + mismatch);
            }
          }
        }
      }
      return { status: GameSprites.status, errors: GameSprites.errors, checked, comparedPixels, failures };
    });
    assert.deepEqual(result.status, { shuu: 'ready', madoka: 'ready' });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.failures, [], 'Sprite source pixels must survive every scene size and animation frame');
    assert.equal(result.checked, 84);
    process.stdout.write('PASS ' + result.checked + ' sprite frame/size comparisons (' + result.comparedPixels + ' RGBA pixels): all source pixels preserved at 1x and 2x.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
