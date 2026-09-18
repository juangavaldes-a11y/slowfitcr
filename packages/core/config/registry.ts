import { projectConfig } from "./project";

export type ModuleManifestItem = {
  key: string;
  enabled: boolean;
  label: string;
  description?: string;
  dependencies?: string[];
};

export type ProviderManifestItem = {
  key: string;
  type: string;
  enabled: boolean;
  label: string;
  description?: string;
};

export const moduleManifest: ModuleManifestItem[] = [
  { key: "catalog", enabled: projectConfig.modules.catalog.enabled, label: "Catalog", description: "Product listing and catalog discovery" },
  { key: "cart", enabled: projectConfig.modules.cart.enabled, label: "Cart", description: "Cart operations and persistence" },
  { key: "checkout", enabled: projectConfig.modules.checkout.enabled, label: "Checkout", description: "Checkout and order creation flow" },
  { key: "customerAccount", enabled: projectConfig.modules.customerAccount.enabled, label: "Customer Account", description: "Accounts, login and profile" },
  { key: "reviews", enabled: projectConfig.modules.reviews.enabled, label: "Reviews", description: "Review submission and moderation" },
  { key: "delivery", enabled: projectConfig.modules.delivery.enabled, label: "Delivery", description: "Shipping, pickup and delivery quotes" },
  { key: "admin", enabled: projectConfig.modules.admin.enabled, label: "Admin", description: "Operations, catalog management and audits" },
  { key: "analytics", enabled: projectConfig.modules.analytics.enabled, label: "Analytics", description: "Tracking and analytics events" },
  { key: "crm", enabled: projectConfig.modules.crm.enabled, label: "CRM", description: "Customer relation sync" },
  { key: "email", enabled: projectConfig.modules.email.enabled, label: "Email", description: "Transactional emails and notifications" },
  { key: "subscriptions", enabled: projectConfig.modules.subscriptions.enabled, label: "Subscriptions", description: "Recurring order or membership flows" },
  { key: "marketplace", enabled: projectConfig.modules.marketplace.enabled, label: "Marketplace", description: "Multi-seller or multi-vendor flow" },
];

export const providerManifest: ProviderManifestItem[] = [
  { key: "payment", type: projectConfig.providers.payment.type, enabled: projectConfig.providers.payment.enabled, label: "Payment", description: "Primary payment gateway provider" },
  { key: "shipping", type: projectConfig.providers.shipping.type, enabled: projectConfig.providers.shipping.enabled, label: "Shipping", description: "Delivery and courier integrations" },
  { key: "email", type: projectConfig.providers.email.type, enabled: projectConfig.providers.email.enabled, label: "Email", description: "Transactional and marketing email provider" },
  { key: "media", type: projectConfig.providers.media.type, enabled: projectConfig.providers.media.enabled, label: "Media", description: "Product media and asset storage" },
  { key: "moderation", type: projectConfig.providers.moderation.type, enabled: projectConfig.providers.moderation.enabled, label: "Moderation", description: "Review moderation provider" },
];

export function getModuleManifest() {
  return moduleManifest;
}

export function getProviderManifest() {
  return providerManifest;
}

export function isModuleManifestEnabled(moduleKey: string) {
  return moduleManifest.some((module) => module.key === moduleKey && module.enabled);
}

export function isProviderManifestEnabled(providerKey: string) {
  return providerManifest.some((provider) => provider.key === providerKey && provider.enabled);
}
