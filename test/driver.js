import { expect } from 'chai';
import { wrap } from '../src/wrappers/star-raster.js';

/*
	The driver itself needs the WebUSB API, which no test runner has, so it is mocked
	here. It is just enough of the API for the driver to walk through connect, open,
	print and disconnect: a device that records what was transferred to it, one
	configuration with one interface, and an endpoint in each direction.

	The mock is installed before src/main.js is imported, because the constructor of the
	driver reaches for navigator.usb.
*/

let mock = null;

function install(productName) {
	let state = {
		transfers:	[],
		closed:		0
	};

	state.device = {
		vendorId:			0x0519,
		productId:			0x0003,
		manufacturerName:	'Star Micronics',
		productName:		productName,
		serialNumber:		'SN12345',

		configuration: {
			interfaces: [
				{
					interfaceNumber: 0,

					alternate: {
						endpoints: [
							{ direction: 'out', endpointNumber: 1 },
							{ direction: 'in',  endpointNumber: 2 }
						]
					}
				}
			]
		},

		open:					async () => {},
		selectConfiguration:	async () => {},
		claimInterface:			async () => {},
		reset:					async () => {},
		close:					async () => { state.closed++; },

		transferOut: async (endpoint, data) => {
			state.transfers.push(Array.from(data));
		}
	};

	Object.defineProperty(globalThis, 'navigator', {
		configurable:	true,

		value: {
			usb: {
				addEventListener:	(n, f) => { state.disconnected = f; },
				requestDevice:		async () => state.device,
				getDevices:			async () => [ state.device ]
			}
		}
	});

	mock = state;

	return state;
}

/*
	A stand in for the renderer package, which this repository does not depend on. The
	class announces the languages it can encode, the instance is the one the driver asked
	for with the language option. It ignores the bytes it is given and returns the same
	items every time, so that the expected output of the wrapper is known.
*/

const items = [
	{ type: 'image', width: 16, height: 2, data: new Uint8Array([ 0xff, 0x0f, 0x00, 0x00 ]) },
	{ type: 'feed', height: 24 },
	{ type: 'cut', value: 'partial' }
];

class FakeRenderer {
	static languages = [ 'esc-pos', 'star-prnt', 'star-line' ];

	#language;

	constructor(options) {
		FakeRenderer.options = options;

		this.#language = options.language;
	}

	get language() {
		return this.#language;
	}

	render(bytes) {
		FakeRenderer.bytes = Array.from(bytes);

		return items;
	}
}

/* The bytes the wrapper makes of those items, for a printer with a cutter */

const wrapped = Array.from(wrap(items, {
	language:	'star-prnt',
	width:		576,
	commands:	[ 'cut', 'pulse', 'feed' ],
	wrapper:	'star-raster',
	tearBar:	false
}));

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms || 0));
}

/* The driver is imported once, after the first mock is in place */

install('Star TSP143IIIU');

const { default: WebUSBReceiptPrinter } = await import('../src/main.js');


describe('driver', () => {

	describe('a TSP100 without a renderer', () => {

		it('should report the language of the printer and no columns', async () => {
			install('Star TSP143IIIU');

			let printer = new WebUSBReceiptPrinter();
			let connected = null;

			printer.addEventListener('connected', d => connected = d);

			await printer.connect();
			await wait();

			expect(connected).to.deep.equal({
				type:				'usb',
				manufacturerName:	'Star Micronics',
				productName:		'Star TSP143IIIU',
				serialNumber:		'SN12345',
				vendorId:			0x0519,
				productId:			0x0003,
				language:			'star-graphics',
				codepageMapping:	'star'
			});
		});

		it('should send the bytes unchanged', async () => {
			let state = install('Star TSP143IIIU');
			let printer = new WebUSBReceiptPrinter();

			await printer.connect();
			await printer.print(new Uint8Array([ 0x1b, 0x2a, 0x72, 0x41 ]));

			expect(state.transfers).to.deep.equal([ [ 0x1b, 0x2a, 0x72, 0x41 ] ]);
		});
	});

	describe('a TSP100 with a renderer', () => {

		it('should report the language, mapping and columns of the renderer', async () => {
			install('Star TSP143IIIU');

			let printer = new WebUSBReceiptPrinter({ renderer: FakeRenderer });
			let connected = null;

			printer.addEventListener('connected', d => connected = d);

			await printer.connect();
			await wait();

			expect(connected).to.deep.equal({
				type:				'usb',
				manufacturerName:	'Star Micronics',
				productName:		'Star TSP143IIIU',
				serialNumber:		'SN12345',
				vendorId:			0x0519,
				productId:			0x0003,
				language:			'star-prnt',
				codepageMapping:	'star',
				columns:			48
			});
		});

		it('should construct the renderer with the settings of the profile', async () => {
			install('Star TSP143IIIU');

			let printer = new WebUSBReceiptPrinter({
				renderer:			FakeRenderer,
				rendererOptions:	{ font: 'x', width: 999, commands: [ 'barcode' ] }
			});

			await printer.connect();

			expect(FakeRenderer.options).to.deep.equal({
				font:				'x',
				language:			'star-prnt',
				width:				576,
				commands:			[ 'cut', 'pulse', 'feed' ],
				codepageMapping:	'star'
			});
		});

		it('should render the job and send the output of the wrapper', async () => {
			let state = install('Star TSP143IIIU');
			let printer = new WebUSBReceiptPrinter({ renderer: FakeRenderer });

			await printer.connect();
			await printer.print(new Uint8Array([ 0x1b, 0x40, 0x41 ]));

			expect(FakeRenderer.bytes).to.deep.equal([ 0x1b, 0x40, 0x41 ]);
			expect(state.transfers).to.deep.equal([ wrapped ]);
		});

		it('should accept a function that returns the renderer', async () => {
			let state = install('Star TSP143IIIU');

			let printer = new WebUSBReceiptPrinter({ renderer: async () => FakeRenderer });
			let connected = null;

			printer.addEventListener('connected', d => connected = d);

			await printer.connect();
			await wait();

			expect(connected.language).to.equal('star-prnt');
			expect(connected.codepageMapping).to.equal('star');
			expect(connected.columns).to.equal(48);

			await printer.print(new Uint8Array([ 0x1b, 0x40, 0x41 ]));

			expect(state.transfers).to.deep.equal([ wrapped ]);
		});

		it('should reject connect() with a renderer that is not one', async () => {
			install('Star TSP143IIIU');

			let printer = new WebUSBReceiptPrinter({ renderer: class {} });
			let error = null;

			try {
				await printer.connect();
			}
			catch(e) {
				error = e;
			}

			expect(error).to.be.an.instanceof(Error);
			expect(error.message).to.equal('The renderer option must be the ReceiptPrinterRenderer class, or a function that returns it');
		});
	});

	describe('an ordinary printer', () => {

		it('should report the language of the profile and send the bytes unchanged', async () => {
			let state = install('TSP100IV');
			let printer = new WebUSBReceiptPrinter({ renderer: FakeRenderer });
			let connected = null;

			printer.addEventListener('connected', d => connected = d);

			await printer.connect();
			await wait();

			/* The TSP100IV speaks StarPRNT itself, so nothing is rendered for it */

			expect(connected.language).to.equal('star-prnt');
			expect(connected.codepageMapping).to.equal('star');
			expect(connected.columns).to.equal(undefined);

			await printer.print(new Uint8Array([ 0x1b, 0x40 ]));

			expect(state.transfers).to.deep.equal([ [ 0x1b, 0x40 ] ]);
		});
	});
});
