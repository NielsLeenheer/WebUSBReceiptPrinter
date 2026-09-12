import { expect } from 'chai';
import { wrap } from '../src/wrappers/star-raster.js';

/*
	The expected bytes are written out in full, so that a mistake in the wrapper cannot 
	hide behind the same mistake in the test.

	Job start, without a pulse in the stream:

		ESC * r R				1b 2a 72 52			initialize raster mode
		ESC * r A				1b 2a 72 41			enter raster mode
		ESC * r Q 0 NUL			1b 2a 72 51 30 00	print quality, high speed
		ESC * r P 0 NUL			1b 2a 72 50 30 00	page length, continuous
		ESC * r E 1 NUL			1b 2a 72 45 31 00	EOT mode, print without feed or cut

	Job end:

		ESC FF EOT				1b 0c 04			execute the EOT mode
		ESC * r B				1b 2a 72 42			quit raster mode
*/

const start = [
	0x1b, 0x2a, 0x72, 0x52,
	0x1b, 0x2a, 0x72, 0x41,
	0x1b, 0x2a, 0x72, 0x51, 0x30, 0x00,
	0x1b, 0x2a, 0x72, 0x50, 0x30, 0x00,
	0x1b, 0x2a, 0x72, 0x45, 0x31, 0x00
];

const end = [
	0x1b, 0x0c, 0x04,
	0x1b, 0x2a, 0x72, 0x42
];


describe('star-raster', () => {

	describe('wrap([ image, cut partial ])', () => {
		let items = [
			{ type: 'image', width: 16, height: 2, data: new Uint8Array([ 0xff, 0x0f, 0x00, 0x00 ]) },
			{ type: 'cut', value: 'partial' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL, partial cut ends this segment */
			0x62, 0x02, 0x00, 0xff, 0x0f,					/* b 2 0 ff 0f, the first row */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0 00, the second row is white */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			...end
		];

		it('should set the partial cut mode before the first row', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, pulse, image, cut full ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'pulse', device: 0, on: 100, off: 500 },
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x42 ]) },
			{ type: 'cut', value: 'full' }
		];

		let expected = [
			...start,
			0x1b, 0x07, 0x0a, 0x32,							/* ESC BEL 10 50, 100 ms on and 500 ms off */
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x00,				/* ESC * r F 1 NUL, a pulse ends this segment */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print the rows without cutting */
			0x1b, 0x2a, 0x72, 0x44, 0x31, 0x00,				/* ESC * r D 1 NUL, drive drawer 1 */
			0x1b, 0x2a, 0x72, 0x46, 0x39, 0x00,				/* ESC * r F 9 NUL, a full cut ends this segment */
			0x62, 0x01, 0x00, 0x42,							/* b 1 0 42 */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			...end
		];

		it('should print before the drawer and change mode per segment', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, feed, image, cut partial ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'feed', height: 24 },
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x42 ]) },
			{ type: 'feed', height: 7 },
			{ type: 'cut', value: 'partial' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x2a, 0x72, 0x59, 0x32, 0x34, 0x00,		/* ESC * r Y 24 NUL */
			0x62, 0x01, 0x00, 0x42,							/* b 1 0 42 */
			0x1b, 0x2a, 0x72, 0x59, 0x37, 0x00,				/* ESC * r Y 7 NUL */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL */
			...end
		];

		it('should move the position instead of sending white rows', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image with a white row, cut partial ])', () => {
		let items = [
			{ type: 'image', width: 24, height: 3, data: new Uint8Array([ 
				0xff, 0xff, 0xff, 
				0x00, 0x00, 0x00, 
				0x80, 0x00, 0x00 
			]) },
			{ type: 'cut', value: 'partial' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL */
			0x62, 0x03, 0x00, 0xff, 0xff, 0xff,				/* b 3 0, nothing to trim */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0, an all white row is one zero byte */
			0x62, 0x01, 0x00, 0x80,							/* b 1 0, the white tail is trimmed */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL */
			...end
		];

		it('should trim the trailing white bytes of every row', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x00,				/* ESC * r F 1 NUL, the job ends this segment */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			...end
		];

		it('should print the last image without cutting', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ pulse ])', () => {
		let items = [
			{ type: 'pulse', device: 0, on: 100, off: 500 }
		];

		let expected = [
			...start,
			0x1b, 0x07, 0x0a, 0x32,							/* ESC BEL 10 50 */
			0x1b, 0x2a, 0x72, 0x44, 0x31, 0x00,				/* ESC * r D 1 NUL, no rows, so nothing to print first */
			...end
		];

		it('should not execute the FF mode when the segment has no rows', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ pulse with extreme times ])', () => {
		let items = [
			{ type: 'pulse', device: 0, on: 2, off: 5000 }
		];

		let expected = [
			...start,
			0x1b, 0x07, 0x01, 0x7f,							/* ESC BEL 1 127, clamped to the defined area */
			0x1b, 0x2a, 0x72, 0x44, 0x31, 0x00,				/* ESC * r D 1 NUL, drive drawer 1 */
			...end
		];

		it('should clamp the pulse width between 1 and 127 units of 10 ms', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ pulse on device 1 ])', () => {
		let items = [
			{ type: 'pulse', device: 1, on: 100, off: 500 }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x44, 0x32, 0x00,				/* ESC * r D 2 NUL, drive drawer 2 */
			...end
		];

		it('should not set a pulse width, the timing of device 2 is fixed', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, pulse, feed, cut partial ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'pulse', device: 0, on: 100, off: 500 },
			{ type: 'feed', height: 48 },
			{ type: 'cut', value: 'partial' }
		];

		let expected = [
			...start,
			0x1b, 0x07, 0x0a, 0x32,							/* ESC BEL 10 50 */
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x00,				/* ESC * r F 1 NUL, a pulse ends this segment */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print the rows without cutting */
			0x1b, 0x2a, 0x72, 0x44, 0x31, 0x00,				/* ESC * r D 1 NUL */
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL, a partial cut ends this segment */
			0x1b, 0x2a, 0x72, 0x59, 0x34, 0x38, 0x00,		/* ESC * r Y 48 NUL, the feed before the cut */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0 00, a blank row, the cut needs a buffer */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			...end
		];

		it('should give a cut after a feed something to cut through', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ cut partial, image ])', () => {
		let items = [
			{ type: 'cut', value: 'partial' },
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0 00, a blank row */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x00,				/* ESC * r F 1 NUL, the job ends this segment */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			...end
		];

		it('should cut when the job starts with a cut', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, cut partial, cut full ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'cut', value: 'partial' },
			{ type: 'cut', value: 'full' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			0x1b, 0x2a, 0x72, 0x46, 0x39, 0x00,				/* ESC * r F 9 NUL, the second cut is a full one */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0 00, a blank row */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print, feed and cut */
			...end
		];

		it('should cut twice when two cuts follow each other', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ feed ])', () => {
		let items = [
			{ type: 'feed', height: 24 }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x00,				/* ESC * r F 1 NUL, the job ends this segment */
			0x1b, 0x2a, 0x72, 0x59, 0x32, 0x34, 0x00,		/* ESC * r Y 24 NUL */
			0x62, 0x01, 0x00, 0x00,							/* b 1 0 00, a blank row, the feed needs a buffer */
			...end
		];

		it('should advance the paper for a job of nothing but a feed', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, feed without a height, cut partial ])', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'feed' },
			{ type: 'cut', value: 'partial' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x31, 0x33, 0x00,		/* ESC * r F 13 NUL */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x2a, 0x72, 0x59, 0x30, 0x00,				/* ESC * r Y 0 NUL, not NaN */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL */
			...end
		];

		it('should send zero for a value that is not a number', () => {
			expect(Array.from(wrap(items))).to.deep.equal(expected);
		});
	});

	describe('wrap([ image, cut full ], { tearBar: true })', () => {
		let items = [
			{ type: 'image', width: 8, height: 1, data: new Uint8Array([ 0x81 ]) },
			{ type: 'cut', value: 'full' }
		];

		let expected = [
			...start,
			0x1b, 0x2a, 0x72, 0x46, 0x33, 0x00,				/* ESC * r F 3 NUL, feed to the tear bar, no cut */
			0x62, 0x01, 0x00, 0x81,							/* b 1 0 81 */
			0x1b, 0x0c, 0x00,								/* ESC FF NUL, print and feed */
			...end
		];

		it('should feed to the tear bar instead of cutting', () => {
			expect(Array.from(wrap(items, { tearBar: true }))).to.deep.equal(expected);
		});
	});

});
