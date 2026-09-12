import EventEmitter from "./event-emitter.js";
import { wrap as starRaster } from "./wrappers/star-raster.js";

/*
	Wrappers turn the items of a renderer into the wire format of a printer. A profile
	that needs rendering names the wrapper it needs in its graphics section.
*/

const Wrappers = {
	'star-raster':		starRaster
};

/*
	The codepage mapping belongs to the language of the renderer, not to the printer,
	so that an application that switches renderer only changes one import.
*/

const CodepageMappings = {
	'esc-pos':			'epson',
	'star-prnt':		'star'
};

/*
	Thrown when a printer needs a renderer and the renderer option does not provide one.
	Unlike the other things that can go wrong while connecting, this is a mistake in the
	application, so connect() passes it on instead of logging it.
*/

class RendererError extends Error {}

const DeviceProfiles = [

	/* POS-8022 and similar printers */
	{
		filters: [
			{ vendorId: 0x0483, productId: 0x5743 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'default'
	},
			
	/* POS-5805, POS-8360 and similar printers */
	{
		filters: [
			{ vendorId: 0x0416, productId: 0x5011 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'zjiang'
	},
			
	/* MPT-II and similar printers */
	{
		filters: [
			{ vendorId: 0x0483, productId: 0x5840 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'mpt'
	},
			
	/* Samsung SRP */
	{
		filters: [
			{ vendorId: 0x0419 }, { vendorId: 0x1504 }
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'bixolon'
	},
			
	/* Star */
	{
		filters: [
			{ vendorId: 0x0519 }
		],
		
		configuration:		1,
		interface:			0,
		

		/*

			vendorId	productId	productName

									FVP10				star-line
			0x0519		0x0001		TSP650II			star-line
									TSP700II			star-line
									TSP800II			star-line
									SP700				star-line
			0x0519 		0x0003		TSP100II			star-graphics
									TSP100III			star-graphics
									TSP100IV			star-prnt
			0x0519		0x0017		mPOP				star-prnt
			0x0519		0x0019		mC-Label3			star-prnt
			0x0519		0x000b		BSC10				esc-pos
			0x0519		0x0011		BSC10BR				esc-pos
			0x0519		0x001b		BSC10II				esc-pos
			0x0519		0x0043		SM-S230i			
			0x0519		0x0047		mC-Print3			star-prnt
			0x0519		0x0049		mC-Print2			star-prnt

		*/

		language:			device => {
								let language = 'star-line';
								let name = device.productName;

								/* 
									Even though the product names are a bit messy, the best way to distinguish between 
									models is by the product name. It is not possible to do it by the productId alone, 
									as the same productId is used for different models supporting different languages.

									But we do need to normalize the names a bit, as they are not consistent.

									For example:	
									TSP654 (STR_T-001) -> TSP650
									Star TSP143IIIU -> TSP100III									
								*/
								
								name = name.replace(/^Star\s+/i, '');
								name = name.replace(/^TSP(1|4|6|7|8|10)(13|43)(.*)?$/, (m, p1, p2, p3) => 'TSP' + p1 + '00' + (p3 || ''));
								name = name.replace(/^TSP(55|65)(1|4)(.*)?$/, (m, p1, p2, p3) => 'TSP' + p1 + '0' + (p3 || ''));
								name = name.replace(/^TSP([0-9]+)(II|III|IV|V|VI)?(.*)?$/, (m, p1, p2) => 'TSP' + p1 + (p2 || ''));

								switch(name) {
									case 'TSP100IV':
									case 'mPOP':
									case 'mC-Label3':
									case 'mC-Print3':
									case 'mC-Print2':
										language = 'star-prnt';
										break;

									case 'TSP100':
									case 'TSP100II':
									case 'TSP100III':
										language = 'star-graphics';
										break;

									case 'BSC10':
									case 'BSC10BR':
									case 'BSC10II':
										language = 'esc-pos';
										break;
								}

								return language;
							},

		codepageMapping:	'star',

		/*
			The TSP100, TSP100II and TSP100III have no fonts and no barcode engine, they
			only print images. When the language resolves to one of the keys below, the
			driver renders the job and wraps the resulting images itself.
		*/

		graphics:			{
								'star-graphics': {
									width:		576,
									commands:	[ 'cut', 'pulse', 'feed' ],
									wrapper:	'star-raster',

									/*
										The values of a graphics section may be functions of the
										device, the same as the language above. The TSP103 and
										TSP113 have a tear bar, the TSP143 has a cutter.
									*/

									tearBar:	device => /TSP1[01]3/.test(device.productName)
								}
							}
	},

	/* Epson */
	{
		filters: [
			{ vendorId: 0x04b8 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'epson'
	},

	/* Citizen */
	{
		filters: [
			{ vendorId: 0x1d90 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'citizen'
	},

	/* HP */
	{
		filters: [
			{ vendorId: 0x05d9 },
		],

		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'hp'
	},

	/* Fujitsu */

	{
		filters: [
			{ vendorId: 0x04c5 },
		],

		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'epson'
	},
			
	/* Dtronic */
	{
		filters: [
			{ vendorId: 0x0fe6, productId: 0x811e },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'epson'
	},

	/* Xprinter */
	{
		filters: [
			{ vendorId: 0x1fc9, productId: 0x2016 },
		],
		
		configuration:		1,
		interface:			0,

		language:			'esc-pos',
		codepageMapping:	'xprinter'
	}
]

class ReceiptPrinterDriver {}

class WebUSBReceiptPrinter extends ReceiptPrinterDriver {

	#emitter;
	#options;

	#device = null;
	#profile = null;
	#graphics = null;
	#renderer = null;
	#wrapper = null;
	#endpoints = {
		input:		null,
		output:		null
	};

	constructor(options) {
		super();

		this.#options = Object.assign({
			renderer:			null,
			rendererOptions:	{}
		}, options);

		this.#emitter = new EventEmitter();

		navigator.usb.addEventListener('disconnect', event => {
			if (this.#device == event.device) {
				this.#emitter.emit('disconnected');
			}
		});
	}

	async connect() {
		try {
			let device = await navigator.usb.requestDevice({
				filters: DeviceProfiles.map(i => i.filters).reduce((a, b) => a.concat(b))
			});

			if (device) {
				await this.#open(device);
			}
		}
		catch(error) {
			/*
				Anything the user or the device does, such as cancelling the dialog or a
				printer that another application already claimed, is logged and nothing
				more, as it always has been. A problem with the renderer is a mistake in
				the application, so that one is passed on to the caller.
			*/

			if (error instanceof RendererError) {
				throw error;
			}

			console.log('Could not connect! ' + error);
		}
	}

	async reconnect(previousDevice) {
		let devices = await navigator.usb.getDevices();

		let device = devices.find(device => device.serialNumber == previousDevice.serialNumber);

		if (!device) {
			device = devices.find(device => device.vendorId == previousDevice.vendorId && device.productId == previousDevice.productId);
		}

		if (device) {
			await this.#open(device);
		}
	}

	async #open(device) {
		this.#device = device;

		this.#profile = DeviceProfiles.find(
			item => item.filters.some(
				filter => filter.vendorId && filter.productId ? filter.vendorId == this.#device.vendorId && filter.productId == this.#device.productId : filter.vendorId == this.#device.vendorId
			)
		);

		let language = await this.#evaluate(this.#profile.language);
		let codepageMapping = await this.#evaluate(this.#profile.codepageMapping);

		/*
			A printer that can only print images. The renderer turns the bytes the
			application sends into images, and the wrapper of the profile turns those
			into commands the printer understands.

			All of this depends on the profile and the product name only, both of which
			are known before the device is opened, so it happens first. A missing or
			invalid renderer option then never leaves the device half open.
		*/

		let graphics = this.#profile.graphics ? this.#profile.graphics[language] : null;

		this.#graphics = null;
		this.#renderer = null;
		this.#wrapper = null;

		if (graphics) {
			graphics = await this.#settings(graphics);

			let Renderer = await this.#resolve(this.#options.renderer);

			if (!Renderer) {
				throw new RendererError('This printer only supports graphics, pass the renderer option with the EscPosRenderer or StarPrntRenderer class from @point-of-sale/receipt-printer-renderer');
			}

			this.#wrapper = Wrappers[graphics.wrapper];

			if (!this.#wrapper) {
				throw new RendererError('The profile of this printer asks for the wrapper ' + graphics.wrapper + ', which does not exist');
			}

			/*
				The language and the codepage mapping of a graphics printer are those of
				the renderer. The width and the supported commands are those of the
				printer, so they win over anything the application passed.
			*/

			language = Renderer.language;
			codepageMapping = CodepageMappings[language] || codepageMapping;

			this.#renderer = new Renderer(Object.assign({}, this.#options.rendererOptions, {
				width:				graphics.width,
				commands:			graphics.commands,
				codepageMapping:	codepageMapping
			}));

			this.#graphics = graphics;
		}

		await this.#device.open();
		await this.#device.selectConfiguration(this.#profile.configuration);
		await this.#device.claimInterface(this.#profile.interface);

		let iface = this.#device.configuration.interfaces.find(i => i.interfaceNumber == this.#profile.interface);

		this.#endpoints.output = iface.alternate.endpoints.find(e => e.direction == 'out');
		this.#endpoints.input = iface.alternate.endpoints.find(e => e.direction == 'in');

		await this.#device.reset();

		let connected = {
			type:				'usb',
			manufacturerName: 	this.#device.manufacturerName,
			productName: 		this.#device.productName,
			serialNumber: 		this.#device.serialNumber,
			vendorId: 			this.#device.vendorId,
			productId: 			this.#device.productId,
			language: 			language,
			codepageMapping:	codepageMapping
		};

		/*
			Only a graphics printer knows how many columns it has, it is the print width
			divided by the twelve dots of a font A character. For other printers the
			application decides, as it always has.
		*/

		if (graphics) {
			connected.columns = graphics.width / 12;
		}

		this.#emitter.emit('connected', connected);
	}

	async #resolve(renderer) {
		if (!renderer) {
			return null;
		}

		/*
			A renderer class is a function with a static language property. Any other
			function is a loader, which returns the class, possibly as a promise. A class
			without that property is therefore called as a loader, which throws, so every
			failure here is reported as the one error that explains the option.
		*/

		try {
			if (typeof renderer == 'function' && typeof renderer.language != 'string') {
				renderer = await renderer();
			}

			if (typeof renderer != 'function' || typeof renderer.language != 'string') {
				throw new Error();
			}
		}
		catch(error) {
			throw new RendererError('The renderer option must be a renderer class, or a function that returns one');
		}

		return renderer;
	}

	async #settings(section) {
		let settings = {};

		/* The values of a graphics section may be functions of the device, as above */

		for (let key of Object.keys(section)) {
			settings[key] = await this.#evaluate(section[key]);
		}

		return settings;
	}

	async #evaluate(expression) {
		if (typeof expression == 'function') {
			return await expression(this.#device);
		}

		return expression;
	}

	async listen() {
		if (this.#endpoints.input) {
			this.#read();
			return true;
		}
	}

	async #read() {
		if (!this.#device) {
			return;
		}

		try {
			const result = await this.#device.transferIn(this.#endpoints.input.endpointNumber, 64);

			if (result instanceof USBInTransferResult) {
				if (result.data.byteLength) {
					this.#emitter.emit('data', result.data);
				}
			}

			this.#read();
		} catch(e) {
		}
	}

	async disconnect() {
		if (!this.#device) {
			return;
		}

		await this.#device.close();

		this.#device = null;
		this.#profile = null;
		this.#graphics = null;
		this.#renderer = null;
		this.#wrapper = null;

		this.#emitter.emit('disconnected');
	}
	
	async print(command) {
		if (this.#device && this.#endpoints.output) {
			try {
				/*
					A graphics printer does not understand the language the application
					encoded the receipt in, so the job is rendered to images first and
					then wrapped in the format of the printer.
				*/

				if (this.#graphics) {
					command = this.#wrapper(this.#renderer.render(command), this.#graphics);
				}

				await this.#device.transferOut(this.#endpoints.output.endpointNumber, command);
			}
			catch(e) {
				console.log(e);
			}
		}
	}

	addEventListener(n, f) {
		this.#emitter.on(n, f);
	}
}


export default WebUSBReceiptPrinter;