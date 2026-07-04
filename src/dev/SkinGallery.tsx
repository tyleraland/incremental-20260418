import { TOKEN_SKINS, ARENA_SKINS, FX_SKINS, BATTLE_SKIN_IDS, type BattleSkin } from '@/render/skins'
import { TERRAIN_PROPS } from '@/render/props'
import { propMarkup, scatterArchetype } from '@/render/terrain'
import { buildingMarkup, BUILDING_LOOKS } from '@/render/buildings'
import { PAPER_PALETTE } from '@/render/palette'
import { generateMap, specBarriers, SCATTER_KINDS, type BarrierMaterial, type MapSpec } from '@/mapgen'
import { FIELD_RECIPE } from '@/mapgen/recipes/field'
import { DUNGEON_RECIPE } from '@/mapgen/recipes/dungeon'
import { CITY_RECIPE } from '@/mapgen/recipes/city'
import type { BodyShape, Weapon, Tone, Biome } from '@/render/appearance'
import type { Barrier } from '@/engine'

// Dev-only skin gallery (`?gallery=1`): a contact sheet of the ENTIRE visual
// language — every token body × tone, every weapon, the state variants
// (KO/casting/selected), a facing wheel, the LOD size ladder, each biome's
// ground tile, barrier swatches, and the FX palette — for both skins on one
// page. One screenshot (`npm run gallery-shot`) is a whole-language review:
// palette drift, silhouette weakness, or a contract break is visible at a
// glance, which makes art iteration a tight loop instead of hunting scenes in
// a live battle. Pure render: imports only the render modules + the pure
// mapgen leaf (no store, no engine), so it also documents the skins' public
// surface — including the §mapgen vocabulary (washes, scatter-kind mapping,
// one generated field swatch).

const SHAPES: BodyShape[] = ['humanoid', 'blob', 'beast', 'flyer', 'snail', 'serpent', 'canine']
const TONES: Tone[] = ['player', 'enemy', 'neutral', 'casting']
const WEAPONS: Weapon[] = ['sword', 'dagger', 'bow', 'staff']
const BIOMES: Biome[] = ['grass', 'stone', 'plaza']
const SIZES = [20, 32, 48, 72]           // the LOD ladder: far zoom → close-up
const GLYPH: Record<BodyShape, string> = { humanoid: '⚔', blob: 'SL', beast: 'BO', flyer: 'HA', snail: 'SN', serpent: 'RS', canine: 'WO' }

const dims = (px: number) => ({ width: `${px}px`, height: `${px}px`, fontSize: `${Math.round(px * 0.4)}px` })

// A representative barrier set for the terrain swatch: two overlapping walls
// (exercises the blob merge), a lone wall, and a cliff.
const TERRAIN_SAMPLE: Barrier[] = [
  { x: 2.5, y: 8.5, w: 4, h: 3 },
  { x: 5.8, y: 7, w: 3, h: 2.5 },
  { x: 11, y: 11.5, w: 2.5, h: 2 },
  { x: 9.5, y: 2.5, w: 3.5, h: 2, kind: 'cliff' },
]

// A representative GENERATED map for the mapgen swatch (§mapgen phase 2):
// deterministically pick a seed whose small field has a lake, so the swatch
// always exercises the full vocabulary (washes, ford, water-hidden collision).
const GEN_SPEC: MapSpec = (() => {
  for (let seed = 1; seed < 30; seed++) {
    const r = generateMap(FIELD_RECIPE, { recipe: 'field', seed, size: 48, themes: ['plains', 'water'], maxBarriers: 16 })
    if (r.report.ok && r.spec.collision.some((c) => c.material === 'deep-water')) return r.spec
  }
  return generateMap(FIELD_RECIPE, { recipe: 'field', seed: 1, size: 48, themes: ['plains', 'water'], onFail: 'accept' }).spec
})()
const WASHES = ['meadowWash', 'sandWash', 'waterShallow', 'waterDeep'] as const
// A representative generated DUNGEON floor (phase 3): rooms, doors, stamps.
const GEN_DUNGEON: MapSpec = generateMap(DUNGEON_RECIPE, { recipe: 'dungeon', seed: 3, size: 48, themes: ['dungeon'] }).spec
// The live Prontera bake (phase 5): plaza + gate roads + street-fronting stone/
// timber buildings — the city tile catalog in situ.
const GEN_CITY: MapSpec = generateMap(CITY_RECIPE, { recipe: 'city', seed: 'prontera-city', size: 50, themes: ['city'], maxBarriers: 40 }).spec
// The building-material catalog: one BUILDING_LOOKS entry per BarrierMaterial a
// city recipe tags. A swatch renders one house of each so the roof/wall/shadow
// treatment is reviewable next to the in-situ bake.
const BUILDING_MATS = Object.keys(BUILDING_LOOKS) as BarrierMaterial[]
const buildingSwatch = (material: BarrierMaterial): string => buildingMarkup({ x: 1.4, y: 1.8, w: 5.2, h: 4 }, material, 42)

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-20 w-20 flex items-center justify-center">{children}</div>
      <span className="text-[9px] text-neutral-500 leading-none">{label}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] uppercase tracking-widest text-neutral-400 mb-2">{title}</h2>
      <div className="flex flex-wrap gap-2 items-end">{children}</div>
    </div>
  )
}

function SkinBlock({ skin }: { skin: BattleSkin }) {
  const Body = TOKEN_SKINS[skin]
  const arena = ARENA_SKINS[skin]
  const terrain = arena.terrain
  const fx = FX_SKINS[skin]
  return (
    <div className="mb-10">
      <h1 className="text-sm font-bold text-neutral-200 mb-3">skin: {skin}</h1>

      <Section title="bodies × tones">
        {SHAPES.map((shape) =>
          TONES.map((tone) => (
            <Cell key={`${shape}-${tone}`} label={`${shape} · ${tone}`}>
              <Body glyph={GLYPH[shape]} tone={tone} bodyShape={shape} alive selected={false} facingDeg={0} dims={dims(56)} />
            </Cell>
          )),
        )}
      </Section>

      <Section title="weapons (class handhelds) — creatures carry facing in the body">
        {WEAPONS.map((w) => (
          <Cell key={w} label={w}>
            <Body glyph="⚔" tone="player" bodyShape="humanoid" weapon={w} alive selected={false} facingDeg={0} dims={dims(56)} />
          </Cell>
        ))}
        <Cell label="no weapon (beast)">
          <Body glyph="BO" tone="enemy" bodyShape="beast" alive selected={false} facingDeg={0} dims={dims(56)} />
        </Cell>
      </Section>

      <Section title="states">
        <Cell label="KO">
          <Body glyph="⚔" tone="player" bodyShape="humanoid" weapon="sword" alive={false} selected={false} facingDeg={null} dims={dims(56)} />
        </Cell>
        <Cell label="casting">
          <Body glyph="✦" tone="casting" bodyShape="humanoid" weapon="staff" alive selected={false} facingDeg={0} dims={dims(56)} />
        </Cell>
        <Cell label="selected">
          <Body glyph="⚔" tone="player" bodyShape="humanoid" weapon="sword" alive selected facingDeg={0} dims={dims(56)} />
        </Cell>
        <Cell label="element tint">
          <Body glyph="SL" tone="enemy" bodyShape="blob" tint="rgb(251 146 60 / 0.9)" alive selected={false} facingDeg={0} dims={dims(56)} />
        </Cell>
        <Cell label="moving (plate lean)">
          <Body glyph="WO" tone="enemy" bodyShape="canine" alive selected={false} facingDeg={0} moving dims={dims(56)} />
        </Cell>
      </Section>

      <Section title="facing wheel (15° quantized in play) — weapon carry + rotating top-down body">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <Cell key={deg} label={`${deg}°`}>
            <Body glyph="⚔" tone="player" bodyShape="humanoid" weapon="bow" alive selected={false} facingDeg={deg} dims={dims(48)} />
          </Cell>
        ))}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <Cell key={`c${deg}`} label={`${deg}°`}>
            <Body glyph="WO" tone="enemy" bodyShape="canine" alive selected={false} facingDeg={deg} dims={dims(48)} />
          </Cell>
        ))}
      </Section>

      <Section title="size ladder (LOD sanity)">
        {SIZES.map((px) => (
          <Cell key={px} label={`${px}px`}>
            <Body glyph="HA" tone="enemy" bodyShape="flyer" alive selected={false} facingDeg={-30} dims={dims(px)} />
          </Cell>
        ))}
      </Section>

      <Section title="ground tiles (per biome) · barriers · vignette">
        {BIOMES.map((b) => {
          const g = arena.grounds?.[b]
          return (
            <div key={b} className="flex flex-col items-center gap-1">
              <div
                className="w-40 h-40 rounded border border-neutral-800"
                style={{ ...arena.surface, ...(g ? { backgroundImage: g.image, backgroundSize: `${g.cellsPerTile * 32}px` } : null) }}
              />
              <span className="text-[9px] text-neutral-500">{b}{g ? '' : ' (none)'}</span>
            </div>
          )
        })}
        <div className="flex flex-col items-center gap-1">
          <div className="w-40 h-40 rounded border border-neutral-800 relative" style={arena.surface}>
            <div className="absolute rounded-sm bg-stone-700/70 border border-stone-500/60" style={{ left: 8, top: 8, width: 56, height: 40, ...ARENA_SKINS[skin].barrierWall }} />
            <div className="absolute rounded-sm bg-amber-900/20 border border-dashed border-amber-600/60" style={{ left: 88, top: 84, width: 56, height: 40, ...ARENA_SKINS[skin].barrierCliff }} />
            {arena.vignette && <div className="absolute inset-0 pointer-events-none" style={{ background: arena.vignette }} />}
          </div>
          <span className="text-[9px] text-neutral-500">wall · cliff · vignette</span>
        </div>
      </Section>

      {terrain && (
        <Section title="scatter props (per biome: hand-authored archetypes + seeded ~variants)">
          {BIOMES.map((b) => (
            <div key={b} className="w-full">
              <div className="text-[9px] text-neutral-500 mb-1">{b} · {TERRAIN_PROPS[b].length} props</div>
              <div className="flex flex-wrap gap-1.5">
                {TERRAIN_PROPS[b].map((def) => (
                  <div key={def.id} className="flex flex-col items-center gap-0.5">
                    <div className="w-12 h-12 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
                      <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-10 h-10" aria-hidden dangerouslySetInnerHTML={{ __html: propMarkup(def) }} />
                    </div>
                    <span className="text-[8px] text-neutral-600 leading-none">{def.id}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {terrain && (
        <Section title="organic terrain (per biome: mottling · props · wall/cliff blobs · rim) + hero light">
          {BIOMES.map((b, i) => {
            const g = arena.grounds?.[b]
            return (
              <div key={b} className="flex flex-col items-center gap-1">
                <div
                  className="w-56 h-56 rounded border border-neutral-800 relative overflow-hidden"
                  style={{ ...arena.surface, ...(g ? { backgroundImage: g.image, backgroundSize: `${g.cellsPerTile * 14}px` } : null) }}
                >
                  {terrain({ biome: b, cols: 16, rows: 16, barriers: TERRAIN_SAMPLE, seed: 7 + i * 1000, rim: true })}
                </div>
                <span className="text-[9px] text-neutral-500">{b}</span>
              </div>
            )
          })}
          {arena.heroLight && (['field', 'city'] as const).map((k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <div className="w-28 h-56 rounded border border-neutral-800 relative" style={arena.surface}>
                <div className="absolute inset-0" style={{ background: arena.heroLight![k] }} />
              </div>
              <span className="text-[9px] text-neutral-500">light: {k}</span>
            </div>
          ))}
        </Section>
      )}

      {terrain && (
        <Section title="mapgen vocabulary: surface washes · scatter kind → biome archetype · a generated field">
          {WASHES.map((w) => (
            <div key={w} className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded border border-neutral-800" style={{ ...arena.surface }}>
                <div className="w-full h-full rounded" style={{ backgroundColor: PAPER_PALETTE[w], opacity: 0.8 }} />
              </div>
              <span className="text-[8px] text-neutral-600 leading-none">{w}</span>
            </div>
          ))}
          {BIOMES.map((b) => (
            <div key={b} className="w-full">
              <div className="text-[9px] text-neutral-500 mb-1">{b} · kind → archetype</div>
              <div className="flex flex-wrap gap-1.5">
                {SCATTER_KINDS.map((kind) => {
                  const def = scatterArchetype(b, kind)
                  return (
                    <div key={kind} className="flex flex-col items-center gap-0.5">
                      <div className="w-12 h-12 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
                        <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-10 h-10" aria-hidden dangerouslySetInnerHTML={{ __html: propMarkup(def) }} />
                      </div>
                      <span className="text-[8px] text-neutral-600 leading-none">{kind} → {def.id}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-56 h-56 rounded border border-neutral-800 relative overflow-hidden"
              style={{ ...arena.surface, ...(arena.grounds?.grass ? { backgroundImage: arena.grounds.grass.image, backgroundSize: `${arena.grounds.grass.cellsPerTile * 5}px` } : null) }}
            >
              {terrain({ biome: 'grass', cols: GEN_SPEC.cols, rows: GEN_SPEC.rows, barriers: specBarriers(GEN_SPEC), seed: 7, rim: true, spec: GEN_SPEC })}
            </div>
            <span className="text-[9px] text-neutral-500">generated field (recipe: {GEN_SPEC.recipe}, seed {GEN_SPEC.seed}) — lake · ford · washes · spec scatter</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-56 h-56 rounded border border-neutral-800 relative overflow-hidden"
              style={{ ...arena.surface, ...(arena.grounds?.stone ? { backgroundImage: arena.grounds.stone.image, backgroundSize: `${arena.grounds.stone.cellsPerTile * 5}px` } : null) }}
            >
              {terrain({ biome: 'stone', cols: GEN_DUNGEON.cols, rows: GEN_DUNGEON.rows, barriers: specBarriers(GEN_DUNGEON), seed: 3, rim: true, spec: GEN_DUNGEON })}
            </div>
            <span className="text-[9px] text-neutral-500">generated dungeon (recipe: {GEN_DUNGEON.recipe}, seed {GEN_DUNGEON.seed}) — rooms · doors · stamps · lair</span>
          </div>
        </Section>
      )}

      {terrain && (
        <Section title="city tile catalog (Prontera) — building materials · cobbled streets · flagstone plaza">
          {BUILDING_MATS.map((mat) => (
            <div key={mat} className="flex flex-col items-center gap-1">
              <div className="w-16 h-16 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
                <svg viewBox="0 0 8 8" className="w-14 h-14" aria-hidden dangerouslySetInnerHTML={{ __html: buildingSwatch(mat) }} />
              </div>
              <span className="text-[8px] text-neutral-600 leading-none">{mat}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-64 h-64 rounded border border-neutral-800 relative overflow-hidden"
              style={{ ...arena.surface, ...(arena.grounds?.plaza ? { backgroundImage: arena.grounds.plaza.image, backgroundSize: `${arena.grounds.plaza.cellsPerTile * 5}px` } : null) }}
            >
              {terrain({ biome: 'plaza', cols: GEN_CITY.cols, rows: GEN_CITY.rows, barriers: specBarriers(GEN_CITY), seed: 9, rim: true, spec: GEN_CITY })}
            </div>
            <span className="text-[9px] text-neutral-500">generated city (recipe: {GEN_CITY.recipe}, "{GEN_CITY.semantic.name}") — plaza · roads · {GEN_CITY.collision.length} buildings</span>
          </div>
        </Section>
      )}

      <Section title="fx: arcs · hit ring · zone · firewall · portal">
        <div className="flex flex-col items-center gap-1">
          <svg width="80" height="80" className="rounded border border-neutral-800" style={arena.surface}>
            <line x1="10" y1="20" x2="70" y2="35" stroke={fx.arcPlayer} strokeWidth="3" strokeLinecap="round" />
            <line x1="10" y1="55" x2="70" y2="70" stroke={fx.arcEnemy} strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-[9px] text-neutral-500">arcs</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-20 h-20 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
            <div className={`w-12 h-12 rounded-full ${fx.hitRing}`} />
          </div>
          <span className="text-[9px] text-neutral-500">hit ring</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-20 h-20 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
            <div className={`w-14 h-14 rounded-full ${fx.zone}`} />
          </div>
          <span className="text-[9px] text-neutral-500">zone</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-20 h-20 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
            <div className={`w-14 h-3 rounded-sm ${fx.firewall}`} />
          </div>
          <span className="text-[9px] text-neutral-500">firewall</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-20 h-20 rounded border border-neutral-800 flex items-center justify-center" style={arena.surface}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${fx.portal}`}>
              <span className="text-fuchsia-100/90 text-[11px]">◈</span>
            </div>
          </div>
          <span className="text-[9px] text-neutral-500">portal</span>
        </div>
      </Section>
    </div>
  )
}

export default function SkinGallery() {
  return (
    <div data-gallery className="min-h-full bg-[#0b0b10] p-4 overflow-auto">
      <p className="text-[10px] text-neutral-500 mb-4">
        skin gallery — the whole visual language on one sheet (dev-only, ?gallery=1 · npm run gallery-shot)
      </p>
      {BATTLE_SKIN_IDS.map((s) => <SkinBlock key={s} skin={s} />)}
    </div>
  )
}
