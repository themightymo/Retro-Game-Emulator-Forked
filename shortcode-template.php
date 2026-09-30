<?php if (! defined('ABSPATH')) { exit; } ?>
<section class="rge" aria-label="<?php esc_attr_e('NES game emulator'); ?>">
    <header class="rge-header">
        <div><span class="rge-eyebrow">THE ORIGINAL PLAY SESSION</span><h2><?php esc_html_e('Your pocket arcade.'); ?></h2><p><?php esc_html_e('Classic games. One more round.'); ?></p></div>
        <span class="rge-badge"><span aria-hidden="true"></span> NES / 8-BIT</span>
    </header>
    <div class="rge-library">
        <div class="rge-picker"><label for="retro-game-emulator-game-select"><?php esc_html_e('CHOOSE YOUR GAME'); ?></label>
            <select id="retro-game-emulator-game-select">
                <option value=""><?php esc_html_e('Select a ROM to start playing'); ?></option>
                <?php foreach ($romsArray as $rom) : ?>
                    <option value="<?php echo esc_url($rom['url']); ?>"><?php echo esc_html($rom['name']); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php if (current_user_can('manage_options') && current_user_can('upload_files')) : ?>
            <button type="button" class="rge-upload retro-game-upload-roms"><?php esc_html_e('+ Upload ROMs'); ?></button>
        <?php endif; ?>
    </div>
    <div class="rge-screen">
        <div class="rge-empty">
            <svg width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true"><rect x="3" y="7" width="66" height="38" rx="12" stroke="currentColor" stroke-width="3"/><path d="M22 17v18M13 26h18" stroke="currentColor" stroke-width="4"/><circle cx="49" cy="29" r="4" fill="currentColor"/><circle cx="59" cy="21" r="4" fill="currentColor"/></svg>
            <h3><?php esc_html_e('Ready, player one?'); ?></h3>
            <p><?php echo empty($romsArray) ? esc_html__('Your arcade is waiting for its first game. Add a .nes ROM to get started.') : esc_html__('Choose a game above and pick up where nostalgia begins.'); ?></p>
            <span class="rge-screen-note"><?php esc_html_e('A keyboard is your controller'); ?></span>
        </div>
        <canvas id="retro-game-emulator-canvas" width="256" height="240" tabindex="0" aria-label="<?php esc_attr_e('Game screen. Focus here to use the keyboard controls.'); ?>" hidden></canvas>
    </div>
    <div class="rge-status"><span class="rge-status-text" role="status" aria-live="polite"><?php esc_html_e('Waiting for a game'); ?></span><span>256 × 240 <span aria-hidden="true">/</span> NES</span></div>
    <div class="rge-controls">
        <div class="rge-controls-heading"><h3><?php esc_html_e('The controls'); ?></h3><span><?php esc_html_e('PLAYER 01'); ?></span></div>
        <div class="rge-keys">
            <div><span class="rge-key-group"><button type="button" class="rge-remap" data-remap="UP" aria-label="<?php esc_attr_e('Change Up key'); ?>" title="<?php esc_attr_e('Change Up key'); ?>" aria-pressed="false"><kbd data-control-keys="UP">↑</kbd></button><button type="button" class="rge-remap" data-remap="LEFT" aria-label="<?php esc_attr_e('Change Left key'); ?>" title="<?php esc_attr_e('Change Left key'); ?>" aria-pressed="false"><kbd data-control-keys="LEFT">←</kbd></button><button type="button" class="rge-remap" data-remap="DOWN" aria-label="<?php esc_attr_e('Change Down key'); ?>" title="<?php esc_attr_e('Change Down key'); ?>" aria-pressed="false"><kbd data-control-keys="DOWN">↓</kbd></button><button type="button" class="rge-remap" data-remap="RIGHT" aria-label="<?php esc_attr_e('Change Right key'); ?>" title="<?php esc_attr_e('Change Right key'); ?>" aria-pressed="false"><kbd data-control-keys="RIGHT">→</kbd></button></span><span><?php esc_html_e('Move'); ?></span></div>
            <div><span class="rge-key-group"><button type="button" class="rge-remap" data-remap="A" aria-label="<?php esc_attr_e('Change A button key'); ?>" title="<?php esc_attr_e('Change A button key'); ?>" aria-pressed="false"><kbd data-control-keys="A">A</kbd></button><button type="button" class="rge-remap" data-remap="B" aria-label="<?php esc_attr_e('Change B button key'); ?>" title="<?php esc_attr_e('Change B button key'); ?>" aria-pressed="false"><kbd data-control-keys="B">S</kbd></button></span><span><?php esc_html_e('A / B buttons'); ?></span></div>
            <div><button type="button" class="rge-remap" data-remap="START" aria-label="<?php esc_attr_e('Change Start key'); ?>" title="<?php esc_attr_e('Change Start key'); ?>" aria-pressed="false"><kbd data-control-keys="START">Enter</kbd></button><span><?php esc_html_e('Start'); ?></span></div>
            <div><button type="button" class="rge-remap" data-remap="SELECT" aria-label="<?php esc_attr_e('Change Select key'); ?>" title="<?php esc_attr_e('Change Select key'); ?>" aria-pressed="false"><kbd data-control-keys="SELECT">Tab</kbd></button><span><?php esc_html_e('Select'); ?></span></div>
        </div>
        <div class="rge-controls-help">
            <p><?php esc_html_e('Click any key to change it. Press Esc to cancel. Saved in this browser.'); ?></p>
            <button type="button" class="rge-controls-reset"><?php esc_html_e('Reset to defaults'); ?></button>
        </div>
        <p class="rge-controls-feedback" role="status" aria-live="polite"></p>
        <p class="rge-tip"><?php esc_html_e('Click the game screen to play. Press Esc to release keyboard focus.'); ?></p>
    </div>
</section>
