# WebUSBReceiptPrinter

This is an library that allows you to print to a USB connected receipt printer using WebUSB.

<br>

[![npm](https://img.shields.io/npm/v/@point-of-sale/webusb-receipt-printer)](https://www.npmjs.com/@point-of-sale/webusb-receipt-printer)
![GitHub License](https://img.shields.io/github/license/NielsLeenheer/WebUSBReceiptPrinter)


> This library is part of [@point-of-sale](https://point-of-sale.dev), a collection of libraries for interfacing browsers and Node with Point of Sale devices such as receipt printers, barcode scanners and customer facing displays.

<br>

## What does this library do?

In order to print a receipt on a receipt printer you need to build the receipt and encode it as in the ESC/POS or StarPRNT language. You can use the [`ReceiptPrinterEncoder`](https://github.com/NielsLeenheer/ReceiptPrinterEncoder) library for this. You end up with an array of raw bytes that needs to be send to the printer. One way to do that is using a direct USB connection using WebUSB.

### Unfortunately this does not work on Windows...

On most platforms you can directly talk to USB connected receipt printers using WebUSB. The main exception to this is on Windows where the printer driver exclusively claims the printer. On that platform the alternative way to print on receipt printers would be to use allow to driver to create a virtual serial port for the printer. Usually this is used for compatibility with old applications, but it also means you can use the `WebSerialReceiptPrinter` library instead.

Unfortunately...

There seems to be an incompatibility between the WebSerial implementation and the virtual serial port that the Star printer driver creates. That means this workaround does not work for Star printers.

<br>

## How to use it?

Load the `webusb-receipt-printer.umd.js` file from the `dist` directory in the browser and instantiate a `WebUSBReceiptPrinter` object. 

```html
<script src='webusb-receipt-printer.umd.js'></script>

<script>

    const receiptPrinter = new WebUSBReceiptPrinter();

</script>
```

Or import the `webusb-receipt-printer.esm.js` module:

```js
import WebUSBReceiptPrinter from 'webusb-receipt-printer.esm.js';

const receiptPrinter = new WebUSBReceiptPrinter();
```

The constructor optionally takes an object with options. These are only needed for printers that can only print graphics, see [Star TSP100 series](#star-tsp100-series).

<br>

## Connect to a receipt printer

The first time you have to manually connect to the receipt printer by calling the `connect()` function. This function must be called as the result of an user action, for example clicking a button. You cannot call this function on page load.

```js
function handleConnectButtonClick() {
    receiptPrinter.connect();
}
```

Subsequent times you can simply call the `reconnect()` function. You have to provide an object with the serial number, vendor id and product id of the previously connected receipt printer in order to find the correct printer and connect to it again. You can get this data by listening to the `connected` event and store it for later use. It is recommended to call this button on page load to prevent having to manually connect to a previously connected device.

```js
receiptPrinter.reconnect(lastUsedDevice);
```

If there are no receipt printers connected that have been previously connected, or the serial number does not match up, this function will do nothing.

The `connect()` function does not throw when something goes wrong, it logs the problem and does nothing. There is one exception: when the printer can only print graphics and the `renderer` option is missing or invalid, the returned promise is rejected with that error, because that is a mistake in your application and not something the user did. See [Star TSP100 series](#star-tsp100-series).

To find out when a receipt printer is connected you can listen for the `connected` event using the `addEventListener()` function.

```js
receiptPrinter.addEventListener('connected', device => {
    console.log(`Connected to ${device.manufacturerName} ${device.productName} (#${device.serialNumber})`);

    printerLanguage = device.language;
    printerCodepageMapping = device.codepageMapping;

    /* Store device for reconnecting */
    lastUsedDevice = device;
});
```

The callback of the `connected` event is passed an object with the following properties:

-   `type`<br>
    Type of the connection that is used, in this case it is always `usb`.
-   `vendorId`<br>
    The USB vendor ID.
-   `productId`<br>
    The USB product ID.
-   `manufacturerName`<br>
    The name of the manufacturer of the printer.
-   `productName`<br>
    The name of the receipt printer.
-   `serialNumber`<br>
    The serial number of the receipt printer. To be used to reconnect to the printer at a later time.
-   `language`<br>
    Language of the printer, which can be either `esc-pos` or `star-prnt`. This can be used as an option for `ReceiptPrinterEncoder` to encode in the correct language for the printer.
-   `codepageMapping`<br>
    Code page mapping of the printer, which can be used as an option for `ReceiptPrinterEncoder` to map non-ascii characters to the correct codepage supported by the printer. 
-   `columns`<br>
    The number of columns of the printer. This property is only present for printers that can only print graphics, such as the Star TSP100 series, where the driver knows the exact print width. For all other printers this property is absent and you decide the number of columns yourself.

<br>

## Star TSP100 series

The Star TSP100, TSP100ECO, TSP100GT, TSP100II and TSP100III have no fonts and no barcode engine. They only print images, which Star calls Star Graphic mode. The TSP100IV is not part of this group, it supports StarPRNT natively and needs nothing special.

You can still use `ReceiptPrinterEncoder` the way you always do. You just have to give this library a renderer, which turns the encoded receipt into images before it is sent to the printer. The renderer lives in a separate package, [`@point-of-sale/receipt-printer-renderer`](https://github.com/NielsLeenheer/ReceiptPrinterRenderer), which you install yourself. It is an optional peer dependency, so it is only in your bundle when you actually use it.

```js
import { EscPosRenderer } from '@point-of-sale/receipt-printer-renderer';

const receiptPrinter = new WebUSBReceiptPrinter({
    renderer: EscPosRenderer
});
```

With WebUSB you do not know beforehand which printer the user is going to pick, so you can also pass a function that returns the renderer class. The function may be asynchronous, which allows you to load the package only when a graphics printer is actually connected.

```js
const receiptPrinter = new WebUSBReceiptPrinter({
    renderer: () => import('@point-of-sale/receipt-printer-renderer').then(m => m.EscPosRenderer)
});
```

The constructor accepts the following options:

-   `renderer`<br>
    A renderer class, or a function that returns a renderer class, possibly as a promise. Required for printers that can only print graphics. When such a printer is connected without a renderer, connecting fails with an error.
-   `rendererOptions`<br>
    An object with additional options for the renderer, such as `maxHeight`. The `width`, `commands` and `codepageMapping` options belong to the printer and to the renderer and are always set by this library.

The `connected` event reports the language and the code page mapping of the renderer, not of the printer, because that is the language you have to encode your receipt in. With the ESC/POS renderer you get `esc-pos` and `epson`. It also reports `columns`, which is 48 for these 80 mm printers.

```js
receiptPrinter.addEventListener('connected', device => {
    let encoder = new ReceiptPrinterEncoder({
        language:        device.language,
        codepageMapping: device.codepageMapping,
        columns:         device.columns
    });
});
```

Cutting the paper and opening the cash drawer work as usual, the driver translates them to the raster mode equivalents. On the TSP103 and TSP113, which have a tear bar instead of a cutter, a cut feeds the paper to the tear bar.

### Windows

This does not work on Windows. The futurePRNT driver claims the printer exclusively, so WebUSB cannot talk to it. On Windows you should let futurePRNT create a virtual serial port for the printer and use the `WebSerialReceiptPrinter` library instead. That virtual serial port emulates ESC/POS or Star Line on top of the raster protocol, so you do not need a renderer there. Do note the incompatibility between WebSerial and the virtual serial ports of the Star driver mentioned above.

### Limitations

-   Only 80 mm paper is supported. The 58 mm paper guide that is included with these printers changes the print width, and this library does not support that.
-   The status bytes these printers send back are not interpreted.

<br>

## Commands

Once connected you can use the following command to print receipts.

### Printing receipts

When you want to print a receipt, you can call the `print()` function with an array, or a typed array with bytes. The data must be properly encoded for the printer. 

For example:

```js
/* Encode the receipt */

let encoder = new ReceiptPrinterEncoder({
    language:  printerLanguage,
    codepageMapping: printerCodepageMapping
});

let data = encoder
    .initialize()
    .text('The quick brown fox jumps over the lazy dog')
    .newline()
    .qrcode('https://nielsleenheer.com')
    .encode();

/* Print the receipt */

receiptPrinter.print(data);
```

<br>

-----

<br>

This library has been created by Niels Leenheer under the [MIT license](LICENSE). Feel free to use it in your products. The  development of this library is sponsored by Salonhub.

<a href="https://salohub.nl"><img src="https://salonhub.nl/assets/images/salonhub.svg" width=140></a>
