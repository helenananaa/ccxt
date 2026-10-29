// Offline contract tests for the versioned CandleScope extension.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import binanceusdm from '../../binanceusdm.js';
import binance from '../../binance.js';

const market = {
    id: 'BTCUSDT', symbol: 'BTC/USDT:USDT', base: 'BTC', quote: 'USDT', settle: 'USDT',
    type: 'swap', swap: true, spot: false, contract: true, linear: true, inverse: false,
};
const row = [1769904000000, '100.000000000000001', '103', '99', '102', '10', 1772323199999, '1010', 4, '6', '606', '0'];
const frame = {
    e: 'kline', E: 1772323200001, s: 'BTCUSDT',
    k: { t: row[0], T: row[6], s: 'BTCUSDT', i: '1M', o: row[1], h: row[2], l: row[3], c: row[4], v: row[5], q: row[7], n: row[8], V: row[9], Q: row[10], x: false, f: 100, L: 103 },
};
function exchange (): any {
    const result: any = new binanceusdm ();
    result.setMarkets ([market]);
    return result;
}

test ('spot preserves source fields and uses the spot page limit and endpoint', async () => {
    const ex: any = new binance ();
    const spot = { ...market, symbol: 'BTC/USDT', type: 'spot', spot: true, swap: false, linear: false, contract: false };
    ex.setMarkets ([spot]);
    ex.publicGetKlines = async () => [row];
    const values = await ex.fetchCandlescopeKlines (spot.symbol, '1M', undefined, 1000);
    assert.equal (values[0].schema, 'candlescope.binance.spot.kline.v1');
    assert.equal (values[0].volume, '10');
    assert.equal (ex.parseCandlescopeWsKline (frame).marketType, 'spot');
    await assert.rejects (ex.fetchCandlescopeKlines (spot.symbol, '1M', undefined, 1001), /1 to 1000/);
});

test ('standard six-value projection remains unchanged; extended values retain source precision and calendar close', () => {
    const ex = exchange ();
    assert.equal (ex.parseOHLCV (row, market).length, 6);
    const parsed = ex.parseCandlescopeKline (row, market, '1M');
    assert.equal (parsed.schema, 'candlescope.binance.usdm.kline.v1');
    assert.equal (parsed.open, row[1]);
    assert.equal (parsed.closeTime, 1772323199999);
    assert.equal (parsed.quoteVolume, '1010');
    assert.equal (parsed.takerBuyBaseVolume, '6');
    assert.equal (parsed.takerBuyQuoteVolume, '606');
    assert.equal (parsed.trades, 4);
    assert.equal (parsed.closed, undefined);
    assert.equal (parsed.closeEvidence, 'rest_close_time');
    assert.deepEqual (JSON.parse (parsed.raw), row);
    JSON.parse (parsed.raw)[1] = 'changed';
    assert.equal (row[1], '100.000000000000001');
});

test ('REST accepts 1500 rows and isolates request-owned range/symbol parameters', async () => {
    const ex = exchange ();
    const rows = Array.from ({ length: 1500 }, (_, i) => [Number (row[0]) + i * 60000, ...row.slice (1)]);
    let request;
    ex.fapiPublicGetKlines = async (params) => { request = params; return rows; };
    const result = await ex.fetchCandlescopeKlines (market.symbol, '1m', row[0], 1500, { until: rows[1499][0] });
    assert.equal (request.limit, 1500);
    assert.equal (request.endTime, rows[1499][0]);
    assert.equal (result.length, 1500);
    const clipped = await ex.fetchCandlescopeKlines (market.symbol, '1m', rows[1][0], 1500, { until: rows[2][0] });
    assert.equal (clipped.length, 2);
    await assert.rejects (ex.fetchCandlescopeKlines (market.symbol, '1m', undefined, 5, { symbol: 'ETHUSDT' }), /only supports params.until/);
    await assert.rejects (ex.fetchCandlescopeKlines (market.symbol, '1m', undefined, 1501), /1 to 1500/);
});

test ('WS retains enhanced-only revisions and explicit finality without aliasing raw evidence', () => {
    const ex = exchange ();
    const first = ex.parseCandlescopeWsKline (frame);
    const revision = structuredClone (frame);
    revision.k.q = '1011';
    revision.k.x = true;
    const second = ex.parseCandlescopeWsKline (revision);
    assert.equal (first.closed, false);
    assert.equal (second.closed, true);
    assert.equal (first.closeEvidence, 'ws_x');
    assert.equal (first.eventTime, frame.E);
    assert.equal (first.quoteVolume, '1010');
    assert.equal (second.quoteVolume, '1011');
    assert.equal (JSON.parse (second.raw).k.f, 100);
    revision.k.q = '999';
    assert.equal (JSON.parse (second.raw).k.q, '1011');
    const malformed = structuredClone (frame) as any;
    delete malformed.k.x;
    assert.throws (() => ex.parseCandlescopeWsKline (malformed), /closed flag/);
    assert.throws (() => ex.parseCandlescopeKline (row.slice (0, 6), market, '1M'), /11 fields/);
    assert.throws (() => ex.parseCandlescopeKline (row, { ...market, inverse: true, linear: false }, '1M'), /linear swaps/);
});
