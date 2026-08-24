"use client";

import Image from "next/image";
import { useState } from "react";

type ProductGalleryProps = {
  images: Array<{ id: string; url: string; altText: string }>;
  productTitle: string;
};

export default function ProductGallery({ images, productTitle }: ProductGalleryProps) {
  const galleryImages = images.length ? images : [{ id: "fallback", url: "/slowfit/hero.jpg", altText: productTitle }];
  const [selectedId, setSelectedId] = useState(galleryImages[0].id);
  const selectedImage = galleryImages.find((image) => image.id === selectedId) || galleryImages[0];

  return (
    <div className="slowfit-product-gallery">
      <div className="slowfit-product-detail-media">
        <Image src={selectedImage.url} alt={selectedImage.altText || productTitle} fill priority unoptimized
          sizes="(max-width: 991px) 100vw, 48vw" className="slowfit-cover" />
      </div>
      {galleryImages.length > 1 ? (
        <div className="slowfit-product-thumbnails" aria-label={`Images: ${productTitle}`}>
          {galleryImages.map((image, index) => (
            <button key={image.id} type="button" className={`slowfit-product-thumbnail${image.id === selectedImage.id ? " is-selected" : ""}`}
              onClick={() => setSelectedId(image.id)} aria-label={`${productTitle}, ${index + 1}`} aria-pressed={image.id === selectedImage.id}>
              <Image src={image.url} alt="" fill unoptimized sizes="88px" className="slowfit-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}