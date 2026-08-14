import "server-only";

import { getCopy, type Locale } from "../i18n";

export type ShopVariant = {
  id: string;
  title: string;
  price: number;
  currencyCode: string;
  availableForSale: boolean;
};

export type ShopProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: string;
  price: number;
  currencyCode: string;
  compareAtPrice?: number;
  collectionHandle: string;
  collectionTitle: string;
  variants: ShopVariant[];
};

export type CheckoutLineInput = {
  variantId: string;
  quantity: number;
};

export type CheckoutSession = {
  checkoutUrl: string;
  cartId: string;
};

export type ShopCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: string;
  products: ShopProduct[];
};

const COLLECTIONS_QUERY = `#graphql
  query StoreCollections {
    collections(first: 12) {
      edges {
        node {
          id
          handle
          title
          description
          image {
            url
          }
          products(first: 8) {
            edges {
              node {
                id
                handle
                title
                description
                featuredImage {
                  url
                }
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                compareAtPriceRange {
                  minVariantPrice {
                    amount
                  }
                }
                variants(first: 8) {
                  edges {
                    node {
                      id
                      title
                      availableForSale
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const COLLECTION_BY_HANDLE_QUERY = `#graphql
  query CollectionByHandle($handle: String!) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
      }
      products(first: 24) {
        edges {
          node {
            id
            handle
            title
            description
            featuredImage {
              url
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
              }
            }
            variants(first: 8) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($handle: String!) {
    product(handle: $handle) {
      id
      handle
      title
      description
      featuredImage {
        url
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      compareAtPriceRange {
        minVariantPrice {
          amount
        }
      }
      collections(first: 1) {
        edges {
          node {
            handle
            title
          }
        }
      }
      variants(first: 12) {
        edges {
          node {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const CART_CREATE_MUTATION = `#graphql
  mutation CartCreate($lines: [CartLineInput!]!, $countryCode: CountryCode) {
    cartCreate(input: { lines: $lines, buyerIdentity: { countryCode: $countryCode } }) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
      warnings {
        code
        message
      }
    }
  }
`;

const CART_QUERY = `#graphql
  query CartById($id: ID!) {
    cart(id: $id) {
      id
      checkoutUrl
      lines(first: 250) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
              }
            }
          }
        }
      }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `#graphql
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `#graphql
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_LINES_REMOVE_MUTATION = `#graphql
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

type GraphEdge<T> = { node: T };

type GraphResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

type StorefrontCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image?: { url?: string };
  products: {
    edges: Array<GraphEdge<StorefrontProduct>>;
  };
};

type StorefrontProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  featuredImage?: { url?: string };
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  compareAtPriceRange?: {
    minVariantPrice?: {
      amount: string;
    };
  };
  variants?: {
    edges: Array<GraphEdge<StorefrontVariant>>;
  };
  collections?: {
    edges: Array<GraphEdge<{ handle: string; title: string }>>;
  };
};

type StorefrontVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: {
    amount: string;
    currencyCode: string;
  };
};

type StorefrontCartCreateResponse = {
  cartCreate: {
    cart: {
      id: string;
      checkoutUrl: string;
    } | null;
    userErrors: Array<{ field?: string[]; message: string }>;
  };
};

type StorefrontCart = {
  id: string;
  checkoutUrl: string;
  lines: {
    edges: Array<
      GraphEdge<{
        id: string;
        quantity: number;
        merchandise?: {
          id?: string;
        };
      }>
    >;
  };
};

type StorefrontCartQueryResponse = {
  cart: StorefrontCart | null;
};

type StorefrontCartMutationResponse = {
  cartLinesAdd?: {
    userErrors: Array<{ message: string }>;
  };
  cartLinesUpdate?: {
    userErrors: Array<{ message: string }>;
  };
  cartLinesRemove?: {
    userErrors: Array<{ message: string }>;
  };
};

function getShopifyEnv() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!domain || !token) {
    return null;
  }

  return { domain, token };
}

async function storefrontFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: { revalidate?: number },
) {
  const env = getShopifyEnv();

  if (!env) {
    return null;
  }

  const response = await fetch(`https://${env.domain}/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": env.token,
    },
    body: JSON.stringify({ query, variables }),
    next: options?.revalidate ? { revalidate: options.revalidate } : undefined,
    cache: options?.revalidate ? undefined : "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopify request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as GraphResponse<T>;

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data ?? null;
}

function parseCurrency(value?: string) {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function toHandle(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toShopVariant(variant: StorefrontVariant): ShopVariant {
  return {
    id: variant.id,
    title: variant.title,
    price: parseCurrency(variant.price.amount),
    currencyCode: variant.price.currencyCode,
    availableForSale: variant.availableForSale,
  };
}

function toShopProduct(product: StorefrontProduct, _locale: Locale, collection?: { handle: string; title: string }): ShopProduct {
  const minPrice = parseCurrency(product.priceRange.minVariantPrice.amount);
  const compareAt = parseCurrency(product.compareAtPriceRange?.minVariantPrice?.amount);
  const variants = product.variants?.edges.map((edge) => toShopVariant(edge.node)) ?? [];
  const fallbackVariant: ShopVariant = {
    id: `${product.id}-default`,
    title: "Default",
    price: minPrice,
    currencyCode: product.priceRange.minVariantPrice.currencyCode,
    availableForSale: true,
  };
  const productCollection =
    collection ??
    product.collections?.edges[0]?.node ?? {
      handle: "featured",
      title: "Featured",
    };

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    image: product.featuredImage?.url ?? "/slowfit/hero.jpg",
    price: minPrice,
    currencyCode: product.priceRange.minVariantPrice.currencyCode,
    compareAtPrice: compareAt > minPrice ? compareAt : undefined,
    collectionHandle: productCollection.handle,
    collectionTitle: productCollection.title,
    variants: variants.length ? variants : [fallbackVariant],
  };
}

function fallbackCatalog(locale: Locale): ShopCollection[] {
  const copy = getCopy(locale);

  return copy.collections.items.map((collection, index) => {
    const collectionHandle = toHandle(collection.title);
    const products: ShopProduct[] = [1, 2, 3].map((slot) => {
      const titleSuffix = locale === "es" ? `Edicion ${slot}` : `Edition ${slot}`;
      const handle = `${collectionHandle}-${slot}`;
      const price = 42 + index * 12 + slot * 8;
      const currencyCode = "USD";

      return {
        id: `${collectionHandle}-${slot}`,
        handle,
        title: `${collection.title} ${titleSuffix}`,
        description: collection.description,
        image: collection.image,
        price,
        currencyCode,
        compareAtPrice: price + 8,
        collectionHandle,
        collectionTitle: collection.title,
        variants: [
          {
            id: `${handle}-s`,
            title: "S",
            price,
            currencyCode,
            availableForSale: true,
          },
          {
            id: `${handle}-m`,
            title: "M",
            price,
            currencyCode,
            availableForSale: true,
          },
          {
            id: `${handle}-l`,
            title: "L",
            price,
            currencyCode,
            availableForSale: true,
          },
        ],
      };
    });

    return {
      id: collectionHandle,
      handle: collectionHandle,
      title: collection.title,
      description: collection.description,
      image: collection.image,
      products,
    };
  });
}

export async function getCollections(locale: Locale): Promise<ShopCollection[]> {
  try {
    const data = await storefrontFetch<{ collections: { edges: Array<GraphEdge<StorefrontCollection>> } }>(
      COLLECTIONS_QUERY,
      undefined,
      { revalidate: 120 },
    );

    if (!data) {
      return fallbackCatalog(locale);
    }

    return data.collections.edges.map((edge) => {
      const collection = edge.node;
      return {
        id: collection.id,
        handle: collection.handle,
        title: collection.title,
        description: collection.description,
        image: collection.image?.url ?? "/slowfit/hero.jpg",
        products: collection.products.edges.map((productEdge) =>
          toShopProduct(productEdge.node, locale, { handle: collection.handle, title: collection.title }),
        ),
      };
    });
  } catch {
    return fallbackCatalog(locale);
  }
}

export async function getCollectionByHandle(handle: string, locale: Locale): Promise<ShopCollection | null> {
  try {
    const data = await storefrontFetch<{ collection: StorefrontCollection | null }>(
      COLLECTION_BY_HANDLE_QUERY,
      { handle },
      { revalidate: 120 },
    );

    if (!data?.collection) {
      return fallbackCatalog(locale).find((collection) => collection.handle === handle) ?? null;
    }

    const collection = data.collection;

    return {
      id: collection.id,
      handle: collection.handle,
      title: collection.title,
      description: collection.description,
      image: collection.image?.url ?? "/slowfit/hero.jpg",
      products: collection.products.edges.map((productEdge) =>
        toShopProduct(productEdge.node, locale, { handle: collection.handle, title: collection.title }),
      ),
    };
  } catch {
    return fallbackCatalog(locale).find((collection) => collection.handle === handle) ?? null;
  }
}

export async function getProductByHandle(handle: string, locale: Locale): Promise<ShopProduct | null> {
  try {
    const data = await storefrontFetch<{ product: StorefrontProduct | null }>(
      PRODUCT_BY_HANDLE_QUERY,
      { handle },
      { revalidate: 120 },
    );

    if (!data?.product) {
      for (const collection of fallbackCatalog(locale)) {
        const product = collection.products.find((item) => item.handle === handle);
        if (product) {
          return product;
        }
      }
      return null;
    }

    return toShopProduct(data.product, locale);
  } catch {
    for (const collection of fallbackCatalog(locale)) {
      const product = collection.products.find((item) => item.handle === handle);
      if (product) {
        return product;
      }
    }
    return null;
  }
}

export async function getAllProductHandles(locale: Locale): Promise<string[]> {
  const collections = await getCollections(locale);
  return collections.flatMap((collection) => collection.products.map((product) => product.handle));
}

export async function createCheckoutSession(lines: CheckoutLineInput[], locale: Locale): Promise<CheckoutSession> {
  const cleanLines = lines.filter((line) => Boolean(line.variantId) && line.quantity > 0);

  if (!cleanLines.length || !getShopifyEnv()) {
    return {
      cartId: "fallback",
      checkoutUrl: `https://slowfitcr.com/${locale}`,
    };
  }

  const countryCode = locale === "es" ? "CR" : "US";

  const data = await storefrontFetch<StorefrontCartCreateResponse>(
    CART_CREATE_MUTATION,
    {
      lines: cleanLines.map((line) => ({ merchandiseId: line.variantId, quantity: line.quantity })),
      countryCode,
    },
    { revalidate: 0 },
  );

  const created = data?.cartCreate;
  if (!created?.cart) {
    const errorMessage = created?.userErrors?.map((error) => error.message).join("; ") || "Unable to create checkout";
    throw new Error(errorMessage);
  }

  return {
    cartId: created.cart.id,
    checkoutUrl: created.cart.checkoutUrl,
  };
}

export async function syncCheckoutSession(
  lines: CheckoutLineInput[],
  locale: Locale,
  cartId?: string,
): Promise<CheckoutSession> {
  const cleanLines = lines.filter((line) => Boolean(line.variantId) && line.quantity > 0);

  if (!cleanLines.length || !getShopifyEnv()) {
    return {
      cartId: cartId || "fallback",
      checkoutUrl: `https://slowfitcr.com/${locale}`,
    };
  }

  if (!cartId) {
    return createCheckoutSession(cleanLines, locale);
  }

  const existingCartData = await storefrontFetch<StorefrontCartQueryResponse>(CART_QUERY, { id: cartId }, { revalidate: 0 });
  const existingCart = existingCartData?.cart;

  if (!existingCart) {
    return createCheckoutSession(cleanLines, locale);
  }

  const currentByVariant = new Map(
    existingCart.lines.edges
      .map((edge) => ({
        lineId: edge.node.id,
        variantId: edge.node.merchandise?.id,
        quantity: edge.node.quantity,
      }))
      .filter((line): line is { lineId: string; variantId: string; quantity: number } => Boolean(line.variantId))
      .map((line) => [line.variantId, { lineId: line.lineId, quantity: line.quantity }] as const),
  );

  const desiredByVariant = new Map(cleanLines.map((line) => [line.variantId, line.quantity]));

  const lineIdsToRemove: string[] = [];
  const linesToUpdate: Array<{ id: string; quantity: number }> = [];
  const linesToAdd: Array<{ merchandiseId: string; quantity: number }> = [];

  for (const [variantId, current] of currentByVariant.entries()) {
    const wantedQuantity = desiredByVariant.get(variantId);
    if (!wantedQuantity) {
      lineIdsToRemove.push(current.lineId);
      continue;
    }

    if (wantedQuantity !== current.quantity) {
      linesToUpdate.push({ id: current.lineId, quantity: wantedQuantity });
    }
  }

  for (const [variantId, quantity] of desiredByVariant) {
    if (!currentByVariant.has(variantId)) {
      linesToAdd.push({ merchandiseId: variantId, quantity });
    }
  }

  if (lineIdsToRemove.length) {
    const removeResult = await storefrontFetch<StorefrontCartMutationResponse>(
      CART_LINES_REMOVE_MUTATION,
      { cartId, lineIds: lineIdsToRemove },
      { revalidate: 0 },
    );
    const removeErrors = removeResult?.cartLinesRemove?.userErrors ?? [];
    if (removeErrors.length) {
      throw new Error(removeErrors.map((error) => error.message).join("; "));
    }
  }

  if (linesToUpdate.length) {
    const updateResult = await storefrontFetch<StorefrontCartMutationResponse>(
      CART_LINES_UPDATE_MUTATION,
      { cartId, lines: linesToUpdate },
      { revalidate: 0 },
    );
    const updateErrors = updateResult?.cartLinesUpdate?.userErrors ?? [];
    if (updateErrors.length) {
      throw new Error(updateErrors.map((error) => error.message).join("; "));
    }
  }

  if (linesToAdd.length) {
    const addResult = await storefrontFetch<StorefrontCartMutationResponse>(
      CART_LINES_ADD_MUTATION,
      { cartId, lines: linesToAdd },
      { revalidate: 0 },
    );
    const addErrors = addResult?.cartLinesAdd?.userErrors ?? [];
    if (addErrors.length) {
      throw new Error(addErrors.map((error) => error.message).join("; "));
    }
  }

  const syncedCartData = await storefrontFetch<StorefrontCartQueryResponse>(CART_QUERY, { id: cartId }, { revalidate: 0 });
  const syncedCart = syncedCartData?.cart;

  if (!syncedCart) {
    return createCheckoutSession(cleanLines, locale);
  }

  return {
    cartId: syncedCart.id,
    checkoutUrl: syncedCart.checkoutUrl,
  };
}
