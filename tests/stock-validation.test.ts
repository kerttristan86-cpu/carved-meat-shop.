import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireStock} from '../lib/stock-validation';
import {checkoutError} from '../lib/http';
test('shortage identifies product, location, available and requested kg',()=>{assert.throws(()=>requireStock('Pork','Retail freezer',50,5950),/Pork: Retail freezer has 0.050 kg; this order needs 5.950 kg/);assert.doesNotThrow(()=>requireStock('Pork','Retail freezer',5950,5950));});
test('confirmed validation failures do not suggest network retries',()=>{assert.equal(checkoutError(Object.assign(new Error('Stock shortage'),{definite:true})),'Stock shortage');assert.match(checkoutError(new Error('Failed to fetch')),/retry checkout/i);});
