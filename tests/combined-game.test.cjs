/* Run: node tests/combined-game.test.cjs
 * Requires Playwright (PLAYWRIGHT_MODULE may point to an installation) and Chrome.
 * The browser clock skips cinematic waits; all story progression uses keyboard input.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.tmpdir(), 'codex-game-shuu-tools/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1120, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let passed = 0;
  const pass = name => { passed++; process.stdout.write('PASS ' + name + '\n'); };
  const state = () => page.evaluate(() => ({
    screen, room, loopN, roam, lock, hasMed, sawGun, objective,
    player: { ...player }, fade, cutscene, muted,
    dialogue: dlg && { who: dlg.who, text: dlg.lines.join(' '), n: dlg.n, total: dlg.total },
    choice: choice && { opts: choice.opts, i: choice.i },
    mash: mash && { label: mash.label, v: mash.v, ceiling: mash.ceiling, t: mash.t, ms: mash.ms },
    end: showEndText && { ...showEndText },
    confirm: typeof onConfirm === 'function', tweens: tweens.length
  }));

  // Advance pending animation/timer work without replacing production functions.
  async function tick() {
    await page.evaluate(() => { stepTweens(60000); });
    await page.clock.fastForward(1000);
  }
  async function pumpUntil(predicate, label, { max = 240, choices = false, mashes = false, seen = [] } = {}) {
    for (let i = 0; i < max; i++) {
      const s = await state();
      if (s.dialogue) seen.push(s.dialogue.text);
      if (predicate(s)) return s;
      if (s.choice) {
        assert.ok(choices, 'Unexpected choice while ' + label + ': ' + JSON.stringify(s));
        await page.keyboard.press('z');
      } else if (s.mash) {
        assert.ok(mashes, 'Unexpected mash while ' + label + ': ' + JSON.stringify(s));
        await page.evaluate(() => stepMash(mash.ms));
      } else if (s.dialogue) {
        await page.keyboard.press('z');
      } else {
        await tick();
      }
    }
    throw new Error('Timed out ' + label + ': ' + JSON.stringify(await state()));
  }
  const finishDialogue = seen => pumpUntil(s => s.roam && !s.lock && !s.dialogue && !s.choice, 'finishing interaction', { seen });
  async function hold(key, ms) {
    await page.keyboard.down(key);
    await page.clock.runFor(ms);
    await page.keyboard.up(key);
  }
  async function walkUntil(key, predicate, label, max = 160) {
    await page.keyboard.down(key);
    try {
      for (let i = 0; i < max; i++) {
        if (predicate(await state())) return;
        await page.clock.runFor(80);
      }
      throw new Error('Could not walk ' + label + ': ' + JSON.stringify(await state()));
    } finally {
      await page.keyboard.up(key);
    }
  }
  async function checkMash(expected) {
    let s = await state();
    assert.equal(s.mash.label, expected);
    const initial = s.mash.v;
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('z');
      await page.clock.runFor(16);
    }
    s = await state();
    assert.ok(s.mash.v > initial, 'Mashing should raise the meter');
    assert.ok(s.mash.v <= s.mash.ceiling, 'Narrative meter should remain capped');
    const position = s.player;
    await hold('ArrowRight', 160);
    assert.equal((await state()).player.x, position.x, 'Movement should be blocked during mash');
    await page.evaluate(() => stepMash(mash.ms));
  }
  async function completeStory(run) {
    await pumpUntil(s => !!s.mash, 'reaching shout on run ' + run);
    await checkMash('MASH [Z] TO SHOUT');
    await pumpUntil(s => !!s.mash, 'reaching speak on run ' + run);
    await checkMash('MASH [Z] TO SPEAK');
    await pumpUntil(s => s.end && s.end.prompt && s.confirm, 'reaching GAME END on run ' + run);
    const s = await state();
    assert.equal(s.end.a, 'GAME  END');
    assert.equal(s.loopN, run);
    assert.equal(s.roam, false);
    pass('Run ' + run + ': both mash sequences, catastrophe, epilogue, and GAME END');
  }

  try {
    const epoch = new Date('2026-01-01T00:00:00Z');
    await page.clock.install({ time: epoch });
    await page.clock.pauseAt(new Date(epoch.getTime() + 1000));
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => GameSprites.ready);
    const sprites = await page.evaluate(() => ({ status: GameSprites.status, errors: GameSprites.errors }));
    assert.deepEqual(sprites, { status: { shuu: 'ready', madoka: 'ready' }, errors: [] });
    assert.equal((await state()).screen, 'title');
    await page.clock.runFor(200);
    assert.equal((await state()).screen, 'title');
    pass('Direct file launch loads both original sprite sheets and retains the title screen');

    await page.keyboard.press('Enter');
    await pumpUntil(s => !!s.dialogue, 'opening first dialogue');
    let s = await state();
    assert.equal(s.screen, 'play');
    assert.ok(s.dialogue.n < s.dialogue.total);
    await page.keyboard.press('z');
    s = await state();
    assert.equal(s.dialogue.n, s.dialogue.total, 'First confirm reveals the full line');
    const firstText = s.dialogue.text;
    await page.clock.runFor(32);
    assert.equal((await state()).dialogue.n, s.dialogue.total, 'Revealed text must not rewind');
    await page.keyboard.press('z');
    assert.notEqual((await state()).dialogue.text, firstText, 'Second confirm advances the dialogue');
    await finishDialogue();
    assert.equal((await state()).objective, 'Check on Madoka.');
    pass('Start, reveal/advance dialogue, and initial objective');

    // Move entirely via keyboard: first face all four ways, then inspect Madoka.
    for (const [key, dir] of [['ArrowUp', 1], ['ArrowDown', 0], ['ArrowRight', 2], ['ArrowLeft', 3]]) {
      const before = (await state()).player;
      await hold(key, 160);
      const after = (await state()).player;
      assert.equal(after.dir, dir);
      assert.ok(after.x !== before.x || after.y !== before.y, key + ' should move');
      assert.ok(after.walkTime > 0, 'Walking should advance sprite animation');
    }
    await walkUntil('ArrowLeft', s => s.player.x < 62, 'to Madoka');
    await page.keyboard.press('e');
    assert.equal((await state()).dialogue.who, 'MADOKA');
    const box = await page.evaluate(() => {
      const g = boxGeom();
      const lastBaseline = g.by + 13 + (dlg.who ? 10 : 0) + (dlg.lines.length - 1) * 10;
      return { ...g, lastBaseline };
    });
    assert.ok(box.lastBaseline + 3 < box.by + box.bh, 'Speaker and final text baseline must fit inside box');
    const lockedX = (await state()).player.x;
    await hold('ArrowRight', 160);
    assert.equal((await state()).player.x, lockedX, 'Dialogue blocks movement');
    await finishDialogue();
    assert.equal((await state()).objective, 'Find the special medicine in the kitchen.');
    pass('Four movement directions, walking animation, interaction lock, and speaker box layout');

    // Walk to the top floor boundary, then into the toy box from below.
    await walkUntil('ArrowUp', s => s.player.y <= 108.1, 'to floor boundary');
    await hold('ArrowUp', 240);
    assert.equal((await state()).player.y, 108);
    await walkUntil('ArrowDown', s => s.player.y >= 148, 'below furniture');
    await walkUntil('ArrowRight', s => s.player.x >= 211, 'under toy box');
    await hold('ArrowUp', 900);
    s = await state();
    assert.ok(s.player.y >= 116 && s.player.y < 120, 'Toy box should block upward movement');
    await walkUntil('ArrowDown', s => s.player.y >= 166, 'below kitchen furniture');
    await walkUntil('ArrowRight', s => s.room === 'hall', 'bedroom to hall');
    await walkUntil('ArrowRight', s => s.room === 'kitchen', 'hall to kitchen');
    await walkUntil('ArrowRight', s => s.player.x >= 140, 'under medicine cabinet');
    await walkUntil('ArrowUp', s => s.player.y <= 127, 'to cabinet');
    await page.keyboard.press('z');
    await finishDialogue();
    assert.equal((await state()).hasMed, true);
    assert.equal((await state()).objective, 'Bring the medicine to Madoka.');
    pass('Floor/furniture collisions, both east room transitions, and first-run medicine objective');

    // Browser focus loss must release a held movement key.
    await page.keyboard.down('ArrowRight');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurX = (await state()).player.x;
    await page.clock.runFor(160);
    assert.equal((await state()).player.x, blurX);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('m');
    assert.equal((await state()).muted, true);
    assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('m');
    assert.equal((await state()).muted, false);
    await page.locator('#mute').click();
    assert.equal((await state()).muted, true);
    await page.evaluate(() => document.activeElement.blur());
    await page.setViewportSize({ width: 280, height: 400 });
    await page.clock.runFor(32);
    const narrow = await page.locator('#stage').boundingBox();
    assert.ok(narrow.width <= 280 && narrow.x >= 0, 'Small viewport should fit the canvas');
    await page.setViewportSize({ width: 1120, height: 760 });
    await page.clock.runFor(32);
    pass('Blur releases movement, keyboard/button mute work, and canvas fits small viewports');

    await walkUntil('ArrowDown', s => s.player.y >= 166, 'below kitchen table');
    await walkUntil('ArrowLeft', s => s.room === 'hall', 'kitchen to hall');
    await walkUntil('ArrowLeft', s => s.room === 'kids', 'hall to bedroom');
    await walkUntil('ArrowLeft', s => s.player.x <= 62, 'back to Madoka');
    await walkUntil('ArrowUp', s => s.player.y <= 134, 'into Madoka interaction range');
    await page.keyboard.press('z');
    assert.equal((await state()).cutscene, true);
    pass('Both west room transitions and medicine delivery start the Game 2 story');
    await completeStory(1);

    await page.keyboard.press('z');
    await finishDialogue();
    s = await state();
    assert.equal(s.loopN, 2);
    assert.equal(s.hasMed, false);
    assert.equal(s.sawGun, false);
    assert.equal(s.objective, 'Check on Madoka.');
    // Only later-run positioning is set directly; narrative/input remain unchanged.
    await page.evaluate(() => { player.x = 54; player.y = 126; });
    await page.keyboard.press('z');
    const secondTalk = [];
    await finishDialogue(secondTalk);
    assert.ok(secondTalk.some(t => t.includes('Do you hate me?')));
    assert.equal((await state()).objective, 'Find the special medicine in the kitchen.');
    await page.evaluate(() => { player.x = 270; player.y = 126; });
    await page.keyboard.press('z');
    await pumpUntil(s => !!s.choice, 'second-run closet choice');
    assert.deepEqual((await state()).choice.opts, ['Take it', 'Leave it']);
    await page.keyboard.press('z');
    const closet = [];
    await finishDialogue(closet);
    assert.ok(closet.some(t => t.includes('It does not move. You are seven.')));
    assert.equal((await state()).sawGun, true);
    pass('Second morning resets inventory and exposes the remembered dialogue/closet choice');

    await page.evaluate(() => { room = 'kitchen'; player.x = 140; player.y = 126; });
    await page.keyboard.press('z');
    await pumpUntil(s => !!s.choice, 'second-run medicine choice');
    assert.deepEqual((await state()).choice.opts, ['YES', 'NO']);
    await page.keyboard.press('ArrowDown');
    assert.equal((await state()).choice.i, 1);
    await page.keyboard.press('Enter');
    const refusal = [];
    await finishDialogue(refusal);
    assert.ok(refusal.some(t => t.includes('...So I take it anyway.')));
    assert.equal((await state()).hasMed, true);
    assert.equal((await state()).objective, 'Bring the medicine to Madoka.');
    pass('Second-run NO choice preserves the scripted outcome and medicine objective');
    await page.evaluate(() => { room = 'kids'; player.x = 54; player.y = 126; });
    await page.keyboard.press('z');
    await completeStory(2);

    await page.keyboard.press('z');
    await pumpUntil(s => s.end && s.end.b === 'thank you for playing', 'terminal ending');
    s = await state();
    assert.equal(s.roam, false);
    assert.equal(s.lock, true);
    assert.equal(s.confirm, false);
    for (const key of ['z', 'Enter', 'Space', 'e', 'ArrowRight']) await page.keyboard.press(key);
    await page.clock.fastForward(5000);
    assert.deepEqual((await state()).end, s.end, 'Final screen must not restart the story');
    assert.equal((await state()).player.x, s.player.x);
    pass('Final reflection reaches a terminal ending and ignores further play input');
    assert.deepEqual(errors, [], 'Browser must have no console or uncaught errors');
    pass('No browser console or page errors across the complete game');
    process.stdout.write('\n' + passed + ' browser regression checks passed.\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
