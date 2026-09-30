<?php if (! defined('ABSPATH')) { exit; } ?>
<div class="wrap">
	<h2><span class="dashicons dashicons-format-image" style="font-size:38px;display:inline;vertical-align:middle;"></span> Retro Game Emulator</h2>
	<?php settings_errors('retro-game-emulator'); ?>
	<p>To insert the emulator in a post or page use the shortcode <code>[nes]</code></p>
	<div class="card">
		<h3><?php esc_html_e('Upload ROMs'); ?></h3>
		<p><?php printf(esc_html__('Select or drag in multiple %s files in the WordPress media uploader. Uploaded ROMs are installed automatically; close the uploader to refresh the list.'), '<code>.nes</code>'); ?></p>
		<button type="button" class="button button-primary" id="retro-game-upload-roms"><?php esc_html_e('Upload ROMs'); ?></button>
	</div>

	<h3><?php _e('Installed Roms'); ?></h3>
	<table class="wp-list-table widefat fixed striped">
		<tr>
			<td>Filename</td>
			<td>Actions</td>
		</tr>
		<?php if (is_dir($this->romsPath)) : ?>
			<?php foreach (scandir($this->romsPath) as $rom) : ?>
				<?php if ($this->isRomFile($rom)) : ?>
					<tr>
						<td><?php echo esc_html($rom); ?></td>
						<td class=""><a href="<?php echo esc_url(wp_nonce_url(add_query_arg(array('page' => 'retro-game-emulator', 'action' => rawurlencode("delete-rom-$rom")), admin_url('options-general.php')), "delete-rom-$rom")); ?>" style="color:#a00;" onclick="return confirm('Are you sure?')">Delete</a></td>
					</tr>
				<?php endif; ?>
			<?php endforeach; ?>
		<?php endif; ?>
	</table>
	<p><?php _e('Roms are stored in'); ?> <code><?php echo esc_html($this->romsPath); ?></code></p>
</div>
