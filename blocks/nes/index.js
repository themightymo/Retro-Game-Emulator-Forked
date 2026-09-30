( function ( blocks, element, blockEditor, components, ServerSideRender, i18n, url ) {
	var el = element.createElement;
	var __ = i18n.__;

	blocks.registerBlockType( 'retro-game-emulator/nes', {
		edit: function ( props ) {
			var blockProps = blockEditor.useBlockProps();

			return el(
				'div',
				blockProps,
				el(
					blockEditor.InspectorControls,
					null,
					el(
						components.PanelBody,
						{ title: __( 'Roms', 'jsnes' ) },
						el(
							'p',
							null,
							__( 'Visitors pick from the roms uploaded on the settings page.', 'jsnes' )
						),
						el(
							components.ExternalLink,
							{ href: url.addQueryArgs( 'options-general.php', { page: 'retro-game-emulator' } ) },
							__( 'Manage roms', 'jsnes' )
						)
					)
				),
				el(
					components.Disabled,
					null,
					el( ServerSideRender, {
						block: 'retro-game-emulator/nes',
						attributes: props.attributes,
					} )
				)
			);
		},

		// Rendered on the server.
		save: function () {
			return null;
		},
	} );
} )(
	window.wp.blocks,
	window.wp.element,
	window.wp.blockEditor,
	window.wp.components,
	window.wp.serverSideRender,
	window.wp.i18n,
	window.wp.url
);
