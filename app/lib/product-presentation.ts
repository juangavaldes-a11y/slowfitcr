type ProductPresentationInput = {
  title: string;
  description: string;
};

const descriptionReferencePattern = /\s*Referencia del proveedor:\s*([^.]+)\.\s*/i;
const titleReferencePattern = /\s*\|\s*([^|]+)$/;

export function getPublicProductTitle(title: string) {
  const match = title.match(titleReferencePattern);
  return match ? title.slice(0, match.index).trim() : title;
}

export function getProductPresentation(product: ProductPresentationInput) {
  const descriptionMatch = product.description.match(descriptionReferencePattern);
  const titleMatch = product.title.match(titleReferencePattern);
  const supplierReference = descriptionMatch?.[1]?.trim() || titleMatch?.[1]?.trim() || null;

  return {
    title: getPublicProductTitle(product.title),
    description: product.description.replace(descriptionReferencePattern, " ").replace(/\s{2,}/g, " ").trim(),
    supplierReference,
  };
}