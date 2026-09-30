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

			add_action('admin_post_retro_game_upload_rom', array($this, 'handleOptions'));
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
						wp_delete_file($file);
					}
				}
			}

			include plugin_dir_path(__FILE__) . 'options.php';
		}


		public function handleOptions()
		{
			if (! current_user_can('manage_options')) {
				wp_die(esc_html__('You do not have sufficient permissions to access this page.'), 403);
			}

			$nonce = isset($_POST['retro-game-emulator-nonce']) ? sanitize_text_field(wp_unslash($_POST['retro-game-emulator-nonce'])) : '';

			if (wp_verify_nonce($nonce, 'retro-game-emulator-options')) {
				add_filter('upload_dir', function ($param) {
					$param['path'] = $param['basedir'] . '/retro-game-emulator/';
					$param['url'] = $param['baseurl'] . '/retro-game-emulator';
					return $param;
				});

				add_filter('mime_types', function ($mimes) {
					$mimes['nes'] = 'application/octet-stream';
					return $mimes;
				});

				// Only accept .nes files.
				if (isset($_FILES['rom_file']['name']) && $this->isRomFile(sanitize_file_name($_FILES['rom_file']['name']))) {
					wp_handle_upload($_FILES['rom_file'], array(
						'action' => 'retro_game_upload_rom',
						'mimes' => array('nes' => 'application/octet-stream'),
					));
				}

				wp_safe_redirect(admin_url('options-general.php?page=retro-game-emulator'));
				exit;
			}

			wp_die(esc_html__('The link you followed has expired.'), 403);
		}
	}

	new RetroGameEmulator;
}
