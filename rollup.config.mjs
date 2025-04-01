import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
	// browser-friendly UMD build
	{
		input: 'src/main.ts',
		output: {
			name: 'WebUSBReceiptPrinter',
			file: 'dist/webusb-receipt-printer.umd.js',
			sourcemap: true,
			format: 'umd'
		},
		plugins: [
			typescript(),
		]
	},
	// browser-friendly UMD build with minification
	{
		input: 'src/main.ts',
		output: {
			name: 'WebUSBReceiptPrinter',
			file: 'dist/webusb-receipt-printer.umd.min.js',
			sourcemap: true,
			format: 'umd',
		},
		plugins: [
			typescript(),
			terser()
		]
	},
	// Flat ES module build for modern browsers
	{
		input: 'src/main.ts',
		output: { 
			file: 'dist/webusb-receipt-printer.mjs',
			sourcemap: true,
			format: 'es'
		},
		plugins: [
			typescript()
		]
	},

	// Declaration files
	{
		input: 'src/main.ts',
		output: {
			file: 'dist/webusb-receipt-printer.d.ts',
			format: 'es'
		},
		plugins: [
			dts(),
		],
	}
];