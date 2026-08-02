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
    cta: string;
    items: Array<{
      title: string;
      description: string;
      image: string;
      imageAlt: string;
    }>;
  };
  values: {
    kicker: string;
    title: string;
    items: Array<{
      title: string;
      image: string;
      imageAlt: string;
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
      whySlow: "¿Por que SLOW?",
      contact: "Contacto",
    },
    hero: {
      eyebrow: "No creemos en los resultados rapidos",
      titleLineOne: "Slow is Smooth.",
      titleLineTwo: "Smooth is Fast.",
      description:
        "Creemos en avanzar todos los dias. El progreso nunca ha sido una linea recta; lo importante es nunca dejar de avanzar.",
      primaryCta: "Ver coleccion",
      secondaryCta: "Hablar con SLOW",
      imageAlt: "Coleccion Slow Fit",
      markAlt: "Marca Slow",
    },
    manifesto: {
      title: "El progreso nunca ha sido una linea recta.",
      description: "Hay dias buenos. Hay dias dificiles. Lo importante es nunca dejar de avanzar.",
      imageAlt: "Detalle de la marca",
    },
    collections: {
      kicker: "Colecciones",
      title: "Performance y estilo para un ritmo sostenible.",
      cta: "Ver coleccion",
      items: [
        {
          title: "Performance Collection",
          description:
            "Prendas diseñadas para acompañarte en cada entrenamiento, sin perder comodidad ni estilo.",
          image: "/slowfit/performance-collection.jpg",
          imageAlt: "Performance Collection",
        },
        {
          title: "Performance for Him",
          description: "Luce elegante en tu dia a dia con nuestros articulos de ropa casual.",
          image: "/slowfit/performance-him.jpg",
          imageAlt: "Performance for Him",
        },
        {
          title: "Accesorios",
          description: "Accesorios diseñados para complementar tu entrenamiento y tu estilo de vida.",
          image: "/slowfit/accessories.jpg",
          imageAlt: "Accesorios Slow Fit",
        },
      ],
    },
    values: {
      kicker: "¿Por que elegir SLOW?",
      title: "Minimalismo funcional para una vida activa.",
      items: [
        {
          title: "Pensado para un estilo de vida activo.",
          image: "/slowfit/value-1.jpg",
          imageAlt: "Estilo de vida activo",
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
        "Somos una marca para quienes entienden que el progreso se construye con paciencia, disciplina y voluntad. SLOW.",
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
      primaryCta: "View collection",
      secondaryCta: "Talk to SLOW",
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
      cta: "View collection",
      items: [
        {
          title: "Performance Collection",
          description:
            "Garments designed to support every workout without giving up comfort or style.",
          image: "/slowfit/performance-collection.jpg",
          imageAlt: "Performance Collection",
        },
        {
          title: "Performance for Him",
          description: "Look polished every day with our casual essentials.",
          image: "/slowfit/performance-him.jpg",
          imageAlt: "Performance for Him",
        },
        {
          title: "Accessories",
          description: "Accessories designed to complement your training and your lifestyle.",
          image: "/slowfit/accessories.jpg",
          imageAlt: "Slow Fit accessories",
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
          imageAlt: "Active lifestyle",
        },
        {
          title: "Garments selected for quality.",
          image: "/slowfit/value-2.jpg",
          imageAlt: "Quality garments",
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
        "We are a brand for people who understand that progress is built with patience, discipline, and will. SLOW.",
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