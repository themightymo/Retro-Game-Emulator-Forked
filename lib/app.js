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

	var AUDIO_BUFFERING = 512;
	var SAMPLE_COUNT = 4*1024;
	var SAMPLE_MASK = SAMPLE_COUNT - 1;
	var audio_samples_L = new Float32Array(SAMPLE_COUNT);
	var audio_samples_R = new Float32Array(SAMPLE_COUNT);
	var audio_write_cursor = 0, audio_read_cursor = 0;
	var audio_fraction = 0;
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
		speedCheck = {start: null, frames: 0, previous: null, longestGap: 0, stalls: 0, percent: Math.round(speed * 100), target: nes.opts.preferredFrameRate * speed};
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
	function resetTiming() {
		lastFrameTime = null;
		frameBudget = 0;
		audio_write_cursor = audio_read_cursor = 0;
		audio_fraction = 0;
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
			// Drop the oldest sample if audio output stalls; never wrap to an empty queue.
			if (((audio_write_cursor + 1) & SAMPLE_MASK) === audio_read_cursor) {
				audio_read_cursor = (audio_read_cursor + 1) & SAMPLE_MASK;
			}
			audio_samples_L[audio_write_cursor] = l;
			audio_samples_R[audio_write_cursor] = r;
			audio_write_cursor = (audio_write_cursor + 1) & SAMPLE_MASK;
		},
	});

	function onAnimationFrame(timestamp){
		window.requestAnimationFrame(onAnimationFrame);
		if (!playing || document.hidden) { resetTiming(); return; }
		if (lastFrameTime !== null) {
			// Carry fractional frames forward so refresh rate cannot change game speed.
			// Discard long stalls rather than fast-forwarding to catch up.
			var elapsed = timestamp - lastFrameTime;
			if (elapsed >= 0 && elapsed <= 100) {
				frameBudget += elapsed * nes.opts.preferredFrameRate * speed / 1000;
				while (frameBudget >= 1) { nes.frame(); emulatedFrames++; frameBudget -= 1; }
			} else { resetTiming(); }
		}
		lastFrameTime = timestamp;
		
		image.data.set(framebuffer_u8);
		canvas_ctx.putImageData(image, 0, 0);
		measureSpeed(timestamp);
	}

	function audio_remain(){
		return (audio_write_cursor - audio_read_cursor) & SAMPLE_MASK;
	}

	function audio_callback(event){
		var dst = event.outputBuffer;
		if (!playing || document.hidden) {
			dst.getChannelData(0).fill(0);
			dst.getChannelData(1).fill(0);
			return;
		}
		var len = dst.length;
		
		// Consume emulated audio at the selected rate. Matching the source and
		// output sample rates keeps 100% speed correct on 48 kHz devices too.
		var step = speed * nes.opts.sampleRate / audio_ctx.sampleRate;
		var dst_l = dst.getChannelData(0);
		var dst_r = dst.getChannelData(1);
		for(var i = 0; i < len; i++){
			// Audio follows the clock; an underrun must never advance the game.
			if (audio_remain() < Math.ceil(step) + 1) {
				dst_l.fill(0, i);
				dst_r.fill(0, i);
				break;
			}
			var next = (audio_read_cursor + 1) & SAMPLE_MASK;
			dst_l[i] = audio_samples_L[audio_read_cursor] * (1 - audio_fraction) + audio_samples_L[next] * audio_fraction;
			dst_r[i] = audio_samples_R[audio_read_cursor] * (1 - audio_fraction) + audio_samples_R[next] * audio_fraction;
			audio_fraction += step;
			var consumed = Math.floor(audio_fraction);
			audio_read_cursor = (audio_read_cursor + consumed) & SAMPLE_MASK;
			audio_fraction -= consumed;
		}
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
		var script_processor = audio_ctx.createScriptProcessor(AUDIO_BUFFERING, 0, 2);
		script_processor.onaudioprocess = audio_callback;
		script_processor.connect(audio_ctx.destination);

		INITIALIZED = true;
	}

	function nes_boot(rom_data){
		nes.loadROM(rom_data);
		resetTiming();
		playing = true;
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
		function fail() {
			playing = false;
			canvas.hidden = true;
			empty.hidden = false;
			status.textContent = 'Unable to load this game. Please choose another ROM.';
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
				} catch (error) { fail(); }
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
				audio_write_cursor = audio_read_cursor = 0;
				audio_fraction = 0;
				romSelect.disabled = true;
				nes_load_url(event.target.value);
			} catch (error) {
				status.textContent = 'Unable to start the emulator in this browser.';
				romSelect.disabled = false;
			}
		});
	}
});
