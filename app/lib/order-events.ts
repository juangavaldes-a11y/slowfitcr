import "server-only";

type ShopifyOrderPayload = {
  id?: number;
  order_number?: number;
  name?: string;
  email?: string;
  currency?: string;
  current_total_price?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
  };
  line_items?: Array<{
    title?: string;
    quantity?: number;
    price?: string;
  }>;
};

function orderSummary(order: ShopifyOrderPayload) {
  const items = order.line_items ?? [];
  const itemSummary = items
    .map((item) => `${item.quantity ?? 1}x ${item.title ?? "Item"}`)
    .slice(0, 8)
    .join(", ");

  return itemSummary || "Order items";
}

async function sendOrderEmail(order: ShopifyOrderPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_CONFIRM_FROM;

  if (!apiKey || !from || !order.email) {
    return;
  }

  const name = `${order.customer?.first_name ?? ""} ${order.customer?.last_name ?? ""}`.trim() || "Slow Fit customer";
  const orderLabel = order.name || `#${order.order_number ?? ""}`;
  const total = `${order.current_total_price ?? "0.00"} ${order.currency ?? "USD"}`;
  const items = orderSummary(order);

  const subject = `Order confirmation ${orderLabel}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2f2a28;">
      <h2>Thanks for your order, ${name}.</h2>
      <p>We received your purchase and are preparing it now.</p>
      <p><strong>Order:</strong> ${orderLabel}</p>
      <p><strong>Total:</strong> ${total}</p>
      <p><strong>Items:</strong> ${items}</p>
      <p>We will contact you with delivery updates soon.</p>
      <p>Slow Fit CR</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [order.email],
      subject,
      html,
    }),
  });
}

export async function processOrderWebhook(input: {
  topic: string;
  shop: string;
  payload: ShopifyOrderPayload;
}) {
  const order = input.payload;

  const event = {
    topic: input.topic,
    shop: input.shop,
    orderId: order.id,
    orderNumber: order.order_number,
    orderName: order.name,
    email: order.email,
    total: order.current_total_price,
    currency: order.currency,
    items: order.line_items ?? [],
    createdAt: new Date().toISOString(),
  };

  const eventsWebhook = process.env.ORDER_EVENTS_WEBHOOK_URL;
  if (eventsWebhook) {
    await fetch(eventsWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  }

  const crmWebhook = process.env.CRM_ORDER_WEBHOOK_URL;
  if (crmWebhook) {
    await fetch(crmWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "slowfit-shopify-order-webhook",
        event,
      }),
    });
  }

  if (input.topic === "orders/create" || input.topic === "orders/paid") {
    await sendOrderEmail(order);
  }
}
