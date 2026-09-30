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

	var nes = new jsnes.NES({
		onFrame: function(framebuffer_24){
			for(var i = 0; i < FRAMEBUFFER_SIZE; i++) framebuffer_u32[i] = 0xFF000000 | framebuffer_24[i];
		},
		onAudioSample: function(l, r){
			audio_samples_L[audio_write_cursor] = l;
			audio_samples_R[audio_write_cursor] = r;
			audio_write_cursor = (audio_write_cursor + 1) & SAMPLE_MASK;
		},
	});

	function onAnimationFrame(){
		window.requestAnimationFrame(onAnimationFrame);
		
		image.data.set(framebuffer_u8);
		canvas_ctx.putImageData(image, 0, 0);
	}

	function audio_remain(){
		return (audio_write_cursor - audio_read_cursor) & SAMPLE_MASK;
	}

	function audio_callback(event){
		var dst = event.outputBuffer;
		if (!playing) {
			dst.getChannelData(0).fill(0);
			dst.getChannelData(1).fill(0);
			return;
		}
		var len = dst.length;
		
		// Attempt to avoid buffer underruns.
		if(audio_remain() < AUDIO_BUFFERING) nes.frame();
		
		var dst_l = dst.getChannelData(0);
		var dst_r = dst.getChannelData(1);
		for(var i = 0; i < len; i++){
			var src_idx = (audio_read_cursor + i) & SAMPLE_MASK;
			dst_l[i] = audio_samples_L[src_idx];
			dst_r[i] = audio_samples_R[src_idx];
		}
		
		audio_read_cursor = (audio_read_cursor + len) & SAMPLE_MASK;
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
			playing = false;
			status.textContent = 'Loading game…';
			try {
				if (!INITIALIZED) nes_init('retro-game-emulator-canvas');
				audio_ctx.resume().catch(function() {
					status.textContent = 'Audio could not start. Select the game again to retry.';
				});
				audio_write_cursor = audio_read_cursor = 0;
				romSelect.disabled = true;
				nes_load_url(event.target.value);
			} catch (error) {
				status.textContent = 'Unable to start the emulator in this browser.';
				romSelect.disabled = false;
			}
		});
	}
});
