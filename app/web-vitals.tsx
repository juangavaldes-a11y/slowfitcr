"use client";

import { useReportWebVitals } from "next/web-vitals";

// Sent to GA4 only (not /api/events, which writes an audit row per event).
const reportWebVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_rating: metric.rating,
    metric_delta: metric.delta,
    navigation_type: metric.navigationType,
    page_path: window.location.pathname,
    non_interaction: true,
  });
};

export default function WebVitals() {
  useReportWebVitals(reportWebVital);
  return null;
}
