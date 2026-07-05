#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- city-square fountain.
Shares constants/palette/primitives with the building asset.
Tiered fountain: masonry basin ring + layered water + raised central
plinth with upper basin & foam-ring spout. One upper-right sun.
"""
import random, math

SEED = 14
random.seed(SEED)

W, H = 460, 460
JIT = 0.9
CELL = 26

INK          = "#312619"
GROUND_COBB  = "#c9c4b4"
COBB_POOL    = ["#c6c0ae", "#cfcabb", "#bdb7a6", "#d3cdbe", "#c0baa8"]
COBB_INK     = "#a49d8b"
STONE_BASE   = "#b7b1a0"
STONE_POOL   = ["#bdb7a6", "#c6c0ae", "#b2ac9a", "#aaa392", "#c8c2b0"]
STONE_INK    = "#4a4335"
MOSS_BASE    = "#4f6a2c"
MOSS_INK     = "#33461f"
MOSS_SPECK   = ["#6f8a3f","#7f9a4d","#567a34"]
WOOD_POOL    = ["#c39a5e","#b8905a","#cba066"]
WOOD_INK     = "#5a3f22"
WOOD_GRAIN   = "#8a6a40"
GRASS_POOL   = ["#6f8a3f","#5a7a34"]
WATER_POOL   = ["#4f7c86","#3f6d78","#5f8b94"]
WATER_INK    = "#274a52"
WATER_HL     = "#a9cfd2"
SHADOW_G     = "#4b4636"
SHADOW_P     = "#2a241a"

# ---------------------------------------------------------------- primitives
def jitter(v, a=JIT): return v + random.uniform(-a, a)

def wrect(x, y, w, h, j=JIT, rnd=1.6):
    p = [(jitter(x,j),jitter(y,j)),(jitter(x+w,j),jitter(y,j)),
         (jitter(x+w,j),jitter(y+h,j)),(jitter(x,j),jitter(y+h,j))]
    r=rnd; d=""; n=len(p)
    for i in range(n):
        x0,y0=p[i]; x1,y1=p[(i+1)%n]
        dx,dy=x1-x0,y1-y0; L=math.hypot(dx,dy) or 1; ux,uy=dx/L,dy/L
        sx,sy=x0+ux*r,y0+uy*r; ex,ey=x1-ux*r,y1-uy*r
        d+= (f"M{sx:.1f},{sy:.1f} " if i==0 else f"Q{x0:.1f},{y0:.1f} {sx:.1f},{sy:.1f} ")
        d+= f"L{ex:.1f},{ey:.1f} "
    x0,y0=p[0]; x1,y1=p[1]; dx,dy=x1-x0,y1-y0; L=math.hypot(dx,dy) or 1
    d+= f"Q{x0:.1f},{y0:.1f} {x0+dx/L*r:.1f},{y0+dy/L*r:.1f} Z"
    return d

def blob(cx, cy, r, n=7, amp=0.32):
    pts=[]
    for i in range(n):
        ang=2*math.pi*i/n+random.uniform(-0.12,0.12)
        rr=r*(1+random.uniform(-amp,amp))
        pts.append((cx+rr*math.cos(ang),cy+rr*math.sin(ang)))
    d=""
    for i in range(n):
        x0,y0=pts[i]; x1,y1=pts[(i+1)%n]; mx,my=(x0+x1)/2,(y0+y1)/2
        if i==0:
            sx,sy=(pts[-1][0]+x0)/2,(pts[-1][1]+y0)/2
            d+=f"M{sx:.1f},{sy:.1f} "
        d+=f"Q{x0:.1f},{y0:.1f} {mx:.1f},{my:.1f} "
    return d+"Z"

def P(d, fill, ink=INK, w=0.9, op=1.0, extra=""):
    o=f' opacity="{op}"' if op!=1.0 else ""
    st=(f' stroke="{ink}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'
        if ink else ' stroke="none"')
    return f'<path d="{d}" fill="{fill}"{st}{o}{extra}/>'

def wpick(pool): return random.choice(pool)

out=[]
def add(s): out.append(s)
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('<defs>')
add('<linearGradient id="lightOverlay" x1="1" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.16"/></linearGradient>')
# water: lit upper-right, dark lower-left rim
add('<radialGradient id="waterGrad" cx="0.62" cy="0.38" r="0.75">'
    '<stop offset="0" stop-color="#6a97a0" stop-opacity="0.55"/>'
    '<stop offset="0.55" stop-color="#3f6d78" stop-opacity="0"/>'
    '<stop offset="0.85" stop-color="#20454d" stop-opacity="0.35"/>'
    '<stop offset="1" stop-color="#173a42" stop-opacity="0.6"/></radialGradient>')
add('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%">'
    '<feGaussianBlur stdDeviation="5"/></filter>')
add('<filter id="softP" x="-70%" y="-70%" width="240%" height="240%">'
    '<feGaussianBlur stdDeviation="2.2"/></filter>')
add('</defs>')

CX, CY = W/2, H/2 + 4

# ================================================================ z0 GROUND
add(f'<rect width="{W}" height="{H}" fill="{GROUND_COBB}"/>')
cob=[]; row=0; y=-CELL/2
while y < H+CELL:
    xoff=(CELL/2) if row%2 else 0; x=-CELL/2+xoff
    while x < W+CELL:
        cob.append(P(blob(x+jitter(0,5), y+jitter(0,5), CELL*0.60, 7, 0.30),
                     wpick(COBB_POOL), COBB_INK, 0.9))
        x+=CELL
    y+=CELL*0.86; row+=1
add("".join(cob))
# grass tufts in cracks
tf=[]
for _ in range(70):
    gx,gy=random.uniform(0,W),random.uniform(0,H)
    if math.hypot(gx-CX,gy-CY) < 150: continue
    col=wpick(GRASS_POOL); b=""
    for _ in range(random.randint(3,5)):
        bx=gx+random.uniform(-3,3)
        b+=(f'<path d="M{bx:.1f},{gy:.1f} q{random.uniform(-2,2):.1f},'
            f'{-random.uniform(5,9):.1f} {random.uniform(-1.5,1.5):.1f},'
            f'{-random.uniform(7,11):.1f}" stroke="{col}" stroke-width="1.1" '
            f'fill="none" stroke-linecap="round" opacity="0.9"/>')
    tf.append(b)
add("".join(tf))

# ---- helper: ring of masonry blocks between r_in and r_out ----
def ring_blocks(cx, cy, r_in, r_out, block_w=22):
    parts=[]
    r_mid=(r_in+r_out)/2
    n=max(10, int(2*math.pi*r_mid/block_w))
    a0=random.uniform(0,0.3)
    for k in range(n):
        a=a0+2*math.pi*k/n
        b=a0+2*math.pi*(k+1)/n
        pad=0.02
        aa=a+pad; bb=b-pad
        ri=r_in+random.uniform(-1.2,1.2); ro=r_out+random.uniform(-1.5,1.5)
        pts=[(cx+ri*math.cos(aa),cy+ri*math.sin(aa)),
             (cx+ro*math.cos(aa),cy+ro*math.sin(aa)),
             (cx+ro*math.cos(bb),cy+ro*math.sin(bb)),
             (cx+ri*math.cos(bb),cy+ri*math.sin(bb))]
        pts=[(jitter(px,0.8),jitter(py,0.8)) for px,py in pts]
        d=(f"M{pts[0][0]:.1f},{pts[0][1]:.1f} Q{pts[1][0]:.1f},{pts[1][1]:.1f} "
           f"{(pts[1][0]+pts[2][0])/2:.1f},{(pts[1][1]+pts[2][1])/2:.1f} "
           f"L{pts[2][0]:.1f},{pts[2][1]:.1f} L{pts[3][0]:.1f},{pts[3][1]:.1f} Z")
        col=wpick(STONE_POOL)
        parts.append(P(d, col, STONE_INK, 0.9))
        # directional shade: dark on lower-left arc, light on upper-right
        mid=(a+b)/2
        dirx,diry=math.cos(mid),math.sin(mid)
        lit = (dirx - diry)   # +1 upper-right, -1 lower-left
        if lit < -0.35:
            parts.append(P(d, "#1a1408", None, 0, op=min(0.22,-lit*0.22)))
        elif lit > 0.5:
            parts.append(P(d, "#fff4d8", None, 0, op=lit*0.12))
    return "".join(parts)

def water_disk(cx, cy, r, glints=6, ripples=4):
    parts=[]
    # layered base fills
    parts.append(P(blob(cx,cy,r,11,0.05), WATER_POOL[1], WATER_INK, 1.3))
    parts.append(P(blob(cx,cy,r*0.82,11,0.06), WATER_POOL[0], None, 0, op=0.5))
    parts.append(P(blob(cx,cy,r*0.6,10,0.07), WATER_POOL[2], None, 0, op=0.45))
    # radial light/rim grad
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#waterGrad)"/>')
    # wet dark rim, heavier lower-left
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r-1.5}" fill="none" '
                 f'stroke="{WATER_INK}" stroke-width="3" opacity="0.35"/>')
    parts.append(f'<path d="M{cx+r*0.7:.1f},{cy+r*0.7:.1f} '
                 f'A{r-2},{r-2} 0 0 1 {cx-r*0.7:.1f},{cy+r*0.7:.1f}" '
                 f'fill="none" stroke="#173a42" stroke-width="4" opacity="0.4"/>')
    # ripple arcs (concentric, jittered)
    for i in range(ripples):
        rr=r*(0.30+0.16*i)+random.uniform(-2,2)
        a1=random.uniform(0.6,1.4); a2=a1+random.uniform(1.6,2.6)
        x1,y1=cx+rr*math.cos(a1),cy+rr*math.sin(a1)
        x2,y2=cx+rr*math.cos(a2),cy+rr*math.sin(a2)
        parts.append(f'<path d="M{x1:.1f},{y1:.1f} A{rr:.0f},{rr:.0f} 0 0 1 '
                     f'{x2:.1f},{y2:.1f}" fill="none" stroke="{WATER_HL}" '
                     f'stroke-width="1.2" opacity="0.5" stroke-linecap="round"/>')
    # highlight glints (upper-right, where the sun hits)
    for _ in range(glints):
        ga=random.uniform(-0.9,0.4)
        gr=r*random.uniform(0.25,0.72)
        gx=cx+gr*math.cos(ga); gy=cy+gr*math.sin(ga)-r*0.12
        parts.append(f'<ellipse cx="{gx:.1f}" cy="{gy:.1f}" '
                     f'rx="{random.uniform(2,5):.1f}" ry="{random.uniform(1,2):.1f}" '
                     f'fill="{WATER_HL}" opacity="0.7" '
                     f'transform="rotate({random.uniform(-30,10):.0f} {gx:.1f} {gy:.1f})"/>')
    return "".join(parts)

def moss_clump(cx, cy, r):
    parts=[P(blob(cx,cy,r,9,0.42), MOSS_BASE, MOSS_INK, 0.9)]
    for _ in range(int(r*1.3)):
        sx=cx+random.uniform(-r*0.9,r*0.9); sy=cy+random.uniform(-r*0.9,r*0.9)
        parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" '
                     f'r="{random.uniform(1.2,2.6):.1f}" fill="{wpick(MOSS_SPECK)}" opacity="0.9"/>')
    return "".join(parts)

# geometry (concentric)
R_OUT   = 172            # outer basin outer radius
R_WALL  = 27            # basin wall thickness
R_WATER = R_OUT - R_WALL # outer water radius (=145)
R_PLIN  = 50            # central plinth radius
R_UPWALL= 14           # upper basin wall thickness
R_UPOUT = R_PLIN - 6   # upper basin outer radius
R_UPWAT = R_UPOUT - R_UPWALL

# ================================================================ z1 CAST SHADOW (whole basin)
add(f'<ellipse cx="{CX-18:.0f}" cy="{CY+20:.0f}" rx="{R_OUT}" ry="{R_OUT*0.98:.0f}" '
    f'fill="{SHADOW_G}" opacity="0.33" filter="url(#soft)"/>')

# ================================================================ z2 OUTER BASIN RING
add(P(blob(CX,CY,R_OUT,20,0.02), STONE_BASE, INK, 2.0))          # base disk under ring
add(ring_blocks(CX, CY, R_WATER-2, R_OUT))                        # masonry ring
# bold outer silhouette + inner rim ink
add(f'<circle cx="{CX}" cy="{CY}" r="{R_OUT}" fill="none" stroke="{INK}" stroke-width="2.6"/>')
add(f'<circle cx="{CX}" cy="{CY}" r="{R_WATER-1}" fill="none" stroke="{STONE_INK}" stroke-width="1.4"/>')

# ================================================================ z3 OUTER WATER
add(water_disk(CX, CY, R_WATER-2, glints=8, ripples=5))

# ================================================================ z4 CENTRAL PLINTH (raised) + shadow on water
add(f'<ellipse cx="{CX-10:.0f}" cy="{CY+11:.0f}" rx="{R_PLIN}" ry="{R_PLIN*0.95:.0f}" '
    f'fill="{SHADOW_P}" opacity="0.34" filter="url(#soft)"/>')            # plinth shadow on water
add(P(blob(CX,CY,R_PLIN,16,0.03), STONE_BASE, INK, 1.8))
add(ring_blocks(CX, CY, R_PLIN*0.42, R_PLIN, block_w=17))              # plinth stonework
add(f'<circle cx="{CX}" cy="{CY}" r="{R_PLIN}" fill="none" stroke="{INK}" stroke-width="2.2"/>')

# ================================================================ z5 UPPER BASIN + WATER + SPOUT
add(P(blob(CX,CY,R_UPOUT,12,0.03), STONE_BASE, INK, 1.5))
add(ring_blocks(CX, CY, R_UPWAT-1, R_UPOUT, block_w=13))
add(f'<circle cx="{CX}" cy="{CY}" r="{R_UPOUT}" fill="none" stroke="{INK}" stroke-width="1.8"/>')
add(water_disk(CX, CY, R_UPWAT, glints=4, ripples=2))
# central spout knob + foam ring + falling-water glints
add(f'<circle cx="{CX}" cy="{CY}" r="6" fill="{STONE_POOL[3]}" stroke="{INK}" stroke-width="1.4"/>')
add(f'<circle cx="{CX-1:.0f}" cy="{CY-1:.0f}" r="3" fill="#fff4d8" opacity="0.35"/>')
for _ in range(10):
    fa=random.uniform(0,2*math.pi); fr=R_UPWAT*random.uniform(0.5,0.95)
    fx=CX+fr*math.cos(fa); fy=CY+fr*math.sin(fa)
    add(f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="{random.uniform(0.8,1.8):.1f}" '
        f'fill="{WATER_HL}" opacity="0.8"/>')
# foam ring where upper water overflows onto plinth edge
add(f'<circle cx="{CX}" cy="{CY}" r="{R_UPOUT+2}" fill="none" stroke="{WATER_HL}" '
    f'stroke-width="2" opacity="0.45" stroke-dasharray="3 4"/>')

# ================================================================ z6 OVERGROWTH moss on stone
# denser on shaded lower-left of both rings
for ang_deg in (150,168,196,214,232,120):
    a=math.radians(ang_deg+random.uniform(-8,8))
    r=R_OUT-random.uniform(3,10)
    add(moss_clump(CX+r*math.cos(a), CY+r*math.sin(a), random.uniform(6,11)))
for ang_deg in (160,205,140):
    a=math.radians(ang_deg+random.uniform(-10,10))
    add(moss_clump(CX+(R_PLIN-4)*math.cos(a), CY+(R_PLIN-4)*math.sin(a), random.uniform(4,7)))
# a little moss on the up-right too (sparser)
add(moss_clump(CX+R_OUT*math.cos(math.radians(-25)), CY+R_OUT*math.sin(math.radians(-25)), 5))

# wet darkening splash on stone around spill points
for ang_deg in (95,250,20):
    a=math.radians(ang_deg); r=R_WATER+random.uniform(4,12)
    add(P(blob(CX+r*math.cos(a),CY+r*math.sin(a),random.uniform(6,10),7,0.35),
          "#20454d", None, 0, op=0.16))

# ================================================================ z7 PROPS around the base
def plank(cx, cy, w, h, ang):
    g=f'<g transform="rotate({ang:.1f} {cx:.1f} {cy:.1f})">'
    g+=P(wrect(cx-w/2-3,cy-h/2+4,w,h,0.8,3), SHADOW_P, None,0,op=0.28,extra=' filter="url(#softP)"')
    g+=P(wrect(cx-w/2,cy-h/2,w,h,0.9,3), wpick(WOOD_POOL), WOOD_INK,1.2)
    for k in range(3):
        gy=cy-h/2+h*(k+1)/4
        g+=P(f"M{cx-w/2+3},{gy:.1f} L{cx+w/2-3},{gy:.1f}","none",WOOD_GRAIN,0.7,op=0.7)
    return g+"</g>"

def bucket(cx, cy, r):
    g=f'<ellipse cx="{cx-4:.1f}" cy="{cy+5:.1f}" rx="{r+2}" ry="{r*0.8:.1f}" fill="{SHADOW_P}" opacity="0.28" filter="url(#softP)"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{wpick(WOOD_POOL)}" stroke="{WOOD_INK}" stroke-width="1.3"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.66:.1f}" fill="#3a2c1a" stroke="{WOOD_INK}" stroke-width="0.9"/>'
    g+=f'<path d="M{cx-r:.1f},{cy:.1f} A{r},{r*0.6:.0f} 0 0 1 {cx+r:.1f},{cy:.1f}" fill="none" stroke="{WOOD_INK}" stroke-width="1.4"/>'
    return g

# bucket set on the basin rim (upper-left), planks & grass at base
add(bucket(CX-R_WATER+8, CY-R_WATER*0.5, 12))
add(plank(CX-R_OUT-6, CY+R_OUT*0.45, 44, 9, 70))
add(plank(CX+R_OUT+2, CY+R_OUT*0.2, 38, 8, 105))
for _ in range(5):
    a=math.radians(random.uniform(100,250)); r=R_OUT+random.uniform(6,20)
    add(moss_clump(CX+r*math.cos(a), CY+r*math.sin(a), random.uniform(4,7)))

# ================================================================ z8 global light overlay across the whole fountain
add(f'<circle cx="{CX}" cy="{CY}" r="{R_OUT}" fill="url(#lightOverlay)"/>')

add('</svg>')
svg="\n".join(out)
open("fountain.svg","w").write(svg)
print("pieces ~", svg.count("<path")+svg.count("<circle")+svg.count("<ellipse"))
print("bytes", len(svg))
