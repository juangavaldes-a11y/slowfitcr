import type { ApprovedReview } from "../lib/reviews";

export const fallbackApprovedReviews: ApprovedReview[] = [
  {
    id: "seed-1",
    productHandle: "performance-collection-1",
    locale: "all",
    rating: 5,
    author: "Mariana",
    content: "Excelente calidad de tela y el ajuste se mantiene en entrenamientos intensos.",
    createdAt: "2026-07-01T10:00:00.000Z",
    source: "manual",
  },
  {
    id: "seed-2",
    productHandle: "performance-collection-1",
    locale: "all",
    rating: 4,
    author: "Daniel",
    content: "Muy comoda y con buen soporte. La entrega fue puntual.",
    createdAt: "2026-07-08T10:00:00.000Z",
    source: "manual",
  },
  {
    id: "seed-3",
    productHandle: "accessories-1",
    locale: "all",
    rating: 5,
    author: "Andrea",
    content: "The accessory quality surprised me and it pairs well with my daily routine.",
    createdAt: "2026-07-11T10:00:00.000Z",
    source: "manual",
  },
];
