import assert from 'node:assert/strict';
import { test } from 'node:test';
import okx from '../../okx.js';

const swap = { id: 'BTC-USDT-SWAP', symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', settle: 'USDT', type: 'swap', swap: true, linear: true, spot: false, contract: true };
const spot = { ...swap, id: 'BTC-USDT', symbol: 'BTC/USDT', type: 'spot', spot: true, swap: false, contract: false };
const row = ['1769904000000', '100.000000000000001', '103', '99', '102', '100', '1', '101', '1'];
function exchange (): any {
    const result: any = new okx ();
    result.setMarkets ([swap, spot]);
    return result;
}
test ('OKX preserves contract/base/quote units and marks unavailable fields', () => {
    const ex = exchange ();
    const parsed = ex.parseCandlescopeKline (row, swap, '1M');
    assert.equal (parsed.volume, '1');
    assert.equal (parsed.sourceVolume, '100');
    assert.equal (parsed.sourceVolumeUnit, 'contracts');
    assert.equal (parsed.trades, undefined);
    assert.equal (parsed.closeTime, undefined);
    assert.equal (parsed.closed, true);
    assert.equal (parsed.open, row[1]);
    assert.equal (ex.parseCandlescopeKline (row, spot, '1m').volume, '100');
    assert.throws (() => ex.parseCandlescopeKline (row.slice (0, 8), swap, '1m'), /nine fields/);
});
test ('OKX REST preserves range boundaries and raw rows', async () => {
    const ex = exchange ();
    let request;
    ex.publicGetMarketHistoryCandles = async (params) => { request = params; return { code: '0', data: [row] }; };
    const values = await ex.fetchCandlescopeKlines (swap.symbol, '1M', Number (row[0]), 300, { until: Number (row[0]) });
    assert.equal (request.after, Number (row[0]) + 1);
    assert.equal (request.before, Number (row[0]) - 1);
    assert.equal (request.bar, '1Mutc');
    assert.deepEqual (JSON.parse (values[0].raw), row);
    await assert.rejects (ex.fetchCandlescopeKlines (swap.symbol, '1m', undefined, 301), /limit/);
});
test ('OKX WS preserves all rows and the original full envelope', () => {
    const ex = exchange ();
    const frame = { arg: { channel: 'candle1Mutc', instId: swap.id }, data: [row, [...row.slice (0, 8), '0']] };
    const values = ex.parseCandlescopeWsKlines (frame);
    assert.equal (values.length, 2);
    assert.equal (values[0].timeframe, '1M');
    assert.equal (values[1].rawRow, 1);
    assert.equal (values[1].closed, false);
    assert.equal (values[0].eventTime, undefined);
    assert.deepEqual (JSON.parse (values[0].raw), frame);
});
