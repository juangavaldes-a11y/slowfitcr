"use client";

import { Alert, Empty, Spin, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { apiRequest, formatApiError } from "./lib/api-client";

type CustomerLayaway = {
  id: string;
  size: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "RELEASED" | "COMPLETED";
  phase: "OK" | "WARNING" | "EXPIRED" | null;
  unitPriceCrc: number;
  depositCrc: number;
  holdExpiresAt: string | null;
  expiresAt: string | null;
  line?: { productName: string; color: string };
};

export default function CustomerLayaways({ locale }: { locale: "es" | "en" }) {
  const es = locale === "es";
  const [layaways, setLayaways] = useState<CustomerLayaway[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<{ layaways: CustomerLayaway[] }>("/api/account/layaways", { cache: "no-store" })
      .then((payload) => { if (active) setLayaways(payload.layaways); })
      .catch((requestError) => { if (active) setError(formatApiError(requestError, locale)); });
    return () => { active = false; };
  }, [locale]);

  const money = new Intl.NumberFormat(es ? "es-CR" : "en-US", { style: "currency", currency: "CRC", maximumFractionDigits: 0 });
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(es ? "es-CR" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : "";

  if (error) return <Alert type="error" showIcon title={error} />;
  if (!layaways) return <Spin />;
  if (!layaways.length) return <Empty description={es ? "Aún no tienes apartados." : "You have no layaways yet."} />;

  const status = (layaway: CustomerLayaway) => {
    if (layaway.status === "COMPLETED") return <Tag color="success">{es ? "Compra completada" : "Purchase completed"}</Tag>;
    if (layaway.status === "RELEASED") return <Tag>{es ? "Liberado" : "Released"}</Tag>;
    if (layaway.status === "PENDING_PAYMENT") return <Tag color="processing">{es ? `Pendiente de depósito (se libera el ${date(layaway.holdExpiresAt)})` : `Deposit pending (released on ${date(layaway.holdExpiresAt)})`}</Tag>;
    if (layaway.phase === "EXPIRED") return <Tag color="error">{es ? `Venció el ${date(layaway.expiresAt)}` : `Expired on ${date(layaway.expiresAt)}`}</Tag>;
    return <Tag color={layaway.phase === "WARNING" ? "warning" : "success"}>{es ? `Apartado hasta el ${date(layaway.expiresAt)}` : `Reserved until ${date(layaway.expiresAt)}`}</Tag>;
  };

  return (
    <div className="slowfit-account-orders">
      {layaways.map((layaway) => (
        <article className="slowfit-order-row" key={layaway.id}>
          <div>
            <Typography.Title level={4}>{layaway.line ? `${layaway.line.productName} · ${layaway.line.color}` : ""} ({layaway.size})</Typography.Title>
            <Typography.Text type="secondary">
              {es ? "Depósito del 20%" : "20% deposit"}: {money.format(layaway.depositCrc)} · {es ? "Precio" : "Price"}: {money.format(layaway.unitPriceCrc)}
            </Typography.Text>
          </div>
          <div className="slowfit-order-status">{status(layaway)}</div>
        </article>
      ))}
    </div>
  );
}
