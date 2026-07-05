#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- dungeon room.
Flagstone floor + thick masonry walls with openings + three doors
(banded wooden door, open door to a corridor, portcullis). Dark void
outside the walls. One upper-right sun -> lower-left shadows/AO.
Shares palette/primitives with building/fountain/stall.
"""
import random, math

SEED = 31
random.seed(SEED)

W, H = 560, 540
JIT = 0.9

INK          = "#312619"
STONE_POOL   = ["#bdb7a6","#c6c0ae","#b2ac9a","#aaa392","#c8c2b0"]
FLOOR_POOL   = ["#b3ad9b","#bcb6a4","#a8a291","#c1bba9","#aea897"]  # floor slabs
STONE_INK    = "#4a4335"
MORTAR       = "#2a2318"
MOSS_BASE    = "#4f6a2c"
MOSS_INK     = "#33461f"
MOSS_SPECK   = ["#6f8a3f","#7f9a4d","#567a34"]
WOOD_POOL    = ["#8a5a2c","#7a4e26","#946534"]   # darker dungeon timber
WOOD_INK     = "#3a2614"
WOOD_GRAIN   = "#5a3f22"
IRON_POOL    = ["#3a3f44","#2f353a","#454b50"]
IRON_INK     = "#181b1e"
IRON_HL      = "#7d858c"
RUST         = "#7a4326"
WATER_POOL   = ["#3f6d78","#345a63"]
WATER_INK    = "#213c42"
WATER_HL     = "#9ec4c7"
BONE         = "#cbc3ab"
VOID         = "#141009"
SHADOW_P     = "#0d0a05"

def jitter(v,a=JIT): return v+random.uniform(-a,a)

def wrect(x,y,w,h,j=JIT,rnd=1.6):
    p=[(jitter(x,j),jitter(y,j)),(jitter(x+w,j),jitter(y,j)),
       (jitter(x+w,j),jitter(y+h,j)),(jitter(x,j),jitter(y+h,j))]
    r=rnd;d="";n=len(p)
    for i in range(n):
        x0,y0=p[i];x1,y1=p[(i+1)%n]
        dx,dy=x1-x0,y1-y0;L=math.hypot(dx,dy) or 1;ux,uy=dx/L,dy/L
        sx,sy=x0+ux*r,y0+uy*r;ex,ey=x1-ux*r,y1-uy*r
        d+=(f"M{sx:.1f},{sy:.1f} " if i==0 else f"Q{x0:.1f},{y0:.1f} {sx:.1f},{sy:.1f} ")
        d+=f"L{ex:.1f},{ey:.1f} "
    x0,y0=p[0];x1,y1=p[1];dx,dy=x1-x0,y1-y0;L=math.hypot(dx,dy) or 1
    d+=f"Q{x0:.1f},{y0:.1f} {x0+dx/L*r:.1f},{y0+dy/L*r:.1f} Z"
    return d

def blob(cx,cy,r,n=7,amp=0.32):
    pts=[]
    for i in range(n):
        ang=2*math.pi*i/n+random.uniform(-0.12,0.12)
        rr=r*(1+random.uniform(-amp,amp))
        pts.append((cx+rr*math.cos(ang),cy+rr*math.sin(ang)))
    d=""
    for i in range(n):
        x0,y0=pts[i];x1,y1=pts[(i+1)%n];mx,my=(x0+x1)/2,(y0+y1)/2
        if i==0:
            sx,sy=(pts[-1][0]+x0)/2,(pts[-1][1]+y0)/2;d+=f"M{sx:.1f},{sy:.1f} "
        d+=f"Q{x0:.1f},{y0:.1f} {mx:.1f},{my:.1f} "
    return d+"Z"

def P(d,fill,ink=INK,w=0.9,op=1.0,extra=""):
    o=f' opacity="{op}"' if op!=1.0 else ""
    st=(f' stroke="{ink}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'
        if ink else ' stroke="none"')
    return f'<path d="{d}" fill="{fill}"{st}{o}{extra}/>'

def wpick(p): return random.choice(p)

out=[]
def add(s): out.append(s)
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('<defs>')
add('<linearGradient id="lightOverlay" x1="1" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.09"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.20"/></linearGradient>')
add('<linearGradient id="aoBottom" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#0d0a05" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#0d0a05" stop-opacity="0.34"/></linearGradient>')
add('<linearGradient id="aoLeft" x1="0" y1="0" x2="1" y2="0">'
    '<stop offset="0" stop-color="#0d0a05" stop-opacity="0.30"/>'
    '<stop offset="1" stop-color="#0d0a05" stop-opacity="0"/></linearGradient>')
add('<radialGradient id="puddle" cx="0.6" cy="0.4" r="0.7">'
    '<stop offset="0" stop-color="#5f8b94" stop-opacity="0.5"/>'
    '<stop offset="1" stop-color="#213c42" stop-opacity="0.75"/></radialGradient>')
add('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>')
add('<filter id="softP" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.2"/></filter>')
add('</defs>')

# ---------- geometry ----------
WX0,WY0,WX1,WY1 = 64,56,496,452     # wall outer rect
T = 30                              # wall thickness
fx0,fy0,fx1,fy1 = WX0+T,WY0+T,WX1-T,WY1-T   # interior floor rect

# openings (full wall-thickness rects) + corridor stubs
op_bottom = (243,WY1-T-2,315,WY1+2)      # closed wooden door
st_bottom = (243,WY1-T,315,H)            # corridor stub down
op_right  = (WX1-T-2,196,WX1+2,268)      # open door -> corridor
st_right  = (WX1-T,196,W,268)            # corridor stub right
op_top    = (150,WY0-2,214,WY0+T+2)      # portcullis
st_top    = (150,0,214,WY0+T)            # short stub up

floor_rects = [(fx0,fy0,fx1,fy1),
               (243,fy1,315,H),          # bottom corridor floor
               (fx1,196,W,268),          # right corridor floor
               (150,0,214,fy0)]          # top gate threshold

def in_floor(x,y):
    for (a,b,c,d) in floor_rects:
        if a<=x<=c and b<=y<=d: return True
    return False

# ================================================================ z0 VOID BACKGROUND
add(f'<rect width="{W}" height="{H}" fill="{VOID}"/>')
for _ in range(60):   # faint texture in the void
    vx,vy=random.uniform(0,W),random.uniform(0,H)
    if in_floor(vx,vy): continue
    add(P(blob(vx,vy,random.uniform(6,16),7,0.4),"#0e0b06",None,0,op=0.5))

# ================================================================ z1 FLAGSTONE FLOOR
# mortar base under floor regions
for (a,b,c,d) in floor_rects:
    add(f'<rect x="{a}" y="{b}" width="{c-a}" height="{d-b}" fill="{MORTAR}"/>')
# big jittered slabs on a grid, only where in_floor
pitch=48
slabs=[]
yy=fy0-24; r=0
while yy < H:
    off=(pitch/2) if r%2 else 0
    xx=fx0-24+off
    while xx < W:
        cxp,cyp=xx+pitch/2, yy+pitch/2
        if in_floor(cxp,cyp):
            sw=pitch-random.uniform(4,7); sh=pitch-random.uniform(4,7)
            slabs.append(P(wrect(xx+2,yy+2,sw,sh,0.9,3), wpick(FLOOR_POOL), STONE_INK, 0.9))
        xx+=pitch
    yy+=pitch; r+=1
add("".join(slabs))

# floor weathering: cracks, worn path, stains, puddle, moss, rubble
# worn traffic path bottom-door -> right-door
add(P(f"M280,{fy1} C280,340 360,300 {fx1},232","none","#7a6f58",22,op=0.14))
add(P(f"M280,{fy1} C280,340 360,300 {fx1},232","none","#5a5040",10,op=0.12))
# cracks
for _ in range(10):
    cx,cy=random.uniform(fx0+20,fx1-20),random.uniform(fy0+20,fy1-20)
    dpath=f"M{cx:.0f},{cy:.0f} "
    for _ in range(random.randint(3,5)):
        cx+=random.uniform(-24,24);cy+=random.uniform(-24,24)
        dpath+=f"L{cx:.0f},{cy:.0f} "
    add(f'<path d="{dpath}" fill="none" stroke="#2a2318" stroke-width="{random.uniform(0.8,1.6):.1f}" opacity="0.5" stroke-linecap="round"/>')
# stains
for _ in range(7):
    sx,sy=random.uniform(fx0,fx1),random.uniform(fy0,fy1)
    add(P(blob(sx,sy,random.uniform(10,22),8,0.4),"#3a3020",None,0,op=0.12))

def moss_clump(cx,cy,r):
    parts=[P(blob(cx,cy,r,9,0.42),MOSS_BASE,MOSS_INK,0.9)]
    for _ in range(int(r*1.3)):
        sx=cx+random.uniform(-r*0.9,r*0.9);sy=cy+random.uniform(-r*0.9,r*0.9)
        parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{random.uniform(1.2,2.4):.1f}" fill="{wpick(MOSS_SPECK)}" opacity="0.9"/>')
    return "".join(parts)

# moss in shaded lower-left corner + along lower-left wall bases
add(moss_clump(fx0+16,fy1-14,14))
add(moss_clump(fx0+40,fy1-8,10))
add(moss_clump(fx0+10,fy1-46,9))
for _ in range(5):
    add(moss_clump(random.uniform(fx0+6,fx0+90),random.uniform(fy1-70,fy1-6),random.uniform(5,8)))
# puddle in the low corner
pcx,pcy=fx0+70,fy1-40
add(f'<ellipse cx="{pcx}" cy="{pcy}" rx="34" ry="20" fill="url(#puddle)" stroke="{WATER_INK}" stroke-width="1.4"/>')
add(f'<path d="M{pcx-18},{pcy+2} A30,16 0 0 0 {pcx+16},{pcy+8}" fill="none" stroke="{WATER_HL}" stroke-width="1" opacity="0.5"/>')
add(f'<ellipse cx="{pcx+8}" cy="{pcy-6}" rx="5" ry="2" fill="{WATER_HL}" opacity="0.6"/>')

# ================================================================ z2 INNER WALL AO (raised walls shade the floor)
add(f'<rect x="{fx0}" y="{fy1-46}" width="{fx1-fx0}" height="46" fill="url(#aoBottom)"/>')
add(f'<rect x="{fx0}" y="{fy0}" width="46" height="{fy1-fy0}" fill="url(#aoLeft)"/>')
# subtle light rim on the up-right inner edges
add(P(f"M{fx1},{fy0} L{fx1},{fy1}","none","#fff4d8",2,op=0.10))
add(P(f"M{fx0},{fy0} L{fx1},{fy0}","none","#fff4d8",2,op=0.08))

# ================================================================ z3 MASONRY WALLS (with openings)
def masonry_fill(x0,y0,x1,y1,skip=(),ch=15):
    parts=[];yy=y0;r=0
    while yy<y1-1:
        h=min(ch,y1-yy); off=random.uniform(8,16) if r%2 else 0; xx=x0-off
        while xx<x1-1:
            bw=random.uniform(18,30); bx0=max(xx,x0); bx1=min(xx+bw,x1); w=bx1-bx0
            cxp,cyp=(bx0+bx1)/2, yy+h/2
            sk=any(a<=cxp<=c and b<=cyp<=d for (a,b,c,d) in skip)
            if not sk and w>3 and h>3:
                parts.append(P(wrect(bx0,yy,w,h,0.8,1.4),wpick(STONE_POOL),STONE_INK,0.9))
            xx+=bw
        yy+=ch;r+=1
    return "".join(parts)

add(P(wrect(WX0,WY0,WX1-WX0,WY1-WY0,0.9,3),"#a59f8e",INK,1.2))  # wall base
add(masonry_fill(WX0,WY0,WX1,WY0+T,skip=[op_top]))                 # top
add(masonry_fill(WX0,WY1-T,WX1,WY1,skip=[op_bottom]))              # bottom
add(masonry_fill(WX0,WY0+T,WX0+T,WY1-T))                           # left
add(masonry_fill(WX1-T,WY0+T,WX1,WY1-T,skip=[op_right]))           # right

# reveal depth inside each opening (dark inner jamb, heavier lower-left)
def reveal(a,b,c,d):
    return (P(wrect(a,b,c-a,d-b,0.6,2),"none",None,0)  # placeholder no-op
            )
# dark threshold + jamb shadows for openings
for (a,b,c,d) in (op_bottom,op_right,op_top):
    add(f'<rect x="{a}" y="{b}" width="{c-a}" height="{d-b}" fill="#0e0b06" opacity="0.0"/>')

# wall shading: light up-right outer edge, dark down-left
add(P(f"M{WX0},{WY0} L{WX1},{WY0}","none","#fff4d8",2.2,op=0.16))
add(P(f"M{WX1},{WY0} L{WX1},{WY1}","none","#fff4d8",2.2,op=0.14))
add(P(f"M{WX0},{WY1} L{WX1},{WY1}","none","#0d0a05",2.6,op=0.30))
add(P(f"M{WX0},{WY0} L{WX0},{WY1}","none","#0d0a05",2.4,op=0.26))
# inner wall edge ink
add(P(wrect(fx0,fy0,fx1-fx0,fy1-fy0,0.6,3),"none",STONE_INK,1.4))
# moss on shaded walls
add(moss_clump(WX0+8,WY1-16,10))
add(moss_clump(WX0+T*0.5,fy1*0.7,8))
for _ in range(4):
    add(moss_clump(random.uniform(WX0+4,WX0+T),random.uniform(fy0+40,WY1-30),random.uniform(4,7)))

# ================================================================ z4 DOORS
def studs(x0,y0,x1,y1,n):
    g=""
    for i in range(n):
        t=(i+0.5)/n
        sx=x0+(x1-x0)*t; sy=y0+(y1-y0)*t
        g+=f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="2.1" fill="#23262a" stroke="{IRON_INK}" stroke-width="0.6"/>'
        g+=f'<circle cx="{sx-0.6:.1f}" cy="{sy-0.6:.1f}" r="0.8" fill="{IRON_HL}" opacity="0.7"/>'
    return g

def iron_band(x,y,w,h):
    g=P(wrect(x,y,w,h,0.5,1.5),wpick(IRON_POOL),IRON_INK,1.0)
    g+=P(f"M{x+2},{y+1.4} L{x+w-2},{y+1.4}","none",IRON_HL,0.8,op=0.5)
    return g

# --- closed banded wooden door (bottom) ---
a,b,c,d=op_bottom; ow=c-a
dl_x, dl_w = a+4, ow-8
dl_y, dl_h = WY1-T+4, T-8
add(P(wrect(dl_x-4,dl_y+5,dl_w,dl_h,0.7,2),SHADOW_P,None,0,op=0.30,extra=' filter="url(#softP)"'))
add(P(wrect(dl_x,dl_y,dl_w,dl_h,0.8,2.5),wpick(WOOD_POOL),WOOD_INK,1.5))
np_=5
for k in range(np_):   # vertical planks
    px=dl_x+dl_w/np_*k
    add(P(f"M{jitter(px):.1f},{dl_y+2} L{jitter(px):.1f},{dl_y+dl_h-2}","none",WOOD_GRAIN,0.9,op=0.7))
add(iron_band(dl_x-1,dl_y+dl_h*0.18,dl_w+2,4))
add(iron_band(dl_x-1,dl_y+dl_h*0.62,dl_w+2,4))
add(studs(dl_x+3,dl_y+dl_h*0.18+2,dl_x+dl_w-3,dl_y+dl_h*0.18+2,6))
add(studs(dl_x+3,dl_y+dl_h*0.62+2,dl_x+dl_w-3,dl_y+dl_h*0.62+2,6))
# ring handle
add(f'<circle cx="{dl_x+dl_w*0.5:.1f}" cy="{dl_y+dl_h*0.5:.1f}" r="4.5" fill="none" stroke="{IRON_POOL[0]}" stroke-width="2"/>')
# stone jambs (lintel darks at the sides) + inner reveal shadow lower-left
add(P(f"M{a},{b} L{a},{d}","none","#0d0a05",2,op=0.4))
add(P(f"M{c},{b} L{c},{d}","none","#0d0a05",2,op=0.3))

# --- open door into corridor (right) ---
a,b,c,d=op_right
# dark threshold showing corridor beyond
add(f'<rect x="{a}" y="{b+3}" width="{c-a}" height="{d-b-6}" fill="#100c07" opacity="0.55"/>')
# door leaf swung open along the lower corridor wall
hx,hy=WX1-2, d-2         # hinge at lower jamb
lw,lh=60,12
add(f'<g transform="rotate(-18 {hx} {hy})">')
add(P(wrect(hx,hy-lh,lw,lh,0.8,2),SHADOW_P,None,0,op=0.28,extra=' filter="url(#softP)"'))
add(P(wrect(hx,hy-lh-3,lw,lh,0.8,2.5),wpick(WOOD_POOL),WOOD_INK,1.5))
for k in range(4):
    px=hx+lw/4*k+4
    add(P(f"M{px:.1f},{hy-lh-2} L{px:.1f},{hy-4}","none",WOOD_GRAIN,0.9,op=0.7))
add(iron_band(hx+2,hy-lh-2,4,lh))
add(iron_band(hx+lw*0.7,hy-lh-2,4,lh))
add('</g>')
# jamb darks
add(P(f"M{a},{b} L{c},{b}","none","#0d0a05",2,op=0.4))
add(P(f"M{a},{d} L{c},{d}","none","#0d0a05",2,op=0.3))

# --- portcullis (top) ---
a,b,c,d=op_top
add(f'<rect x="{a}" y="{b+2}" width="{c-a}" height="{d-b-4}" fill="#0c0906" opacity="0.7"/>')  # dark behind
nbars=6
for k in range(nbars):
    bx=a+4+(c-a-8)/(nbars-1)*k
    add(P(wrect(bx-2.2,b+2,4.4,d-b-4,0.4,1.8),wpick(IRON_POOL),IRON_INK,1.0))
    add(P(f"M{bx-1:.1f},{b+3} L{bx-1:.1f},{d-3}","none",IRON_HL,0.7,op=0.4))
for hy in (b+ (d-b)*0.30, b+(d-b)*0.72):   # crossbars
    add(P(wrect(a+3,hy,c-a-6,4,0.4,1.5),wpick(IRON_POOL),IRON_INK,1.0))
# rust + moss on the gate
for _ in range(8):
    rx,ry=random.uniform(a+4,c-4),random.uniform(b+4,d-4)
    add(f'<circle cx="{rx:.1f}" cy="{ry:.1f}" r="{random.uniform(1,2.4):.1f}" fill="{RUST}" opacity="0.4"/>')
add(moss_clump(a+6,d-4,6))
# jamb darks
add(P(f"M{a},{b} L{a},{d}","none","#0d0a05",2,op=0.4))
add(P(f"M{c},{b} L{c},{d}","none","#0d0a05",2,op=0.3))

# ================================================================ z5 PROPS / DEBRIS
def tshadow(x,y,w,h,dx=-4,dy=5):
    return P(wrect(x+dx,y+dy,w,h,0.8,3),SHADOW_P,None,0,op=0.30,extra=' filter="url(#softP)"')

def barrel(cx,cy,r):
    g=f'<ellipse cx="{cx-4:.1f}" cy="{cy+5:.1f}" rx="{r+2}" ry="{r*0.85:.1f}" fill="{SHADOW_P}" opacity="0.32" filter="url(#softP)"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{wpick(WOOD_POOL)}" stroke="{WOOD_INK}" stroke-width="1.4"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.62:.1f}" fill="none" stroke="{WOOD_INK}" stroke-width="1" opacity="0.7"/>'
    g+=f'<circle cx="{cx-r*0.3:.1f}" cy="{cy-r*0.3:.1f}" r="{r*0.22:.1f}" fill="#fff4d8" opacity="0.16"/>'
    return g

def crate(cx,cy,s,broken=False):
    g=tshadow(cx-s/2,cy-s/2,s,s)
    g+=P(wrect(cx-s/2,cy-s/2,s,s,0.9,3),wpick(WOOD_POOL),WOOD_INK,1.4)
    g+=P(wrect(cx-s/2+3,cy-s/2+3,s-6,s-6,0.7,2),"none",WOOD_INK,0.9,op=0.6)
    g+=P(f"M{cx-s/2+3},{cy-s/2+3} L{cx+s/2-3},{cy+s/2-3}","none",WOOD_GRAIN,0.9,op=0.5)
    if broken:
        g+=P(f"M{cx+s/2},{cy-s/4} L{cx+s/2+8},{cy}","none",WOOD_INK,1.2)
    return g

def bones(cx,cy):
    g=""
    # skull
    g+=f'<ellipse cx="{cx-3:.1f}" cy="{cy+3:.1f}" rx="8" ry="7" fill="{SHADOW_P}" opacity="0.25" filter="url(#softP)"/>'
    g+=P(blob(cx,cy,7,8,0.18),BONE,"#6f6749",1.1)
    g+=f'<circle cx="{cx-2.5:.1f}" cy="{cy-1:.1f}" r="1.6" fill="#3a3020"/>'
    g+=f'<circle cx="{cx+2.5:.1f}" cy="{cy-1:.1f}" r="1.6" fill="#3a3020"/>'
    g+=f'<path d="M{cx-2:.1f},{cy+4:.1f} L{cx+2:.1f},{cy+4:.1f}" stroke="#3a3020" stroke-width="1"/>'
    # a couple ribs/long bones nearby
    for _ in range(3):
        bx,by=cx+random.uniform(10,22),cy+random.uniform(-8,14)
        ang=random.uniform(-40,40)
        g+=(f'<g transform="rotate({ang:.0f} {bx:.0f} {by:.0f})">'
            f'<rect x="{bx:.0f}" y="{by:.0f}" width="14" height="3.4" rx="1.7" '
            f'fill="{BONE}" stroke="#6f6749" stroke-width="0.8"/>'
            f'<circle cx="{bx:.0f}" cy="{by+1.7:.0f}" r="2.2" fill="{BONE}" stroke="#6f6749" stroke-width="0.8"/>'
            f'<circle cx="{bx+14:.0f}" cy="{by+1.7:.0f}" r="2.2" fill="{BONE}" stroke="#6f6749" stroke-width="0.8"/></g>')
    return g

def chain(x0,y0,x1,y1,n=9):
    g=""
    for i in range(n):
        t=i/(n-1); cx=x0+(x1-x0)*t+random.uniform(-2,2); cy=y0+(y1-y0)*t+random.uniform(-2,2)
        g+=f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="3.4" ry="2.2" fill="none" stroke="{IRON_POOL[0]}" stroke-width="1.6" transform="rotate({45 if i%2 else -45} {cx:.1f} {cy:.1f})"/>'
    return g

# place props (avoid door thresholds & path)
add(barrel(fx0+34,fy0+34,15))
add(barrel(fx0+58,fy0+30,12))
add(crate(fx0+40,fy0+72,30))
add(crate(fx1-46,fy1-44,28,broken=True))
add(bones(fx0+150,fy1-70))
add(chain(fx1-30,fy0+30,fx1-70,fy0+64))
# scattered rubble
for _ in range(9):
    rx,ry=random.uniform(fx0+10,fx1-10),random.uniform(fy0+10,fy1-10)
    if abs(ry-fy1)<24 and 240<rx<320: continue
    add(P(blob(rx,ry,random.uniform(4,8),6,0.4),wpick(STONE_POOL),STONE_INK,1.0))

# ================================================================ z6 GLOBAL LIGHT + SILHOUETTE
add(f'<rect x="{fx0}" y="{fy0}" width="{fx1-fx0}" height="{fy1-fy0}" fill="url(#lightOverlay)"/>')
add(P(wrect(WX0,WY0,WX1-WX0,WY1-WY0,0.8,3),"none",INK,2.8))

add('</svg>')
svg="\n".join(out)
open("dungeon.svg","w").write(svg)
print("pieces ~", svg.count("<path")+svg.count("<circle")+svg.count("<ellipse")+svg.count("<rect"))
print("bytes", len(svg))
