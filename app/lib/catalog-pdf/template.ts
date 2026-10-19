// Layout, colors and copy for the exported catalog PDF. Every value was measured from the
// reference file Catalogo_Slow.pdf (US Letter, points, origin top-left). Change the look of the
// exported catalog here; the renderer only reads this file. Brand assets (logos, fonts) live in
// public/slowfit/catalog-template/.

export const catalogTemplate = {
  page: { width: 612, height: 792, marginX: 43.5 },

  copy: {
    brandUrl: "slowfitcr.com",
    headerLabel: "Catálogo",
    coverLabel: "Catálogo",
    tagline: "Slow is smooth. Smooth is fast.",
    indexTitle: "Índice",
    indexSubtitle: "Código, prenda y precio en colones.",
    sizesLabel: "Tallas disponibles: ",
    singleSizeLabel: "Talla única",
    colorColumn: "Color",
    setSuffix: "por conjunto",
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
    headRule: "#bfb2aa",
    rowRule: "#e3dad5",
    ink: "#3e3a39",
    body: "#5b5655",
    muted: "#8d807a",
    accent: "#a58f82",
    sizeRing: "#7c706a",
    sizeMissing: "#cfc5bf",
    white: "#ffffff",
  },

  header: { logoX: 43.5, logoY: 29.2, logoWidth: 42.7, ruleY: 51, ruleHeight: 0.8, labelBaseline: 39.8, labelSize: 8, labelSpacing: 0.56 },
  footer: { baseline: 760.9, size: 7.5, spacing: 0.38 },

  cover: {
    labelBaseline: 89,
    labelSize: 9.5,
    labelSpacing: 2.6,
    logo: { y: 188, width: 268 },
    taglineBaseline: 341,
    taglineSize: 12.5,
    urlBaseline: 748.4,
    urlSize: 8,
    urlSpacing: 1.03,
    // Bezier waves: [back, front], each described by the top edge from the left to the right of the page.
    waves: [
      { color: "coverWaveBack", points: [[0, 613.6], [108, 562.6, 187.2, 656.2, 309.6, 613.6], [432, 571.1, 518.4, 639.1, 612, 596.6]] },
      { color: "coverWaveFront", points: [[0, 673.2], [122.4, 622.1, 208.8, 707.2, 324, 668.9], [439.2, 630.6, 525.6, 694.4, 612, 656.2]] },
    ],
  },

  // The closing band is the cover's bottom third, scaled down and anchored to the bottom of the last page.
  closing: { height: 313.5, logoTop: 61.5, logoWidth: 188, taglineBaseline: 175, urlBaseline: 201.8, waveScale: 0.565, minGapAbove: 40 },

  index: {
    titleBaseline: 109.8,
    titleSize: 30,
    subtitleBaseline: 134.3,
    subtitleSize: 9,
    firstRowTop: 162.6,
    continuationRowTop: 70,
    bottomLimit: 735,
    columns: [{ x: 43.5, width: 244.5 }, { x: 324, width: 244.5 }],
    nameX: 64.5, // offset from the column edge
    nameWrapWidth: 138,
    codeSize: 7.5,
    codeSpacing: 0.52,
    nameSize: 8,
    priceSize: 9.5,
    rowBaseline: 16.8,
    rowPadding: 14.5,
    lineHeight: 11.9,
    wrapLineHeight: 12,
  },

  product: {
    bodyTop: 68.2,
    bodyBottom: 747.5,
    blockGap: 22.8,
    dividerOffset: 12,
    dividerHeight: 0.8,
    single: { imageWidth: 237, imageHeight: 324, infoX: 309.8 },
    gallery: { imageWidth: 219, imageHeight: 332.2, thumbWidth: 54.7, thumbHeight: 75.8, thumbGap: 7, thumbX: 267.8, maxThumbs: 4, infoX: 342 },
    infoRight: 568.5,
    codeSize: 8,
    codeSpacing: 0.84,
    titleSize: 19,
    titleLineHeight: 23.5,
    priceSize: 17,
    subtitleSize: 8.5,
    sizesSize: 8.5,
    headSize: 7.5,
    rowSize: 8.5,
    ringSize: 7,
    ringDiameter: 13.5,
    rowHeight: 23.25,
    // Offsets (pt) from the top of the info column; "set" values apply to multi-piece products.
    offsets: { codeBaseline: 8, titleBaseline: 34.4, subtitleBaseline: 51.9, priceBaseline: 66.8, sizesBaseline: 88.9, headBaseline: 107.8, headRule: 115.5, setExtra: 17 },
    sizeColumnWidth: { single: [69, 69, 49.7, 42, 36], gallery: [24.8, 24.8, 24.8, 24.8, 24.8] },
  },
} as const;

export type CatalogTemplate = typeof catalogTemplate;
