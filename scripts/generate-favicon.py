#!/usr/bin/env python3
"""Generate circular favicons from a square LinkedIn profile photo.

Crops to the inner portrait (excluding an Open to Work ring when present),
tightens around the face, masks to a circle, and writes ICO/PNG files with
no EXIF or other metadata. The full-size source is not copied into the repo.

Usage:
  python3 scripts/generate-favicon.py --source /path/to/linkedin-photo.jpg
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo


# Slightly tighter than the inner portrait, and a little above center so the
# face fills 16px and 32px icons without clipping the top of the head.
FACE_FRACTION = 0.86
FACE_Y_OFFSET = -0.04


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Square source photo (not committed)")
    parser.add_argument("--outdir", type=Path, default=root / "assets", help="Directory for generated icons")
    return parser.parse_args()


def inner_portrait_radius(image: Image.Image) -> int:
    """Largest radius from the center that stays inside a green banner ring."""
    rgb = image.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size
    cx, cy = (width - 1) / 2, (height - 1) / 2
    max_r = int(min(cx, cy))

    def ring_green_fraction(radius: int, thickness: int = 3) -> float:
        total = 0
        green = 0
        for y in range(height):
            for x in range(width):
                dist = math.hypot(x - cx, y - cy)
                if abs(dist - radius) <= thickness:
                    total += 1
                    r, g, b = pixels[x, y]
                    if g > r + 20 and g > b + 20 and g > 80:
                        green += 1
        return (green / total) if total else 0.0

    for radius in range(max_r, max(max_r // 2, 1), -1):
        if ring_green_fraction(radius) < 0.02:
            return radius
    return max_r


def face_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    cx, cy = (width - 1) / 2, (height - 1) / 2
    radius = inner_portrait_radius(image)
    side = int(radius * 2 * FACE_FRACTION)
    offset_y = int(radius * FACE_Y_OFFSET)
    left = int(round(cx - side / 2))
    top = int(round(cy + offset_y - side / 2))
    left = max(0, min(left, width - side))
    top = max(0, min(top, height - side))
    return image.crop((left, top, left + side, top + side))


def apply_circle_mask(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    mask = Image.new("L", image.size, 0)
    # Inset by 1px so the circle edge is fully inside the square.
    ImageDraw.Draw(mask).ellipse((1, 1, image.size[0] - 2, image.size[1] - 2), fill=255)
    image.putalpha(mask)
    return image


def resize(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, pnginfo=PngInfo())


def save_ico(image: Image.Image, path: Path, sizes: tuple[int, ...] = (16, 32, 48)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = [resize(image, size) for size in sizes]
    frames[-1].save(
        path,
        format="ICO",
        sizes=[(size, size) for size in sizes],
        append_images=frames[:-1],
    )


def main() -> None:
    args = parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Source photo not found: {source}")
    outdir = args.outdir
    with Image.open(source) as original:
        rgb = original.convert("RGB")
        # Copy pixels only so EXIF and other source metadata are not carried over.
        clean = Image.frombytes("RGB", rgb.size, rgb.tobytes())
    icon = apply_circle_mask(face_crop(clean))

    save_ico(icon, outdir / "favicon.ico", (16, 32, 48))
    save_png(resize(icon, 32), outdir / "favicon-32.png")
    apple = Image.new("RGBA", (180, 180), (247, 243, 236, 255))
    apple.alpha_composite(resize(icon, 180))
    save_png(apple, outdir / "apple-touch-icon.png")
    save_png(resize(icon, 192), outdir / "icon-192.png")
    save_png(resize(icon, 512), outdir / "icon-512.png")
    print(f"Wrote favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png to {outdir}")


if __name__ == "__main__":
    main()
