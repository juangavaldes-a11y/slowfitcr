"use client";

import { PrinterOutlined } from "@ant-design/icons";
import { Alert, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Typography, message } from "antd";
import { useMemo, useState } from "react";
import { apiRequest, formatApiError } from "./lib/api-client";
import { crProvinces, findCanton, findProvince } from "./lib/cr-locations";
import { buildGuideRequest, guideLabelHtml, type GuideForm, type PosGuide } from "./lib/pos-guide";
import type { PosReceipt } from "./lib/pos-receipt";

type Props = { open: boolean; locale: "es" | "en"; receipt: PosReceipt | null; onClose: () => void };

// Creates a Correos de Costa Rica guide for a POS sale. If the gateway is not configured the guide is stored and the
// tracking number printed by Correos is typed in afterwards.
export default function PosShippingGuide({ open, locale, receipt, onClose }: Props) {
  const [api, contextHolder] = message.useMessage();
  const [form] = Form.useForm<GuideForm>();
  const [guide, setGuide] = useState<PosGuide | null>(null);
  const [saving, setSaving] = useState(false);
  const [tracking, setTracking] = useState("");
  const es = locale === "es";
  const provinceCode = Form.useWatch("provinceCode", form);
  const cantonCode = Form.useWatch("cantonCode", form);

  const labels = es ? {
    title: "Guía de Correos de Costa Rica", name: "Nombre del destinatario", phone: "Teléfono", province: "Provincia", canton: "Cantón", district: "Distrito",
    address: "Otras señas", weight: "Peso (kg)", pieces: "Piezas", contents: "Contenido", declared: "Valor declarado (₡)", create: "Crear guía", close: "Cerrar",
    required: "Requerido", created: "Guía creada", manualTitle: "Falta el número de rastreo",
    manual: "La pasarela de Correos no está configurada. Crea la guía en Correos y escribe aquí el número de rastreo para guardarlo.",
    tracking: "Número de rastreo", saveTracking: "Guardar número", print: "Imprimir etiqueta", status: "Estado", trackingSaved: "Número de rastreo guardado",
    gatewayError: "La pasarela no respondió; completa el número de rastreo a mano.",
  } : {
    title: "Correos de Costa Rica guide", name: "Recipient name", phone: "Phone", province: "Province", canton: "Canton", district: "District",
    address: "Address details", weight: "Weight (kg)", pieces: "Pieces", contents: "Contents", declared: "Declared value (₡)", create: "Create guide", close: "Close",
    required: "Required", created: "Guide created", manualTitle: "Tracking number missing",
    manual: "The Correos gateway is not configured. Create the guide at Correos and type the tracking number here to store it.",
    tracking: "Tracking number", saveTracking: "Save number", print: "Print label", status: "Status", trackingSaved: "Tracking number saved",
    gatewayError: "The gateway did not respond; enter the tracking number by hand.",
  };

  const cantons = useMemo(() => findProvince(provinceCode)?.cantons ?? [], [provinceCode]);
  const districts = useMemo(() => findCanton(provinceCode, cantonCode)?.districts ?? [], [provinceCode, cantonCode]);

  const submit = async (values: GuideForm) => {
    if (!receipt) return;
    setSaving(true);
    try {
      const created = await apiRequest<PosGuide>("/api/admin/pos/shipments", { method: "POST", body: JSON.stringify(buildGuideRequest(values, receipt.receipt)) });
      setGuide(created);
      api.success(labels.created);
    } catch (error) {
      api.error(formatApiError(error, locale));
    } finally {
      setSaving(false);
    }
  };

  const saveTracking = async () => {
    if (!guide) return;
    setSaving(true);
    try {
      const updated = await apiRequest<PosGuide>(`/api/admin/pos/shipments/${guide.id}/tracking`, { method: "PATCH", body: JSON.stringify({ trackingNumber: tracking }) });
      setGuide({ ...guide, ...updated });
      api.success(labels.trackingSaved);
    } catch (error) {
      api.error(formatApiError(error, locale));
    } finally {
      setSaving(false);
    }
  };

  const printLabel = () => {
    if (!guide) return;
    const popup = window.open("", "_blank", "width=480,height=720");
    if (!popup) return;
    popup.document.write(guideLabelHtml(guide, locale));
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const close = () => {
    setGuide(null);
    setTracking("");
    form.resetFields();
    onClose();
  };

  return (
    <Modal open={open} onCancel={close} title={labels.title} width={720} destroyOnHidden
      footer={guide ? <Button onClick={close}>{labels.close}</Button> : null}>
      {contextHolder}
      {!guide ? (
        <Form<GuideForm> form={form} layout="vertical" onFinish={(values) => void submit(values)}
          initialValues={{ weightKg: 0.5, pieces: 1, contents: es ? "Ropa deportiva" : "Sportswear", declaredValueCrc: receipt?.totalCrc ?? 0 }}>
          <Row gutter={12}>
            <Col xs={24} md={14}><Form.Item name="name" label={labels.name} rules={[{ required: true, message: labels.required }]}><Input /></Form.Item></Col>
            <Col xs={24} md={10}><Form.Item name="phone" label={labels.phone} rules={[{ required: true, message: labels.required }]}><Input inputMode="tel" /></Form.Item></Col>
            <Col xs={24} md={8}>
              <Form.Item name="provinceCode" label={labels.province} rules={[{ required: true, message: labels.required }]}>
                <Select options={crProvinces.map((province) => ({ value: province.code, label: province.name }))} onChange={() => form.setFieldsValue({ cantonCode: undefined, districtCode: undefined })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="cantonCode" label={labels.canton} rules={[{ required: true, message: labels.required }]}>
                <Select disabled={!cantons.length} options={cantons.map((canton) => ({ value: canton.code, label: canton.name }))} onChange={() => form.setFieldsValue({ districtCode: undefined })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="districtCode" label={labels.district} rules={[{ required: true, message: labels.required }]}>
                <Select disabled={!districts.length} options={districts.map((district) => ({ value: district.code, label: district.name }))} />
              </Form.Item>
            </Col>
            <Col xs={24}><Form.Item name="address" label={labels.address} rules={[{ required: true, message: labels.required }]}><Input.TextArea rows={2} maxLength={200} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="weightKg" label={labels.weight} rules={[{ required: true, message: labels.required }]}><InputNumber min={0.1} max={30} step={0.1} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={12} md={6}><Form.Item name="pieces" label={labels.pieces}><InputNumber min={1} max={50} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="contents" label={labels.contents}><Input maxLength={120} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item name="declaredValueCrc" label={labels.declared}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={saving} data-testid="guide-create">{labels.create}</Button>
        </Form>
      ) : (
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Typography.Paragraph>
            {labels.status}: <Tag color={guide.trackingNumber ? "green" : "gold"}>{guide.status}</Tag>
            {guide.reference ? <Typography.Text type="secondary"> {guide.reference}</Typography.Text> : null}
          </Typography.Paragraph>
          {guide.trackingNumber ? (
            <Typography.Title level={4} data-testid="guide-tracking">{guide.trackingNumber}</Typography.Title>
          ) : (
            <>
              <Alert type="info" showIcon title={labels.manualTitle} description={guide.errorMessage ? `${labels.gatewayError} (${guide.errorMessage})` : labels.manual} />
              <Space.Compact style={{ width: "100%" }}>
                <Input placeholder={labels.tracking} value={tracking} onChange={(event) => setTracking(event.target.value)} />
                <Button type="primary" loading={saving} disabled={!tracking.trim()} onClick={() => void saveTracking()}>{labels.saveTracking}</Button>
              </Space.Compact>
            </>
          )}
          <Button icon={<PrinterOutlined />} onClick={printLabel}>{labels.print}</Button>
        </Space>
      )}
    </Modal>
  );
}
