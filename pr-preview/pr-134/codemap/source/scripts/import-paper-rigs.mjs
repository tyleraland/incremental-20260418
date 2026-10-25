// Paper Rig Workbench v2 → runtime PaperRigSpec importer.
//
// The workbench is an authoring artifact, not an application dependency. This
// script opens it in Chromium, asks its own exporter for each requested model,
// validates the opaque paper contract, and keeps only fields consumed by the
// runtime projector. Generated JSON is deterministic and intentionally small.
//
//   node scripts/import-paper-rigs.mjs paper-rig-workbench_v2.html horse humanoid rhino


import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [input, ...requestedModels] = process.argv.slice(2)
if (!input || requestedModels.length === 0) {
  console.error('usage: node scripts/import-paper-rigs.mjs <workbench.html> <model...>')
  process.exit(1)
}

const outputDir = resolve('src/render/paperRig/generated')
const workbenchUrl = pathToFileURL(resolve(input)).href
const browser = await chromium.launch({ headless: true })

const pick = (object, keys) => Object.fromEntries(keys.map((key) => [key, object[key]]))

function runtimeSpec(source) {
  const joints = source.joints.map((joint) => pick(joint, [
    'id', 'stableId', 'parentId', 'localBindPositionMeters', 'localBindRotationDegrees',
    'semanticRole', 'absoluteSide', 'mirroredCounterpartId', 'groundContact', 'coverageGasketId',
  ]))
  const renderableKeys = [
    'id', 'stableId', 'semanticRole', 'bodyRegion', 'side', 'attachment', 'localGeometry',
    'depthBias', 'paletteRole', 'opacity', 'intentionalHoles', 'compositingGroup',
    'eligibleCompositingGroups', 'headingSwapsNearFar', 'silhouetteCritical', 'lodTier',
    'lodMergeGroup',
  ]
  const plates = source.plates.map((plate) => pick(plate, [...renderableKeys, 'mirrorPlateId']))
  const gaskets = source.gaskets.map((gasket) => pick(gasket, [...renderableKeys, 'jointId', 'diameterMeters']))
  const paintRegions = source.paintRegions.map((region) => pick(region, [
    'id', 'owningPlateId', 'closedPath', 'coordinateSpace', 'paletteRole', 'opacity',
    'mirrorBehavior', 'lodTier', 'compileMode', 'intentionalHoles',
  ]))
  const anchors = source.anchors.map((anchor) => pick(anchor, [
    'id', 'boneId', 'localPositionMeters', 'localRotationDegrees', 'moduleType',
    'paletteRole', 'opacity', 'lodTier',
  ]))
  const clips = Object.fromEntries(Object.entries(source.clips).map(([id, clip]) => [id, pick(clip, [
    'id', 'inherits', 'durationMs', 'loop', 'easing',
  ])]))

  return {
    ...pick(source, [
      'schema', 'schemaVersion', 'generatorVersion', 'modelId', 'stableModelId', 'family',
      'heightMeters', 'scale', 'opacityInvariant',
    ]),
    joints,
    groundContacts: source.groundContacts,
    plates,
    gaskets,
    coreOccluder: pick(source.coreOccluder, [
      'id', 'memberPlateIds', 'memberGasketIds', 'paletteRole', 'opacity',
      'intentionalHoles', 'compositingGroup',
    ]),
    compositingPolicy: source.compositingPolicy,
    paintRegions,
    anchors,
    clips,
    directionalBake: pick(source.directionalBake, [
      'headingsDegrees', 'validationElevationsDegrees',
    ]),
    lod: source.lod,
    validation: pick(source.validation, ['status', 'issues']),
  }
}

try {
  const page = await browser.newPage()
  await page.goto(workbenchUrl)
  await page.waitForFunction(() => document.documentElement.dataset.rigReady === 'true')
  const available = await page.locator('#modelSel option').evaluateAll((options) => options.map((option) => option.value))
  await mkdir(outputDir, { recursive: true })

  for (const model of requestedModels) {
    if (!available.includes(model)) throw new Error(`unknown model '${model}' in ${basename(input)}`)
    await page.selectOption('#modelSel', model)
    const exported = await page.evaluate(() => globalThis.rigPayload())
    if (exported.validation.status !== 'passed') {
      throw new Error(`${model} failed workbench validation: ${JSON.stringify(exported.validation.issues)}`)
    }
    const output = resolve(outputDir, `${model}.json`)
    const serialized = `${JSON.stringify(runtimeSpec(exported), null, 2)}\n`
    await writeFile(output, serialized)
    console.log(`${model.padEnd(9)} ${serialized.length.toLocaleString().padStart(7)} bytes → ${output}`)
  }
} finally {
  await browser.close()
}
