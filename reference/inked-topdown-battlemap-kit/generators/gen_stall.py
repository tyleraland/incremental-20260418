#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- market stall.
Shares constants/palette/primitives with building + fountain assets.
Four timber posts, striped canvas awning (scalloped sagging front + underside
shadow), plank counter with goods. One upper-right sun -> lower-left shadows.
"""
import random, math

SEED = 23
random.seed(SEED)

W, H = 360, 340
JIT = 0.9
CELL = 26

INK          = "#312619"
GROUND_COBB  = "#c9c4b4"
COBB_POOL    = ["#c6c0ae","#cfcabb","#bdb7a6","#d3cdbe","#c0baa8"]
COBB_INK     = "#a49d8b"
STONE_POOL   = ["#bdb7a6","#c6c0ae","#b2ac9a","#aaa392","#c8c2b0"]
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
# bright-but-weathered goods
PRODUCE      = ["#b0553a","#c47a2c","#d9b23a","#5a7a4c","#7f9a4d","#8f4028","#9a5aa0","#c98a3a"]
SACK_POOL    = ["#c9b98a","#bfaa78","#d3c39a"]

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

def wpick(pool): return random.choice(pool)

out=[]
def add(s): out.append(s)
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('<defs>')
add('<linearGradient id="lightOverlay" x1="1" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.12"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.18"/></linearGradient>')
# awning front-sag darkening (top lit, front edge shaded)
add('<linearGradient id="awnShade" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.55" stop-color="#1a1408" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#1a1408" stop-opacity="0.22"/></linearGradient>')
add('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%">'
    '<feGaussianBlur stdDeviation="5"/></filter>')
add('<filter id="softP" x="-70%" y="-70%" width="240%" height="240%">'
    '<feGaussianBlur stdDeviation="2.2"/></filter>')
add('</defs>')

# ================================================================ z0 GROUND
add(f'<rect width="{W}" height="{H}" fill="{GROUND_COBB}"/>')
cob=[];row=0;y=-CELL/2
while y<H+CELL:
    xoff=(CELL/2) if row%2 else 0;x=-CELL/2+xoff
    while x<W+CELL:
        cob.append(P(blob(x+jitter(0,5),y+jitter(0,5),CELL*0.60,7,0.30),
                     wpick(COBB_POOL),COBB_INK,0.9))
        x+=CELL
    y+=CELL*0.86;row+=1
add("".join(cob))
tf=[]
for _ in range(55):
    gx,gy=random.uniform(0,W),random.uniform(0,H);col=wpick(GRASS_POOL);b=""
    for _ in range(random.randint(3,5)):
        bx=gx+random.uniform(-3,3)
        b+=(f'<path d="M{bx:.1f},{gy:.1f} q{random.uniform(-2,2):.1f},'
            f'{-random.uniform(5,9):.1f} {random.uniform(-1.5,1.5):.1f},'
            f'{-random.uniform(7,11):.1f}" stroke="{col}" stroke-width="1.1" '
            f'fill="none" stroke-linecap="round" opacity="0.9"/>')
    tf.append(b)
add("".join(tf))

# ---------- helpers ----------
def timber_shadow(x,y,w,h,dx=-5,dy=5):
    return P(wrect(x+dx,y+dy,w,h,0.8,3), SHADOW_P, None,0,op=0.28,extra=' filter="url(#softP)"')

def post(cx,cy,s=17):
    """top-down timber post: shadow + square + inset cap ring + up-right highlight."""
    g=timber_shadow(cx-s/2,cy-s/2,s,s,-6,6)
    col=wpick(WOOD_POOL)
    g+=P(wrect(cx-s/2,cy-s/2,s,s,0.8,3),col,WOOD_INK,1.3)
    g+=P(wrect(cx-s/2+3,cy-s/2+3,s-6,s-6,0.6,2),"none",WOOD_INK,0.9,op=0.6)
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="2.2" fill="{WOOD_GRAIN}" opacity="0.7"/>'
    g+=P(f"M{cx+s/2-1},{cy-s/2} L{cx+s/2-1},{cy+s/2}","none","#fff4d8",1.4,op=0.22)
    return g

def moss_clump(cx,cy,r):
    parts=[P(blob(cx,cy,r,9,0.42),MOSS_BASE,MOSS_INK,0.9)]
    for _ in range(int(r*1.3)):
        sx=cx+random.uniform(-r*0.9,r*0.9);sy=cy+random.uniform(-r*0.9,r*0.9)
        parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{random.uniform(1.2,2.4):.1f}" '
                     f'fill="{wpick(MOSS_SPECK)}" opacity="0.9"/>')
    return "".join(parts)

# ---------- stall geometry ----------
AX, AY = 70, 66            # awning top-left
AW, AD = 210, 118         # awning width / depth
CX = AX+AW/2
CTY = AY+AD               # counter top edge (front of awning)
CD  = 40                  # counter depth (sticks out toward viewer)
posts = [(AX+10,AY+8),(AX+AW-10,AY+8),(AX+10,CTY-6),(AX+AW-10,CTY-6)]

# ================================================================ z1 CAST SHADOW (whole stall, lower-left)
d=(f"M{AX+6},{AY+4} L{AX+AW+4},{AY+2} L{AX+AW+4},{CTY+CD-6} "
   f"L{AX+AW-14},{CTY+CD+16} L{AX-18},{CTY+CD+16} L{AX-18},{AY+18} Z")
add(P(d,SHADOW_G,None,0,op=0.32,extra=' filter="url(#soft)"'))

# ================================================================ z2 BACK POSTS + COUNTER + GOODS
# back posts (covered partly by awning later)
add(post(*posts[0])); add(post(*posts[1]))

# plank counter (front strip) : horizontal planks
add(timber_shadow(AX+6,CTY,AW-12,CD,-6,7))
counter=[]
counter.append(P(wrect(AX+6,CTY,AW-12,CD,0.9,3),wpick(WOOD_POOL),WOOD_INK,1.4))
pn=4
for k in range(pn):
    py=CTY+ (CD/pn)*k
    counter.append(P(wrect(AX+8,py+1,AW-16,CD/pn-1.5,0.7,2),wpick(WOOD_POOL),WOOD_INK,1.0))
add("".join(counter))
# counter edge shading
add(P(f"M{AX+6},{CTY+CD} L{AX+AW-6},{CTY+CD}","none","#1a1408",2.2,op=0.22))
add(P(f"M{AX+AW-6},{CTY} L{AX+AW-6},{CTY+CD}","none","#fff4d8",1.6,op=0.20))

# goods on the counter
def produce_pile(cx,cy,rad,cols,count=9):
    g=""
    for _ in range(count):
        a=random.uniform(0,2*math.pi);rr=random.uniform(0,rad)
        px=cx+rr*math.cos(a);py=cy+rr*math.sin(a)*0.7
        pr=random.uniform(3.2,5.2);col=random.choice(cols)
        g+=f'<circle cx="{px:.1f}" cy="{py+2:.1f}" r="{pr:.1f}" fill="{SHADOW_P}" opacity="0.22"/>'
        g+=f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{pr:.1f}" fill="{col}" stroke="{INK}" stroke-width="0.8"/>'
        g+=f'<circle cx="{px-pr*0.3:.1f}" cy="{py-pr*0.3:.1f}" r="{pr*0.3:.1f}" fill="#fff4d8" opacity="0.35"/>'
    return g

def crate_of(cx,cy,s,cols):
    g=timber_shadow(cx-s/2,cy-s/2,s,s,-4,5)
    g+=P(wrect(cx-s/2,cy-s/2,s,s,0.8,2.5),wpick(WOOD_POOL),WOOD_INK,1.3)
    g+=P(wrect(cx-s/2+2.5,cy-s/2+2.5,s-5,s-5,0.6,2),"#3a2c1a",WOOD_INK,0.9)
    g+=produce_pile(cx,cy,s*0.34,cols,count=7)
    return g

def sack(cx,cy,r):
    g=f'<ellipse cx="{cx-3:.1f}" cy="{cy+4:.1f}" rx="{r+1}" ry="{r*0.8:.1f}" fill="{SHADOW_P}" opacity="0.25" filter="url(#softP)"/>'
    g+=P(blob(cx,cy+2,r,8,0.22),wpick(SACK_POOL),"#8a7a4a",1.2)
    # cinched top
    g+=P(blob(cx,cy-r*0.7,r*0.42,7,0.3),wpick(SACK_POOL),"#8a7a4a",1.0)
    g+=f'<path d="M{cx-r*0.4:.1f},{cy-r*0.5:.1f} Q{cx:.1f},{cy-r*0.9:.1f} {cx+r*0.4:.1f},{cy-r*0.5:.1f}" fill="none" stroke="#8a7a4a" stroke-width="1"/>'
    g+=f'<circle cx="{cx-r*0.35:.1f}" cy="{cy-r*0.2:.1f}" r="{r*0.28:.1f}" fill="#fff4d8" opacity="0.14"/>'
    return g

goods=""
goods+=crate_of(AX+40,CTY+CD*0.42,30,["#b0553a","#8f4028","#c47a2c"])       # apples/tomatoes
goods+=crate_of(AX+AW-46,CTY+CD*0.44,28,["#5a7a4c","#6f8a3f","#7f9a4d"])    # greens
goods+=produce_pile(CX-6,CTY+CD*0.4,22,["#c47a2c","#d9b23a","#c98a3a"],11)  # loose citrus
goods+=sack(AX+18,CTY+CD*0.5,12)
goods+=sack(AX+AW-16,CTY+CD*0.52,11)
add(goods)

# ================================================================ z3 AWNING (striped canvas) over the back
# base under-awning shadow strip on the counter/back (underside shadow)
add(P(wrect(AX+6,CTY-10,AW-12,14,0.8,3),"#1a1408",None,0,op=0.20,extra=' filter="url(#softP)"'))

# stripes: vertical bands across the awning
add(P(wrect(AX,AY,AW,AD,0.9,4),CANVAS_POOL[1],INK,1.6))   # base
nb=9
bw=AW/nb
stripes=[]
for k in range(nb):
    col=CANVAS_POOL[0] if k%2==0 else CANVAS_POOL[1]
    if random.random()<0.14: col=random.choice(CANVAS_POOL[2:])
    x0=AX+bw*k
    stripes.append(P(wrect(x0,AY+1,bw,AD-1,0.7,1.5),col,None,0,op=0.96))
add("".join(stripes))
# thin ink seams between stripes
for k in range(1,nb):
    x0=AX+bw*k
    add(P(f"M{jitter(x0):.1f},{AY+2} L{jitter(x0):.1f},{CTY-2}","none",INK,0.7,op=0.5))

# top ridge line of the awning (crease) + up-right lit rim
add(P(f"M{AX+4},{AY+AD*0.30:.0f} Q{CX:.0f},{AY+AD*0.24:.0f} {AX+AW-4},{AY+AD*0.30:.0f}",
      "none","#fff4d8",1.6,op=0.30))
# shading gradients: front sag dark + global light
add(f'<rect x="{AX}" y="{AY}" width="{AW}" height="{AD}" fill="url(#awnShade)"/>')

# scalloped sagging front valance (each scallop alternating stripe color)
val=[]
ns=nb
for k in range(ns):
    x0=AX+bw*k; x1=x0+bw
    col=CANVAS_POOL[0] if k%2==0 else CANVAS_POOL[1]
    sag=random.uniform(12,18)
    mid=(x0+x1)/2
    dd=(f"M{x0:.1f},{CTY-1:.1f} "
        f"Q{mid:.1f},{CTY+sag:.1f} {x1:.1f},{CTY-1:.1f} Z")
    val.append(P(dd,col,INK,1.0))
    # tiny shadow the scallop drops
    val.append(f'<path d="M{x0+2:.1f},{CTY+sag*0.4:.1f} Q{mid:.1f},{CTY+sag+3:.1f} '
               f'{x1-2:.1f},{CTY+sag*0.4:.1f}" fill="none" stroke="#1a1408" '
               f'stroke-width="1.4" opacity="0.18"/>')
add("".join(val))
# awning outline silhouette
add(P(wrect(AX,AY,AW,AD,0.9,4),"none",INK,2.4))

# ================================================================ z4 FRONT POSTS (hold the awning front)
add(post(*posts[2])); add(post(*posts[3]))

# ================================================================ z5 OVERGROWTH + WEATHERING
# moss on shaded lower-left post + awning corner, a patch/stain on canvas
add(moss_clump(posts[2][0]-6,posts[2][1]+8,7))
add(moss_clump(AX+4,CTY-6,6))
add(P(blob(AX+bw*1.4,AY+AD*0.5,10,7,0.4),"#7a3826",None,0,op=0.16))  # canvas stain
add(P(blob(AX+bw*6.5,AY+AD*0.35,8,7,0.4),"#1a1408",None,0,op=0.10))
# a loose plank dropped on the awning
def plank(cx,cy,w,h,ang):
    g=f'<g transform="rotate({ang:.1f} {cx:.1f} {cy:.1f})">'
    g+=timber_shadow(cx-w/2,cy-h/2,w,h,-3,4)
    g+=P(wrect(cx-w/2,cy-h/2,w,h,0.9,3),wpick(WOOD_POOL),WOOD_INK,1.2)
    for k in range(3):
        gy=cy-h/2+h*(k+1)/4
        g+=P(f"M{cx-w/2+3},{gy:.1f} L{cx+w/2-3},{gy:.1f}","none",WOOD_GRAIN,0.7,op=0.7)
    return g+"</g>"
add(plank(AX+AW*0.62,AY+AD*0.5,52,9,-14))

# ================================================================ z6 SIDE PROPS (tie to the map)
def barrel(cx,cy,r):
    g=f'<ellipse cx="{cx-4:.1f}" cy="{cy+5:.1f}" rx="{r+2}" ry="{r*0.85:.1f}" fill="{SHADOW_P}" opacity="0.28" filter="url(#softP)"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{wpick(WOOD_POOL)}" stroke="{WOOD_INK}" stroke-width="1.3"/>'
    g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.62:.1f}" fill="none" stroke="{WOOD_INK}" stroke-width="1" opacity="0.7"/>'
    g+=f'<circle cx="{cx-r*0.3:.1f}" cy="{cy-r*0.3:.1f}" r="{r*0.22:.1f}" fill="#fff4d8" opacity="0.18"/>'
    return g
add(barrel(AX-18,CTY+CD-6,14))
add(barrel(AX-30,CTY+CD-30,11))
add(crate_of(AX+AW+22,CTY+CD-14,26,["#c47a2c","#b0553a","#d9b23a"]))
for _ in range(4):
    add(moss_clump(AX-24+random.uniform(-6,6),CTY+CD+random.uniform(2,14),random.uniform(4,6)))

# ================================================================ z7 global light overlay
add(f'<rect x="{AX-4}" y="{AY-4}" width="{AW+8}" height="{CD+AD+CD}" fill="url(#lightOverlay)" opacity="0.7"/>')

add('</svg>')
svg="\n".join(out)
open("stall.svg","w").write(svg)
print("pieces ~", svg.count("<path")+svg.count("<circle")+svg.count("<ellipse"))
print("bytes", len(svg))
