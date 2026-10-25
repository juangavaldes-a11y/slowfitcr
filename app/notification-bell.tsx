"use client";

import { BellOutlined } from "@ant-design/icons";
import { Badge, Button, Empty, Popover, Typography } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./lib/api-client";

type Audience = "admin" | "customer";
type Notice = {
  id: string;
  kind: string;
  readAt: string | null;
  createdAt: string;
  params: { code?: string | null; productName?: string | null; color?: string | null; size?: string; customerName?: string | null; expiresAt?: string | null };
};

const POLL_MS = 60_000;

export function describeNotice(notice: Notice, audience: Audience, locale: "es" | "en") {
  const es = locale === "es";
  const { params } = notice;
  const piece = [params.productName ?? params.code, params.color, params.size].filter(Boolean).join(" · ");
  const who = params.customerName || (es ? "Un cliente" : "A customer");
  const date = params.expiresAt ? new Date(params.expiresAt).toLocaleDateString(es ? "es-CR" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "";
  const admin = audience === "admin";
  switch (notice.kind) {
    case "LAYAWAY_WARNING":
      if (es) return admin ? `El apartado de ${who} (${piece}) vence el ${date}: faltan 10 días o menos.` : `Tu apartado (${piece}) vence el ${date}: te quedan 10 días o menos para completar tu compra.`;
      return admin ? `${who}'s layaway (${piece}) expires on ${date}: 10 days or less left.` : `Your layaway (${piece}) expires on ${date}: 10 days or less left to complete your purchase.`;
    case "LAYAWAY_EXPIRED":
      if (es) return admin ? `El apartado de ${who} (${piece}) venció el ${date}. Ya puedes liberarlo en el inventario.` : `Tu apartado (${piece}) venció el ${date}.`;
      return admin ? `${who}'s layaway (${piece}) expired on ${date}. You can release it from the inventory.` : `Your layaway (${piece}) expired on ${date}.`;
    case "LAYAWAY_REQUESTED":
      return es ? `${who} solicitó apartar ${piece}. Confirma el depósito en el inventario.` : `${who} requested a layaway for ${piece}. Confirm the deposit in the inventory.`;
    case "LAYAWAY_PAID":
      return es ? `${who} pagó en línea el depósito de ${piece}.` : `${who} paid the deposit for ${piece} online.`;
    case "LAYAWAY_PAYMENT_CONFLICT":
      return es ? `${who} pagó el depósito de ${piece} pero la pieza ya no está disponible. Hay que reembolsarlo.` : `${who} paid the deposit for ${piece} but the piece is no longer available. It needs a refund.`;
    default:
      return notice.kind;
  }
}

export default function NotificationBell({ audience, locale }: { audience: Audience; locale: "es" | "en" }) {
  const base = audience === "admin" ? "/api/admin/notifications" : "/api/account/notifications";
  const href = audience === "admin" ? `/${locale}/admin/inventory` : `/${locale}/account`;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const es = locale === "es";

  const load = useCallback(async () => {
    try {
      const payload = await apiRequest<{ notifications: Notice[]; unread: number }>(base, { cache: "no-store" });
      setNotices(payload.notifications);
      setUnread(payload.unread);
    } catch {
      // A signed-out or offline session simply shows an empty bell.
    }
  }, [base]);

  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    try {
      await apiRequest(`${base}/read`, { method: "POST", body: JSON.stringify(body) });
    } finally {
      await load();
    }
  };

  const content = (
    <div className="slowfit-notification-panel">
      <div className="slowfit-notification-head">
        <Typography.Text strong>{es ? "Notificaciones" : "Notifications"}</Typography.Text>
        <Button type="link" size="small" disabled={!unread} onClick={() => void markRead({ all: true })}>{es ? "Marcar todo como leído" : "Mark all as read"}</Button>
      </div>
      {notices.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={es ? "Sin notificaciones" : "No notifications"} /> : (
        <ul className="slowfit-notification-list">
          {notices.map((notice) => (
            <li key={notice.id} className={`slowfit-notification-item${notice.readAt ? "" : " is-unread"}${notice.kind === "LAYAWAY_EXPIRED" || notice.kind === "LAYAWAY_PAYMENT_CONFLICT" ? " is-urgent" : ""}`}>
              <Link href={href} onClick={() => { setOpen(false); if (!notice.readAt) void markRead({ ids: [notice.id] }); }}>
                <span>{describeNotice(notice, audience, locale)}</span>
                <time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString(es ? "es-CR" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const label = audience === "admin" ? (es ? "Notificaciones de administración" : "Admin notifications") : (es ? "Mis notificaciones" : "My notifications");
  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} arrow={false}>
      <Badge count={unread} size="small" overflowCount={99} offset={[-4, 4]}>
        <Button type="text" shape="circle" aria-label={`${label}${unread ? ` (${unread})` : ""}`} icon={<BellOutlined />} className="slowfit-bell" />
      </Badge>
    </Popover>
  );
}
