"""Genera los iconos de la PWA.

  python scripts/make_icons.py                       -> icono provisional con el emblema del logo
  python scripts/make_icons.py mi_icono.png          -> usa tu imagen (cualquier tamaño; se centra en un cuadrado)
  python scripts/make_icons.py mi_icono.png "#221e41" -> igual, con ese color de fondo para rellenar

Salida en icons/: icon-192, icon-512, icon-maskable-512 (con margen de seguridad), apple-touch-icon, favicon-32.
"""
import os
import sys
from collections import deque
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

BASE = (34, 30, 65)
TEAL = (62, 112, 124)
SKY = (139, 205, 255)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------- icono provisional (emblema del logo) ----------
def emblem():
    """Recorta del logo solo el emblema (componente conexa más grande), sin el texto GUNDAM CARD GAME."""
    logo = Image.open(os.path.join(ROOT, "assets", "logo_white.png")).convert("RGBA")
    alpha = logo.split()[3]
    w, h = logo.size
    px = alpha.load()
    seen = [[False] * w for _ in range(h)]
    best = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or px[sx, sy] <= 40:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sy][sx] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny] > 40:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x, y in best:
        mp[x, y] = alpha.getpixel((x, y))
    white = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    white.putalpha(mask)
    return white.crop(mask.getbbox())


def glow(size, center, radius, color, alpha):
    layer = Image.new("RGBA", (size, size), color + (0,))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.45))


def default_icon(size, scale):
    bg = Image.new("RGBA", (size, size), BASE + (255,))
    bg.alpha_composite(glow(size, (size * 0.9, size * 0.05), size * 0.55, TEAL, 210))
    bg.alpha_composite(glow(size, (size * 0.05, size * 0.95), size * 0.5, SKY, 70))
    em = emblem()
    ew = int(size * scale)
    eh = int(em.height * ew / em.width)
    em = em.resize((ew, eh), Image.LANCZOS)
    pos = ((size - ew) // 2, (size - eh) // 2)
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    halo.paste(em, pos)
    halo = Image.composite(Image.new("RGBA", (size, size), SKY + (255,)), halo, halo.split()[3])
    halo.putalpha(halo.split()[3].point(lambda v: int(v * 0.55)))
    bg.alpha_composite(halo.filter(ImageFilter.GaussianBlur(size * 0.025)))
    bg.paste(em, pos, em)
    return bg.convert("RGB")


# ---------- icono propio ----------
def square_source(path, bg):
    src = Image.open(path).convert("RGBA")
    if bg is None:
        corner = src.getpixel((2, 2))
        bg = corner[:3] if corner[3] > 200 else BASE
    side = max(src.size)
    sq = Image.new("RGBA", (side, side), bg + (255,))
    sq.alpha_composite(src, ((side - src.width) // 2, (side - src.height) // 2))
    return sq.convert("RGB"), bg


def from_source(sq, bg, size, inner):
    """inner < 1 deja margen alrededor (necesario en el icono maskable)."""
    canvas = Image.new("RGB", (size, size), bg)
    d = int(size * inner)
    canvas.paste(sq.resize((d, d), Image.LANCZOS), ((size - d) // 2, (size - d) // 2))
    return canvas


if __name__ == "__main__":
    src_path = sys.argv[1] if len(sys.argv) > 1 else None
    bg_arg = hex_to_rgb(sys.argv[2]) if len(sys.argv) > 2 else None
    specs = [("icon-512.png", 512, 1.0), ("icon-192.png", 192, 1.0), ("icon-maskable-512.png", 512, 0.74),
             ("apple-touch-icon.png", 180, 1.0), ("favicon-32.png", 32, 1.0)]
    if src_path:
        sq, bg = square_source(src_path, bg_arg)
        print("fondo usado:", "#%02x%02x%02x" % bg)
        for name, size, inner in specs:
            from_source(sq, bg, size, inner).save(os.path.join(OUT, name), optimize=True)
            print(name)
    else:
        scales = {"icon-512.png": 0.60, "icon-192.png": 0.60, "icon-maskable-512.png": 0.46, "apple-touch-icon.png": 0.56, "favicon-32.png": 0.78}
        for name, size, _ in specs:
            default_icon(size, scales[name]).save(os.path.join(OUT, name), optimize=True)
            print(name)
