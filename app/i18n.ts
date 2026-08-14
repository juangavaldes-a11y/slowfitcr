export type Locale = "es" | "en";

export const locales: Locale[] = ["es", "en"];
export const defaultLocale: Locale = "es";

export type Copy = {
  brandTagline: string;
  nav: {
    shop: string;
    collections: string;
    whySlow: string;
    contact: string;
  };
  hero: {
    eyebrow: string;
    titleLineOne: string;
    titleLineTwo: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    imageAlt: string;
    markAlt: string;
  };
  manifesto: {
    title: string;
    description: string;
    imageAlt: string;
  };
  collections: {
    kicker: string;
    title: string;
    items: Array<{
      title: string;
      description: string;
      image: string;
      imageAlt: string;
      ctaLabel: string;
    }>;
  };
  values: {
    kicker: string;
    title: string;
    items: Array<{
      title: string;
      image?: string;
      imageAlt?: string;
    }>;
  };
  story: {
    kicker: string;
    title: string;
    description: string;
    imageAlt: string;
  };
  contactForm: {
    title: string;
    subtitle: string;
    nameLabel: string;
    emailLabel: string;
    messageLabel: string;
    submitLabel: string;
    successMessage: string;
    errorMessage: string;
  };
  shop: {
    kicker: string;
    title: string;
    description: string;
    featuredLabel: string;
    ctaLabel: string;
    helper: string;
  };
  trust: {
    shippingTitle: string;
    shippingCopy: string;
    returnsTitle: string;
    returnsCopy: string;
    supportTitle: string;
    supportCopy: string;
    secureTitle: string;
    secureCopy: string;
  };
  policies: {
    privacy: {
      title: string;
      intro: string;
      items: string[];
    };
    terms: {
      title: string;
      intro: string;
      items: string[];
    };
    shipping: {
      title: string;
      intro: string;
      items: string[];
    };
    returns: {
      title: string;
      intro: string;
      items: string[];
    };
  };
};

const copyByLocale: Record<Locale, Copy> = {
  es: {
    brandTagline: "Train with Purpose.",
    nav: {
      shop: "Tienda",
      collections: "Colecciones",
      whySlow: "¿Por qué SLOW?",
      contact: "Contacto",
    },
    hero: {
      eyebrow: "No creemos en los resultados rápidos",
      titleLineOne: "Slow is Smooth.",
      titleLineTwo: "Smooth is Fast.",
      description:
        "Creemos en avanzar todos los días. El progreso nunca ha sido una línea recta; lo importante es nunca dejar de avanzar.",
      primaryCta: "VER COLECCIÓN",
      secondaryCta: "CONTACTO",
      imageAlt: "Colección Slow Fit",
      markAlt: "Marca Slow",
    },
    manifesto: {
      title: "El progreso nunca ha sido una línea recta.",
      description: "Hay días buenos. Hay días difíciles. Lo importante es nunca dejar de avanzar.",
      imageAlt: "Detalle de la marca",
    },
    collections: {
      kicker: "Colecciones",
      title: "Performance y estilo para un ritmo sostenible.",
      items: [
        {
          title: "Performance Collection",
          description:
            "Prendas diseñadas para acompañarte en cada entrenamiento, sin perder comodidad ni estilo.",
          image: "/slowfit/performance-collection.jpg",
          imageAlt: "Performance Collection",
          ctaLabel: "VER COLECCIÓN",
        },
        {
          title: "Performance for Him",
          description: "Luce elegante en tu día a día con nuestros artículos de ropa casual.",
          image: "/slowfit/performance-him.jpg",
          imageAlt: "Performance for Him",
          ctaLabel: "VER COLECCIÓN",
        },
        {
          title: "Accesorios",
          description: "Accesorios diseñados para complementar tu entrenamiento y tu estilo de vida.",
          image: "/slowfit/accessories.jpg",
          imageAlt: "Accesorios Slow Fit",
          ctaLabel: "VER",
        },
      ],
    },
    values: {
      kicker: "¿Por qué elegir SLOW?",
      title: "Minimalismo funcional para una vida activa.",
      items: [
        {
          title: "Pensado para un estilo de vida activo.",
          image: "/slowfit/value-1.jpg",
          imageAlt: "Pensado para un estilo de vida activo",
        },
        {
          title: "Prendas seleccionadas por calidad.",
          image: "/slowfit/value-2.jpg",
          imageAlt: "Prendas seleccionadas por calidad",
        },
        {
          title: "Diseños minimalistas.",
          image: "/slowfit/value-3.jpg",
          imageAlt: "Diseños minimalistas",
        },
      ],
    },
    story: {
      kicker: "Pensamiento de marca",
      title: "No somos una marca que persigue la velocidad.",
      description:
        "Somos una marca para quienes entienden que el progreso se construye con paciencia, disciplina y voluntad.",
      imageAlt: "Editorial Slow Fit",
    },
    contactForm: {
      title: "Hablemos de tu compra",
      subtitle: "Cuéntanos qué colección te interesa y te ayudamos con talla, disponibilidad y entrega.",
      nameLabel: "Nombre",
      emailLabel: "Correo",
      messageLabel: "Mensaje",
      submitLabel: "Enviar consulta",
      successMessage: "Recibimos tu mensaje. Te responderemos pronto.",
      errorMessage: "No fue posible enviar el mensaje. Intenta de nuevo.",
    },
    shop: {
      kicker: "Tienda Slow",
      title: "Compra por colección con una experiencia guiada y clara.",
      description:
        "Mientras integramos el catálogo completo, esta tienda te dirige a las líneas clave con contexto, prioridades y confianza de compra.",
      featuredLabel: "Colección destacada",
      ctaLabel: "Explorar colección",
      helper: "Muy pronto: productos, carrito y checkout completo dentro de Slow Fit.",
    },
    trust: {
      shippingTitle: "Envíos claros",
      shippingCopy: "Mostraremos tiempos estimados y cobertura desde el primer paso de compra.",
      returnsTitle: "Cambios y devoluciones",
      returnsCopy: "Definiremos una política simple y visible antes del checkout.",
      supportTitle: "Soporte directo",
      supportCopy: "WhatsApp y formulario de contacto para resolver dudas de talla, stock o entrega.",
      secureTitle: "Pago seguro",
      secureCopy: "La siguiente fase conectará checkout seguro con Shopify y seguimiento de pedidos.",
    },
    policies: {
      privacy: {
        title: "Política de privacidad",
        intro: "Explica cómo Slow Fit recopila, usa y protege la información de clientes y visitantes.",
        items: [
          "Recolectamos únicamente los datos necesarios para responder consultas, procesar pedidos y mejorar la experiencia del sitio.",
          "No compartimos información personal con terceros fuera de proveedores operativos necesarios como pagos, logística o mensajería.",
          "Las solicitudes de acceso, corrección o eliminación de datos podrán gestionarse por los canales oficiales de contacto.",
        ],
      },
      terms: {
        title: "Términos y condiciones",
        intro: "Define las condiciones de uso del sitio, disponibilidad de productos y reglas generales de compra.",
        items: [
          "Los precios, disponibilidad y promociones pueden cambiar sin previo aviso.",
          "Las compras estarán sujetas a validación de inventario, pago y datos de entrega.",
          "El uso del sitio implica aceptación de estas condiciones y de las políticas asociadas.",
        ],
      },
      shipping: {
        title: "Política de envíos",
        intro: "Aclara plazos estimados, cobertura y comunicación de pedidos durante la entrega.",
        items: [
          "El tiempo de preparación y despacho se comunicará en cada colección o producto.",
          "Las entregas pueden variar según ubicación, temporadas altas y disponibilidad logística.",
          "Toda actualización importante del pedido se notificará por los canales de contacto disponibles.",
        ],
      },
      returns: {
        title: "Política de cambios y devoluciones",
        intro: "Resume el proceso para solicitar cambios por talla o devoluciones autorizadas.",
        items: [
          "Las solicitudes deberán realizarse dentro del plazo informado al momento de la compra.",
          "Las prendas deberán conservar su estado original, etiquetas y comprobante de compra.",
          "Cada caso será evaluado conforme a condiciones de higiene, uso y disponibilidad de reemplazo.",
        ],
      },
    },
  },
  en: {
    brandTagline: "Train with Purpose.",
    nav: {
      shop: "Shop",
      collections: "Collections",
      whySlow: "Why SLOW?",
      contact: "Contact",
    },
    hero: {
      eyebrow: "We do not believe in quick results",
      titleLineOne: "Slow is Smooth.",
      titleLineTwo: "Smooth is Fast.",
      description:
        "We believe in moving forward every day. Progress has never been a straight line; what matters is to keep moving.",
      primaryCta: "VIEW COLLECTION",
      secondaryCta: "CONTACT",
      imageAlt: "Slow Fit collection",
      markAlt: "Slow brand mark",
    },
    manifesto: {
      title: "Progress has never been a straight line.",
      description: "There are good days. There are hard days. What matters is to keep moving forward.",
      imageAlt: "Brand detail",
    },
    collections: {
      kicker: "Collections",
      title: "Performance and style for a sustainable pace.",
      items: [
        {
          title: "Performance Collection",
          description:
            "Garments designed to support every workout without giving up comfort or style.",
          image: "/slowfit/performance-collection.jpg",
          imageAlt: "Performance Collection",
          ctaLabel: "VIEW COLLECTION",
        },
        {
          title: "Performance for Him",
          description: "Look polished every day with our casual essentials.",
          image: "/slowfit/performance-him.jpg",
          imageAlt: "Performance for Him",
          ctaLabel: "VIEW COLLECTION",
        },
        {
          title: "Accessories",
          description: "Accessories designed to complement your training and your lifestyle.",
          image: "/slowfit/accessories.jpg",
          imageAlt: "Slow Fit accessories",
          ctaLabel: "VIEW",
        },
      ],
    },
    values: {
      kicker: "Why choose SLOW?",
      title: "Functional minimalism for an active life.",
      items: [
        {
          title: "Designed for an active lifestyle.",
          image: "/slowfit/value-1.jpg",
          imageAlt: "Designed for an active lifestyle",
        },
        {
          title: "Garments selected for quality.",
          image: "/slowfit/value-2.jpg",
          imageAlt: "Garments selected for quality",
        },
        {
          title: "Minimalist designs.",
          image: "/slowfit/value-3.jpg",
          imageAlt: "Minimalist designs",
        },
      ],
    },
    story: {
      kicker: "Brand mindset",
      title: "We are not a brand chasing speed.",
      description:
        "We are a brand for people who understand that progress is built with patience, discipline, and will.",
      imageAlt: "Slow Fit editorial",
    },
    contactForm: {
      title: "Let us support your purchase",
      subtitle: "Tell us which collection you want and we will help with sizing, availability, and delivery.",
      nameLabel: "Name",
      emailLabel: "Email",
      messageLabel: "Message",
      submitLabel: "Send inquiry",
      successMessage: "We received your message and will reply soon.",
      errorMessage: "We could not send your message. Please try again.",
    },
    shop: {
      kicker: "Slow Shop",
      title: "Shop by collection with a clearer, guided storefront experience.",
      description:
        "While the full catalog is being integrated, this shop page directs customers into the main lines with context, priorities, and purchase confidence.",
      featuredLabel: "Featured collection",
      ctaLabel: "Explore collection",
      helper: "Coming next: products, cart, and full checkout directly inside Slow Fit.",
    },
    trust: {
      shippingTitle: "Clear shipping",
      shippingCopy: "Estimated delivery windows and service coverage will be visible from the first buying step.",
      returnsTitle: "Returns and exchanges",
      returnsCopy: "A simple, visible policy will be presented before checkout.",
      supportTitle: "Direct support",
      supportCopy: "WhatsApp and a contact form will help with sizing, stock, or delivery questions.",
      secureTitle: "Secure payments",
      secureCopy: "The next phase connects Shopify-powered secure checkout and order tracking.",
    },
    policies: {
      privacy: {
        title: "Privacy policy",
        intro: "Explains how Slow Fit collects, uses, and protects customer and visitor information.",
        items: [
          "We collect only the data required to answer inquiries, process orders, and improve the shopping experience.",
          "We do not share personal information with third parties beyond essential providers such as payments, logistics, or messaging tools.",
          "Requests to access, correct, or delete personal data can be handled through official support channels.",
        ],
      },
      terms: {
        title: "Terms and conditions",
        intro: "Defines site usage terms, product availability expectations, and general purchasing rules.",
        items: [
          "Prices, availability, and promotions may change without prior notice.",
          "Orders remain subject to inventory, payment confirmation, and delivery data validation.",
          "Using the site implies acceptance of these terms and the related store policies.",
        ],
      },
      shipping: {
        title: "Shipping policy",
        intro: "Clarifies estimated timelines, delivery coverage, and communication during fulfillment.",
        items: [
          "Preparation and dispatch timelines will be communicated on each collection or product.",
          "Delivery timing can vary by destination, peak seasons, and logistics availability.",
          "Important order updates will be shared through the available customer contact channels.",
        ],
      },
      returns: {
        title: "Returns and exchanges policy",
        intro: "Summarizes the process for size exchanges and approved returns.",
        items: [
          "Requests must be made within the window communicated at the time of purchase.",
          "Garments must remain in original condition with tags and proof of purchase.",
          "Each request is reviewed based on hygiene, product use, and replacement availability.",
        ],
      },
    },
  },
};

export function getPreferredLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return defaultLocale;
  }

  const normalized = acceptLanguage.toLowerCase();
  const requestedLocales = normalized
    .split(",")
    .map((part) => part.split(";")[0]?.trim().split("-")[0])
    .filter((part): part is string => Boolean(part));

  return requestedLocales.find(isLocale) ?? defaultLocale;
}

export function getCopy(locale: Locale): Copy {
  return copyByLocale[locale];
}

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}