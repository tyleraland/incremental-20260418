#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- dense forest.
Grass/dirt floor + many overlapping top-down tree canopies (layered blob
clusters, lit upper-right, soft lower-left shadows) + a small clearing with
understory (fallen log, rocks, ferns, mushrooms, litter, dappled light).
Shares palette/primitives with the rest of the collection.
"""
import random, math

SEED = 42
random.seed(SEED)

W, H = 560, 520
JIT = 0.9

INK        = "#312619"
# forest foliage greens (match moss greens of the world)
G_DARK     = "#2f4a1e"
G_MIDS     = ["#4f6a2c","#456019","#567a34","#3f5a22"]
G_LIGHTS   = ["#6f8a3f","#7f9a4d","#86a24f","#94ac57"]
G_INK      = "#243a16"
# ground
GRASS_BASE = "#4b652a"
GRASS_POOL = ["#4f6a2c","#456019","#567a34","#3f5a22","#5c7a30"]
DIRT_POOL  = ["#8a6a40","#7c5e38","#96784a","#6e5230"]
DIRT_INK   = "#4a3822"
# props
STONE_POOL = ["#b2ac9a","#aaa392","#bdb7a6","#9c9584"]
STONE_INK  = "#4a4335"
WOOD_POOL  = ["#8a5a2c","#7a4e26","#946534"]
WOOD_INK   = "#3a2614"
WOOD_GRAIN = "#5a3f22"
MOSS_BASE  = "#4f6a2c"
MOSS_INK   = "#33461f"
MOSS_SPECK = ["#6f8a3f","#7f9a4d","#567a34"]
MUSH_RED   = "#b0402f"
MUSH_TAN   = "#c8a56a"
LITTER     = ["#a9642f","#b8863a","#8a5a2c","#c19a4a","#7a4e26"]
SHADOW     = "#1c2a12"      # cool-dark forest shadow

def jitter(v,a=JIT): return v+random.uniform(-a,a)

def blob(cx,cy,r,n=8,amp=0.34):
    pts=[]
    for i in range(n):
        ang=2*math.pi*i/n+random.uniform(-0.14,0.14)
        rr=r*(1+random.uniform(-amp,amp))
        pts.append((cx+rr*math.cos(ang),cy+rr*math.sin(ang)))
    d=""
    for i in range(n):
        x0,y0=pts[i];x1,y1=pts[(i+1)%n];mx,my=(x0+x1)/2,(y0+y1)/2
        if i==0:
            sx,sy=(pts[-1][0]+x0)/2,(pts[-1][1]+y0)/2;d+=f"M{sx:.1f},{sy:.1f} "
        d+=f"Q{x0:.1f},{y0:.1f} {mx:.1f},{my:.1f} "
    return d+"Z"

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
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#0e1a08" stop-opacity="0.22"/></linearGradient>')
add('<radialGradient id="dapple" cx="0.5" cy="0.5" r="0.5">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.30"/>'
    '<stop offset="1" stop-color="#fff4d8" stop-opacity="0"/></radialGradient>')
add('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>')
add('<filter id="softP" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.4"/></filter>')
add('</defs>')

# clearing region (ellipse, lower-middle) -- kept free of trees
Ccx,Ccy,Crx,Cry = 300,362,128,86
def in_clearing(x,y,scale=1.0):
    return ((x-Ccx)/(Crx*scale))**2 + ((y-Ccy)/(Cry*scale))**2 < 1

# ================================================================ z0 GROUND grass/dirt
add(f'<rect width="{W}" height="{H}" fill="{GRASS_BASE}"/>')
# grass blob patches for texture
patches=[]
for _ in range(220):
    gx,gy=random.uniform(0,W),random.uniform(0,H)
    patches.append(P(blob(gx,gy,random.uniform(10,26),7,0.4),wpick(GRASS_POOL),None,0,op=0.55))
add("".join(patches))
# dirt patches, denser in the clearing
dirt=[]
for _ in range(60):
    if random.random()<0.6:
        gx=Ccx+random.uniform(-Crx,Crx); gy=Ccy+random.uniform(-Cry,Cry)
    else:
        gx,gy=random.uniform(0,W),random.uniform(0,H)
    dirt.append(P(blob(gx,gy,random.uniform(8,22),7,0.42),wpick(DIRT_POOL),None,0,op=0.5))
add("".join(dirt))
# blade tufts everywhere
tufts=[]
for _ in range(160):
    gx,gy=random.uniform(0,W),random.uniform(0,H);col=wpick(GRASS_POOL);b=""
    for _ in range(random.randint(3,5)):
        bx=gx+random.uniform(-3,3)
        b+=(f'<path d="M{bx:.1f},{gy:.1f} q{random.uniform(-2,2):.1f},'
            f'{-random.uniform(5,10):.1f} {random.uniform(-1.5,1.5):.1f},'
            f'{-random.uniform(8,13):.1f}" stroke="{col}" stroke-width="1.1" '
            f'fill="none" stroke-linecap="round" opacity="0.85"/>')
    tufts.append(b)
add("".join(tufts))
# leaf litter in clearing + gaps
lit=[]
for _ in range(140):
    if random.random()<0.55:
        gx=Ccx+random.uniform(-Crx,Crx); gy=Ccy+random.uniform(-Cry,Cry)
    else:
        gx,gy=random.uniform(0,W),random.uniform(0,H)
    a=random.uniform(0,360)
    lit.append(f'<ellipse cx="{gx:.1f}" cy="{gy:.1f}" rx="{random.uniform(1.6,3.2):.1f}" '
               f'ry="{random.uniform(0.9,1.6):.1f}" fill="{wpick(LITTER)}" opacity="0.6" '
               f'transform="rotate({a:.0f} {gx:.1f} {gy:.1f})"/>')
add("".join(lit))

# ================================================================ z1 DAPPLED LIGHT on the floor (upper-right bias)
for _ in range(9):
    dx=random.uniform(Ccx-Crx*0.6,Ccx+Crx); dy=random.uniform(Ccy-Cry,Ccy+Cry*0.4)
    rr=random.uniform(16,34)
    add(f'<ellipse cx="{dx:.1f}" cy="{dy:.1f}" rx="{rr:.1f}" ry="{rr*0.7:.1f}" fill="url(#dapple)"/>')

# ================================================================ z2 UNDERSTORY in the clearing
def small_shadow(cx,cy,rx,ry):
    return f'<ellipse cx="{cx-5:.1f}" cy="{cy+5:.1f}" rx="{rx}" ry="{ry}" fill="{SHADOW}" opacity="0.30" filter="url(#softP)"/>'

def rock(cx,cy,r):
    g=small_shadow(cx,cy,r+2,r*0.8)
    g+=P(blob(cx,cy,r,7,0.28),wpick(STONE_POOL),STONE_INK,1.2)
    g+=P(f"M{cx+r*0.4:.1f},{cy-r*0.4:.1f} A{r},{r} 0 0 1 {cx+r*0.7:.1f},{cy+r*0.2:.1f}","none","#fff4d8",1.2,op=0.20)
    # moss on shaded lower-left
    g+=P(blob(cx-r*0.4,cy+r*0.4,r*0.42,7,0.4),MOSS_BASE,MOSS_INK,0.8,op=0.9)
    for _ in range(4):
        g+=f'<circle cx="{cx-r*0.4+random.uniform(-r*0.3,r*0.3):.1f}" cy="{cy+r*0.4+random.uniform(-r*0.3,r*0.3):.1f}" r="1.4" fill="{wpick(MOSS_SPECK)}"/>'
    return g

def fern(cx,cy,s):
    g=""
    for k in range(random.randint(5,7)):
        ang=math.radians(-90+random.uniform(-70,70))
        ex=cx+math.cos(ang)*s; ey=cy+math.sin(ang)*s
        mx=cx+math.cos(ang)*s*0.5+random.uniform(-4,4); my=cy+math.sin(ang)*s*0.5
        col=wpick(G_LIGHTS if random.random()<0.5 else G_MIDS)
        g+=f'<path d="M{cx:.1f},{cy:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}" fill="none" stroke="{col}" stroke-width="2" opacity="0.9" stroke-linecap="round"/>'
        # little leaflets
        for t in (0.4,0.65,0.85):
            lx=cx+(ex-cx)*t; ly=cy+(ey-cy)*t
            g+=f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="1.4" fill="{col}" opacity="0.8"/>'
    return g

def mushroom(cx,cy,s,red=True):
    g=small_shadow(cx,cy,s*1.1,s*0.6)
    g+=P(wrect(cx-s*0.28,cy-s*0.1,s*0.56,s*0.9,0.5,1.5),"#e5dcc2",WOOD_INK,0.9)  # stem
    cap=MUSH_RED if red else MUSH_TAN
    g+=P(blob(cx,cy-s*0.2,s*0.8,8,0.2),cap,"#5a2a1e" if red else "#6f5330",1.1)
    if red:
        for _ in range(4):
            g+=f'<circle cx="{cx+random.uniform(-s*0.5,s*0.5):.1f}" cy="{cy-s*0.2+random.uniform(-s*0.3,s*0.2):.1f}" r="{random.uniform(1,1.8):.1f}" fill="#f0e8d0"/>'
    return g

def log(cx,cy,length,thick,ang):
    g=f'<g transform="rotate({ang:.1f} {cx:.1f} {cy:.1f})">'
    g+=f'<ellipse cx="{cx-6:.1f}" cy="{cy+7:.1f}" rx="{length/2+4:.0f}" ry="{thick*0.7:.0f}" fill="{SHADOW}" opacity="0.32" filter="url(#soft)"/>'
    g+=P(wrect(cx-length/2,cy-thick/2,length,thick,0.9,thick*0.4),wpick(WOOD_POOL),WOOD_INK,1.6)
    for k in range(3):
        gy=cy-thick/2+thick*(k+1)/4
        g+=P(f"M{cx-length/2+6},{gy:.1f} L{cx+length/2-6},{gy:.1f}","none",WOOD_GRAIN,0.8,op=0.6)
    # end rings
    g+=f'<ellipse cx="{cx-length/2+4:.1f}" cy="{cy:.1f}" rx="4" ry="{thick*0.42:.0f}" fill="#6e4a28" stroke="{WOOD_INK}" stroke-width="1.1"/>'
    g+=f'<ellipse cx="{cx-length/2+4:.1f}" cy="{cy:.1f}" rx="2" ry="{thick*0.22:.0f}" fill="none" stroke="{WOOD_GRAIN}" stroke-width="0.8"/>'
    # moss along the top-left
    for _ in range(5):
        mx=cx+random.uniform(-length*0.4,length*0.3); my=cy-thick*0.3+random.uniform(-2,2)
        g+=P(blob(mx,my,random.uniform(4,7),7,0.4),MOSS_BASE,MOSS_INK,0.8,op=0.92)
    g+="</g>"
    return g

# lay understory
add(log(Ccx-6,Ccy+26,180,26,-12))
add(rock(Ccx-96,Ccy-8,20))
add(rock(Ccx+104,Ccy+18,17))
add(rock(Ccx+70,Ccy-40,12))
for (mx,my,rd) in [(Ccx-60,Ccy+40,7),(Ccx-52,Ccy+48,5),(Ccx+30,Ccy+44,6),(Ccx-30,Ccy-46,6)]:
    add(mushroom(mx,my,rd,red=(random.random()<0.6)))
for (fx,fy,fs) in [(Ccx-110,Ccy+40,20),(Ccx+120,Ccy-20,18),(Ccx+40,Ccy+52,16),(Ccx-10,Ccy-54,15)]:
    add(fern(fx,fy,fs))

# ================================================================ trees: build positions
trees=[]
pitch=54
gy=-20; row=0
while gy<H+40:
    xoff=(pitch/2) if row%2 else 0
    gx=-20+xoff
    while gx<W+40:
        cx=gx+random.uniform(-20,20); cy=gy+random.uniform(-20,20)
        if in_clearing(cx,cy,1.05):
            gx+=pitch; continue
        r=random.uniform(30,54)
        trees.append((cx,cy,r))
        gx+=pitch
    gy+=pitch*0.82; row+=1

# ================================================================ z3 TREE SHADOWS (all, on the floor, lower-left)
shad=[]
for (cx,cy,r) in sorted(trees,key=lambda t:t[1]):
    shad.append(f'<ellipse cx="{cx-r*0.42:.1f}" cy="{cy+r*0.42:.1f}" rx="{r*0.94:.0f}" '
                f'ry="{r*0.86:.0f}" fill="{SHADOW}" opacity="0.26" filter="url(#soft)"/>')
add('<g>'+"".join(shad)+'</g>')

# ================================================================ z4 TREE CANOPIES (back-to-front)
def tree(cx,cy,r):
    g=""
    base=random.choice([G_DARK,"#33511f","#2b451b"])
    # silhouette base blob (ink-outlined)
    g+=P(blob(cx,cy,r,10,0.30),base,G_INK,1.4)
    # bumpy mid-green lobes
    nl=int(r/6)+6
    for _ in range(nl):
        a=random.uniform(0,2*math.pi); rr=random.uniform(0,r*0.62)
        lx=cx+rr*math.cos(a); ly=cy+rr*math.sin(a)
        lr=random.uniform(r*0.26,r*0.42)
        g+=P(blob(lx,ly,lr,7,0.34),wpick(G_MIDS),G_INK,0.7,op=0.95)
    # lit speckle blobs, biased upper-right
    for _ in range(int(nl*0.7)):
        a=random.uniform(-0.9,0.7)   # upper-right sector
        rr=random.uniform(r*0.15,r*0.6)
        lx=cx+rr*math.cos(a); ly=cy+rr*math.sin(a)-r*0.05
        lr=random.uniform(r*0.14,r*0.28)
        g+=P(blob(lx,ly,lr,7,0.4),wpick(G_LIGHTS),None,0,op=0.9)
    # tiny bright highlights on the sunny side
    for _ in range(int(r/10)+2):
        a=random.uniform(-0.8,0.3); rr=random.uniform(r*0.25,r*0.55)
        lx=cx+rr*math.cos(a); ly=cy+rr*math.sin(a)-r*0.1
        g+=f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="{random.uniform(2,3.4):.1f}" fill="#a6bd63" opacity="0.75"/>'
    # lower-left shaded crescent inside the canopy
    g+=P(blob(cx-r*0.34,cy+r*0.34,r*0.5,8,0.35),"#213617",None,0,op=0.34)
    # trunk hint (small dark center) on some
    if random.random()<0.30:
        g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.09:.1f}" fill="#2a1c10" opacity="0.6"/>'
    return g

canopy=[]
for (cx,cy,r) in sorted(trees,key=lambda t:t[1]):
    canopy.append(tree(cx,cy,r))
add('<g>'+"".join(canopy)+'</g>')

# ================================================================ z5 a few bushes at clearing edge (over floor, under nothing)
def bush(cx,cy,r):
    g=f'<ellipse cx="{cx-r*0.4:.1f}" cy="{cy+r*0.4:.1f}" rx="{r*0.9:.0f}" ry="{r*0.75:.0f}" fill="{SHADOW}" opacity="0.24" filter="url(#soft)"/>'
    g+=P(blob(cx,cy,r,9,0.32),"#3a5a20",G_INK,1.2)
    for _ in range(int(r/4)+4):
        a=random.uniform(0,2*math.pi);rr=random.uniform(0,r*0.6)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a),random.uniform(r*0.24,r*0.4),7,0.36),
             wpick(G_MIDS),G_INK,0.6,op=0.95)
    for _ in range(int(r/5)+2):
        a=random.uniform(-0.9,0.6);rr=random.uniform(r*0.2,r*0.55)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a)-r*0.05,random.uniform(r*0.14,r*0.24),7,0.4),
             wpick(G_LIGHTS),None,0,op=0.9)
    return g
add(bush(Ccx-118,Ccy+58,20))
add(bush(Ccx+126,Ccy+40,18))
add(bush(Ccx+90,Ccy+62,15))

# ================================================================ z6 global light overlay + scattered floating leaves
add(f'<rect width="{W}" height="{H}" fill="url(#lightOverlay)"/>')
fl=[]
for _ in range(30):
    gx,gy=random.uniform(0,W),random.uniform(0,H);a=random.uniform(0,360)
    fl.append(f'<ellipse cx="{gx:.1f}" cy="{gy:.1f}" rx="{random.uniform(1.4,2.6):.1f}" '
              f'ry="{random.uniform(0.8,1.4):.1f}" fill="{wpick(LITTER)}" opacity="0.5" '
              f'transform="rotate({a:.0f} {gx:.1f} {gy:.1f})"/>')
add("".join(fl))

add('</svg>')
svg="\n".join(out)
open("forest.svg","w").write(svg)
print("trees:",len(trees))
print("pieces ~", svg.count("<path")+svg.count("<circle")+svg.count("<ellipse")+svg.count("<rect"))
print("bytes", len(svg))
