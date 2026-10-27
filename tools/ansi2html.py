#!/usr/bin/env python3
"""Convert `tmux capture-pane -e -p` output (ANSI SGR) to standalone HTML.
Usage: ansi2html.py out.html in.ansi [in.ansi ...]
       ansi2html.py --box page.bmp   (the box inside the MARK outline of the rendered page, "x y w h")
  One page, the captures side by side in the given order, a 1px #444 line between them, laid out
  on a square canvas (Quick Look renders a square, cropped around its centre), the content scaled to
  the canvas width and centred vertically, outlined in MARK so that shot.sh can crop to it exactly.
  Prints "<canvas side> <content width> <content height>" in CSS px for the caller to render and crop."""
import re, sys, html, unicodedata

BASIC = ["#1e1e1e", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
         "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#ffffff"]
DEF_FG, DEF_BG = "#d4d4d4", "#1e1e1e"
FONT = 'Menlo, "SF Mono", monospace'


def c256(n):
    if n < 16:
        return BASIC[n]
    if n < 232:
        n -= 16
        lv = [0, 95, 135, 175, 215, 255]
        return "#%02x%02x%02x" % (lv[n // 36], lv[(n // 6) % 6], lv[n % 6])
    v = 8 + (n - 232) * 10
    return "#%02x%02x%02x" % (v, v, v)


TOKEN = re.compile(r"\x1b\[([0-9;:]*)m|\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[^\[\]]")


def new_state():
    return dict(fg=None, bg=None, bold=False, dim=False, italic=False, ul=False, rev=False)


def apply(st, params):
    p = [int(x) if x else 0 for x in re.split(r"[;:]", params)] if params != "" else [0]
    i = 0
    while i < len(p):
        n = p[i]
        if n == 0: st.update(new_state())
        elif n == 1: st["bold"] = True
        elif n == 2: st["dim"] = True
        elif n == 3: st["italic"] = True
        elif n == 4: st["ul"] = True
        elif n == 7: st["rev"] = True
        elif n == 22: st["bold"] = st["dim"] = False
        elif n == 23: st["italic"] = False
        elif n == 24: st["ul"] = False
        elif n == 27: st["rev"] = False
        elif 30 <= n <= 37: st["fg"] = BASIC[n - 30]
        elif 90 <= n <= 97: st["fg"] = BASIC[n - 90 + 8]
        elif 40 <= n <= 47: st["bg"] = BASIC[n - 40]
        elif 100 <= n <= 107: st["bg"] = BASIC[n - 100 + 8]
        elif n == 39: st["fg"] = None
        elif n == 49: st["bg"] = None
        elif n in (38, 48):
            key = "fg" if n == 38 else "bg"
            if i + 2 < len(p) and p[i + 1] == 5:
                st[key] = c256(p[i + 2] & 255); i += 2
            elif i + 4 < len(p) and p[i + 1] == 2:
                st[key] = "#%02x%02x%02x" % tuple(x & 255 for x in p[i + 2:i + 5]); i += 4
        i += 1


def style(st):
    fg, bg = st["fg"], st["bg"]
    if st["rev"]:
        fg, bg = (bg or DEF_BG), (fg or DEF_FG)
    css = []
    if fg: css.append("color:" + fg)
    if bg: css.append("background:" + bg)
    if st["bold"]: css.append("font-weight:bold")
    if st["italic"]: css.append("font-style:italic")
    if st["ul"]: css.append("text-decoration:underline")
    if st["dim"]: css.append("opacity:0.55")
    return ";".join(css)


def cell(ch):
    """ASCII as is; any other glyph pinned to its cells, so a fallback font cannot push the row."""
    if ord(ch) < 128:
        return html.escape(ch, quote=False)
    cells = 2 if unicodedata.east_asian_width(ch) in "WF" else 1
    # vertical-align:top and a fixed height: a fallback glyph's taller ascent cannot grow the line box either.
    return '<span style="display:inline-block;width:%dch;height:%spx;vertical-align:top;overflow:visible">%s</span>' % (cells, LINE_H, html.escape(ch, quote=False))


def render_pre(text, extra_style=""):
    st = new_state()
    out, pos = [], 0
    def emit(s):
        if not s: return
        s = "".join(cell(ch) for ch in s)
        css = style(st)
        out.append('<span style="%s">%s</span>' % (css, s) if css else s)
    for m in TOKEN.finditer(text):
        emit(text[pos:m.start()])
        pos = m.end()
        if m.group(1) is not None:
            apply(st, m.group(1))
    emit(text[pos:])
    return '<pre style="margin:0;padding:12px;font-family:%s;font-size:14px;line-height:%spx;font-variant-ligatures:none;color:%s;%s">%s</pre>' % (
        FONT, LINE_H, DEF_FG, extra_style, "".join(out))


def page(body):
    return ('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:%s;color:%s}'
            '</style></head><body>%s</body></html>' % (DEF_BG, DEF_FG, body))


def convert(text):
    return page(render_pre(text))


def side_by_side(left, right):
    body = ('<div style="display:flex;align-items:flex-start">%s<div style="width:1px;background:#444;align-self:stretch"></div>%s</div>'
            % (render_pre(left), render_pre(right)))
    return page(body)


CHAR_W, LINE_H, PAD = 8.43, 17.5, 12
MARK = "#ff00ff"
CANVAS = 800  # Menlo 14px, line-height 1.25, the <pre> padding


def visible_width(text):
    return max([len(re.sub(r"\x1b\[[0-9;:]*[A-Za-z]", "", line)) for line in text.split("\n")] or [0])


def panes(texts):
    """The page and its content size: every capture in its own <pre>, separated by a 1px #444 line."""
    texts = [t.rstrip("\n") for t in texts]
    width = sum(int(visible_width(t) * CHAR_W) + 2 * PAD + 2 for t in texts) + len(texts)
    height = int(max(len(t.split("\n")) for t in texts) * LINE_H) + 2 * PAD + 4
    side = max(width, height)
    sep = '<div style="width:1px;flex:none;background:#444;align-self:stretch"></div>'
    # A MARK outline drawn on the content itself (real font metrics), for the caller to find and crop inside.
    inner = sep.join('<div style="flex:none">%s</div>' % render_pre(t, "white-space:pre") for t in texts)
    # Quick Look lays the page out in a small view: a CANVAS px square, the content scaled to fit it.
    scale = CANVAS / side
    body = ('<div style="width:%dpx;height:%dpx;overflow:hidden;display:flex;align-items:center">'
            '<div style="height:%dpx;width:%dpx"><div style="display:inline-flex;align-items:flex-start;outline:3px solid %s;outline-offset:-3px;'
            'transform:scale(%.5f);transform-origin:0 0">%s</div></div></div>'
            % (CANVAS, CANVAS, int(height * scale), int(width * scale), MARK, scale, inner))
    return page(body), CANVAS, int(width * scale), int(height * scale)


def mark_box(bmp_path):
    """The box inside the MARK outline of a rendered page (an uncompressed BMP), as "x y w h" in pixels."""
    data = open(bmp_path, "rb").read()
    start = int.from_bytes(data[10:14], "little")
    w, h = int.from_bytes(data[18:22], "little", signed=True), int.from_bytes(data[22:26], "little", signed=True)
    bpp = int.from_bytes(data[28:30], "little") // 8
    stride = (w * bpp + 3) // 4 * 4
    pixel = b"\xff\x00\xff" + (b"\xff" if bpp == 4 else b"")  # B G R (A)
    xs, ys = [], []
    for y in range(abs(h)):
        row = data[start + y * stride:start + y * stride + w * bpp]
        i = row.find(pixel)
        while i != -1 and i % bpp: i = row.find(pixel, i + 1)
        if i == -1: continue
        j = row.rfind(pixel)
        while j != -1 and j % bpp: j = row.rfind(pixel, 0, j)
        xs += [i // bpp, j // bpp]; ys.append(y if h < 0 else abs(h) - 1 - y)
    if not xs: sys.exit("no mark found")
    # Step inside the outline: its thickness is the run of MARK pixels from the left edge, on a middle row.
    mid = (min(ys) + max(ys)) // 2
    y = mid if h < 0 else abs(h) - 1 - mid
    row, pad = data[start + y * stride:start + y * stride + w * bpp], 0
    while row[(min(xs) + pad) * bpp:(min(xs) + pad) * bpp + len(pixel)] == pixel: pad += 1
    x0, x1, y0, y1 = min(xs) + pad + 1, max(xs) - pad - 1, min(ys) + pad + 1, max(ys) - pad - 1
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


if __name__ == "__main__" and sys.argv[1] == "--box":
    print(*mark_box(sys.argv[2]))
elif __name__ == "__main__":
    out, sources = sys.argv[1], sys.argv[2:]
    html_text, side, width, height = panes([open(f, encoding="utf-8", errors="replace").read() for f in sources])
    open(out, "w", encoding="utf-8").write(html_text)
    print(side, width, height)
