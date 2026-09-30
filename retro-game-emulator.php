<?php
/**
 * @package Retro Game Emulator
 */
/*
Plugin Name: Retro Game Emulator (updated by Toby on Sept. 29, 2026)
Plugin URI: https://wordpress.org/plugins/retro-game-emulator/
Description: Run an NES emulator on your Wordpress site.
Version: 1.3.1
Author: grimmdude
Author URI: http://grimmdude.com
Text Domain: jsnes
License: GPLv2 or later
*/

// Make sure we don't expose any info if called directly
if (! defined('ABSPATH')) {
	exit;
}

if (! class_exists('RetroGameEmulator')) {
	class RetroGameEmulator
	{

		public $romsFolder = '/retro-game-emulator/';

		public $romsPath;

		public $romsURL;


		public function __construct()
		{
			$uploads_dir = wp_upload_dir();
			$this->romsPath = $uploads_dir['basedir'] . $this->romsFolder;
			$this->romsURL = $uploads_dir['baseurl'] . $this->romsFolder;

			add_action('wp_enqueue_scripts', function () {
				wp_enqueue_script('jsnes', plugins_url('lib/jsnes.min.js', __FILE__), [], '1.2.0');
				wp_enqueue_script('retro-game-emulator-app', plugins_url('lib/app.js', __FILE__), array('jsnes'), '1.3.1');
			});

			add_action('wp_head', array($this, 'head'));
			add_shortcode('nes', array($this, 'shortcode'));
			add_action('init', array($this, 'registerBlocks'));

			/*
			register_activation_hook(__FILE__, function () {
				// Try to create wp-content/retro-game-emulator directory if it doesn't exist
				if ( ! file_exists(WP_CONTENT_DIR . '/retro-game-emulator')) {
					mkdir(WP_CONTENT_DIR . '/retro-game-emulator');
				}
			});
			*/

			add_action('admin_menu', function () {
				add_options_page('Retro Game Emulator', 'Retro Game Emulator', 'manage_options', 'retro-game-emulator', array($this, 'optionsPage'));
			});

			add_action('admin_enqueue_scripts', array($this, 'enqueueMediaUploader'));
			add_action('admin_init', array($this, 'prepareMediaUpload'));
		}

		/**
		 * Whether a filename is a plain .nes file name with no path components.
		 */
		public function isRomFile($name)
		{
			return is_string($name)
				&& $name === basename($name)
				&& $name !== ''
				&& $name[0] !== '.'
				&& strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'nes';
		}

		public function head()
		{
			if (is_dir($this->romsPath)) {
				$roms = scandir($this->romsPath);
				$romsArray = array();

				foreach ($roms as $rom) {
					if ($this->isRomFile($rom)) {
						$romsArray[] = array('name' => $rom, 'url' => $this->romsURL . rawurlencode($rom));
					}
				}
				?>
					<script type="text/javascript">
						var retroGameEmulator = {roms: <?php echo wp_json_encode($romsArray); ?>};
					</script>
				<?php
			}
		}


		public function shortcode($atts)
		{
			if (current_user_can('manage_options') && current_user_can('upload_files')) {
				$this->enqueueRomUploader();
			}

			$romsArray = array();

			if (is_dir($this->romsPath)) {
				$roms = scandir($this->romsPath);
				$romsArray = array();

				foreach ($roms as $rom) {
					if ($this->isRomFile($rom)) {
						$romsArray[] = array('name' => $rom, 'url' => $this->romsURL . rawurlencode($rom));
					}
				}
			}

			ob_start();
			include(plugin_dir_path(__FILE__) . 'shortcode-template.php');
			return ob_get_clean();
		}


		public function registerBlocks()
		{
			// Blocks registered from block.json require WordPress 5.5+.
			if (! function_exists('register_block_type')) {
				return;
			}

			register_block_type(plugin_dir_path(__FILE__) . 'blocks/nes', array(
				'render_callback' => array($this, 'renderBlock'),
			));
		}


		public function renderBlock($attributes)
		{
			$wrapperAttributes = function_exists('get_block_wrapper_attributes') ? get_block_wrapper_attributes() : 'class="wp-block-retro-game-emulator-nes"';

			return '<div ' . $wrapperAttributes . '>' . $this->shortcode(array()) . '</div>';
		}


		public function optionsPage()
		{
			if (! current_user_can('manage_options')) {
				wp_die(esc_html__('You do not have sufficient permissions to access this page.'));
			}

			// Handle deleting rom
			if (isset($_GET['action']) && is_string($_GET['action']) && substr($_GET['action'], 0, 11) === 'delete-rom-') {
				$rom = substr(wp_unslash($_GET['action']), 11);
				check_admin_referer("delete-rom-$rom");

				// Only allow deleting .nes files directly inside the roms folder (no path traversal).
				if ($this->isRomFile($rom)) {
					$file = realpath($this->romsPath . $rom);
					$dir = realpath($this->romsPath);
					if ($file && $dir && dirname($file) === $dir && is_file($file)) {
						$attachment_id = attachment_url_to_postid($this->romsURL . $rom);
						if ($attachment_id && current_user_can('delete_post', $attachment_id)) {
							wp_delete_attachment($attachment_id, true);
						} elseif (! $attachment_id) {
							wp_delete_file($file);
						}
					}
				}
			}

			$notice_key = 'retro_game_upload_' . get_current_user_id();
			$notice = get_transient($notice_key);
			if (is_array($notice)) {
				delete_transient($notice_key);
				add_settings_error('retro-game-emulator', 'rom-upload', $notice['message'], $notice['type']);
			}

			include plugin_dir_path(__FILE__) . 'options.php';
		}


		public function enqueueMediaUploader($hook)
		{
			if ($hook !== 'settings_page_retro-game-emulator') {
				return;
			}

			$this->enqueueRomUploader();
		}

		public function enqueueRomUploader()
		{
			// Shortcodes and blocks can render more than once on the same page.
			if (wp_script_is('retro-game-emulator-admin', 'enqueued')) {
				return;
			}

			add_filter('plupload_default_params', function ($params) {
				$params['retro_game_upload_nonce'] = wp_create_nonce('retro-game-media-upload');
				return $params;
			});
			add_filter('plupload_default_settings', function ($settings) {
				$settings['filters']['mime_types'] = array(array('title' => __('NES ROMs'), 'extensions' => 'nes'));
				return $settings;
			});
			wp_enqueue_media();
			wp_enqueue_script('retro-game-emulator-admin', plugins_url('lib/admin.js', __FILE__), array('media-views'), '1.3.3', true);
			wp_localize_script('retro-game-emulator-admin', 'retroGameMedia', array(
				'title' => __('Upload NES ROMs'),
				'button' => __('Done'),
			));
		}

		public function prepareMediaUpload()
		{
			if (! isset($_POST['retro_game_upload_nonce']) || ! isset($_REQUEST['action']) || $_REQUEST['action'] !== 'upload-attachment') {
				return;
			}
			check_ajax_referer('retro-game-media-upload', 'retro_game_upload_nonce');
			if (! current_user_can('manage_options') || ! current_user_can('upload_files')) {
				wp_send_json_error(array('message' => __('You do not have permission to upload ROMs.')), 403);
			}

			add_filter('upload_mimes', function ($mimes) {
				return array('nes' => 'application/octet-stream');
			});
			add_filter('wp_handle_upload_prefilter', function ($file) {
				if (! $this->isRomFile($file['name'])) {
					$file['error'] = __('Only .nes ROM files can be uploaded.');
				} elseif (! $file['error'] && ! $this->hasRomHeader($file['tmp_name'])) {
					$file['error'] = __('This file is not a valid NES ROM. Choose an uncompressed .nes file.');
				}
				return $file;
			});
			add_filter('wp_check_filetype_and_ext', function ($data, $file, $filename) {
				if ($this->isRomFile($filename) && $this->hasRomHeader($file)) {
					return array('ext' => 'nes', 'type' => 'application/octet-stream', 'proper_filename' => false);
				}
				return $data;
			}, 10, 3);
			add_filter('upload_dir', function ($dir) {
				$dir['subdir'] = '/retro-game-emulator';
				$dir['path'] = $dir['basedir'] . $dir['subdir'];
				$dir['url'] = $dir['baseurl'] . $dir['subdir'];
				return $dir;
			});
		}

		public function hasRomHeader($file)
		{
			$header = is_readable($file) ? file_get_contents($file, false, null, 0, 16) : false;
			return is_string($header) && strlen($header) === 16 && substr($header, 0, 4) === "NES\x1a";
		}
	}

	new RetroGameEmulator;
}
