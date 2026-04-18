import { create } from 'zustand'

interface ResourceState {
  gold: number
  goldPerSecond: number
  workers: number
  collect: () => void
  addWorker: () => void
  tick: () => void
}

export const useResourceStore = create<ResourceState>((set) => ({
  gold: 0,
  goldPerSecond: 0,
  workers: 0,
  collect: () => set((s) => ({ gold: s.gold + 1 })),
  addWorker: () =>
    set((s) => ({
      workers: s.workers + 1,
      goldPerSecond: s.goldPerSecond + 1,
    })),
  tick: () => set((s) => ({ gold: s.gold + s.goldPerSecond / 20 })),
}))
