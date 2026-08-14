"use client";

import { Button, Form, Input, Typography, message } from "antd";
import { trackEvent } from "./lib/analytics";

type ContactFormCopy = {
  title: string;
  subtitle: string;
  nameLabel: string;
  emailLabel: string;
  messageLabel: string;
  submitLabel: string;
  successMessage: string;
  errorMessage: string;
};

type ContactFormProps = {
  copy: ContactFormCopy;
  locale: "es" | "en";
};

type ContactFormValues = {
  name: string;
  email: string;
  message: string;
};

export default function ContactForm({ copy, locale }: ContactFormProps) {
  const [form] = Form.useForm<ContactFormValues>();
  const [api, contextHolder] = message.useMessage();

  const onSubmit = async (values: ContactFormValues) => {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...values, locale }),
    });

    if (!response.ok) {
      api.error(copy.errorMessage);
      trackEvent("contact_form_error", { locale });
      return;
    }

    form.resetFields();
    api.success(copy.successMessage);
    trackEvent("contact_form_submit", { locale });
  };

  return (
    <div className="slowfit-contact-form-wrap">
      {contextHolder}
      <Typography.Title level={3} className="slowfit-display slowfit-contact-title">
        {copy.title}
      </Typography.Title>
      <Typography.Paragraph className="slowfit-contact-subtitle">{copy.subtitle}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit} className="slowfit-contact-form">
        <Form.Item
          name="name"
          label={copy.nameLabel}
          rules={[{ required: true, min: 2 }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="email"
          label={copy.emailLabel}
          rules={[{ required: true, type: "email" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="message"
          label={copy.messageLabel}
          rules={[{ required: true, min: 10 }]}
        >
          <Input.TextArea rows={4} />
        </Form.Item>
        <Button htmlType="submit" type="primary" className="slowfit-secondary-cta">
          {copy.submitLabel}
        </Button>
      </Form>
    </div>
  );
}
