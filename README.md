# Special Medicine

index.html in this folder to play the combined version. No install or local server is needed. Keep files together so  browser can find the artwork bbygirl.

The combined game uses **Game 2's gameplay**: room exploration, object inspection, dialogue, choices, timed button-mashing sequences, and the full two-morning story and ending. It adds Shuu and Madoka's directional sprite sheets from the Little Horrors index version, animated walking, objectives, room labels, and a medicine indicator. All that jazz.

Controls:

- **WASD / arrow keys:** move; up/down selects a choice.
- **Z / Enter / Space / E:** interact, reveal dialogue, advance, or confirm.
- **Repeatedly press Z** when a timed prompt appears. Holding the key does not count as repeated presses.
- **M / Sound button:** toggle sound.
- **Click the title screen** or press an interaction key to begin.

Combined version also fixes the competing title render loop, gives speaker names their own dialogue-box space, clears held movement on focus loss, and loads sprites directly without canvas pixel reads so opening the game as a local file works.

Sprites use OG pixels at whole-number scales in every scene. Exploration, bed, and title sprites are never shrunk below their native resolution, & camera shake stays aligned to the pixel grid.
