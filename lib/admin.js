/* global wp, retroGameMedia */
(function () {
	'use strict';

	document.querySelectorAll('#retro-game-upload-roms, .retro-game-upload-roms').forEach(function (button) {
		button.addEventListener('click', openUploader);
	});

	function openUploader() {
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
	}
}());
