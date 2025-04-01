import EventEmitter from "./event-emitter";

interface DeviceFilter {
    vendorId: number;
    productId?: number;
}

interface DeviceProfile {
    filters: DeviceFilter[];
    configuration: number;
    interface: number;
    language: string | ((device: USBDevice) => string | Promise<string>);
    codepageMapping: string | ((device: USBDevice) => string | Promise<string>);
}

const DeviceProfiles: DeviceProfile[] = [

    /* POS-8022 and similar printers */
    {
        filters: [
            { vendorId: 0x0483, productId: 0x5743 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'default'
    },

    /* POS-5805, POS-8360 and similar printers */
    {
        filters: [
            { vendorId: 0x0416, productId: 0x5011 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'zjiang'
    },

    /* MPT-II and similar printers */
    {
        filters: [
            { vendorId: 0x0483, productId: 0x5840 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'mpt'
    },

    /* Samsung SRP */
    {
        filters: [
            { vendorId: 0x0419 }, { vendorId: 0x1504 }
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'bixolon'
    },

    /* Star */
    {
        filters: [
            { vendorId: 0x0519 }
        ],

        configuration: 1,
        interface: 0,


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

        language: device => {
            let language = 'star-line';
            let name = device.productName ?? '';

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

            switch (name) {
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

        codepageMapping: 'star'
    },

    /* Epson */
    {
        filters: [
            { vendorId: 0x04b8 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'epson'
    },

    /* Citizen */
    {
        filters: [
            { vendorId: 0x1d90 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'citizen'
    },

    /* HP */
    {
        filters: [
            { vendorId: 0x05d9 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'hp'
    },

    /* Fujitsu */

    {
        filters: [
            { vendorId: 0x04c5 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'epson'
    },

    /* Dtronic */
    {
        filters: [
            { vendorId: 0x0fe6, productId: 0x811e },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'epson'
    },

    /* Xprinter */
    {
        filters: [
            { vendorId: 0x1fc9, productId: 0x2016 },
        ],

        configuration: 1,
        interface: 0,

        language: 'esc-pos',
        codepageMapping: 'xprinter'
    }
]

interface Endpoints {
    input?: USBEndpoint;
    output?: USBEndpoint;
}

interface ConnectedEvent {
    type: string;
    manufacturerName: string;
    productName: string;
    serialNumber: string;
    vendorId: number;
    productId: number;
    language: string;
    codepageMapping: string;
}

class ReceiptPrinterDriver { }

class WebUSBReceiptPrinter extends ReceiptPrinterDriver {

    #emitter: EventEmitter;
    #device: USBDevice | null = null;
    #profile: DeviceProfile | null = null;
    #endpoints: Endpoints = {};

    constructor() {
        super();

        this.#emitter = new EventEmitter();

        navigator.usb.addEventListener('disconnect', (event: USBConnectionEvent) => {
            if (this.#device == event.device) {
                this.#emitter.emit('disconnected');
            }
        });
    }

    async connect(): Promise<void> {
        try {
            const device = await navigator.usb.requestDevice({
                filters: DeviceProfiles.map(i => i.filters).reduce((a, b) => a.concat(b))
            });

            if (device) {
                await this.#open(device);
            }
        }
        catch (error) {
            console.log('Could not connect! ' + error);
        }
    }

    async reconnect(previousDevice: USBDevice): Promise<void> {
        const devices = await navigator.usb.getDevices();

        let device = devices.find(device => device.serialNumber == previousDevice.serialNumber);

        if (!device) {
            device = devices.find(device => device.vendorId == previousDevice.vendorId && device.productId == previousDevice.productId);
        }

        if (device) {
            await this.#open(device);
        }
    }

    async #open(device: USBDevice): Promise<void> {
        this.#device = device;

        this.#profile = DeviceProfiles.find(
            item => item.filters.some(
                filter => filter.vendorId && filter.productId ? filter.vendorId == this.#device!.vendorId && filter.productId == this.#device!.productId : filter.vendorId == this.#device!.vendorId
            )
        ) ?? null;

        if (!this.#profile) {
            throw new Error("Device profile not found");
        }

        await this.#device.open();
        await this.#device.selectConfiguration(this.#profile.configuration);
        await this.#device.claimInterface(this.#profile.interface);

        const iface = this.#device.configuration!.interfaces.find(i => i.interfaceNumber == this.#profile!.interface);

        if (!iface) {
            throw new Error("Interface not found");
        }

        this.#endpoints.output = iface.alternate.endpoints.find(e => e.direction == 'out');
        this.#endpoints.input = iface.alternate.endpoints.find(e => e.direction == 'in');

        await this.#device.reset();

        this.#emitter.emit('connected', {
            type: 'usb',
            manufacturerName: this.#device.manufacturerName!,
            productName: this.#device.productName!,
            serialNumber: this.#device.serialNumber!,
            vendorId: this.#device.vendorId,
            productId: this.#device.productId,
            language: await this.#evaluate(this.#profile.language),
            codepageMapping: await this.#evaluate(this.#profile.codepageMapping)
        } as ConnectedEvent);
    }

    async #evaluate(expression: string | ((device: USBDevice) => string | Promise<string>)): Promise<string> {
        if (typeof expression == 'function') {
            return expression(this.#device!);
        }

        return expression;
    }

    async listen(): Promise<boolean> {
        if (this.#endpoints.input) {
            this.#read();
            return true;
        }
        return false;
    }

    async #read(): Promise<void> {
        if (!this.#device) {
            return;
        }

        try {
            const result = await this.#device.transferIn(this.#endpoints.input!.endpointNumber, 64);

            if (result instanceof USBInTransferResult) {
                if (result.data && result.data.byteLength) {
                    this.#emitter.emit('data', result.data);
                }
            }

            this.#read();
        } catch (e) {
            // Handle read error
        }
    }

    async disconnect(): Promise<void> {
        if (!this.#device) {
            return;
        }

        await this.#device.close();

        this.#device = null;
        this.#profile = null;

        this.#emitter.emit('disconnected');
    }

    async print(command: BufferSource): Promise<void> {
        if (this.#device && this.#endpoints.output) {
            try {
                await this.#device.transferOut(this.#endpoints.output.endpointNumber, command);
            }
            catch (e) {
                console.log(e);
            }
        }
    }

    addEventListener(event: string, listener: (...args: any[]) => void): void {
        this.#emitter.on(event, listener);
    }
}


export default WebUSBReceiptPrinter;