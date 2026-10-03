// Hacienda republishes the BCCR reference rate without an API key.
const RATE_URL = "https://api.hacienda.go.cr/indicadores/tc";

export async function fetchBccrRate(fetchImpl = fetch) {
  const response = await fetchImpl(RATE_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FX_HTTP_${response.status}`);
  const payload = await response.json();
  const sell = Number(payload?.dolar?.venta?.valor);
  const buy = Number(payload?.dolar?.compra?.valor);
  const date = String(payload?.dolar?.venta?.fecha || "");
  if (!Number.isFinite(sell) || !Number.isFinite(buy) || sell <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("FX_INVALID_PAYLOAD");
  }
  return { date, buyRate: buy, sellRate: sell };
}
