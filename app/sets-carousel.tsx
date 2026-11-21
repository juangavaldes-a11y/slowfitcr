"use client";

import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SET_IMAGE_SIZE, setSlides, slideHref, slideIsExternal } from "./data/sets-carousel";
import type { Copy, Locale } from "./i18n";

// Horizontal scroll-snap carousel of the set mosaics: no external library, native touch/trackpad scrolling plus arrow buttons.
export default function SetsCarousel({ copy, locale }: { copy: Copy["sets"]; locale: Locale }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setEdge({ start: track.scrollLeft <= 4, end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(updateEdges, 0);
    window.addEventListener("resize", updateEdges);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", updateEdges);
    };
  }, [updateEdges]);

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <section id="sets" className="slowfit-shell slowfit-section slowfit-sets" aria-roledescription="carousel" aria-label={copy.title}>
      <div className="slowfit-sets-heading">
        <div>
          <Typography.Text className="slowfit-kicker">{copy.kicker}</Typography.Text>
          <Typography.Title level={2} className="slowfit-display slowfit-collection-title">{copy.title}</Typography.Title>
          <Typography.Paragraph className="slowfit-collection-copy">{copy.subtitle}</Typography.Paragraph>
        </div>
        <div className="slowfit-sets-arrows">
          <Button shape="circle" aria-label={copy.previous} icon={<LeftOutlined />} disabled={edge.start} onClick={() => scrollByCard(-1)} data-testid="sets-prev" />
          <Button shape="circle" aria-label={copy.next} icon={<RightOutlined />} disabled={edge.end} onClick={() => scrollByCard(1)} data-testid="sets-next" />
        </div>
      </div>
      <ul className="slowfit-sets-track" ref={trackRef} onScroll={updateEdges} data-testid="sets-track">
        {setSlides.map((slide, index) => {
          const href = slideHref(slide, locale);
          const external = slideIsExternal(slide);
          const image = (
            <Image
              src={slide.image}
              alt={`${slide.name}`}
              width={SET_IMAGE_SIZE.width}
              height={SET_IMAGE_SIZE.height}
              sizes="(max-width: 575px) 78vw, (max-width: 991px) 42vw, 300px"
              loading={index < 2 ? "eager" : "lazy"}
              className="slowfit-sets-image"
            />
          );
          return (
            <li key={slide.id} className="slowfit-sets-slide" aria-roledescription="slide" aria-label={`${index + 1} / ${setSlides.length}`}>
              {external ? (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${copy.viewLabel} ${slide.name}`}>{image}</a>
              ) : (
                <Link href={href} aria-label={`${copy.viewLabel} ${slide.name}`}>{image}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
