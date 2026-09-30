<?php if (! defined('ABSPATH')) { exit; } ?>
<canvas id="retro-game-emulator-canvas" width="256" height="240" style="width: 100%;display:none;margin-bottom:10px"></canvas>
<select id="retro-game-emulator-game-select" class="form-control">
    <option>- Select Rom -</option>
    <?php foreach ($romsArray as $rom) : ?>
        <option value="<?php echo esc_url($rom['url']); ?>"><?php echo esc_html($rom['name']); ?></option>
    <?php endforeach; ?>
</select>
<h3><?php echo esc_html__("Controls"); ?></h3>
<table>
    <tr>
        <th><?php echo esc_html__("Button"); ?></th>
        <th><?php echo esc_html__("Player 1"); ?></th>
        <th><?php echo esc_html__("Player 2"); ?></th>
    </tr>
    <tr>
        <td><?php echo esc_html__("Left"); ?></td>
        <td><?php echo esc_html__("Left"); ?></td>
        <td><?php echo esc_html__("Num-4"); ?></td>
    <tr>
        <td><?php echo esc_html__("Right"); ?></td>
        <td><?php echo esc_html__("Right"); ?></td>
        <td><?php echo esc_html__("Num-6"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("Up"); ?></td>
        <td><?php echo esc_html__("Up"); ?></td>
        <td><?php echo esc_html__("Num-8"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("Down"); ?></td>
        <td><?php echo esc_html__("Down"); ?></td>
        <td><?php echo esc_html__("Num-2"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("A"); ?></td>
        <td><?php echo esc_html__("A"); ?></td>
        <td><?php echo esc_html__("Num-7"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("B"); ?></td>
        <td><?php echo esc_html__("S"); ?></td>
        <td><?php echo esc_html__("Num-9"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("Start"); ?></td>
        <td><?php echo esc_html__("Enter"); ?></td>
        <td><?php echo esc_html__("Num-1"); ?></td>
    </tr>
    <tr>
        <td><?php echo esc_html__("Select"); ?></td>
        <td><?php echo esc_html__("Tab"); ?></td>
        <td><?php echo esc_html__("Num-3"); ?></td>
    </tr>
</table>