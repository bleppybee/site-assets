/* Original character artwork shared by the combined game. */
(function () {
  'use strict';

  const script = document.currentScript;
  const assetRoot = new URL('.', script && script.src ? script.src : document.baseURI);
  const cellWidth = 32;
  const cellHeight = 48;
  const directionRows = [0, 1, 3, 2]; // Game 2: down, up, right, left.
  const directionNames = ['front', 'back', 'right', 'left'];
  const characters = {
    shuu: {
      file: 'shuu_animation_sheet_cropped.png',
      visibleHeight: 42,
      // Inclusive alpha bounds, measured from the original PNG offline.
      bounds: [
        [[3, 7, 28, 44], [3, 6, 28, 44], [3, 6, 28, 44]],
        [[3, 6, 28, 43], [3, 6, 28, 44], [3, 6, 28, 44]],
        [[4, 5, 27, 44], [4, 5, 27, 46], [4, 5, 27, 46]],
        [[4, 5, 27, 44], [4, 5, 27, 46], [4, 5, 27, 46]]
      ],
      sheet: null,
      fallback: []
    },
    madoka: {
      file: 'madoka_animation_sheet_cropped.png',
      visibleHeight: 34,
      bounds: [
        [[4, 12, 27, 44], [4, 12, 27, 44], [4, 12, 27, 44]],
        [[4, 11, 27, 43], [4, 11, 27, 43], [4, 11, 27, 43]],
        [[4, 11, 26, 44], [4, 11, 26, 44], [4, 11, 26, 44]],
        [[6, 11, 28, 44], [4, 11, 26, 44], [6, 11, 28, 44]]
      ],
      sheet: null,
      fallback: []
    }
  };

  const status = { shuu: 'loading', madoka: 'loading' };
  const errors = [];

  function loadImage(relativePath) {
    return new Promise(function (resolve) {
      const img = new Image();
      const url = new URL(relativePath, assetRoot).href;
      let finished = false;
      const timeout = window.setTimeout(function () { finish(false); }, 10000);

      function finish(success) {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        img.onload = null;
        img.onerror = null;
        if (!success) errors.push('Could not load sprite: ' + relativePath);
        resolve(success ? img : null);
      }

      img.onload = function () { finish(img.naturalWidth > 0 && img.naturalHeight > 0); };
      img.onerror = function () { finish(false); };
      img.src = url;
    });
  }

  async function loadCharacter(key) {
    const character = characters[key];
    const sheet = await loadImage(character.file);
    if (sheet && sheet.naturalWidth === 96 && sheet.naturalHeight === 192) {
      character.sheet = sheet;
      status[key] = 'ready';
      return;
    }
    if (sheet) errors.push('Unexpected sprite sheet dimensions: ' + character.file);
    character.fallback = await Promise.all(directionNames.map(function (direction) {
      return loadImage('shuu_little_horrors_v4/assets/' + key + '_' + direction + '.png');
    }));
    status[key] = character.fallback.some(Boolean) ? 'fallback' : 'error';
  }

  function draw(ctx, key, x, feetY, height, dir, moving, walkTime) {
    const character = characters[key];
    if (!character || !Number.isFinite(height) || height <= 0) return false;
    const direction = Number.isInteger(dir) && dir >= 0 && dir < 4 ? dir : 0;
    const row = directionRows[direction];
    let source;
    let sx;
    let sy;
    let sw;
    let sh;
    let scale;

    if (character.sheet) {
      const time = Number.isFinite(walkTime) ? Math.max(0, walkTime) : 0;
      const step = Math.floor(time * 8);
      const frame = !moving ? 0 : row < 2 ? 1 + step % 2 : step % 3;
      const bounds = character.bounds[row][frame];
      source = character.sheet;
      sx = frame * cellWidth + bounds[0];
      sy = row * cellHeight + bounds[1];
      sw = bounds[2] - bounds[0] + 1;
      sh = bounds[3] - bounds[1] + 1;
      // Keep every source pixel. Fractional shrinking erased eyes, hair and
      // clothing details during exploration even with smoothing disabled.
      // The requested height is a size hint; pixel art uses whole multiples.
      scale = Math.max(1, Math.round(height / character.visibleHeight));
    } else {
      source = character.fallback[direction] || character.fallback.find(Boolean);
      if (!source) return false;
      sx = 0;
      sy = 0;
      sw = source.naturalWidth;
      sh = source.naturalHeight;
      scale = Math.max(1, Math.round(height / sh));
    }

    const width = sw * scale;
    const drawnHeight = sh * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, sx, sy, sw, sh,
      Math.round(x - width / 2), Math.round(feetY - drawnHeight), width, drawnHeight);
    ctx.restore();
    return true;
  }

  const api = { ready: null, draw: draw, status: status, errors: errors };
  window.GameSprites = api;
  api.ready = Promise.all(Object.keys(characters).map(loadCharacter)).then(function () {
    return api;
  });
}());
