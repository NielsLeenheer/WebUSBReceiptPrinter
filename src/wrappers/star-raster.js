/*

	Star raster mode wrapper

	Turns the items of a renderer into the raster mode commands of the Star TSP100 
	family. The byte sequences come from the STAR Graphic Mode Command Specifications 
	Rev. 2.32, cross-checked with Star's CUPS driver rastertostar.

	Two rules of raster mode shape this wrapper. 

	The mode setting commands are ignored while raster data is in the image buffer, so a 
	cut type can not be chosen at the moment of the cut. Instead every cut and pulse item 
	ends a segment, and the FF mode of a segment is set before the first item of that 
	segment is sent, while the buffer is still empty.

	And the execute commands are ignored when the buffer is empty, so a cut on an empty 
	buffer would not cut at all. A segment that has to cut but has no rows is therefore 
	given one blank row, which is the smallest thing that makes the printer act.

*/

const Commands = {

	/* 3-2-1) Initialize raster mode 			ESC * r R 			*/
	initializeRaster:	[ 0x1b, 0x2a, 0x72, 0x52 ],

	/* 3-2-1) Enter raster mode 				ESC * r A 			*/
	enterRaster:		[ 0x1b, 0x2a, 0x72, 0x41 ],

	/* 3-2-1) Quit raster mode 					ESC * r B 			*/
	quitRaster:			[ 0x1b, 0x2a, 0x72, 0x42 ],

	/* 3-2-2) Set raster print quality 			ESC * r Q n NUL 	*/
	printQuality:		[ 0x1b, 0x2a, 0x72, 0x51 ],

	/* 3-2-2) Set raster page length 			ESC * r P n NUL 	*/
	pageLength:			[ 0x1b, 0x2a, 0x72, 0x50 ],

	/* 3-2-2) Set raster EOT mode 				ESC * r E n NUL 	*/
	eotMode:			[ 0x1b, 0x2a, 0x72, 0x45 ],

	/* 3-2-2) Set raster FF mode 				ESC * r F n NUL 	*/
	ffMode:				[ 0x1b, 0x2a, 0x72, 0x46 ],

	/* 3-2-2) Drive drawer 						ESC * r D n NUL 	*/
	driveDrawer:		[ 0x1b, 0x2a, 0x72, 0x44 ],

	/* 3-2-4) Position movement in vertical direction	ESC * r Y n NUL */
	verticalPosition:	[ 0x1b, 0x2a, 0x72, 0x59 ],

	/* 3-2-3) Transfer of raster data, automatic line feed 	b n1 n2 data */
	rasterData:			[ 0x62 ],

	/* 3-2-4) Execute FF mode 					ESC FF NUL 			*/
	executeFF:			[ 0x1b, 0x0c, 0x00 ],

	/* 3-2-4) Execute EOT mode 					ESC FF EOT 			*/
	executeEOT:			[ 0x1b, 0x0c, 0x04 ],

	/* 3-1-1) Set external device 1 pulse width 	ESC BEL n1 n2 	*/
	pulseWidth:			[ 0x1b, 0x07 ]
};

/*
	The values of the FF mode and EOT mode setting commands, from the mode tables of 
	ESC * r F n NUL and ESC * r E n NUL. Sent as ASCII decimal digits.

	The cutter modes 9 and 13 are invalid on a model with a tear bar, and mode 3 is 
	invalid on a model with a cutter, so a cut becomes one or the other.
*/

const Modes = {
	print:				1,		/* print, no feed, no cut 					*/
	tearBar:			3,		/* print, feed to the tear bar, no cut 		*/
	fullCut:			9,		/* print, feed, full cut 					*/
	partialCut:			13		/* print, feed, partial cut 				*/
};

/*
	The drive circuit of the ESC * r D n NUL command, for the device of a pulse item.
*/

const Drawers = [ 1, 2 ];

/*
	One blank row, the least that can be put in the image buffer to make the execute 
	commands do their work.
*/

const BlankRow = [ 0x62, 0x01, 0x00, 0x00 ];


/**
 * Wrap a list of renderer items in Star raster mode commands
 * 
 * Items are the output of a renderer: image, cut, pulse and feed. Any other item is 
 * ignored. The result is one Uint8Array holding the complete job, from entering raster 
 * mode to quitting it, which the driver sends as a whole.
 * 
 * @param  {Array}       items      Items as returned by the renderer
 * @param  {object}      options    Optional settings, the graphics section of the profile
 * @return {Uint8Array}             The job, ready to be sent to the printer
 */
function wrap(items, options) {
	options = Object.assign({
		quality:		0,		/* 0 is high speed, the default 			*/
		pageLength:		0,		/* 0 is continuous, no page length 			*/
		tearBar:		false	/* true for a model without a cutter 		*/
	}, options);

	let chunks = [];

	/* 
		Job start. The image buffer is empty here, so all mode settings are accepted. 
	*/

	chunks.push(Commands.initializeRaster);
	chunks.push(Commands.enterRaster);
	chunks.push(setting(Commands.printQuality, options.quality));
	chunks.push(setting(Commands.pageLength, options.pageLength));
	chunks.push(setting(Commands.eotMode, Modes.print));

	/* 
		The pulse width is a setting as well, and it survives a reset, so it is taken 
		from the first pulse item and sent once, before any data. It only applies to 
		external device 1, the timing of device 2 is fixed in the printer, and without 
		such a pulse item the printer default of 200 ms on and 200 ms off is left alone. 
	*/

	let pulse = items.find(item => item.type == 'pulse' && (item.device || 0) == 0);

	if (pulse) {
		chunks.push([ Commands.pulseWidth[0], Commands.pulseWidth[1], width(pulse.on), width(pulse.off) ]);
	}

	/* 
		Segments. The FF mode belongs to the command that ends the segment and must be 
		sent while the buffer is empty, so it is looked up ahead and written lazily, 
		right before the first item of the segment. 

		open	the FF mode of the current segment has been written
		rows	raster data has been sent in the current segment
	*/

	let mode = lookahead(items, 0, options.tearBar);
	let open = false;
	let rows = false;

	let begin = () => {
		if (!open) {
			chunks.push(setting(Commands.ffMode, mode));
			open = true;
		}
	};

	for (let i = 0; i < items.length; i++) {
		let item = items[i];

		switch (item.type) {

			/* One raster data command per row, with the trailing white bytes trimmed */

			case 'image':
				let stride = Math.ceil(item.width / 8);

				for (let y = 0; y < item.height; y++) {
					let length = stride;

					while (length > 1 && item.data[y * stride + length - 1] == 0x00) {
						length--;
					}

					begin();

					chunks.push([ Commands.rasterData[0], length & 0xff, length >> 8 ]);
					chunks.push(item.data.slice(y * stride, y * stride + length));

					rows = true;
				}

				break;

			/* Move the position down without sending white rows */

			case 'feed':
				begin();

				chunks.push(setting(Commands.verticalPosition, item.height));
				break;

			/* 
				Execute the FF mode of this segment, which prints, feeds and cuts. An 
				empty buffer would make the printer ignore the command, so a segment 
				without rows gets one blank row to cut through. 
			*/

			case 'cut':
				begin();

				if (!rows) {
					chunks.push(BlankRow);
				}

				chunks.push(Commands.executeFF);

				open = false;
				rows = false;
				mode = lookahead(items, i + 1, options.tearBar);
				break;

			/* 
				The drawer command is ignored while data is in the buffer, so the 
				pending rows are printed first, with the FF mode of this segment, 
				which is print without feed or cut. 
			*/

			case 'pulse':
				if (rows) {
					chunks.push(Commands.executeFF);
				}

				chunks.push(setting(Commands.driveDrawer, Drawers[item.device] || Drawers[0]));

				open = false;
				rows = false;
				mode = lookahead(items, i + 1, options.tearBar);
				break;
		}
	}

	/* 
		Job end. The EOT mode prints whatever is left without cutting, then raster mode 
		is closed. A segment of nothing but feeds would be ignored, so it gets a blank 
		row as well, and the paper still advances. 
	*/

	if (open && !rows) {
		chunks.push(BlankRow);
	}

	chunks.push(Commands.executeEOT);
	chunks.push(Commands.quitRaster);

	return concat(chunks);
}

/**
 * Build a setting command, its value as ASCII decimal digits followed by NUL
 * 
 * @param  {Array}       command    The bytes of the command
 * @param  {number}      value      The value of the setting
 * @return {Array}                  The bytes of the complete command
 */
function setting(command, value) {
	value = Math.round(value);

	if (!Number.isFinite(value) || value < 0) {
		value = 0;
	}

	let digits = String(value).split('').map(i => i.charCodeAt(0));

	return [ ...command, ...digits, 0x00 ];
}

/**
 * Turn a pulse time in milliseconds into the units of 10 ms the printer expects
 * 
 * @param  {number}      ms         The time in milliseconds
 * @return {number}                 The time in units of 10 ms, between 1 and 127
 */
function width(ms) {
	let n = Math.round(ms / 10);

	if (!Number.isFinite(n)) {
		n = 20;
	}

	return Math.min(127, Math.max(1, n));
}

/**
 * Find the FF mode of the segment that starts at the given position
 * 
 * @param  {Array}       items      Items as returned by the renderer
 * @param  {number}      from       The first item of the segment
 * @param  {boolean}     tearBar    True when the printer has no cutter
 * @return {number}                 The FF mode of the segment
 */
function lookahead(items, from, tearBar) {
	for (let i = from; i < items.length; i++) {
		if (items[i].type == 'cut') {
			if (tearBar) {
				return Modes.tearBar;
			}

			return items[i].value == 'full' ? Modes.fullCut : Modes.partialCut;
		}

		if (items[i].type == 'pulse') {
			return Modes.print;
		}
	}

	return Modes.print;
}

/**
 * Join all chunks into one array of bytes
 * 
 * @param  {Array}       chunks     Arrays or typed arrays of bytes
 * @return {Uint8Array}             All bytes in one array
 */
function concat(chunks) {
	let length = chunks.reduce((a, b) => a + b.length, 0);
	let result = new Uint8Array(length);
	let offset = 0;

	for (let chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}


export { wrap };
export default wrap;
