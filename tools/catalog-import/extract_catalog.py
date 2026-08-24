from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from PIL import Image


SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL"]
SIZE_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL)(?=\s+(?:\d+(?:\.\d+)?|/))",
    re.IGNORECASE,
)
SKU_PATTERN = re.compile(r"([A-Z]?FGB[A-Z0-9#-]+(?:\s*\+\s*[A-Z0-9#-]+)*)", re.IGNORECASE)
PRICE_PATTERN = re.compile(r"\$\s*(\d+(?:\.\d{1,2})?)")
PERCENT_PATTERN = re.compile(r"\d+(?:\.\d+)?%")


@dataclass(frozen=True)
class SourcePage:
    pdf_path: Path
    page_index: int
    heading: str
    text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract draft products from Mige Sports PDF catalogs.")
    parser.add_argument("--reference-dir", type=Path, default=Path("reference"))
    parser.add_argument("--output", type=Path, default=Path("backend/data/catalog-products.json"))
    parser.add_argument("--assets-dir", type=Path, default=Path("public/slowfit/catalog-products"))
    parser.add_argument("--base-url", default="https://slowfitcr.com/slowfit/catalog-products")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-images", action="store_true")
    return parser.parse_args()


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    value = value.casefold()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "product"


def extract_pdf_pages(pdf_path: Path) -> list[str]:
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
    )
    return result.stdout.decode("utf-8", errors="replace").split("\f")


def extract_heading(text: str) -> str | None:
    for raw_line in text.splitlines():
        match = SKU_PATTERN.search(raw_line)
        if not match:
            continue
        line = raw_line[match.start():]
        line = re.split(r"\s{2,}(?=(?:Material|Fabric|Outside|Inside|SIZE)\s*:?)", line, maxsplit=1, flags=re.IGNORECASE)[0]
        line = re.split(r"\s{4,}", line, maxsplit=1)[0]
        return normalize_space(line).rstrip("-").strip()
    return None


def collect_source_pages(reference_dir: Path) -> list[SourcePage]:
    products: dict[str, SourcePage] = {}
    for pdf_path in sorted(reference_dir.glob("*.pdf")):
        for page_index, text in enumerate(extract_pdf_pages(pdf_path)):
            heading = extract_heading(text)
            if not heading:
                continue
            key = slugify(heading)
            candidate = SourcePage(pdf_path, page_index, heading, text)
            existing = products.get(key)
            candidate_score = len(SIZE_PATTERN.findall(text)) * 100 + len(PRICE_PATTERN.findall(text)) * 100 + len(text)
            existing_score = (
                len(SIZE_PATTERN.findall(existing.text)) * 100
                + len(PRICE_PATTERN.findall(existing.text)) * 100
                + len(existing.text)
                if existing
                else -1
            )
            if candidate_score > existing_score:
                products[key] = candidate
    return list(products.values())


def extract_sku(heading: str) -> str:
    match = SKU_PATTERN.match(heading)
    if not match:
        raise ValueError(f"Could not parse SKU from heading: {heading}")
    return normalize_space(match.group(1)).replace(" ", "").rstrip("-")


def infer_garments(text: str) -> str:
    chart_match = re.search(r"SIZE\s*CHART", text, re.IGNORECASE)
    price_match = re.search(r"Price\s*\(USD\)", text, re.IGNORECASE)
    section = text[chart_match.end():price_match.start()] if chart_match and price_match else text
    garment_patterns = (
        (r"\bHALTER\s+BRA\b", "Halter Bra"),
        (r"\bLONG[- ]SLEEVE\s+TOPS?\b", "Long-Sleeve Top"),
        (r"\bSHORT[- ]SLEEVE\s+TOPS?\b", "Short-Sleeve Top"),
        (r"\bBELL[- ]BOTTOM\s+PANTS?\b", "Flare Pants"),
        (r"\bJUMPSUITS?\b", "Jumpsuit"),
        (r"\bJACKETS?\b", "Jacket"),
        (r"\bLEGGINGS?\b", "Leggings"),
        (r"\bSHORTS?\b", "Shorts"),
        (r"\bSKIRTS?\b", "Skirt"),
        (r"\bDRESSES?|\bDRESS\b", "Dress"),
        (r"\bSINGLETS?\b", "Tank Top"),
        (r"\bTOPS?\b", "Top"),
        (r"\bPANTS?\b", "Pants"),
        (r"\bBRA\b", "Bra"),
        (r"\bVEST\b", "Vest"),
    )
    garments: list[str] = []
    for pattern, label in garment_patterns:
        if re.search(pattern, section, re.IGNORECASE) and label not in garments:
            garments.append(label)
    if any(label.endswith("Top") and label != "Top" for label in garments):
        garments = [label for label in garments if label != "Top"]
    if "Halter Bra" in garments:
        garments = [label for label in garments if label != "Bra"]
    priority = {
        "Bra": 1,
        "Halter Bra": 1,
        "Top": 2,
        "Tank Top": 2,
        "Long-Sleeve Top": 2,
        "Short-Sleeve Top": 2,
        "Vest": 2,
        "Jacket": 2,
        "Shorts": 3,
        "Skirt": 3,
        "Leggings": 3,
        "Pants": 3,
        "Flare Pants": 3,
        "Jumpsuit": 4,
        "Dress": 4,
    }
    garments.sort(key=lambda label: (priority.get(label, 10), label))
    return " & ".join(garments[:3])


def extract_product_name(heading: str, text: str, sku: str) -> str:
    name = heading[len(SKU_PATTERN.match(heading).group(0)):].strip(" -")
    replacements = (
        (r"\bBulit\b", "Built"),
        (r"\bCausal\b", "Casual"),
        (r"\bseparetely\b", "separately"),
        (r"\bJumpsuits\b", "Jumpsuit"),
        (r"\bSinglets\b", "Tank Top"),
        (r"\bSkirts\b", "Skirt"),
        (r"\bJackets\b", "Jacket"),
        (r"\bLegs\b", "Leggings"),
        (r"\bLong sleeves tops\b", "Long-Sleeve Top"),
        (r"\bShort sleeves tops\b", "Short-Sleeve Top"),
        (r"\bBell[- ]bottom pants\b", "Flare Pants"),
        (r"\bBuilt in\b", "Built-in"),
    )
    for pattern, replacement in replacements:
        name = re.sub(pattern, replacement, name, flags=re.IGNORECASE)
    name = normalize_space(name) or "Activewear"
    if not re.search(r"bra|top|tank|short|skirt|legging|pants|jacket|coat|dress|jumpsuit|vest", name, re.IGNORECASE):
        garments = infer_garments(text)
        if garments:
            name = f"{garments} - {name}"
    return name[:120].rstrip()


def extract_sizes(text: str) -> list[str]:
    found: set[str] = set()
    for line in text.splitlines():
        for match in SIZE_PATTERN.finditer(line):
            found.add(match.group(1).upper())
    sizes = [size for size in SIZE_ORDER if size in found]
    if sizes:
        return sizes
    if re.search(r"free\s*size|one\s*size", text, re.IGNORECASE):
        return ["One Size"]
    return ["Size pending"]


def extract_material(text: str) -> str:
    candidates: list[str] = []
    for raw_line in text.splitlines():
        line = normalize_space(raw_line)
        if not PERCENT_PATTERN.search(line):
            continue
        if re.search(r"Material|Fabric|Outside|Inside|Tops?|Bra|Pants?|Leggings?|Skirts?|Shorts?", line, re.IGNORECASE):
            candidate = re.sub(r"^.*?(?=(?:Material|Fabric|Outside|Inside|Tops?|Bra|Pants?|Leggings?|Skirts?|Shorts?)\s*:)", "", line, flags=re.IGNORECASE)
            candidate = normalize_space(candidate)
            if candidate and candidate not in candidates:
                candidates.append(candidate)
    if not candidates:
        percent_lines = [normalize_space(line) for line in text.splitlines() if PERCENT_PATTERN.search(line)]
        candidates.extend(percent_lines[:2])
    material = "; ".join(candidates[:3]) or "Composition pending supplier review"
    material = re.sub(r"\bMaterial\s*:\s*", "", material, flags=re.IGNORECASE)
    material = re.sub(r"(\d%)\s*([A-Za-z])", r"\1 \2", material)
    material = re.sub(r"\s*\+\s*", " + ", material)
    return normalize_space(material)


def extract_price(text: str) -> float:
    match = PRICE_PATTERN.search(text)
    return float(match.group(1)) if match else 0.0


def category_for(name: str) -> str:
    value = name.casefold()
    categories = (
        ("jumpsuit", "jumpsuit"),
        ("dress", "dress"),
        ("bra", "sports-bra"),
        ("legging", "leggings"),
        ("short", "shorts"),
        ("skirt", "skirt"),
        ("jacket", "jacket"),
        ("coat", "jacket"),
        ("pants", "pants"),
        ("top", "top"),
        ("vest", "top"),
    )
    return next((category for needle, category in categories if needle in value), "activewear")


def gender_tags_for(source_file: str) -> list[str]:
    if source_file == "260228Unisex Daily-MIGE SPORTS.pdf":
        return ["men", "women"]
    if source_file == "260714MIGE SPORTS - MEN.pdf":
        return ["men"]
    if source_file in {
        "260728Seamless - MIGE SPORTS.pdf",
        "260813Non-Seamless - MIGE SPORTS.pdf",
        "MATCHING SET - Non-Seamless - MIGE SPORTS.pdf",
    }:
        return ["women"]
    raise ValueError(f"Unknown catalog gender for source document: {source_file}")


def enhanced_description(name: str, material: str, sizes: list[str], sku: str) -> str:
    value = name.casefold()
    if " & " in name or " set" in value or "pcs" in value:
        opening = "Conjunto coordinado para entrenar y moverte con una silueta uniforme y versatil."
    elif "jumpsuit" in value or "dress" in value:
        opening = "Una pieza deportiva practica que simplifica el look y acompana el movimiento diario."
    elif "bra" in value:
        opening = "Top deportivo pensado para combinar soporte cotidiano, libertad de movimiento y un acabado limpio."
    elif any(word in value for word in ("legging", "pants", "short", "skirt")):
        opening = "Una prenda inferior versatil para entrenamiento, caminatas y uso activo diario."
    elif any(word in value for word in ("jacket", "coat", "sweater")):
        opening = "Una capa deportiva funcional para completar el conjunto antes, durante o despues de entrenar."
    else:
        opening = "Una prenda deportiva versatil para entrenamiento y movimiento diario."

    features: list[str] = []
    feature_rules = (
        ("with padding", "incluye copas internas"),
        ("padding inside", "incluye copas internas"),
        ("without padding", "tiene construccion sin copas"),
        ("pocket", "incorpora bolsillos"),
        ("ribbed", "presenta textura acanalada"),
        ("fleece", "incorpora interior afelpado"),
        ("zipper", "incluye cierre funcional"),
        ("plus size", "esta disenada en tallaje ampliado"),
        ("built-in shorts", "integra short interior"),
    )
    for needle, phrase in feature_rules:
        if needle in value and phrase not in features:
            features.append(phrase)

    feature_sentence = " Detalles: " + ", ".join(features) + "." if features else ""
    size_text = ", ".join(sizes)
    return (
        f"{opening}{feature_sentence} La composicion declarada por el proveedor es {material}. "
        f"Tallas disponibles: {size_text}. Referencia del proveedor: {sku}. "
        "Producto importado como borrador; confirma precio, color y ajuste antes de publicarlo."
    )


def image_candidates(document: pymupdf.Document, page: pymupdf.Page) -> list[bytes]:
    candidates: list[tuple[int, int]] = []
    seen: set[int] = set()
    for image in page.get_images(full=True):
        xref, width, height = image[0], image[2], image[3]
        if xref in seen:
            continue
        seen.add(xref)
        if width >= 1800 and height >= 1000 and 1.6 <= width / height <= 1.9:
            continue
        if width * height < 120_000:
            continue
        candidates.append((width * height, xref))
    images: list[bytes] = []
    for _, xref in sorted(candidates, reverse=True)[:10]:
        try:
            images.append(document.extract_image(xref)["image"])
        except (RuntimeError, ValueError):
            continue
    if images:
        return images

    photo_area = pymupdf.Rect(
        page.rect.x0,
        page.rect.y0,
        page.rect.x0 + page.rect.width * 0.58,
        page.rect.y1,
    )
    rendered = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), clip=photo_area, alpha=False)
    return [rendered.tobytes("png")]


def save_webp(image_data: bytes, destination: Path) -> None:
    with Image.open(io.BytesIO(image_data)) as source:
        source.thumbnail((1200, 1500), Image.Resampling.LANCZOS)
        if source.mode in {"RGBA", "LA"}:
            background = Image.new("RGB", source.size, "white")
            background.paste(source, mask=source.getchannel("A"))
            image = background
        else:
            image = source.convert("RGB")
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=80, method=6)


def build_product(
    source: SourcePage,
    assets_dir: Path,
    base_url: str,
    document: pymupdf.Document | None,
) -> dict:
    sku = extract_sku(source.heading)
    title = extract_product_name(source.heading, source.text, sku)
    sizes = extract_sizes(source.text)
    material = extract_material(source.text)
    price = extract_price(source.text)
    digest = hashlib.sha1(source.heading.casefold().encode("utf-8")).hexdigest()[:8]
    handle = f"mige-{slugify(source.heading)[:120]}-{digest}"
    category = category_for(title)
    variant_sku_base = re.sub(r"[^A-Z0-9]+", "-", sku.upper()).strip("-")[:55]
    images: list[dict] = []

    if document is not None and source.page_index < len(document):
        image_data = image_candidates(document, document[source.page_index])
        for index, image in enumerate(image_data):
            suffix = "" if index == 0 else f"-{index + 1}"
            filename = f"{handle}{suffix}.webp"
            save_webp(image, assets_dir / filename)
            images.append({
                "url": f"{base_url.rstrip('/')}/{filename}",
                "altText": title,
            })

    tags = ["pdf-import", "mige-sports", category, *gender_tags_for(source.pdf_path.name)]
    if price == 0:
        tags.append("price-review")
    if sizes == ["Size pending"]:
        tags.append("size-review")
    return {
        "title": title,
        "handle": handle,
        "description": enhanced_description(title.split(" | ", 1)[0], material, sizes, sku),
        "status": "DRAFT",
        "published": False,
        "preorderEnabled": False,
        "tags": tags,
        "images": images,
        "variants": [
            {
                "title": size,
                "sku": f"{variant_sku_base}-{slugify(size).upper()}-{digest}",
                "price": price,
                "compareAtPrice": None,
                "inventoryQuantity": 0,
            }
            for size in sizes
        ],
        "source": {
            "file": source.pdf_path.name,
            "page": source.page_index + 1,
            "heading": source.heading,
            "material": material,
        },
    }


def main() -> None:
    args = parse_args()
    source_pages = collect_source_pages(args.reference_dir)
    if args.limit is not None:
        source_pages = source_pages[:args.limit]
    pymupdf.TOOLS.mupdf_display_errors(False)
    documents: dict[Path, pymupdf.Document] = {}
    try:
        products = []
        for source in source_pages:
            document = None
            if not args.skip_images:
                document = documents.setdefault(source.pdf_path, pymupdf.open(source.pdf_path))
            products.append(build_product(source, args.assets_dir, args.base_url, document))
    finally:
        for document in documents.values():
            document.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(products, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    missing_images = sum(not product["images"] for product in products)
    pending_sizes = sum("size-review" in product["tags"] for product in products)
    pending_prices = sum("price-review" in product["tags"] for product in products)
    print(
        f"Extracted {len(products)} products; missing images={missing_images}, "
        f"size review={pending_sizes}, price review={pending_prices}."
    )


if __name__ == "__main__":
    main()