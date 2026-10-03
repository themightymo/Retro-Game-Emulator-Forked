/* Ported from https://raw.githubusercontent.com/bfirsh/jsnes/master/example/nes-embed.js */
window.addEventListener('load', function(event) {
	var INITIALIZED = false;
	var playing = false;
	var animationStarted = false;
	var audio_ctx;
	var canvas = document.getElementById('retro-game-emulator-canvas');
	if (!canvas) return;
	var panel = canvas.closest('.rge');
	var status = panel.querySelector('.rge-status-text');
	var empty = panel.querySelector('.rge-empty');
	var SCREEN_WIDTH = 256;
	var SCREEN_HEIGHT = 240;
	var FRAMEBUFFER_SIZE = SCREEN_WIDTH*SCREEN_HEIGHT;

	var canvas_ctx, image;
	var framebuffer_u8, framebuffer_u32;

	var FRAME_RATE = 60; // NTSC NES frame rate; 100% speed targets this.

	// Emulated samples are batched and handed to audio_out, which is either an
	// AudioWorklet's message port or, where worklets are unavailable, a queue
	// drained by a ScriptProcessor on the main thread.
	var AUDIO_BATCH = 512;
	var audio_batch_L = new Float32Array(AUDIO_BATCH);
	var audio_batch_R = new Float32Array(AUDIO_BATCH);
	var audio_batch_len = 0;
	var audio_out = null;
	var speed = 1;
	var speedSelect = panel.querySelector('.rge-speed');
	var speedStorageKey = 'retro-game-emulator-speed-v1';
	var lastFrameTime = null;
	var frameBudget = 0;
	var emulatedFrames = 0;
	var speedCheck = null;
	var speedCheckButton = panel.querySelector('.rge-speed-check');
	var speedCheckResult = panel.querySelector('.rge-speed-result');
	var speedCheckLabel = speedCheckButton.textContent;
	function cancelSpeedCheck(message) {
		var wasRunning = speedCheck !== null;
		speedCheck = null;
		speedCheckButton.disabled = false;
		speedCheckButton.textContent = speedCheckLabel;
		speedCheckResult.textContent = wasRunning ? message : '';
	}
	speedCheckButton.addEventListener('click', function() {
		if (!playing || document.hidden) {
			speedCheckResult.textContent = 'Start a game first, then check its speed.';
			return;
		}
		speedCheck = {start: null, frames: 0, previous: null, longestGap: 0, stalls: 0, percent: Math.round(speed * 100), target: FRAME_RATE * speed};
		speedCheckButton.disabled = true;
		speedCheckButton.textContent = 'Checking…';
		speedCheckResult.textContent = 'Checking 10 seconds of gameplay. Keep playing and leave this tab visible.';
		canvas.focus({preventScroll: true});
	});
	function measureSpeed(timestamp) {
		if (!speedCheck) return;
		var check = speedCheck;
		if (check.start === null) {
			check.start = check.previous = timestamp;
			check.frames = emulatedFrames;
			return;
		}
		var gap = timestamp - check.previous;
		check.previous = timestamp;
		check.longestGap = Math.max(check.longestGap, gap);
		if (gap > 50) check.stalls++;
		var elapsed = timestamp - check.start;
		if (elapsed < 10000) {
			speedCheckButton.textContent = 'Checking… ' + Math.ceil((10000 - elapsed) / 1000) + 's';
			return;
		}
		var fps = (emulatedFrames - check.frames) * 1000 / elapsed;
		var ratio = fps / check.target;
		var result = fps.toFixed(1) + ' game FPS / ' + check.target.toFixed(1) + ' target at ' + check.percent + '%. ';
		result += 'Longest display gap: ' + Math.round(check.longestGap) + ' ms; pauses over 50 ms: ' + check.stalls + '. ';
		if (ratio < 0.98) {
			result += 'The browser is falling behind. Close busy tabs or apps and test again. Raising the speed setting will not fix slowdowns.';
		} else if (ratio > 1.02) {
			result += 'The game ran above the selected target. Run the check again to confirm before adjusting speed.';
		} else if (check.stalls > 0) {
			result += 'Average speed is on target, but playback had pauses. Close busy tabs or apps and test again.';
		} else {
			result += 'Your selected speed is steady. 100% targets 60 game FPS; a lower percentage is a personal preference if the game feels too fast.';
		}
		cancelSpeedCheck('');
		speedCheckResult.textContent = result;
	}
	function validSpeed(value) { return Number.isFinite(value) && value >= 0.25 && value <= 2; }
	try {
		var savedSpeed = Number(localStorage.getItem(speedStorageKey));
		if (validSpeed(savedSpeed)) speed = Math.round(savedSpeed * 100) / 100;
	} catch (error) { /* Speed still works without browser storage. */ }
	speedSelect.value = String(Math.round(speed * 100));
	speedSelect.addEventListener('input', function() {
		var percent = Number(speedSelect.value);
		if (!Number.isInteger(percent) || !validSpeed(percent / 100)) return;
		cancelSpeedCheck('Speed changed. Run the check again at your new setting.');
		speed = percent / 100;
		resetTiming();
		try { localStorage.setItem(speedStorageKey, String(speed)); } catch (error) {}
	});
	speedSelect.addEventListener('change', function() {
		speedSelect.value = String(Math.round(speed * 100));
	});
	function resetAudio() {
		audio_batch_len = 0;
		if (!audio_out) return;
		// step: emulated samples consumed per output sample, so audio follows the
		// selected speed. prime: ~30 ms of cushion against uneven frame delivery.
		var rate = speed * nes.opts.sampleRate;
		audio_out({type: 'reset', step: rate / audio_ctx.sampleRate, prime: Math.ceil(rate * 0.03)});
	}
	function resetTiming() {
		lastFrameTime = null;
		frameBudget = 0;
		resetAudio();
	}
	document.addEventListener('visibilitychange', function() {
		if (document.hidden) cancelSpeedCheck('Check cancelled because the tab was hidden. Keep this tab visible and try again.');
		resetTiming();
		releaseButtons();
	});

	var nes = new jsnes.NES({
		onFrame: function(framebuffer_24){
			for(var i = 0; i < FRAMEBUFFER_SIZE; i++) framebuffer_u32[i] = 0xFF000000 | framebuffer_24[i];
		},
		onAudioSample: function(l, r){
			audio_batch_L[audio_batch_len] = l;
			audio_batch_R[audio_batch_len] = r;
			if (++audio_batch_len === AUDIO_BATCH) flushAudio();
		},
	});

	function onAnimationFrame(timestamp){
		window.requestAnimationFrame(onAnimationFrame);
		if (!playing || document.hidden) {
			if (lastFrameTime !== null) resetTiming();
			return;
		}
		if (lastFrameTime !== null) {
			// Carry fractional frames forward so refresh rate cannot change game speed.
			// Discard long stalls rather than fast-forwarding to catch up.
			var elapsed = timestamp - lastFrameTime;
			if (elapsed >= 0 && elapsed <= 100) {
				frameBudget += elapsed * FRAME_RATE * speed / 1000;
				try {
					while (frameBudget >= 1) { nes.frame(); emulatedFrames++; frameBudget -= 1; }
				} catch (error) {
					// JSNES refuses further frames once a game crashes.
					playing = false;
					resetTiming();
					cancelSpeedCheck('Check cancelled because the game stopped.');
					status.textContent = 'This game stopped unexpectedly. Choose another ROM, or reload the page to play it again.';
					return;
				}
				flushAudio();
			} else { resetTiming(); }
		}
		lastFrameTime = timestamp;

		image.data.set(framebuffer_u8);
		canvas_ctx.putImageData(image, 0, 0);
		measureSpeed(timestamp);
	}

	function flushAudio(){
		if (audio_batch_len && audio_out) {
			audio_out({type: 'samples', left: audio_batch_L.slice(0, audio_batch_len), right: audio_batch_R.slice(0, audio_batch_len)});
		}
		audio_batch_len = 0;
	}

	// Runs inside the AudioWorklet (passed as source text) and on the main thread
	// as the fallback, so it must not reference anything outside itself.
	class NESAudioQueue {
		constructor() {
			this.size = 8192;
			this.mask = this.size - 1;
			this.left = new Float32Array(this.size);
			this.right = new Float32Array(this.size);
			this.handle({type: 'reset', step: 1, prime: 0});
		}
		handle(message) {
			if (message.type === 'reset') {
				this.write = this.read = 0;
				this.fraction = 0;
				this.step = message.step;
				this.prime = message.prime;
				this.primed = false;
				return;
			}
			for (var i = 0; i < message.left.length; i++) {
				// Drop the oldest sample if output stalls; never wrap to an empty queue.
				if (((this.write + 1) & this.mask) === this.read) this.read = (this.read + 1) & this.mask;
				this.left[this.write] = message.left[i];
				this.right[this.write] = message.right[i];
				this.write = (this.write + 1) & this.mask;
			}
		}
		render(dst_l, dst_r) {
			var remain = (this.write - this.read) & this.mask;
			if (!this.primed && remain >= this.prime) this.primed = true;
			for (var i = 0; i < dst_l.length; i++) {
				// Audio follows the clock; an underrun must never advance the game.
				// Rebuild the cushion afterwards so one late frame doesn't crackle repeatedly.
				if (!this.primed || remain < Math.ceil(this.step) + 1) {
					this.primed = false;
					dst_l.fill(0, i);
					dst_r.fill(0, i);
					return;
				}
				var next = (this.read + 1) & this.mask;
				dst_l[i] = this.left[this.read] * (1 - this.fraction) + this.left[next] * this.fraction;
				dst_r[i] = this.right[this.read] * (1 - this.fraction) + this.right[next] * this.fraction;
				this.fraction += this.step;
				var consumed = Math.floor(this.fraction);
				this.read = (this.read + consumed) & this.mask;
				this.fraction -= consumed;
				remain -= consumed;
			}
		}
	}

	async function startAudio(){
		try {
			var source = NESAudioQueue.toString() + '\nregisterProcessor("rge-nes-audio", class extends AudioWorkletProcessor {' +
				'constructor() { super(); var queue = this.queue = new NESAudioQueue(); this.port.onmessage = function(event) { queue.handle(event.data); }; }' +
				'process(inputs, outputs) { this.queue.render(outputs[0][0], outputs[0][1]); return true; }' +
			'});';
			var url = URL.createObjectURL(new Blob([source], {type: 'application/javascript'}));
			try { await audio_ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
			var node = new AudioWorkletNode(audio_ctx, 'rge-nes-audio', {numberOfInputs: 0, outputChannelCount: [2]});
			node.connect(audio_ctx.destination);
			audio_out = function(message) {
				node.port.postMessage(message, message.left ? [message.left.buffer, message.right.buffer] : []);
			};
		} catch (error) {
			// AudioWorklet needs a secure (HTTPS) page and a CSP that allows blob: scripts.
			var queue = new NESAudioQueue();
			var processor = audio_ctx.createScriptProcessor(512, 0, 2);
			processor.onaudioprocess = function(event) {
				queue.render(event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1));
			};
			processor.connect(audio_ctx.destination);
			audio_out = queue.handle.bind(queue);
		}
		resetAudio();
	}

	var defaults = {
		UP: ['ArrowUp'], LEFT: ['ArrowLeft'], DOWN: ['ArrowDown'], RIGHT: ['ArrowRight'],
		A: ['KeyA', 'KeyQ'], B: ['KeyS', 'KeyO'], START: ['Enter'], SELECT: ['Tab']
	};
	var bindings = JSON.parse(JSON.stringify(defaults));
	var storageKey = 'retro-game-emulator-controls-v1';
	var actions = Object.keys(defaults);
	var feedback = panel.querySelector('.rge-controls-feedback');
	var capture = null;
	var held = {};
	function allowed(code) {
		return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|Numpad[0-9])$/.test(code);
	}
	try {
		var saved = JSON.parse(localStorage.getItem(storageKey));
		var seen = [];
		if (saved && actions.every(function(action) {
			return Array.isArray(saved[action]) && saved[action].length > 0 && saved[action].length <= 2 && saved[action].every(function(code) {
				if (typeof code !== 'string' || !allowed(code) || seen.indexOf(code) !== -1) return false;
				seen.push(code);
				return true;
			});
		})) bindings = saved;
	} catch (error) { /* Controls still work when storage is unavailable. */ }
	function keyLabel(code) {
		var labels = {ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
			BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
			Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', Backquote: '`'};
		return labels[code] || code.replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, ' $1');
	}
	function renderControls() {
		panel.querySelectorAll('[data-control-keys]').forEach(function(node) {
			node.textContent = bindings[node.dataset.controlKeys].map(keyLabel).join(' / ');
		});
		panel.querySelectorAll('[data-remap]').forEach(function(button) {
			button.setAttribute('aria-pressed', button === capture ? 'true' : 'false');
			if (button === capture) button.querySelector('kbd').textContent = 'Press a key…';
		});
	}
	function releaseButtons() {
		held = {};
		for (var button = 0; button < 8; button++) nes.buttonUp(1, button);
	}
	function cancelCapture(message) {
		capture = null;
		renderControls();
		if (message) feedback.textContent = message;
	}
	function saveControls() {
		try {
			localStorage.setItem(storageKey, JSON.stringify(bindings));
			feedback.textContent = 'Controls saved in this browser.';
		} catch (error) {
			feedback.textContent = 'Controls updated for this visit. This browser could not save them.';
		}
		renderControls();
	}
	panel.querySelectorAll('[data-remap]').forEach(function(button) {
		button.addEventListener('click', function() {
			releaseButtons();
			capture = button;
			feedback.textContent = 'Press a key for ' + button.dataset.remap + '. Press Esc to cancel.';
			renderControls();
		});
		button.addEventListener('blur', function() {
			if (capture === button) cancelCapture('Change cancelled.');
		});
		button.addEventListener('keydown', function(event) {
			if (capture !== button) return;
			event.preventDefault();
			event.stopPropagation();
			button.capturedKey = event.code;
			if (event.key === 'Escape') { cancelCapture('Change cancelled.'); return; }
			if (event.repeat) return;
			if (!allowed(event.code) || event.metaKey || (event.ctrlKey && !event.code.startsWith('Control')) || (event.altKey && !event.code.startsWith('Alt'))) {
				feedback.textContent = 'Choose a letter, number, arrow, or a single keyboard key. Esc is reserved to leave the game.';
				return;
			}
			var conflict = actions.find(function(action) {
				return action !== button.dataset.remap && bindings[action].indexOf(event.code) !== -1;
			});
			if (conflict) {
				feedback.textContent = keyLabel(event.code) + ' is already used for ' + conflict + '. Choose another key.';
				return;
			}
			bindings[button.dataset.remap] = [event.code];
			cancelCapture();
			saveControls();
		});
		// Prevent Space/Enter keyup from reactivating the capture button.
		button.addEventListener('keyup', function(event) {
			if (button.capturedKey === event.code) {
				event.preventDefault();
				button.capturedKey = null;
			}
		});
	});
	panel.querySelector('.rge-controls-reset').addEventListener('click', function() {
		releaseButtons();
		bindings = JSON.parse(JSON.stringify(defaults));
		cancelCapture();
		saveControls();
	});
	window.addEventListener('blur', function() { releaseButtons(); cancelCapture(); });
	renderControls();

	var player = panel.querySelector('.rge-player');
	var fullscreenButton = panel.querySelector('.rge-fullscreen');
	var fullscreenFeedback = panel.querySelector('.rge-fullscreen-feedback');
	if (player.requestFullscreen && document.fullscreenEnabled) {
		fullscreenButton.hidden = false;
		fullscreenButton.addEventListener('click', async function() {
			fullscreenFeedback.textContent = '';
			try {
				if (document.fullscreenElement === player) {
					await document.exitFullscreen();
				} else {
					await player.requestFullscreen();
				}
			} catch (error) {
				fullscreenFeedback.textContent = fullscreenButton.dataset.errorLabel;
			}
		});
		document.addEventListener('fullscreenchange', function() {
			var active = document.fullscreenElement === player;
			fullscreenButton.setAttribute('aria-pressed', active ? 'true' : 'false');
			fullscreenButton.textContent = active ? fullscreenButton.dataset.exitLabel : fullscreenButton.dataset.enterLabel;
			releaseButtons();
			if (active && playing) canvas.focus({preventScroll: true});
			if (!document.fullscreenElement) fullscreenButton.focus({preventScroll: true});
		});
	}

	function keyboard(down, event){
		if (!playing || document.activeElement !== canvas || capture) return;
		if (event.key === 'Escape') { event.preventDefault(); canvas.blur(); return; }
		if (down && (event.metaKey || event.ctrlKey || event.altKey) && !/^(Control|Alt)/.test(event.code)) return;
		var action = actions.find(function(name) { return bindings[name].indexOf(event.code) !== -1; });
		if (!action) return;
		event.preventDefault();
		if (down) {
			held[event.code] = action;
			nes.buttonDown(1, jsnes.Controller['BUTTON_' + action]);
		} else {
			delete held[event.code];
			if (!Object.keys(held).some(function(code) { return held[code] === action; })) {
				nes.buttonUp(1, jsnes.Controller['BUTTON_' + action]);
			}
		}
	}

	function nes_init(canvas_id){
		var canvas = document.getElementById(canvas_id);
		// Keep the placeholder visible until a ROM loads successfully.
		canvas_ctx = canvas.getContext("2d");
		image = canvas_ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		
		canvas_ctx.fillStyle = "black";
		canvas_ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		
		// Allocate framebuffer array.
		var buffer = new ArrayBuffer(image.data.length);
		framebuffer_u8 = new Uint8ClampedArray(buffer);
		framebuffer_u32 = new Uint32Array(buffer);
		
		// Setup audio.
		audio_ctx = new window.AudioContext();
		startAudio();

		INITIALIZED = true;
	}

	function nes_boot(rom_data){
		nes.loadROM(rom_data);
		playing = true;
		resetTiming();
		canvas.hidden = false;
		empty.hidden = true;
		canvas.focus({preventScroll: true});
		if (!animationStarted) {
			animationStarted = true;
			window.requestAnimationFrame(onAnimationFrame);
		}
	}

	function nes_load_data(canvas_id, rom_data){
		nes_init(canvas_id);
		nes_boot(rom_data);
	}

	function nes_load_url(path){
		var req = new XMLHttpRequest();
		req.open("GET", path);
		req.overrideMimeType("text/plain; charset=x-user-defined");
		function fail(error) {
			playing = false;
			canvas.hidden = true;
			empty.hidden = false;
			var mapper = error instanceof Error && /^Unsupported mapper: (\d+)/.exec(error.message);
			status.textContent = mapper
				? 'This game uses cartridge mapper ' + mapper[1] + ', which the emulator does not support. Please choose another ROM.'
				: 'Unable to load this game. Please choose another ROM.';
			romSelect.disabled = false;
		}
		req.onerror = fail;
		req.timeout = 20000;
		req.ontimeout = fail;
		
		req.onload = function() {
			if (this.status === 200) {
				try {
					nes_boot(this.responseText);
					status.textContent = 'Now playing · ' + romSelect.options[romSelect.selectedIndex].text;
					romSelect.disabled = false;
				} catch (error) { fail(error); }
			} else if (this.status === 0) {
				// Aborted, so ignore error
			} else {
				req.onerror();
			}
		};
		
		req.send();
	}

	canvas.addEventListener('blur', releaseButtons);

	document.addEventListener('keydown' , (event) => {keyboard(true, event)});
	document.addEventListener('keyup', (event) => {keyboard(false, event)});

	var romSelect = document.getElementById('retro-game-emulator-game-select');

	if (romSelect) {
		romSelect.addEventListener('change', function(event) {
			if (!event.target.value) return;
			cancelSpeedCheck('Game changed. Run the check again once it loads.');
			playing = false;
			status.textContent = 'Loading game…';
			try {
				if (!INITIALIZED) nes_init('retro-game-emulator-canvas');
				audio_ctx.resume().catch(function() {
					status.textContent = 'Audio could not start. Select the game again to retry.';
				});
				resetTiming();
				romSelect.disabled = true;
				nes_load_url(event.target.value);
			} catch (error) {
				status.textContent = 'Unable to start the emulator in this browser.';
				romSelect.disabled = false;
			}
		});
	}
});
