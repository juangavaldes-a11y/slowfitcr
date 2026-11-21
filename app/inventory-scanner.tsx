"use client";

import { CameraOutlined, DeleteOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Input, InputNumber, Popconfirm, Segmented, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import BarcodeScanner, { cameraScanSupported } from "./barcode-scanner";
import { apiRequest, formatApiError, isApiErrorStatus } from "./lib/api-client";
import { addScan, applyBody, countDifference, removeRow, sessionSummary, setRowQuantity, type ScanMode, type ScanRow, type ScannedItem } from "./lib/inventory-scan";

type LookupResponse = ScannedItem & { code: string; received: number; sold: number; held: number };
type ApplyResponse = { mode: ScanMode; applied: Array<{ lineId: string; code: string; color: string; size: string; before: number; after: number; delta: number }> };

type Props = { open: boolean; locale: "es" | "en"; onClose: () => void; onApplied: () => void };

// Receive stock or run a physical count by scanning SKUs. USB/Bluetooth scanners type into the box; the camera button reads with BarcodeDetector.
export default function InventoryScanner({ open, locale, onClose, onApplied }: Props) {
  const [api, contextHolder] = message.useMessage();
  const [mode, setMode] = useState<ScanMode>("receive");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const es = locale === "es";

  const labels = es ? {
    title: "Escáner de inventario", receive: "Ingreso de mercadería", count: "Conteo físico",
    hintReceive: "Escanea cada prenda que llega: cada lectura suma una unidad al inventario.",
    hintCount: "Cuenta lo que hay en el estante. Al aplicar, el sistema queda igual a tu conteo.",
    placeholder: "Escanea o escribe el código (SKU)", camera: "Cámara", product: "Producto", system: "Sistema", counted: "Contado", arrived: "Llegó", diff: "Diferencia",
    apply: "Aplicar", applyConfirm: "¿Aplicar estos cambios al inventario?", clear: "Limpiar", note: "Nota (opcional)",
    notFound: "No encontramos ese código.", noLine: "Ese código no tiene una línea de inventario.", noCamera: "La cámara no está disponible en este navegador; usa un lector USB o escribe el código.",
    empty: "Aún no has escaneado nada.", done: "Cambios aplicados", unitsReceived: "unidades ingresadas", rowsApplied: "líneas ajustadas", close: "Cerrar", remove: "Quitar",
    summary: (units: number, differences: number, shortfall: number, surplus: number) => `${units} u. · ${differences} con diferencia (faltan ${Math.abs(shortfall)}, sobran ${surplus})`,
  } : {
    title: "Inventory scanner", receive: "Receive stock", count: "Physical count",
    hintReceive: "Scan each garment that arrives: every read adds one unit to the inventory.",
    hintCount: "Count what is on the shelf. When applied, the system matches your count.",
    placeholder: "Scan or type the code (SKU)", camera: "Camera", product: "Product", system: "System", counted: "Counted", arrived: "Received", diff: "Difference",
    apply: "Apply", applyConfirm: "Apply these changes to the inventory?", clear: "Clear", note: "Note (optional)",
    notFound: "We could not find that code.", noLine: "That code has no inventory line.", noCamera: "The camera is not available in this browser; use a USB scanner or type the code.",
    empty: "Nothing scanned yet.", done: "Changes applied", unitsReceived: "units received", rowsApplied: "lines adjusted", close: "Close", remove: "Remove",
    summary: (units: number, differences: number, shortfall: number, surplus: number) => `${units} units · ${differences} differ (${Math.abs(shortfall)} short, ${surplus} over)`,
  };

  const scan = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    try {
      const found = await apiRequest<LookupResponse>(`/api/admin/inventory/scan?code=${encodeURIComponent(value)}`, { cache: "no-store" });
      setRows((current) => addScan(current, { lineId: found.lineId, size: found.size, sku: found.sku, productName: found.productName, color: found.color, remaining: found.remaining }));
      setResult(null);
    } catch (error) {
      if (isApiErrorStatus(error, 404)) api.warning(labels.notFound);
      else if (error instanceof Error && error.message === "NOT_FOUND_LINE") api.warning(labels.noLine);
      else api.error(formatApiError(error, locale));
    }
  }, [api, labels.noLine, labels.notFound, locale]);

  const onCameraCode = useCallback((value: string) => { void scan(value); }, [scan]);

  const changeMode = (next: ScanMode) => {
    setMode(next);
    // Quantities mean different things in each mode, so start a clean session.
    setRows([]);
    setResult(null);
  };

  const apply = async () => {
    setApplying(true);
    try {
      const done = await apiRequest<ApplyResponse>("/api/admin/inventory/scan/apply", { method: "POST", body: JSON.stringify(applyBody(rows, mode, note)) });
      setResult(done);
      setRows([]);
      setNote("");
      onApplied();
      api.success(labels.done);
    } catch (error) {
      api.error(formatApiError(error, locale));
    } finally {
      setApplying(false);
    }
  };

  const summary = sessionSummary(rows, mode);
  const columns: ColumnsType<ScanRow> = [
    { title: labels.product, key: "product", render: (_, row) => (<><div>{row.productName}</div><Typography.Text type="secondary">{row.color} · {row.size} · {row.sku}</Typography.Text></>) },
    ...(mode === "count" ? [{ title: labels.system, key: "system", width: 90, render: (_: unknown, row: ScanRow) => row.remaining }] : []),
    { title: mode === "count" ? labels.counted : labels.arrived, key: "qty", width: 110, render: (_, row) => (<InputNumber min={0} value={row.quantity} onChange={(value) => setRows((current) => setRowQuantity(current, row.key, Number(value ?? 0)))} />) },
    ...(mode === "count" ? [{
      title: labels.diff, key: "diff", width: 100,
      render: (_: unknown, row: ScanRow) => { const diff = countDifference(row); return <Tag color={diff === 0 ? "green" : diff < 0 ? "red" : "gold"}>{diff > 0 ? `+${diff}` : diff}</Tag>; },
    }] : []),
    { key: "remove", width: 44, render: (_, row) => (<Button type="text" danger aria-label={labels.remove} icon={<DeleteOutlined />} onClick={() => setRows((current) => removeRow(current, row.key))} />) },
  ];

  return (
    <Drawer open={open} onClose={onClose} title={labels.title} size="large" destroyOnHidden>
      {contextHolder}
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Segmented<ScanMode> block value={mode} onChange={changeMode} options={[{ value: "receive", label: labels.receive }, { value: "count", label: labels.count }]} />
        <Typography.Text type="secondary">{mode === "receive" ? labels.hintReceive : labels.hintCount}</Typography.Text>
        <Space.Compact style={{ width: "100%" }}>
          <Input.Search
            autoFocus
            size="large"
            allowClear
            enterButton
            placeholder={labels.placeholder}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onSearch={(value) => { setCode(""); void scan(value); }}
          />
          <Button size="large" icon={<CameraOutlined />} onClick={() => (cameraScanSupported() ? setCameraOpen(true) : api.info(labels.noCamera))}>{labels.camera}</Button>
        </Space.Compact>
        {result ? (
          <Alert type="success" showIcon closable onClose={() => setResult(null)} title={labels.done}
            description={`${result.applied.length} ${labels.rowsApplied}${result.mode === "receive" ? ` · ${result.applied.reduce((total, item) => total + item.delta, 0)} ${labels.unitsReceived}` : ""}`} />
        ) : null}
        <Table<ScanRow> size="small" rowKey="key" columns={columns} dataSource={rows} pagination={false} scroll={{ x: true }} locale={{ emptyText: labels.empty }} />
        {rows.length ? (
          <>
            {mode === "count" ? <Typography.Text>{labels.summary(summary.units, summary.differences, summary.shortfall, summary.surplus)}</Typography.Text> : null}
            <Input placeholder={labels.note} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
            <Space>
              <Popconfirm title={labels.applyConfirm} okText={labels.apply} cancelText={labels.close} onConfirm={() => void apply()}>
                <Button type="primary" loading={applying} data-testid="scan-apply">{labels.apply}</Button>
              </Popconfirm>
              <Button onClick={() => setRows([])}>{labels.clear}</Button>
            </Space>
          </>
        ) : null}
      </Space>
      <BarcodeScanner open={cameraOpen} locale={locale} onClose={() => setCameraOpen(false)} onDetect={onCameraCode} />
    </Drawer>
  );
}
