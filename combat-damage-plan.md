# Combat Damage Model

This document describes the stat-driven combat model implemented across the codebase.

---

## Attack (Physical)

```
attack = weaponAttack + abilityAttack + skillBonuses
weaponAttack   = sum of attack stats from all equipped items
abilityAttack  = STR + floor(STR / 10)²
```

STR scaling: linear below 10, quadratic above (STR=10→+1, STR=20→+4, STR=50→+25).

## Attack (Magic)

```
magicAttack = weaponMagicAttack + abilityMagicAttack + skillBonuses
weaponMagicAttack    = sum of specialAttack stats from all equipped items
abilityMagicAttack   = INT + (floor(INT/7)² + floor(INT/5)²) / 2
```

Which type is used depends on the mainHand weapon:
- mainHand has `specialAttack` → unit is a magic attacker (uses `magicAttack`)
- otherwise → physical attacker (uses `attack`)

## Attacks Per Second (APS)

```
aps = max(0.1, weaponBaseAps × (1 + AGI/100) × (1 + DEX/500))
```

`weaponBaseAps` comes from the mainHand item's `baseAps` field; unarmed default is 0.8.
APS is used as a multiplier in expected-value damage: `damage_per_tick = aps × damagePerHit × hitRate`.

## Defense (Physical)

Defense has two components applied in sequence to incoming physical damage:

1. **Armor defense** (from gear) — percentage mitigation:
   ```
   afterArmor = incomingDmg × (100 / (100 + armorDefense))
   ```
2. **Ability defense** = CON — flat subtraction after mitigation:
   ```
   finalDmg = max(1, afterArmor − abilityDefense)
   ```

Combined into `computeDmg(attack, armorDef, abilityDef)`:
```
max(1, attack × 100/(100 + armorDef) − abilityDef)
```

Minimum damage per hit is always 1.

## Defense (Magic)

Same two-component structure as physical, but:
- **Magic armor defense** = from gear (`specialDefense` items)
- **Ability magic defense** = INT

## Hit / Miss

```
hitRate = clamp(0.05, 0.95, (accuracy − dodge + 80) / 100)
accuracy = DEX + level    (for units)
         = stats.accuracy  (for monsters, hardcoded)
dodge    = AGI + bonuses   (for units; +1 per AGI)
         = stats.dodge      (for monsters, hardcoded)
```

At equal accuracy and dodge: 80% hit rate.
High dodge (AGI build) can reduce hits to as low as 5%.
High accuracy can raise hits to as high as 95%.

Hit/miss is deterministic (expected-value): `dmgPerTick = aps × computeDmg(...) × hitRate`.
No RNG in the tick loop — this keeps batch ticks (offline sessions) analytically correct.

## Monster HP and Progress

Each monster has a `maxHp` field. Combat progress (0→1) advances as:

```
progress += dmgPerTick / monster.maxHp
```

At progress = 1 the monster is defeated. The monster's `abilityDefense` and `abilityMagicDefense`
fields (in their DerivedStats) act as flat post-armor reductions, the same as CON/INT for units.

## Monster Attack Speed

Monster `stats.aps` represents their attacks per second (stored as raw value, not divided).
Monsters always attack the expected-value way: `dmgPerTick = monster.stats.aps × computeDmg(...) × hitRate`.

---

## DerivedStats Fields

| Field | Source for Units | Source for Monsters |
|---|---|---|
| `attack` | weaponAtk + STR + floor(STR/10)² | hardcoded in registry |
| `magicAttack` | weaponMagicAtk + INT formula | hardcoded in registry |
| `aps` | baseAps × AGI/DEX modifiers | hardcoded in registry |
| `armorDefense` | sum of equipment defense stats | hardcoded in registry |
| `abilityDefense` | CON | hardcoded in registry |
| `magicArmorDefense` | sum of equipment specialDefense stats | hardcoded in registry |
| `abilityMagicDefense` | INT | hardcoded in registry |
| `accuracy` | DEX + level | hardcoded in registry |
| `dodge` | AGI + bonuses | hardcoded in registry |
| `primaryDamageType` | from mainHand weapon | N/A (monsters always physical) |
| `range` | max range from equipped items | hardcoded in registry |

---

## Equipment baseAps Reference

| Item | baseAps |
|---|---|
| Shortsword | 1.4 |
| Skinning Knife | 1.3 |
| Iron Sword | 1.2 |
| Greatsword | 0.9 |
| Wand | 1.1 |
| Staff | 0.9 |
| Handaxe | 1.0 |
| Lockpick | 1.0 |
| Pickaxe | 0.9 |
| Unarmed (no weapon) | 0.8 |

---

## Worked Examples

**Wolf attacking an unarmed makeUnit (all abilities=5, level=1):**
- Unit: armorDefense=0, abilityDefense=CON=5, dodge=AGI=5
- Wolf: attack=8, accuracy=10, aps=1.4
- `hitRate(10, 5) = (10−5+80)/100 = 0.85`
- `computeDmg(8, 0, 5) = max(1, 8×1 − 5) = 3`
- `dmgPerTick = 1.4 × 3 × 0.85 ≈ 3.57` → HP goes 100 → 96 after first tick

**Unarmed makeUnit attacking a wolf (maxHp=80):**
- Unit: attack=5+0=5, accuracy=DEX+level=6, aps=0.8
- Wolf: armorDefense=4, abilityDefense=0, dodge=8
- `hitRate(6, 8) = (6−8+80)/100 = 0.78`
- `computeDmg(5, 4, 0) = max(1, 5×100/104) ≈ 4.81`
- `dpTick = 0.8 × 4.81 × 0.78 / 80 ≈ 0.0374` progress/tick → wolf dies in ~27s
