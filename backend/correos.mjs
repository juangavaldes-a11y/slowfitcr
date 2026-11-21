import { randomUUID } from "node:crypto";
import { configuredPickup, normalizeDeliveryDestination } from "./delivery-providers.mjs";

// Correos de Costa Rica (Pymexpress) shipping guides created from the POS.
// The official API contract is not available here, so remote creation goes through a configurable gateway
// (CCR_GUIDE_GATEWAY_URL + CCR_GUIDE_GATEWAY_TOKEN), the same pattern the DiDi provider uses. Without it the guide is
// stored ready to dispatch and the tracking number printed by Correos is entered by hand.
export const CCR_PROVIDER = "CORREOS_CR";

const positiveNumber = (value, field, { max, fallback } = {}) => {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || (max && number > max)) throw new Error(`INVALID_GUIDE_${field}`);
  return number;
};

export function parseGuideInput(body) {
  const reference = String(body?.reference || "").trim();
  if (!reference || reference.length > 60) throw new Error("INVALID_GUIDE_REFERENCE");
  const recipient = normalizeDeliveryDestination({ ...body?.recipient, country: "CR" });
  return {
    reference,
    recipient,
    weightKg: positiveNumber(body?.weightKg, "WEIGHT", { max: 30 }),
    pieces: Math.round(positiveNumber(body?.pieces, "PIECES", { max: 50, fallback: 1 })),
    declaredValueCrc: body?.declaredValueCrc === undefined || body?.declaredValueCrc === "" ? 0 : positiveNumber(body.declaredValueCrc, "VALUE", { max: 5_000_000 }),
    contents: String(body?.contents || "Ropa deportiva").trim().slice(0, 120),
  };
}

export function parseTrackingNumber(value) {
  const tracking = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,30}$/.test(tracking)) throw new Error("INVALID_TRACKING_NUMBER");
  return tracking;
}

export function gatewayConfigured(env = process.env) {
  return Boolean(env.CCR_GUIDE_GATEWAY_URL && env.CCR_GUIDE_GATEWAY_TOKEN);
}

export async function requestRemoteGuide(guide, sender, { env = process.env, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${env.CCR_GUIDE_GATEWAY_URL.replace(/\/+$/, "")}/guides`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CCR_GUIDE_GATEWAY_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reference: guide.reference,
      sender,
      recipient: guide.recipient,
      parcel: { weightKg: guide.weightKg, pieces: guide.pieces, contents: guide.contents, declaredValueCrc: guide.declaredValueCrc },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.trackingNumber) throw new Error(payload.error || payload.message || `Gateway responded ${response.status}`);
  return { trackingNumber: parseTrackingNumber(payload.trackingNumber), labelUrl: typeof payload.labelUrl === "string" ? payload.labelUrl : null };
}

const serialize = (delivery) => ({
  id: delivery.id,
  reference: delivery.paymentReference,
  status: delivery.status,
  trackingNumber: delivery.externalDeliveryId ?? null,
  trackingUrl: delivery.trackingUrl ?? null,
  recipient: delivery.contact,
  address: delivery.dropoff,
  parcel: delivery.manifest,
  errorMessage: delivery.errorMessage ?? null,
  createdAt: delivery.createdAt,
});

const safePickup = () => {
  try {
    return configuredPickup();
  } catch {
    return {};
  }
};

export function createCorreosHandlers({ prisma, jsonResponse, readJson, isAuthorized, appendAudit, env = process.env, fetchImpl = fetch }) {
  const guard = (handler) => async (request, ...args) => {
    if (!(await isAuthorized(request))) return jsonResponse({ error: "Unauthorized" }, 401);
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse({ error: "Invalid JSON" }, 400);
      if (/^(INVALID|NOT_FOUND|ALREADY)/.test(error?.message ?? "")) {
        return jsonResponse({ error: error.message }, error.message === "NOT_FOUND" ? 404 : 400);
      }
      if (error?.code === "P2002") return jsonResponse({ error: "ALREADY_EXISTS" }, 409);
      throw error;
    }
  };

  const createGuide = guard(async (request) => {
    const guide = parseGuideInput(await readJson(request));
    const sender = safePickup();
    let remote = null;
    let errorMessage = null;
    if (gatewayConfigured(env)) {
      try {
        remote = await requestRemoteGuide(guide, sender, { env, fetchImpl });
      } catch (error) {
        errorMessage = String(error?.message || "Gateway error").slice(0, 300);
      }
    }
    const now = new Date();
    const delivery = await prisma.delivery.create({
      data: {
        paymentReference: guide.reference,
        provider: CCR_PROVIDER,
        status: remote ? "ACTIVE" : "READY_TO_DISPATCH",
        externalQuoteId: `ccr-${randomUUID()}`,
        externalDeliveryId: remote?.trackingNumber ?? null,
        feeMinor: 0,
        currency: "CRC",
        quoteExpiresAt: now,
        pickup: sender,
        dropoff: guide.recipient.address,
        contact: { name: guide.recipient.name, phone: guide.recipient.phone },
        manifest: { weightKg: guide.weightKg, pieces: guide.pieces, contents: guide.contents, declaredValueCrc: guide.declaredValueCrc, notes: guide.recipient.notes },
        trackingUrl: remote?.labelUrl ?? null,
        errorMessage,
        dispatchedAt: remote ? now : null,
      },
    });
    await appendAudit("pos.shipment.created", { deliveryId: delivery.id, reference: guide.reference, remote: Boolean(remote), tracking: remote?.trackingNumber ?? null }, "admin");
    return jsonResponse({ ...serialize(delivery), gatewayConfigured: gatewayConfigured(env) }, 201);
  });

  const setTracking = guard(async (request, deliveryId) => {
    const body = await readJson(request);
    const trackingNumber = parseTrackingNumber(body?.trackingNumber);
    const existing = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!existing || existing.provider !== CCR_PROVIDER) throw new Error("NOT_FOUND");
    if (existing.status === "CANCELLED" || existing.status === "COMPLETED") throw new Error("INVALID_STATUS");
    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: { externalDeliveryId: trackingNumber, status: "ACTIVE", errorMessage: null, dispatchedAt: existing.dispatchedAt ?? new Date() },
    });
    await appendAudit("pos.shipment.tracking", { deliveryId, trackingNumber }, "admin");
    return jsonResponse(serialize(updated));
  });

  const getGuide = guard(async (_request, deliveryId) => {
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery || delivery.provider !== CCR_PROVIDER) throw new Error("NOT_FOUND");
    return jsonResponse(serialize(delivery));
  });

  return { createGuide, setTracking, getGuide };
}
