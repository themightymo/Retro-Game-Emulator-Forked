/* ROM library for the standalone page. Games the player opens are kept in this
 * browser's IndexedDB and played through app.js's rge:load-file event. */
(function() {
	var panel = document.querySelector('.rge');
	var select = document.getElementById('rge-library-select');
	var fileInput = panel.querySelector('.rge-file');
	var removeButton = panel.querySelector('.rge-remove');
	var note = panel.querySelector('.rge-library-note');
	var emptyText = panel.querySelector('.rge-empty-text');
	// ROMs kept for this visit only, used when IndexedDB is unavailable or a save fails.
	var session = {};

	var dbPromise = new Promise(function(resolve, reject) {
		var request = indexedDB.open('retro-game-emulator', 1);
		request.onupgradeneeded = function() { request.result.createObjectStore('roms', {keyPath: 'name'}); };
		request.onsuccess = function() { resolve(request.result); };
		request.onerror = function() { reject(request.error); };
	});
	dbPromise.catch(function() { /* Falls back to the session library. */ });

	function transact(mode, work) {
		return dbPromise.then(function(db) {
			return new Promise(function(resolve, reject) {
				var tx = db.transaction('roms', mode);
				var request = work(tx.objectStore('roms'));
				tx.oncomplete = function() { resolve(request.result); };
				tx.onerror = tx.onabort = function() { reject(tx.error); };
			});
		});
	}

	function refresh(selected) {
		return transact('readonly', function(store) { return store.getAllKeys(); }).catch(function() { return []; }).then(function(names) {
			Object.keys(session).forEach(function(name) { if (names.indexOf(name) === -1) names.push(name); });
			names.sort(function(a, b) { return a.localeCompare(b); });
			select.length = 1;
			names.forEach(function(name) { select.add(new Option(name, name)); });
			select.value = names.indexOf(selected) === -1 ? '' : selected;
			removeButton.disabled = !select.value;
			emptyText.textContent = names.length
				? 'Choose a game above, or open another .nes ROM from your computer.'
				: 'Open a .nes ROM from your computer, or drop one onto this page. Games you open are saved in this browser only.';
		});
	}

	function play(name, file) {
		note.textContent = '';
		panel.dispatchEvent(new CustomEvent('rge:load-file', {detail: {file: file, name: name}}));
	}

	// Resolves to 'saved', 'session' (kept for this visit only), or 'invalid'.
	function save(file) {
		return file.slice(0, 4).arrayBuffer().then(function(header) {
			var bytes = new Uint8Array(header);
			if (bytes[0] !== 0x4E || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1A) return 'invalid';
			return file.arrayBuffer().then(function(data) {
				return transact('readwrite', function(store) { return store.put({name: file.name, data: data, added: Date.now()}); });
			}).then(function() {
				delete session[file.name];
				return 'saved';
			}, function() {
				session[file.name] = file;
				return 'session';
			});
		});
	}

	function addFiles(files) {
		files = Array.prototype.filter.call(files, function(file) { return /\.nes$/i.test(file.name); });
		if (!files.length) {
			note.textContent = 'Choose an uncompressed .nes ROM file.';
			return;
		}
		// Start the first game straight away, while the browser still allows audio to begin.
		select.value = '';
		play(files[0].name, files[0]);
		Promise.all(files.map(save)).then(function(results) {
			if (results.indexOf('saved') !== -1 && navigator.storage && navigator.storage.persist) {
				navigator.storage.persist().catch(function() {});
			}
			var invalid = results.filter(function(result) { return result === 'invalid'; }).length;
			var messages = [];
			if (invalid) messages.push(invalid === 1 ? '1 file is not a valid NES ROM and was not added.' : invalid + ' files are not valid NES ROMs and were not added.');
			if (results.indexOf('session') !== -1) messages.push('This browser could not save games, so they are available until you leave the page.');
			return refresh(files[0].name).then(function() { note.textContent = messages.join(' '); });
		});
	}

	panel.querySelector('.rge-open').addEventListener('click', function() { fileInput.click(); });
	fileInput.addEventListener('change', function() {
		addFiles(fileInput.files);
		fileInput.value = '';
	});

	select.addEventListener('change', function() {
		var name = select.value;
		removeButton.disabled = !name;
		if (!name) return;
		play(name, session[name] || transact('readonly', function(store) { return store.get(name); }).then(function(record) {
			if (!record) throw new Error('ROM not found');
			return new Blob([record.data]);
		}));
	});

	removeButton.addEventListener('click', function() {
		var name = select.value;
		if (!name) return;
		delete session[name];
		transact('readwrite', function(store) { return store.delete(name); }).catch(function() {}).then(function() {
			return refresh('');
		}).then(function() {
			note.textContent = name + ' was removed from this browser.';
		});
	});

	function hasFiles(event) { return event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, 'Files') !== -1; }
	document.addEventListener('dragover', function(event) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		panel.classList.add('rge-dragging');
	});
	document.addEventListener('dragleave', function(event) {
		if (!event.relatedTarget) panel.classList.remove('rge-dragging');
	});
	document.addEventListener('drop', function(event) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		panel.classList.remove('rge-dragging');
		addFiles(event.dataTransfer.files);
	});

	refresh('');
})();
