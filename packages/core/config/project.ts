export const projectConfig = {
  brand: {
    name: "Slow Fit",
    slug: "slowfit",
    currency: "CRC",
    defaultLocale: "es",
    locales: ["es", "en"],
  },
  theme: {
    primaryColor: "#69676c",
    infoColor: "#69676c",
    textColor: "#2f2a28",
    textSecondaryColor: "#6d6968",
    bgBase: "#f5f0e8",
    borderColor: "#d7d2cd",
    borderRadius: 18,
    bodyFontVar: "var(--font-body)",
  },
  modules: {
    catalog: { enabled: true },
    cart: { enabled: true },
    checkout: { enabled: true },
    customerAccount: { enabled: true },
    reviews: { enabled: true },
    delivery: { enabled: true },
    admin: { enabled: true },
    analytics: { enabled: true },
    crm: { enabled: true },
    email: { enabled: true },
    subscriptions: { enabled: false },
    marketplace: { enabled: false },
  },
  featureFlags: {
    wishlist: true,
    guestCheckout: true,
    pickup: true,
    reviewModeration: true,
    showCartDock: true,
    analytics: true,
    crmSync: true,
    accountRecovery: true,
    contactForm: true,
  },
  providers: {
    payment: { type: "bank", enabled: true },
    shipping: { type: "multi-provider", enabled: true },
    email: { type: "resend", enabled: true },
    media: { type: "r2", enabled: true },
    moderation: { type: "internal", enabled: true },
  },
} as const;

export type ProjectModuleKey = keyof typeof projectConfig.modules;

export function isModuleEnabled(module: ProjectModuleKey) {
  return projectConfig.modules[module].enabled;
}
