export type Locale = "es" | "en";

export const locales: Locale[] = ["es", "en"];
export const defaultLocale: Locale = "es";

export type Copy = {
  brandTagline: string;
  nav: {
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
};

const copyByLocale: Record<Locale, Copy> = {
  es: {
    brandTagline: "Train with Purpose.",
    nav: {
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
  },
  en: {
    brandTagline: "Train with Purpose.",
    nav: {
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