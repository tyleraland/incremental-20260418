// Complexity lens — per-function metrics straight off the ts-morph AST. Fully
// deterministic (no runtime, no deps beyond ts-morph): same source → same output.
//
// Per function: cyclomatic (McCabe, exact), cognitive (SonarSource-style,
// approximate — see note), max nesting depth, LOC, param count.
// Per file: worst/avg/sum of the above + a Maintainability Index (0–100) from an
// approximate Halstead volume.
//
// Each function's metrics cover its OWN body only — traversal stops at nested
// function boundaries, so a nested arrow doesn't inflate its parent (the nested
// fn is measured separately). Cognitive counts each `if` as +1+nesting, so long
// else-if chains read slightly high vs. the canonical spec; labelled approximate.

import { Project, SyntaxKind as SK } from 'ts-morph'
import { relative, join } from 'node:path'

const FN_KINDS = new Set([
  SK.FunctionDeclaration, SK.FunctionExpression, SK.ArrowFunction,
  SK.MethodDeclaration, SK.Constructor, SK.GetAccessor, SK.SetAccessor,
])
const isFn = (k) => FN_KINDS.has(k)
// cyclomatic decision nodes (each +1)
const CYCLO = new Set([
  SK.IfStatement, SK.ForStatement, SK.ForInStatement, SK.ForOfStatement,
  SK.WhileStatement, SK.DoStatement, SK.CaseClause, SK.CatchClause, SK.ConditionalExpression,
])
// cognitive: structures that add (1 + nesting) AND increase nesting for their body
const COG_NEST = new Set([
  SK.IfStatement, SK.ConditionalExpression, SK.SwitchStatement,
  SK.ForStatement, SK.ForInStatement, SK.ForOfStatement,
  SK.WhileStatement, SK.DoStatement, SK.CatchClause,
])

export function extractComplexity({ REPO }) {
  const rel = (p) => relative(REPO, p).split('\\').join('/')
  const project = new Project({ tsConfigFilePath: join(REPO, 'tsconfig.json'), skipAddingFilesFromTsConfig: false })
  const files = project.getSourceFiles().filter((f) => {
    const p = rel(f.getFilePath())
    return p.startsWith('src/') && !p.includes('__tests__') && !/\.(test|spec)\.[tj]sx?$/.test(p)
  })

  const functions = []
  const byFile = {}

  for (const f of files) {
    const path = rel(f.getFilePath())
    const fileFns = []
    // collect function-like nodes
    f.forEachDescendant((node) => {
      if (!isFn(node.getKind())) return
      const { cyclomatic, cognitive, depth } = measure(node)
      const loc = node.getEndLineNumber() - node.getStartLineNumber() + 1
      const params = node.getParameters ? node.getParameters().length : 0
      const rec = { file: path, name: fnName(node), line: node.getStartLineNumber(), cyclomatic, cognitive, depth, loc, params }
      functions.push(rec)
      fileFns.push(rec)
    })
    const hal = halstead(f)
    const sloc = f.getEndLineNumber()
    const cc = fileFns.length ? fileFns.reduce((s, r) => s + r.cyclomatic, 0) / fileFns.length : 1
    // Microsoft-style Maintainability Index, normalized to 0–100.
    const mi = Math.max(0, Math.min(100,
      (171 - 5.2 * Math.log(hal.volume || 1) - 0.23 * cc - 16.2 * Math.log(sloc || 1)) * 100 / 171))
    byFile[path] = {
      functions: fileFns.length,
      maxCyclomatic: fileFns.reduce((m, r) => Math.max(m, r.cyclomatic), 0),
      sumCyclomatic: fileFns.reduce((s, r) => s + r.cyclomatic, 0),
      maxCognitive: fileFns.reduce((m, r) => Math.max(m, r.cognitive), 0),
      maxDepth: fileFns.reduce((m, r) => Math.max(m, r.depth), 0),
      mi: +mi.toFixed(1),
      worst: fileFns.slice().sort((a, b) => b.cyclomatic - a.cyclomatic)[0]?.name || null,
    }
  }

  functions.sort((a, b) => b.cyclomatic - a.cyclomatic || b.cognitive - a.cognitive)
  const cc = functions.map((f) => f.cyclomatic)
  return {
    stats: {
      files: files.length,
      functions: functions.length,
      totalCyclomatic: cc.reduce((s, v) => s + v, 0),
      over10: functions.filter((f) => f.cyclomatic > 10).length,
      over20: functions.filter((f) => f.cyclomatic > 20).length,
      medianMi: median(Object.values(byFile).map((v) => v.mi)),
    },
    functions,
    byFile,
  }
}

// Recursive walk of a function body; stops at nested-function boundaries.
function measure(fnNode) {
  let cyclomatic = 1
  let cognitive = 0
  let maxDepth = 0
  const walk = (node, nesting) => {
    node.forEachChild((child) => {
      const k = child.getKind()
      if (isFn(k)) return // nested function: measured on its own
      if (CYCLO.has(k)) cyclomatic++
      if (k === SK.BinaryExpression) {
        const op = child.getOperatorToken().getText()
        if (op === '&&' || op === '||' || op === '??') cyclomatic++
      }
      const nests = COG_NEST.has(k)
      if (nests) cognitive += 1 + nesting
      const childNesting = nesting + (nests ? 1 : 0)
      if (childNesting > maxDepth) maxDepth = childNesting
      walk(child, childNesting)
    })
  }
  walk(fnNode, 0)
  return { cyclomatic, cognitive, depth: maxDepth }
}

// Approximate Halstead volume over a file: operators vs operands from token kinds.
function halstead(sourceFile) {
  const operators = new Map(), operands = new Map()
  sourceFile.forEachDescendant((n) => {
    const k = n.getKind()
    if (k === SK.Identifier || k === SK.NumericLiteral || k === SK.StringLiteral ||
        k === SK.TrueKeyword || k === SK.FalseKeyword || k === SK.NullKeyword) {
      const t = n.getText(); operands.set(t, (operands.get(t) || 0) + 1)
    } else if (n.getChildCount() === 0 && k !== SK.EndOfFileToken) {
      const t = n.getText(); if (t) operators.set(t, (operators.get(t) || 0) + 1)
    }
  })
  const n1 = operators.size, n2 = operands.size
  const N1 = [...operators.values()].reduce((s, v) => s + v, 0)
  const N2 = [...operands.values()].reduce((s, v) => s + v, 0)
  const vocab = n1 + n2, len = N1 + N2
  return { volume: vocab > 0 ? len * Math.log2(vocab) : 0 }
}

function fnName(node) {
  if (node.getName && node.getName()) return node.getName()
  const vd = node.getFirstAncestorByKind(SK.VariableDeclaration)
  if (vd) return vd.getName()
  const pa = node.getFirstAncestorByKind(SK.PropertyAssignment)
  if (pa) return pa.getName()
  if (node.getKind() === SK.Constructor) return 'constructor'
  return '(anonymous)'
}

const median = (arr) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1)
}
