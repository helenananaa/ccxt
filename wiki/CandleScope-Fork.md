# CandleScope fixed-version fork prototype

Upstream baseline: `v4.5.60`, commit `72fd71026c8cfc0d9a470a834fcc7ad611be5765`.
This branch intentionally does not track upstream master. Updates require an explicit
baseline change and regression qualification. The existing unified API is unchanged.

## Additive contract

Only Binance USD-M **linear swaps, trade klines** are in scope. The exchange-specific
methods are `candlescopeKlineContract`, `fetchCandlescopeKlines`,
`parseCandlescopeKline`, and `parseCandlescopeWsKline` (snake_case in Python).
Schema: `candlescope.binance.usdm.kline.v1`.

`fetchCandlescopeKlines(symbol, timeframe, since, limit, {until})` makes one public
REST request, allows 1–1500 rows, uses inclusive open-time bounds, and rejects other
params so market identity and range cannot be silently overridden. Callers own
pagination. It preserves `closeTime`, quote volume, trade count, taker base/quote
volumes, and base/quote unit labels. Decimal fields are strings. The `raw` string
serializes the complete already-decoded source payload, including additional source
fields; it is not the original HTTP/WS wire bytes. No raw response side cache is used.

`parseCandlescopeWsKline(message)` requires loaded markets and accepts a native kline
frame before Pro projects it. It keeps `eventTime`, boolean `closed` from `k.x`, and
`closeEvidence=ws_x`. It neither subscribes nor deduplicates. CandleScope calls it
from its existing synchronous raw hook, sharing the existing Pro subscription.
REST has `closed=undefined`/`None` and `closeEvidence=rest_close_time`; a consumer may
compare source close time to its observation time, but must label that inference.
Parsers preserve raw evidence; consumers must validate the values and their units.

## Python/JavaScript examples

```python
exchange = ccxt.async_support.binanceusdm()
try:
    candles = await exchange.fetch_candlescope_klines(
        'BTC/USDT:USDT', '1m', since_ms, 1500, {'until': until_ms})
finally:
    await exchange.close()
```

```javascript
const candles = await exchange.fetchCandlescopeKlines(
    'BTC/USDT:USDT', '1m', sinceMs, 1500, { until: untilMs });
```

## Build and qualification

Maintain TypeScript source only. Generate Python with the pinned Node dependency
lock, compile TypeScript directly with `tsc` (upstream's `tsBuild` can hide failures),
and run `tsx build/transpile.ts --python --noTests binance`. The CandleScope consumer
contains a source-SHA lock and a clean-checkout wheel builder; installing this branch
with `pip install git+...#subdirectory=python` alone is insufficient because generated
Python files are deliberately not committed. Build provenance is embedded in the
wheel, and the consumer checks it when enabling the experiment.

Offline extension tests: `npx tsx --test ts/src/test/candlescope/binance.test.ts`.
All target-language transpilation was exercised. This prototype is qualified for
local JS/Python testing; PHP/C#/Go/Java runtime parity and full upstream release gates
remain unqualified. Do not treat successful transpilation as runtime qualification.
