// Layout, colors and copy for the exported catalog PDF. Every value was measured from the designed
// reference Catalogo_Slow_Completo.pdf: one 4:5 page (1080 x 1350 px, origin top-left) per product, framed by a cover
// and a closing page. Change the look of the exported catalog here; the renderer only reads this file. Brand assets
// (logos, fonts) live in public/slowfit/catalog-template/.

export const catalogTemplate = {
  page: { width: 1080, height: 1350, marginX: 50 },

  copy: {
    brandUrl: "slowfitcr.com",
    coverLabel: "Catálogo",
    tagline: "Slow is smooth. Smooth is fast.",
    sizesLabel: "Tallas disponibles: ",
    sizesPerColor: "Tallas disponibles por color",
    singleSizeLabel: "Talla única",
    setSuffix: "por conjunto",
    setLabel: (pieces: number) => `Conjunto de ${pieces} piezas`,
    soldOut: "Agotado",
    noPrice: "Precio por confirmar",
    codePrefix: "SLW-",
  },

  colors: {
    cover: "#57524f",
    coverText: "#e4dad5",
    coverWaveBack: "#c8b9af",
    coverWaveFront: "#a58f82",
    page: "#fbf9f8",
    imageBackdrop: "#ede6e2",
    headerRule: "#d9cfcb",
    ink: "#3e3a39",
    body: "#5b5655",
    muted: "#8d807a",
    accent: "#a58f82",
    sizeRing: "#7c706a",
    sizeMissing: "#cfc5bf",
    dotFallback: "#a58f82",
    white: "#ffffff",
  },

  logo: { right: 1030, top: 52, width: 158 },
  footer: { baseline: 1306, size: 15.5, spacing: 1.6 },

  cover: {
    labelBaseline: 152,
    labelSize: 17,
    labelSpacing: 5,
    logo: { y: 320, width: 473 },
    taglineBaseline: 612,
    taglineSize: 26,
    urlBaseline: 1275,
    urlSize: 14.5,
    urlSpacing: 2,
    scaleX: 1080 / 612,
    scaleY: 1350 / 792,
    // Bezier waves from the original 612 x 792 cover; the renderer scales them to the page.
    waves: [
      { color: "coverWaveBack", points: [[0, 613.6], [108, 562.6, 187.2, 656.2, 309.6, 613.6], [432, 571.1, 518.4, 639.1, 612, 596.6]] },
      { color: "coverWaveFront", points: [[0, 673.2], [122.4, 622.1, 208.8, 707.2, 324, 668.9], [439.2, 630.6, 525.6, 694.4, 612, 656.2]] },
    ],
  },

  product: {
    codeBaseline: 64,
    codeSize: 15,
    codeSpacing: 3,
    titleSizes: [56, 46, 40],
    titleBaseline: 124,
    titleMaxWidth: 770,
    titleLineHeight: 44,
    subtitleSize: 15,
    priceSize: 38,
    priceSuffixSize: 14,
    bodyBottom: 1252,
    tilesGap: 24,
    photoGap: 8,
    rowGap: 28,
    label: { size: 26, dot: 22, dotGap: 12, inlineHeight: 58, stackedHeight: 98, ringRow: 38 },
    ring: { diameter: 34, gap: 7, size: 11.5, pillWidth: 66, pillHeight: 28, pillSize: 11 },
    maxRatio: { two: 1.8, three: 2.5, four: 1.85 },
    side: { photosWidth: 680, labelX: 740, labelSize: 31, maxRatioPair: 0.85, maxRatioTriple: 1.8, rowGap: 18 },
    hero: { x: 49, y: 49, width: 602, height: 1252, infoX: 696, infoWidth: 334 },
  },
} as const;

export type CatalogTemplate = typeof catalogTemplate;
