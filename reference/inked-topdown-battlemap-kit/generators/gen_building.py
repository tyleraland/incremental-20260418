#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- procedural building asset.
Follows the style_spec: seeded RNG, everything ink-outlined, surfaces built
from many small jittered pieces, single upper-right sun -> lower-left shadows.
"""
import random, math

# ---------------------------------------------------------------- constants
SEED = 7
random.seed(SEED)

W, H = 560, 480
JIT = 0.9                       # shared hand-drawn wobble amplitude
CELL = 26                       # cobble/grass cell pitch
LIGHT = (fff := 0)              # placeholder (unused)

# ---- palette tokens (straight from spec) ----
INK          = "#312619"
GROUND_COBB  = "#c9c4b4"
COBB_POOL    = ["#c6c0ae", "#cfcabb", "#bdb7a6", "#d3cdbe", "#c0baa8"]
COBB_INK     = "#a49d8b"
STONE_BASE   = "#b7b1a0"
STONE_POOL   = ["#bdb7a6", "#c6c0ae", "#b2ac9a", "#aaa392", "#c8c2b0"]
STONE_INK    = "#4a4335"
ROOF_RED     = ["#a84e33","#9c4630","#b0553a","#8f4028","#a24a30","#b86347","#7a3826","#a04a31","#6b3f3a"]
ROOF_RED_INK = "#3a2016"
TILE_MOSS    = "#6f8a3f"
TILE_BROKEN  = "#5a3226"
MOSS_BASE    = "#4f6a2c"
MOSS_INK     = "#33461f"
MOSS_SPECK   = ["#6f8a3f","#7f9a4d","#567a34"]
WOOD_POOL    = ["#c39a5e","#b8905a","#cba066"]
WOOD_INK     = "#5a3f22"
WOOD_GRAIN   = "#8a6a40"
GRASS_POOL   = ["#6f8a3f","#5a7a34"]
CANVAS_POOL  = ["#b0553a","#d9cba0","#5a7a4c","#b8905a"]
SHADOW_G     = "#4b4636"
SHADOW_P     = "#2a241a"

# ---------------------------------------------------------------- primitives
def jitter(v, a=JIT):
    return v + random.uniform(-a, a)

def wrect(x, y, w, h, j=JIT, rnd=1.6):
    """wobbly hand-drawn rounded rect as a bezier-cornered path."""
    p = [(jitter(x,j),      jitter(y,j)),
         (jitter(x+w,j),    jitter(y,j)),
         (jitter(x+w,j),    jitter(y+h,j)),
         (jitter(x,j),      jitter(y+h,j))]
    r = rnd
    d = ""
    n = len(p)
    for i in range(n):
        x0,y0 = p[i]
        x1,y1 = p[(i+1)%n]
        dx,dy = x1-x0, y1-y0
        L = math.hypot(dx,dy) or 1
        ux,uy = dx/L, dy/L
        sx,sy = x0+ux*r, y0+uy*r
        ex,ey = x1-ux*r, y1-uy*r
        if i == 0:
            d += f"M{sx:.1f},{sy:.1f} "
        else:
            d += f"Q{x0:.1f},{y0:.1f} {sx:.1f},{sy:.1f} "
        d += f"L{ex:.1f},{ey:.1f} "
    # close last corner
    x0,y0 = p[0]
    d += f"Q{x0:.1f},{y0:.1f} "
    # reconnect to first start point
    x1,y1 = p[1]
    dx,dy = x1-x0, y1-y0
    L = math.hypot(dx,dy) or 1
    d += f"{x0+dx/L*r:.1f},{y0+dy/L*r:.1f} Z"
    return d

def blob(cx, cy, r, n=7, amp=0.32, seedpts=None):
    """organic closed shape, smoothed with quadratic beziers."""
    pts = []
    for i in range(n):
        ang = 2*math.pi*i/n + random.uniform(-0.12,0.12)
        rr = r*(1+random.uniform(-amp,amp))
        pts.append((cx+rr*math.cos(ang), cy+rr*math.sin(ang)))
    d = ""
    for i in range(n):
        x0,y0 = pts[i]
        x1,y1 = pts[(i+1)%n]
        mx,my = (x0+x1)/2,(y0+y1)/2
        if i == 0:
            sx,sy = (pts[-1][0]+x0)/2,(pts[-1][1]+y0)/2
            d += f"M{sx:.1f},{sy:.1f} "
        d += f"Q{x0:.1f},{y0:.1f} {mx:.1f},{my:.1f} "
    d += "Z"
    return d

def P(d, fill, ink=INK, w=0.9, op=1.0, extra=""):
    o = f' opacity="{op}"' if op != 1.0 else ""
    st = f' stroke="{ink}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"' if ink else ' stroke="none"'
    return f'<path d="{d}" fill="{fill}"{st}{o}{extra}/>'

def wpick(pool):
    return random.choice(pool)

# ---------------------------------------------------------------- svg buffer
out = []
def add(s): out.append(s)

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')

# defs: gradients + soft shadow blur
add('<defs>')
add('<linearGradient id="lightOverlay" x1="1" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.16"/></linearGradient>')
add('<linearGradient id="slopeUp" x1="0" y1="1" x2="0" y2="0">'
    '<stop offset="0" stop-color="#1a1408" stop-opacity="0.28"/>'
    '<stop offset="0.55" stop-color="#1a1408" stop-opacity="0.02"/>'
    '<stop offset="1" stop-color="#fff4d8" stop-opacity="0.12"/></linearGradient>')
add('<linearGradient id="slopeDn" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.4" stop-color="#1a1408" stop-opacity="0.03"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.30"/></linearGradient>')
add('<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">'
    '<feGaussianBlur stdDeviation="5"/></filter>')
add('<filter id="softP" x="-60%" y="-60%" width="220%" height="220%">'
    '<feGaussianBlur stdDeviation="2.2"/></filter>')
add('</defs>')

# ================================================================ z0 GROUND
# cobblestone field tiling at CELL pitch, lighter ink so it recedes
add('<g>')
add(f'<rect x="0" y="0" width="{W}" height="{H}" fill="{GROUND_COBB}"/>')
cob = []
row = 0
y = -CELL/2
while y < H + CELL:
    xoff = (CELL/2) if (row % 2) else 0
    x = -CELL/2 + xoff
    while x < W + CELL:
        cx = x + jitter(0,5); cy = y + jitter(0,5)
        cob.append(P(blob(cx, cy, CELL*0.60, n=7, amp=0.30),
                     wpick(COBB_POOL), COBB_INK, 0.9))
        x += CELL
    y += CELL*0.86
    row += 1
add("".join(cob))

# worn darker lane (ruts) sweeping across, + grass tufts in cracks
add(P(blob(W*0.5, H*0.9, 150, n=9, amp=0.35), "#bfb9a8", None, 0, op=0.35))
tufts = []
for _ in range(90):
    gx, gy = random.uniform(0,W), random.uniform(0,H)
    col = wpick(GRASS_POOL)
    blades = ""
    for _ in range(random.randint(3,5)):
        bx = gx + random.uniform(-3,3)
        blades += (f'<path d="M{bx:.1f},{gy:.1f} q{random.uniform(-2,2):.1f},'
                   f'{-random.uniform(5,9):.1f} {random.uniform(-1.5,1.5):.1f},'
                   f'{-random.uniform(7,11):.1f}" stroke="{col}" stroke-width="1.1" '
                   f'fill="none" stroke-linecap="round" opacity="0.9"/>')
    tufts.append(blades)
add("".join(tufts))
add('</g>')

# ================================================================ building geom
# axis-aligned rectangular building, ridge runs horizontally.
BX, BY = 118, 92               # footprint top-left
BW, BH = 322, 292              # footprint size
WALL = 20                      # stone wall border thickness
ridgeY = BY + BH*0.52          # ridge line (a touch below center)

ix, iy = BX+WALL, BY+WALL      # interior (roof) rect
iw, ih = BW-2*WALL, BH-2*WALL
upH = ridgeY - iy              # upper slope height
dnH = (iy+ih) - ridgeY         # lower slope height

# ================================================================ z1 CAST SHADOW
add('<g filter="url(#soft)">')
sh = 22  # shadow offset magnitude (lower-left), scaled by building height
# soft offset footprint: the top/right edges barely move (light side),
# the bottom/left edges throw the shadow out lower-left.
d = (f"M{BX+2},{BY+4} "
     f"L{BX+BW+2},{BY+2} "
     f"L{BX+BW+2},{BY+BH-4} "
     f"L{BX+BW-sh*0.5:.0f},{BY+BH+sh} "
     f"L{BX-sh},{BY+BH+sh} "
     f"L{BX-sh},{BY+sh} Z")
add(P(d, SHADOW_G, None, 0, op=0.33))
add('</g>')

# ================================================================ z2 STRUCTURE BASE
# stone wall footprint drawn as running-bond masonry ring.
def masonry_region(x0, y0, x1, y1, ch=15, inset_ok=True):
    """fill rectangular band region with running-bond jittered blocks."""
    parts = []
    yy = y0
    r = 0
    while yy < y1 - 1:
        h = min(ch, y1-yy)
        off = random.uniform(8,16) if (r % 2) else 0
        xx = x0 - off
        while xx < x1 - 1:
            bw = random.uniform(16,26)
            w = min(bw, x1-xx)
            if xx + w > x0 and w > 3 and h > 3:
                dx0 = max(xx, x0)
                parts.append(P(wrect(dx0, yy, min(xx+w,x1)-dx0, h, 0.8, 1.4),
                               wpick(STONE_POOL), STONE_INK, 0.9))
            xx += bw
        yy += ch
        r += 1
    return "".join(parts)

add('<g>')
# base fill for whole footprint (stone), so gaps read as mortar
add(P(wrect(BX,BY,BW,BH,0.9,3), STONE_BASE, INK, 1.4))
# four wall bands
add(masonry_region(BX, BY, BX+BW, BY+WALL))              # top
add(masonry_region(BX, BY+BH-WALL, BX+BW, BY+BH))        # bottom
add(masonry_region(BX, BY+WALL, BX+WALL, BY+BH-WALL))    # left
add(masonry_region(BX+BW-WALL, BY+WALL, BX+BW, BY+BH-WALL)) # right
# a plank door set into the lower (front) wall + two small window darks
dwx, dwy, dww, dwh = BX+BW*0.42, BY+BH-WALL-1, 34, WALL+2
add(P(wrect(dwx-3, dwy-2, dww+6, dwh+3, 0.7, 2), "#3a2c1a", INK, 1.6))  # frame
add(P(wrect(dwx, dwy, dww, dwh, 0.7, 2), wpick(WOOD_POOL), WOOD_INK, 1.2)) # door
add(P(f"M{dwx+dww/2:.0f},{dwy} L{dwx+dww/2:.0f},{dwy+dwh}", "none", WOOD_GRAIN, 0.8, op=0.7))
for wxf in (0.16, 0.72):
    wxx = BX + BW*wxf
    add(P(wrect(wxx, BY+BH-WALL+3, 15, WALL-7, 0.6, 2), "#1a140c", INK, 1.2))
# light edge up-right, dark edge down-left on the wall ring
add(P(f"M{BX+BW},{BY} L{BX+BW},{BY+BH}", "none", "#fff4d8", 2.2, op=0.18))
add(P(f"M{BX},{BY+BH} L{BX+BW},{BY+BH}", "none", "#1a1408", 2.4, op=0.22))
add('</g>')

# ================================================================ z3 ROOF TILE FIELDS
def tile_field(x0, y0, x1, y1):
    parts = []
    cy = y0
    row = 0
    while cy < y1 - 1:
        chh = 11
        stag = random.uniform(9,13) * (1 if row % 2 else 0)
        cx = x0 - stag
        while cx < x1 - 1:
            tw = random.uniform(17,23)
            w = min(tw, x1-cx)
            h = min(chh, y1-cy)
            if cx + w > x0 and w > 4 and h > 3:
                dx0 = max(cx, x0)
                ww = min(cx+w, x1) - dx0
                roll = random.random()
                if roll < 0.05:
                    col, ink = TILE_BROKEN, ROOF_RED_INK
                elif roll < 0.10:
                    col, ink = TILE_MOSS, MOSS_INK
                else:
                    col, ink = wpick(ROOF_RED), ROOF_RED_INK
                parts.append(P(wrect(dx0, cy, ww, h, 0.7, 2.6), col, ink, 0.85))
            cx += tw
        cy += chh
        row += 1
    return "".join(parts)

add('<g>')
add(tile_field(ix, iy, ix+iw, ridgeY))          # upper slope
add(tile_field(ix, ridgeY, ix+iw, iy+ih))       # lower slope
# slope shading gradients
add(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{upH}" fill="url(#slopeUp)"/>')
add(f'<rect x="{ix}" y="{ridgeY}" width="{iw}" height="{dnH}" fill="url(#slopeDn)"/>')
# eave darkening lines
add(P(f"M{ix},{iy+ih} L{ix+iw},{iy+ih}", "none", "#1a1408", 3, op=0.16))
add('</g>')

# ================================================================ z4 RIDGE SPINE + CHIMNEYS
add('<g>')
# ridge = thin stone cap band straddling ridgeY
add(masonry_region(ix-2, ridgeY-5, ix+iw+2, ridgeY+5, ch=8))
# ridge highlight above / dark below
add(P(f"M{ix},{ridgeY-5} L{ix+iw},{ridgeY-5}", "none", "#fff4d8", 1.6, op=0.30))
add(P(f"M{ix},{ridgeY+5} L{ix+iw},{ridgeY+5}", "none", "#1a1408", 1.6, op=0.28))

def chimney(cx, w=30, h=34):
    parts = []
    x0 = cx - w/2
    y0 = ridgeY - h/2
    # its own small lower-left shadow
    parts.append(P(wrect(x0-6, y0+5, w, h, 0.8, 3), SHADOW_P, None, 0, op=0.30,
                   extra=' filter="url(#softP)"'))
    parts.append(P(wrect(x0, y0, w, h, 0.9, 3), STONE_BASE, INK, 1.4))
    parts.append(masonry_region(x0, y0, x0+w, y0+h, ch=11))
    # dark flue hole
    parts.append(P(wrect(x0+w*0.28, y0+h*0.30, w*0.44, h*0.36, 0.6, 2),
                   "#1a140c", INK, 1.0))
    # cap highlight up-right
    parts.append(P(f"M{x0+w},{y0} L{x0+w},{y0+h}", "none", "#fff4d8", 1.6, op=0.22))
    return "".join(parts)

add(chimney(ix + iw*0.30, 32, 36))
add(chimney(ix + iw*0.74, 26, 30))
add('</g>')

# ================================================================ z5 GLOBAL LIGHT OVERLAY
add(f'<path d="{wrect(ix,iy,iw,ih,0.5,3)}" fill="url(#lightOverlay)"/>')

# ================================================================ z6 OVERGROWTH moss/ivy
add('<g>')
def moss_clump(cx, cy, r):
    parts = [P(blob(cx, cy, r, n=9, amp=0.42), MOSS_BASE, MOSS_INK, 0.9)]
    for _ in range(int(r*1.3)):
        sx = cx + random.uniform(-r*0.9, r*0.9)
        sy = cy + random.uniform(-r*0.9, r*0.9)
        rr = random.uniform(1.2, 2.6)
        parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{rr:.1f}" '
                     f'fill="{wpick(MOSS_SPECK)}" opacity="0.9"/>')
    return "".join(parts)

# along ridge, valleys, corners, denser lower-left
for fx in (0.15, 0.5, 0.62, 0.9):
    add(moss_clump(ix+iw*fx, ridgeY + random.uniform(-4,4), random.uniform(7,11)))
# shaded corners (lower-left heavier)
add(moss_clump(ix+6, iy+ih-8, 12))
add(moss_clump(ix+iw*0.2, iy+ih-6, 10))
add(moss_clump(ix+8, iy+ih*0.62, 8))
add(moss_clump(ix+iw-8, iy+6, 6))
# extra moss creeping up the shaded lower-left outer wall base
for _ in range(6):
    mx = BX + random.uniform(-2, BW*0.34)
    my = BY + BH - random.uniform(-2, 10)
    add(moss_clump(mx, my, random.uniform(6,10)))
for _ in range(4):
    my = BY + random.uniform(BH*0.55, BH-6)
    add(moss_clump(BX + random.uniform(-2,8), my, random.uniform(5,8)))
# a vine trail creeping down the lower slope
vx, vy = ix+iw*0.44, ridgeY+4
vine = f'<path d="M{vx},{vy} '
for _ in range(6):
    vx += random.uniform(-6,6); vy += random.uniform(10,16)
    vine += f'Q{vx+random.uniform(-8,8):.1f},{vy-6:.1f} {vx:.1f},{vy:.1f} '
vine += f'" stroke="{MOSS_INK}" stroke-width="2.4" fill="none" opacity="0.75" stroke-linecap="round"/>'
add(vine)
add(moss_clump(vx, vy, 7))
add('</g>')

# ================================================================ z7 PROPS & DEBRIS
add('<g>')
def plank(cx, cy, w, h, ang):
    g = f'<g transform="rotate({ang:.1f} {cx:.1f} {cy:.1f})">'
    g += P(wrect(cx-w/2-3, cy-h/2+4, w, h, 0.8, 3), SHADOW_P, None, 0, op=0.28,
           extra=' filter="url(#softP)"')
    col = wpick(WOOD_POOL)
    g += P(wrect(cx-w/2, cy-h/2, w, h, 0.9, 3), col, WOOD_INK, 1.2)
    for k in range(3):
        gy = cy-h/2 + h*(k+1)/4
        g += P(f"M{cx-w/2+3},{gy:.1f} L{cx+w/2-3},{gy:.1f}", "none",
               WOOD_GRAIN, 0.7, op=0.7)
    g += "</g>"
    return g

# loose planks dropped on roof
add(plank(ix+iw*0.55, iy+upH*0.55, 46, 9, 24))
add(plank(ix+iw*0.24, ridgeY+dnH*0.55, 40, 8, -18))
# planks / crates on ground beside building (lower-left)
def crate(cx, cy, s):
    g = P(wrect(cx-s/2-4, cy-s/2+4, s, s, 0.8, 3), SHADOW_P, None, 0, op=0.28,
          extra=' filter="url(#softP)"')
    g += P(wrect(cx-s/2, cy-s/2, s, s, 0.9, 3), wpick(WOOD_POOL), WOOD_INK, 1.2)
    g += P(wrect(cx-s/2+3, cy-s/2+3, s-6, s-6, 0.7, 2), "none", WOOD_INK, 0.9, op=0.6)
    g += P(f"M{cx-s/2+4},{cy} L{cx+s/2-4},{cy}", "none", WOOD_GRAIN, 0.8, op=0.6)
    return g
add(crate(BX-26, BY+BH-30, 26))
add(crate(BX-30, BY+BH-58, 22))
add(crate(BX-8, BY+BH+14, 20))
# a couple barrels (short stout timber + lid ellipse)
def barrel(cx, cy, r):
    g = f'<ellipse cx="{cx-4:.1f}" cy="{cy+5:.1f}" rx="{r+2}" ry="{r*0.9}" fill="{SHADOW_P}" opacity="0.28" filter="url(#softP)"/>'
    g += f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{wpick(WOOD_POOL)}" stroke="{WOOD_INK}" stroke-width="1.3"/>'
    g += f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.62:.1f}" fill="none" stroke="{WOOD_INK}" stroke-width="1" opacity="0.7"/>'
    g += f'<circle cx="{cx-r*0.28:.1f}" cy="{cy-r*0.28:.1f}" r="{r*0.22:.1f}" fill="#fff4d8" opacity="0.18"/>'
    return g
add(barrel(BX+BW+18, BY+BH-40, 13))
add(barrel(BX+BW+30, BY+BH-20, 11))
# sacks near crates
for (sx,sy,sr) in [(BX-40,BY+BH-16,10),(BX-52,BY+BH-34,9)]:
    add(P(blob(sx,sy,sr,7,0.28), "#c9b98a", "#8a7a4a", 1.1))
add('</g>')

# ================================================================ z8 SILHOUETTE INK
# bold outline round whole structure to seat it
add(P(wrect(BX,BY,BW,BH,0.9,3), "none", INK, 2.7))

add('</svg>')

svg = "\n".join(out)
with open("building.svg","w") as f:
    f.write(svg)
print("pieces ~", svg.count("<path")+svg.count("<circle")+svg.count("<ellipse"))
print("bytes", len(svg))
