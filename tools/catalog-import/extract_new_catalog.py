"""Imports the photos and color dots of the designed catalog PDF (Catalogo_Slow_Completo.pdf) per product.

Every page of that PDF is one 1080x1350 image holding a single product (SLW-NNN) laid out as tiles. This script crops
each tile, saves it as JPEG under public/slowfit/catalog-photos/<code>/ and writes catalog-photos/manifest.json:
{ "SLW-001": { "colors": [{ "raw": "Cherry", "label": "Cereza", "hex": "#..", "photos": ["SLW-001/cherry-1.jpg"] }] } }

`raw` is the inventory color name (as in backend/data/sammy-invoice-*.json); the exporter matches on it.
Usage: python tools/catalog-import/extract_new_catalog.py [path/to/Catalogo_Slow_Completo.pdf]
"""
import io, json, re, sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "slowfit" / "catalog-photos"
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "Catalogo_Slow_Completo.pdf"

TWO_BY_TWO = [[50, 219, 528, 661], [552, 219, 1030, 661], [50, 739, 528, 1182], [552, 739, 1030, 1182]]
SHIRT_PANELS = [[50, 234, 360, 564], [370, 234, 680, 564], [50, 588, 360, 918], [370, 588, 680, 918], [50, 944, 360, 1274], [370, 944, 680, 1274]]

# page -> (code, tile boxes or None for auto-detection, [(raw, label, tile indexes)] in reading order of the labels)
PAGES = {
    2: ("SLW-001", None, [("Sky blue", "Celeste", [0]), ("Cherry", "Cereza", [1]), ("White", "Blanco", [2]), ("Black", "Negro", [3])]),
    3: ("SLW-002", None, [("Dark blue & Stripe", "Azul oscuro y rayas", [0]), ("Black & Stripe", "Negro y rayas", [1]), ("Black & Polka dot", "Negro y lunares", [2]), ("Cream & Polka dot", "Crema y lunares", [3])]),
    4: ("SLW-003", None, [("Raspberry", "Frambuesa", [0]), ("Navy", "Azul marino", [1]), ("Black", "Negro", [2]), ("Army green", "Verde militar", [3])]),
    5: ("SLW-004", None, [("Raspberry", "Frambuesa", [0]), ("Navy", "Azul marino", [1]), ("Black", "Negro", [2]), ("Army green", "Verde militar", [3])]),
    6: ("SLW-005", None, [("Black", "Negro", [0]), ("Navy", "Azul marino", [1])]),
    7: ("SLW-006", None, [("Cobalt blue", "Azul cobalto", [0]), ("Khaki", "Caqui", [1, 2]), ("Black", "Negro", [3]), ("Green", "Verde", [4])]),
    8: ("SLW-007", None, [("Off white", "Off white", [0]), ("Pink", "Rosado", [1])]),
    9: ("SLW-008", TWO_BY_TWO, [("31.SHL", "Azul oscuro", [0]), ("35.HS", "Celeste", [1]), ("12.XNTLL", "Negro", [2]), ("16.SMZ", "Fucsia", [3])]),
    10: ("SLW-009", TWO_BY_TWO, [("White", "Blanco", [0]), ("Black", "Negro", [1]), ("Red", "Rojo", [2]), ("Navy", "Azul marino", [3])]),
    11: ("SLW-010", None, [("Black", "Negro", [0]), ("Olive", "Oliva", [1])]),
    12: ("SLW-011", None, [("Black", "Negro", [0, 1]), ("Violet", "Violeta", [2, 3]), ("White", "Blanco", [4, 5])]),
    13: ("SLW-012", None, [("Dark purple", "Morado oscuro", [0, 3]), ("Black", "Negro", [1, 4]), ("Grey", "Gris", [2, 5])]),
    14: ("SLW-013", None, [("Dark red", "Vino", [0, 1]), ("Light purple", "Rosado lila", [2, 3]), ("Dark blue", "Azul marino", [4, 5]), ("Black", "Negro", [6, 7])]),
    15: ("SLW-014", None, [("Purple", "Morado", [0, 1, 2]), ("Pink", "Rosado", [3, 4, 5])]),
    16: ("SLW-015", None, [("Dark blue", "Azul oscuro", [0]), ("Black", "Negro", [1]), ("Grape", "Uva", [2]), ("Red", "Rojo", [3])]),
    17: ("SLW-016", None, [("Red", "Rojo", [0]), ("Black", "Negro", [1]), ("Cherry", "Cereza", [2])]),
    18: ("SLW-017", None, [("Burgundy", "Vino", [0]), ("Black", "Negro", [1]), ("Navy", "Azul marino", [2])]),
    19: ("SLW-018", None, [("Purple", "Morado", [0]), ("Black", "Negro", [1]), ("Angolan red", "Rojo Angola", [2])]),
    20: ("SLW-019", None, [("Midnight", "Azul medianoche", [0]), ("Black", "Negro", [1]), ("Blue", "Azul", [2]), ("Pink", "Rosado", [3])]),
    21: ("SLW-020", None, [("Wine", "Vino", [0]), ("Navy", "Azul marino", [1]), ("Black", "Negro", [2])]),
    22: ("SLW-022", None, [("Red", "Rojo", [0]), ("Navy", "Azul marino", [1]), ("Black", "Negro", [2])]),
    23: ("SLW-023", None, [("Red", "Rojo", [0])]),
    24: ("SLW-024", None, [("Black", "Negro", [0]), ("Grey", "Gris", [1])]),
    25: ("SLW-025", None, [("Green", "Verde", [0])]),
    26: ("SLW-026", SHIRT_PANELS, [("Black", "Negro", [0, 1]), ("Grey", "Gris", [2, 3]), ("Blue", "Azul", [4, 5])]),
    27: ("SLW-027", None, [("Black", "Negro", [0]), ("Grey", "Gris", [1]), ("Blue", "Azul", [2])]),
}

# Outlined (white) and half-filled dots are not detected as solid circles; their colors are set by hand.
HEX_OVERRIDES = {
    "SLW-001": {"Sky blue": "#a7c7ee", "Cherry": "#a5173d", "White": "#ffffff", "Black": "#1f1e1c"},
    "SLW-002": {"Dark blue & Stripe": "#26325f", "Black & Stripe": "#1f1e1c", "Black & Polka dot": "#1f1e1c", "Cream & Polka dot": "#efe6cf"},
    "SLW-007": {"Off white": "#efe9dc", "Pink": "#f3b9cf"},
    "SLW-009": {"White": "#ffffff", "Black": "#1f1e1c", "Red": "#d4202a", "Navy": "#1d2a55"},
    "SLW-011": {"Black": "#1f1e1c", "Violet": "#a48be0", "White": "#ffffff"},
}


def detect_tiles(a, bg):
    mask = ndi.binary_opening(np.abs(a - bg).max(axis=2) > 10, structure=np.ones((9, 9)))
    lab, _ = ndi.label(mask)
    boxes = []
    for i, (ys, xs) in enumerate(ndi.find_objects(lab)):
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if h >= 120 and w >= 90 and (lab[ys, xs] == i + 1).sum() > 0.5 * h * w:
            boxes.append([xs.start, ys.start, xs.stop, ys.stop])
    return sorted(boxes, key=lambda b: (round(b[1] / 60), b[0]))


def detect_dots(a, bg, tiles):
    """Color-dot centers in reading order: filled circles of ~20-34 px outside the photos."""
    mask = np.abs(a - bg).max(axis=2) > 10
    for x0, y0, x1, y1 in tiles:
        mask[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6] = False
    mask[:200, 600:] = False  # logo
    mask = ndi.binary_opening(mask, structure=np.ones((11, 11)))
    lab, _ = ndi.label(mask)
    dots = []
    for i, (ys, xs) in enumerate(ndi.find_objects(lab)):
        h, w = ys.stop - ys.start, xs.stop - xs.start
        if 16 <= h <= 36 and 16 <= w <= 36 and abs(h - w) <= 4 and ys.start > 200:
            cy, cx = (ys.start + ys.stop) // 2, (xs.start + xs.stop) // 2
            dots.append((cx, cy, "#%02x%02x%02x" % tuple(np.median(a[cy - 3:cy + 4, cx - 3:cx + 4].reshape(-1, 3), axis=0).astype(int))))
    return sorted(dots, key=lambda d: (round(d[1] / 60), d[0]))


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main():
    doc = pymupdf.open(PDF)
    manifest = {}
    for page_no, (code, fixed, groups) in PAGES.items():
        img = Image.open(io.BytesIO(doc.extract_image(doc[page_no - 1].get_images()[0][0])["image"])).convert("RGB")
        a = np.asarray(img).astype(int)
        tiles = fixed or detect_tiles(a, a[1340, 5])
        need = max(i for _, _, idx in groups for i in idx) + 1
        if len(tiles) < need:
            sys.exit(f"{code}: found {len(tiles)} photos, expected {need}")
        dots = detect_dots(a, a[1340, 5], tiles)
        folder = OUT / code
        folder.mkdir(parents=True, exist_ok=True)
        colors = []
        for gi, (raw, label, idx) in enumerate(groups):
            photos = []
            for n, ti in enumerate(idx, 1):
                name = f"{slug(raw)}-{n}.jpg"
                img.crop(tuple(tiles[ti])).save(folder / name, quality=88)
                photos.append(f"{code}/{name}")
            hex_ = HEX_OVERRIDES.get(code, {}).get(raw) or (dots[gi][2] if len(dots) == len(groups) else None)
            colors.append({"raw": raw, "label": label, "hex": hex_, "photos": photos})
        manifest[code] = {"colors": colors}
        print(code, len(tiles), "tiles", len(dots), "dots", [c["hex"] for c in colors])
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")


main()
