/* global wp, retroGameMedia */
(function () {
	'use strict';

	var button = document.getElementById('retro-game-upload-roms');
	if (!button) {
		return;
	}

	button.addEventListener('click', function () {
		var frame = wp.media({
			title: retroGameMedia.title,
			button: { text: retroGameMedia.button },
			multiple: true,
			library: { type: 'application/octet-stream' }
		});

		frame.on('open', function () {
			frame.content.mode('upload');
		});
		frame.on('close', function () {
			// Keep uploads running if the modal is closed before its queue finishes.
			if (wp.Uploader.queue.some(function (file) { return file.get('uploading'); })) {
				wp.Uploader.queue.once('reset', function () {
					window.location.reload();
				});
			} else {
				window.location.reload();
			}
		});
		frame.open();
	});
}());
