#!/usr/bin/env python3
"""
Inked Top-Down Medieval Battlemap Style -- dense forest with a wide
winding path. Path enters the bottom edge, weaves up and exits the top
(tiles with neighbours). Trees are cleared from the path corridor; a small
glade off the trail holds the understory. One upper-right sun.
"""
import random, math

SEED = 45
random.seed(SEED)

W, H = 560, 560
JIT = 0.9
PATHW = 92                     # wide trail

INK        = "#312619"
G_DARK     = "#2f4a1e"
G_MIDS     = ["#4f6a2c","#456019","#567a34","#3f5a22"]
G_LIGHTS   = ["#6f8a3f","#7f9a4d","#86a24f","#94ac57"]
G_INK      = "#243a16"
GRASS_BASE = "#4b652a"
GRASS_POOL = ["#4f6a2c","#456019","#567a34","#3f5a22","#5c7a30"]
DIRT_POOL  = ["#8a6a40","#7c5e38","#96784a","#6e5230"]
PATH_BASE  = "#7c5e38"
PATH_LIGHT = "#93714a"
PATH_RUT   = "#5e4526"
PATH_INK   = "#4a3822"
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
WATER_HL   = "#9ec4c7"
WATER_INK  = "#213c42"
SHADOW     = "#1c2a12"

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

# ---------- path centerline (Catmull-Rom through control points) ----------
ctrl=[(300,585),(285,510),(372,452),(232,382),(338,308),(214,232),(324,158),(250,86),(300,10),(304,-40)]
def catmull(pts,sps=18):
    Pp=[pts[0]]+list(pts)+[pts[-1]]; res=[]
    for i in range(1,len(Pp)-2):
        p0,p1,p2,p3=Pp[i-1],Pp[i],Pp[i+1],Pp[i+2]
        for s in range(sps):
            t=s/sps;t2=t*t;t3=t2*t
            x=0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3)
            y=0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
            res.append((x,y))
    res.append(ctrl[-1]); return res
center=catmull(ctrl)
coarse=center[::2]
def dist_path(x,y):
    return min(math.hypot(x-px,y-py) for px,py in coarse)
def path_d():
    d=f"M{center[0][0]:.1f},{center[0][1]:.1f} "
    for (x,y) in center[1:]: d+=f"L{x:.1f},{y:.1f} "
    return d

# glade beside the trail
Gcx,Gcy,Gr = 150,300,66
def in_glade(x,y,s=1.0): return math.hypot(x-Gcx,y-Gcy) < Gr*s

out=[]
def add(s): out.append(s)
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add('<defs>')
add('<linearGradient id="lightOverlay" x1="1" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.10"/>'
    '<stop offset="0.5" stop-color="#fff4d8" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#0e1a08" stop-opacity="0.22"/></linearGradient>')
add('<radialGradient id="dapple" cx="0.5" cy="0.5" r="0.5">'
    '<stop offset="0" stop-color="#fff4d8" stop-opacity="0.34"/>'
    '<stop offset="1" stop-color="#fff4d8" stop-opacity="0"/></radialGradient>')
add('<radialGradient id="puddle" cx="0.6" cy="0.4" r="0.7">'
    '<stop offset="0" stop-color="#5f8b94" stop-opacity="0.5"/>'
    '<stop offset="1" stop-color="#213c42" stop-opacity="0.7"/></radialGradient>')
add('<filter id="soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>')
add('<filter id="softP" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.4"/></filter>')
add('</defs>')

# ================================================================ z0 GROUND grass
add(f'<rect width="{W}" height="{H}" fill="{GRASS_BASE}"/>')
patches=[]
for _ in range(230):
    gx,gy=random.uniform(0,W),random.uniform(0,H)
    patches.append(P(blob(gx,gy,random.uniform(10,26),7,0.4),wpick(GRASS_POOL),None,0,op=0.55))
add("".join(patches))
tufts=[]
for _ in range(150):
    gx,gy=random.uniform(0,W),random.uniform(0,H);col=wpick(GRASS_POOL);b=""
    for _ in range(random.randint(3,5)):
        bx=gx+random.uniform(-3,3)
        b+=(f'<path d="M{bx:.1f},{gy:.1f} q{random.uniform(-2,2):.1f},'
            f'{-random.uniform(5,10):.1f} {random.uniform(-1.5,1.5):.1f},'
            f'{-random.uniform(8,13):.1f}" stroke="{col}" stroke-width="1.1" '
            f'fill="none" stroke-linecap="round" opacity="0.85"/>')
    tufts.append(b)
add("".join(tufts))

# ================================================================ z1 PATH SURFACE (dirt, ruts, texture)
pd=path_d()
add(f'<path d="{pd}" fill="none" stroke="{PATH_BASE}" stroke-width="{PATHW}" stroke-linecap="round" stroke-linejoin="round"/>')
add(f'<path d="{pd}" fill="none" stroke="{PATH_LIGHT}" stroke-width="{PATHW*0.6:.0f}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>')
# glade floor (worn earth + grass mix)
add(P(blob(Gcx,Gcy,Gr,10,0.18),"#6f5c3a",None,0,op=0.9))
# scatter dirt/earth blobs to break the path edge organically
edge=[]
for (x,y) in center[::3]:
    for _ in range(2):
        a=random.uniform(0,2*math.pi); rr=PATHW/2*random.uniform(0.75,1.05)
        ex=x+rr*math.cos(a); ey=y+rr*math.sin(a)
        edge.append(P(blob(ex,ey,random.uniform(8,16),7,0.45),wpick(DIRT_POOL),None,0,op=0.5))
add("".join(edge))
# central rut (heavy travel) + a second offset rut
add(f'<path d="{pd}" fill="none" stroke="{PATH_RUT}" stroke-width="{PATHW*0.14:.0f}" opacity="0.35" stroke-linecap="round"/>')
add(f'<path d="{pd}" fill="none" stroke="{PATH_RUT}" stroke-width="3" opacity="0.30" stroke-linecap="round" transform="translate(12,-4)"/>')
add(f'<path d="{pd}" fill="none" stroke="{PATH_RUT}" stroke-width="3" opacity="0.30" stroke-linecap="round" transform="translate(-12,4)"/>')
# pebbles, grass-in-cracks, litter, puddles on the trail
peb=[]
for (x,y) in center[::4]:
    for _ in range(3):
        a=random.uniform(0,2*math.pi); rr=random.uniform(0,PATHW*0.42)
        ex,ey=x+rr*math.cos(a),y+rr*math.sin(a)
        if random.random()<0.5:
            peb.append(P(blob(ex,ey,random.uniform(2.2,4.5),6,0.4),wpick(STONE_POOL),STONE_INK,0.7,op=0.9))
        else:
            col=wpick(GRASS_POOL);tb=""
            for _ in range(3):
                bx=ex+random.uniform(-2,2)
                tb+=f'<path d="M{bx:.1f},{ey:.1f} q0,-5 {random.uniform(-1,1):.1f},-7" stroke="{col}" stroke-width="1" fill="none" opacity="0.7"/>'
            peb.append(tb)
add("".join(peb))
# litter on trail
for (x,y) in center[::5]:
    for _ in range(2):
        ex,ey=x+random.uniform(-PATHW*0.4,PATHW*0.4),y+random.uniform(-PATHW*0.4,PATHW*0.4)
        a=random.uniform(0,360)
        add(f'<ellipse cx="{ex:.1f}" cy="{ey:.1f}" rx="{random.uniform(1.5,3):.1f}" ry="{random.uniform(0.9,1.5):.1f}" fill="{wpick(LITTER)}" opacity="0.55" transform="rotate({a:.0f} {ex:.1f} {ey:.1f})"/>')
# a couple puddles
for (px,py) in [(center[16][0],center[16][1]),(center[len(center)//2][0]+14,center[len(center)//2][1])]:
    add(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="20" ry="12" fill="url(#puddle)" stroke="{WATER_INK}" stroke-width="1.3"/>')
    add(f'<ellipse cx="{px+4:.1f}" cy="{py-3:.1f}" rx="4" ry="1.6" fill="{WATER_HL}" opacity="0.6"/>')

# ================================================================ z2 DAPPLED LIGHT along the open trail
for (x,y) in center[::7]:
    if random.random()<0.7:
        rr=random.uniform(16,30)
        add(f'<ellipse cx="{x+random.uniform(-10,20):.1f}" cy="{y+random.uniform(-14,6):.1f}" rx="{rr:.0f}" ry="{rr*0.7:.0f}" fill="url(#dapple)"/>')

# ================================================================ z3 UNDERSTORY in the glade + trail edges
def small_shadow(cx,cy,rx,ry):
    return f'<ellipse cx="{cx-5:.1f}" cy="{cy+5:.1f}" rx="{rx}" ry="{ry}" fill="{SHADOW}" opacity="0.30" filter="url(#softP)"/>'
def rock(cx,cy,r):
    g=small_shadow(cx,cy,r+2,r*0.8)
    g+=P(blob(cx,cy,r,7,0.28),wpick(STONE_POOL),STONE_INK,1.2)
    g+=P(f"M{cx+r*0.4:.1f},{cy-r*0.4:.1f} A{r},{r} 0 0 1 {cx+r*0.7:.1f},{cy+r*0.2:.1f}","none","#fff4d8",1.2,op=0.20)
    g+=P(blob(cx-r*0.4,cy+r*0.4,r*0.42,7,0.4),MOSS_BASE,MOSS_INK,0.8,op=0.9)
    for _ in range(4):
        g+=f'<circle cx="{cx-r*0.4+random.uniform(-r*0.3,r*0.3):.1f}" cy="{cy+r*0.4+random.uniform(-r*0.3,r*0.3):.1f}" r="1.4" fill="{wpick(MOSS_SPECK)}"/>'
    return g
def fern(cx,cy,s):
    g=""
    for k in range(random.randint(5,7)):
        ang=math.radians(-90+random.uniform(-70,70)); ex=cx+math.cos(ang)*s; ey=cy+math.sin(ang)*s
        mx=cx+math.cos(ang)*s*0.5+random.uniform(-4,4); my=cy+math.sin(ang)*s*0.5
        col=wpick(G_LIGHTS if random.random()<0.5 else G_MIDS)
        g+=f'<path d="M{cx:.1f},{cy:.1f} Q{mx:.1f},{my:.1f} {ex:.1f},{ey:.1f}" fill="none" stroke="{col}" stroke-width="2" opacity="0.9" stroke-linecap="round"/>'
        for t in (0.45,0.7,0.9):
            lx=cx+(ex-cx)*t; ly=cy+(ey-cy)*t
            g+=f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="1.4" fill="{col}" opacity="0.8"/>'
    return g
def mushroom(cx,cy,s,red=True):
    g=small_shadow(cx,cy,s*1.1,s*0.6)
    g+=P(wrect(cx-s*0.28,cy-s*0.1,s*0.56,s*0.9,0.5,1.5),"#e5dcc2",WOOD_INK,0.9)
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
    g+=f'<ellipse cx="{cx-length/2+4:.1f}" cy="{cy:.1f}" rx="4" ry="{thick*0.42:.0f}" fill="#6e4a28" stroke="{WOOD_INK}" stroke-width="1.1"/>'
    for _ in range(5):
        mx=cx+random.uniform(-length*0.4,length*0.3); my=cy-thick*0.3+random.uniform(-2,2)
        g+=P(blob(mx,my,random.uniform(4,7),7,0.4),MOSS_BASE,MOSS_INK,0.8,op=0.92)
    g+="</g>"; return g

add(log(Gcx+2,Gcy+18,150,24,-16))
add(rock(Gcx-36,Gcy-24,17))
add(rock(Gcx+44,Gcy-30,13))
for (mx,my,rd) in [(Gcx-20,Gcy+34,7),(Gcx-12,Gcy+42,5),(Gcx+34,Gcy+28,6)]:
    add(mushroom(mx,my,rd,red=(random.random()<0.6)))
for (fx,fy,fs) in [(Gcx-52,Gcy+6,18),(Gcx+52,Gcy+8,16),(Gcx+6,Gcy-44,15)]:
    add(fern(fx,fy,fs))

# ================================================================ trees (dense, excluded from path + glade)
trees=[]; pitch=52; gy=-24; row=0
while gy<H+44:
    xoff=(pitch/2) if row%2 else 0; gx=-24+xoff
    while gx<W+44:
        cx=gx+random.uniform(-18,18); cy=gy+random.uniform(-18,18)
        r=random.uniform(28,52)
        if dist_path(cx,cy) < PATHW/2 + r*0.5 or in_glade(cx,cy,1.0+r*0.006):
            gx+=pitch; continue
        trees.append((cx,cy,r)); gx+=pitch
    gy+=pitch*0.82; row+=1

# z4 tree shadows (fall onto ground/path, lower-left)
shad=[]
for (cx,cy,r) in sorted(trees,key=lambda t:t[1]):
    shad.append(f'<ellipse cx="{cx-r*0.42:.1f}" cy="{cy+r*0.42:.1f}" rx="{r*0.94:.0f}" ry="{r*0.86:.0f}" fill="{SHADOW}" opacity="0.26" filter="url(#soft)"/>')
add('<g>'+"".join(shad)+'</g>')

# z5 canopies back-to-front
def tree(cx,cy,r):
    g=""; base=random.choice([G_DARK,"#33511f","#2b451b"])
    g+=P(blob(cx,cy,r,10,0.30),base,G_INK,1.4)
    nl=int(r/6)+6
    for _ in range(nl):
        a=random.uniform(0,2*math.pi); rr=random.uniform(0,r*0.62)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a),random.uniform(r*0.26,r*0.42),7,0.34),wpick(G_MIDS),G_INK,0.7,op=0.95)
    for _ in range(int(nl*0.7)):
        a=random.uniform(-0.9,0.7); rr=random.uniform(r*0.15,r*0.6)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a)-r*0.05,random.uniform(r*0.14,r*0.28),7,0.4),wpick(G_LIGHTS),None,0,op=0.9)
    for _ in range(int(r/10)+2):
        a=random.uniform(-0.8,0.3); rr=random.uniform(r*0.25,r*0.55)
        g+=f'<circle cx="{cx+rr*math.cos(a):.1f}" cy="{cy+rr*math.sin(a)-r*0.1:.1f}" r="{random.uniform(2,3.4):.1f}" fill="#a6bd63" opacity="0.75"/>'
    g+=P(blob(cx-r*0.34,cy+r*0.34,r*0.5,8,0.35),"#213617",None,0,op=0.34)
    if random.random()<0.3:
        g+=f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.09:.1f}" fill="#2a1c10" opacity="0.6"/>'
    return g
canopy=[tree(cx,cy,r) for (cx,cy,r) in sorted(trees,key=lambda t:t[1])]
add('<g>'+"".join(canopy)+'</g>')

# z6 bushes softening the trail/glade edges
def bush(cx,cy,r):
    g=f'<ellipse cx="{cx-r*0.4:.1f}" cy="{cy+r*0.4:.1f}" rx="{r*0.9:.0f}" ry="{r*0.75:.0f}" fill="{SHADOW}" opacity="0.24" filter="url(#soft)"/>'
    g+=P(blob(cx,cy,r,9,0.32),"#3a5a20",G_INK,1.2)
    for _ in range(int(r/4)+4):
        a=random.uniform(0,2*math.pi);rr=random.uniform(0,r*0.6)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a),random.uniform(r*0.24,r*0.4),7,0.36),wpick(G_MIDS),G_INK,0.6,op=0.95)
    for _ in range(int(r/5)+2):
        a=random.uniform(-0.9,0.6);rr=random.uniform(r*0.2,r*0.55)
        g+=P(blob(cx+rr*math.cos(a),cy+rr*math.sin(a)-r*0.05,random.uniform(r*0.14,r*0.24),7,0.4),wpick(G_LIGHTS),None,0,op=0.9)
    return g
# a few bushes right at the trail lip (just outside the corridor)
for (x,y) in [center[6],center[24],center[42],center[60],center[78]]:
    a=random.choice([-1,1]); nx,ny=x+a*(PATHW/2+12),y+random.uniform(-6,6)
    add(bush(nx,ny,random.uniform(14,20)))
add(bush(Gcx-58,Gcy+40,18)); add(bush(Gcx+58,Gcy+36,16))

# z7 global light + floating leaves
add(f'<rect width="{W}" height="{H}" fill="url(#lightOverlay)"/>')
for _ in range(28):
    gx,gy=random.uniform(0,W),random.uniform(0,H);a=random.uniform(0,360)
    add(f'<ellipse cx="{gx:.1f}" cy="{gy:.1f}" rx="{random.uniform(1.4,2.6):.1f}" ry="{random.uniform(0.8,1.4):.1f}" fill="{wpick(LITTER)}" opacity="0.5" transform="rotate({a:.0f} {gx:.1f} {gy:.1f})"/>')

add('</svg>')
svg="\n".join(out)
open("forest_path.svg","w").write(svg)
print("trees:",len(trees),"| pieces ~",svg.count("<path")+svg.count("<circle")+svg.count("<ellipse")+svg.count("<rect"))
print("bytes",len(svg))
