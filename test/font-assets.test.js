import test from 'node:test';
import assert from 'node:assert/strict';
import {weightRange,verifyFontAssets} from '../src/font-assets.js';
test('bundled font binaries really support the variable ranges declared in CSS',()=>{
 assert.doesNotThrow(verifyFontAssets);
 assert.throws(()=>weightRange(Buffer.from([0,1,0,0,0,15,0,128])),/not correctly encoded WOFF2/);
});
