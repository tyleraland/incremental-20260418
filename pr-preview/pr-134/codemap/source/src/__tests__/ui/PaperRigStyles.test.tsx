import { render } from '@testing-library/react'
import PaperRigStyleSheet from '@/dev/PaperRigStyleSheet'

describe('paper-rig style bake', () => {
  it('renders all three imported specimens in both fully opaque styles at 60 degrees', () => {
    const { container } = render(<PaperRigStyleSheet />)
    expect(container.querySelectorAll('[data-paper-rig-asset]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-paper-rig-style="rim-ink"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-paper-rig-style="stencil-5"]')).toHaveLength(3)
    expect([...container.querySelectorAll('[data-rig-elevation]')].every((node) => node.getAttribute('data-rig-elevation') === '60')).toBe(true)
    expect(container.querySelector('[data-paper-rig-asset="horse"]')).toBeTruthy()
    expect(container.querySelector('[data-paper-rig-asset="humanoid"]')).toBeTruthy()
    expect(container.querySelector('[data-paper-rig-asset="rhino"]')).toBeTruthy()
  })

  it('uses five solid stencil values without SVG transparency or effects', () => {
    const { container } = render(<PaperRigStyleSheet />)
    const stencil = [...container.querySelectorAll<SVGSVGElement>('[data-paper-rig-style="stencil-5"]')]
    for (const svg of stencil) {
      const bands = new Set([...svg.querySelectorAll('[data-rig-depth-band]')].map((node) => node.getAttribute('fill')))
      expect(bands.size).toBe(5)
      expect(svg.querySelector('filter, mask, linearGradient, radialGradient')).toBeNull()
      expect(svg.innerHTML).not.toMatch(/(?:fill-)?opacity/i)
      expect([...svg.querySelectorAll('[data-rig-part]')].every((part) => !part.hasAttribute('stroke'))).toBe(true)
    }
  })
})
