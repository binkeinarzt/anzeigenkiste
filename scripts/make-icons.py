"""Erzeugt die Extension-Icons (eine grüne Kiste) in allen benötigten Größen.
Aufruf: python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
GREEN = (31, 111, 80, 255)
CREAM = (255, 253, 248, 255)


def icon(size: int) -> Image.Image:
    s = size * 8  # supersampling für glatte Kanten
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=GREEN)
    # Kiste: Deckel + Korpus
    m = s * 0.2
    d.rounded_rectangle([m, s * 0.30, s - m, s * 0.42], radius=s * 0.03, fill=CREAM)
    d.rounded_rectangle([m + s * 0.05, s * 0.45, s - m - s * 0.05, s * 0.80], radius=s * 0.04, fill=CREAM)
    # Griff
    d.rounded_rectangle([s * 0.40, s * 0.54, s * 0.60, s * 0.60], radius=s * 0.03, fill=GREEN)
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    icon(size).save(OUT / f"icon{size}.png")
icon(512).save(OUT.parent.parent / "site" / "icon.png")
print("Icons erstellt:", OUT)
