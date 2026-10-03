// Run with: node tests/speed-analysis.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/app.js'), 'utf8');
const analysis = source.slice(source.indexOf('\tvar emulatedFrames ='), source.indexOf('\tfunction validSpeed'));
const reset = source.slice(source.indexOf('\tfunction resetAudio()'), source.indexOf("\tdocument.addEventListener('visibilitychange'"));
const scheduler = source.slice(source.indexOf('\tfunction onAnimationFrame('), source.indexOf('\n\tfunction flushAudio'));
function setup(speed = 1) {
 const button = {textContent: 'Check game speed', addEventListener(type, handler) { this[type] = handler; }};
 const result = {textContent: ''};
 const context = {speed, playing: true, document: {hidden: false}, lastFrameTime: null, frameBudget: 0,
  FRAME_RATE: 60, audio_batch_len: 0, audio_out: null, flushAudio() {},
  panel: {querySelector: selector => selector === '.rge-speed-check' ? button : result},
  canvas: {focus() {}}, window: {requestAnimationFrame() {}},
  nes: {opts: {sampleRate: 48000}, frame() {}},
  image: {data: {set() {}}}, framebuffer_u8: [], canvas_ctx: {putImageData() {}}};
 vm.createContext(context);
 vm.runInContext(analysis + reset + scheduler, context);
 return {context, button, result};
}
for (const hz of [30, 60, 120, 144, 165]) {
 for (const speed of [0.25, 0.92, 0.97, 1, 2]) {
  const {context: c, button, result} = setup(speed);
  button.click();
  assert.equal(button.disabled, true);
  for (let i = 0; i <= hz * 10; i++) c.onAnimationFrame(i * 1000 / hz);
  assert.match(result.textContent, /selected speed is steady/);
  assert(result.textContent.includes((60 * speed).toFixed(1) + ' target'));
  assert.equal(button.disabled, false);
  assert.equal(c.speed, speed, 'Analysis must not change the selected speed');
 }
}
{
 const {context: c, button, result} = setup();
 button.click();
 for (let t = 0; t <= 10000; t += 200) c.onAnimationFrame(t);
 assert.match(result.textContent, /browser is falling behind/);
 assert.match(result.textContent, /Raising the speed setting will not fix/);
 assert.equal(button.disabled, false);
}
{
 const {context: c, button, result} = setup();
 button.click();
 for (let t = 0; t <= 10000; t += 50) c.onAnimationFrame(t === 5000 ? 5020 : t);
 assert.match(result.textContent, /Average speed is on target, but playback had pauses/);
}
{
 const {context: c, button, result} = setup();
 c.playing = false;
 button.click();
 assert.match(result.textContent, /Start a game first/);
 c.playing = true;
 button.click();
 c.onAnimationFrame(0);
 c.cancelSpeedCheck('Check cancelled.');
 c.onAnimationFrame(10000);
 assert.equal(result.textContent, 'Check cancelled.');
 assert.equal(button.disabled, false);
 button.click();
 assert.equal(button.disabled, true, 'Can retry after cancellation');
}
console.log('Passed: 25 refresh-rate/speed combinations, slowdowns, uneven playback, no-game guard, cancellation, and retry.');
