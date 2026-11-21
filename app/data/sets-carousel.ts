// Mosaics of the two-piece sets shown in the home carousel. Images are 864x1080 (4:5) catalog mosaics.
// A slide links to the site's own product page when the product exists here (`handle`), otherwise to the Nidux store (`externalUrl`).

export type SetSlide = {
  id: string;
  name: string;
  image: string;
  handle?: string;
  externalUrl?: string;
};

export const SET_IMAGE_SIZE = { width: 864, height: 1080 } as const;
const NIDUX_STORE = "https://slow.minidux.com";

export const setSlides: SetSlide[] = [
  { id: "marea", name: "Marea", image: "/slowfit/sets/marea.jpg", handle: "mige-fgbtz4549-bra-pants-4681974c" },
  { id: "aurora", name: "Aurora", image: "/slowfit/sets/aurora.jpg", handle: "mige-fgbtz8232-long-sleeves-tops-bell-bottom-pants-8470fb12" },
  { id: "alba", name: "Alba", image: "/slowfit/sets/alba.jpg", handle: "mige-fgbb6505-k6510-bra-skirts-8412f7f2" },
  { id: "armonia", name: "Armonía", image: "/slowfit/sets/armonia.jpg", handle: "mige-fgb2590-91229-short-sleeves-tops-without-padding-pants-fa06ff09" },
  { id: "coral", name: "Coral", image: "/slowfit/sets/coral.jpg", handle: "mige-fgbwx2493-dk3492-bra-shorts-pockets-43f1a46c" },
  { id: "duna", name: "Duna", image: "/slowfit/sets/duna.jpg", handle: "mige-fgbf233-230-one-shoulder-bra-shorts-pockets-ec03fc99" },
  { id: "ambar", name: "Ámbar", image: "/slowfit/sets/ambar.jpg", handle: "mige-fgbwx2495-ck5495-bra-bell-bottoms-pants-pockets-5c99218c" },
  { id: "calma", name: "Calma", image: "/slowfit/sets/calma.jpg", externalUrl: `${NIDUX_STORE}/products/29` },
  { id: "refugio", name: "Refugio", image: "/slowfit/sets/refugio.jpg", externalUrl: `${NIDUX_STORE}/products/36` },
  { id: "brio", name: "Brío", image: "/slowfit/sets/brio.jpg", externalUrl: `${NIDUX_STORE}/products/37` },
];

export function slideHref(slide: SetSlide, locale: "es" | "en") {
  if (slide.handle) return `/${locale}/shop/${slide.handle}`;
  return slide.externalUrl ?? `/${locale}/shop`;
}

export const slideIsExternal = (slide: SetSlide) => !slide.handle && Boolean(slide.externalUrl);
