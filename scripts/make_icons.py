"""Genera todos los iconos de Locura robótica a partir de un único asset canónico: brand/locura-robotica-icon.png

  python scripts/make_icons.py                 -> regenera icons/ desde brand/locura-robotica-icon.png
  python scripts/make_icons.py nuevo_icono.png -> además sustituye el asset canónico (limpia las esquinas blancas a transparente)

Salida:
  brand/locura-robotica-icon.png   512x512, esquinas redondeadas transparentes (UI, splash, manifest 512 "any")
  icons/icon-192.png               misma composición a 192 (manifest "any")
  icons/icon-maskable-512.png      misma composición sin esquinas transparentes (Android aplica su máscara)
  icons/apple-touch-icon.png       180x180 sin esquinas transparentes (iOS pone su propia máscara)
  icons/favicon-32.png             32x32 (esquinas redondeadas)
Todos parten de la misma ilustración; no se redibuja ni se recolorea nada.
"""
import os
import sys
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.join(ROOT, "brand", "locura-robotica-icon.png")
ICONS = os.path.join(ROOT, "icons")
SIZE = 512


def transparent_corners(img):
    """Las esquinas del original son blancas: se marcan por relleno desde el borde y pasan a transparentes (con suavizado)."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    white = lambda x, y: min(px[x, y]) >= 232
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if white(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and white(nx, ny):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    mask = Image.new("L", (w, h), 255)
    mask.putdata([0 if s else 255 for s in seen])
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))   # 1 px hacia dentro: sin halo blanco
    out = rgb.convert("RGBA")
    out.putalpha(mask)
    return out


def bleed(img, size):
    """Misma ilustración, encuadre intacto y sin esquinas transparentes: las esquinas se rellenan con la propia imagen ampliada y difuminada."""
    big = img.resize((round(size * 1.5), round(size * 1.5)), Image.LANCZOS)
    o = (big.width - size) // 2
    flat = Image.new("RGBA", big.size, (0, 0, 0, 255))
    flat.alpha_composite(big)
    bg = flat.crop((o, o, o + size, o + size)).filter(ImageFilter.GaussianBlur(size * 0.03))
    bg.alpha_composite(img.resize((size, size), Image.LANCZOS))
    return bg.convert("RGB")


def main():
    os.makedirs(os.path.dirname(CANON), exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)
    if len(sys.argv) > 1:
        src = Image.open(sys.argv[1])
        side = min(src.size)
        src = src.crop(((src.width - side) // 2, (src.height - side) // 2, (src.width + side) // 2, (src.height + side) // 2))
        transparent_corners(src).resize((SIZE, SIZE), Image.LANCZOS).save(CANON, optimize=True)
        print("asset canónico:", CANON)
    base = Image.open(CANON).convert("RGBA")
    base.resize((192, 192), Image.LANCZOS).save(os.path.join(ICONS, "icon-192.png"), optimize=True)
    base.resize((32, 32), Image.LANCZOS).save(os.path.join(ICONS, "favicon-32.png"), optimize=True)
    bleed(base, 512).save(os.path.join(ICONS, "icon-maskable-512.png"), optimize=True)
    bleed(base, 180).save(os.path.join(ICONS, "apple-touch-icon.png"), optimize=True)
    print("iconos en", ICONS)


if __name__ == "__main__":
    main()
