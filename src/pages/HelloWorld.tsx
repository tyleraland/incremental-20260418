import { useEffect } from 'react'
import { useResourceStore } from '@/stores/useResourceStore'

export function HelloWorld() {
  const { gold, goldPerSecond, workers, collect, addWorker, tick } =
    useResourceStore()

  useEffect(() => {
    const id = setInterval(tick, 50)
    return () => clearInterval(id)
  }, [tick])

  return (
    <div className="flex flex-col items-center justify-center min-h-full gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-game-primary mb-2">Incremental</h1>
        <p className="text-game-text-dim text-sm">Worker placement · Skill trees · Crafting</p>
      </div>

      <div className="panel w-full max-w-sm text-center">
        <div className="text-game-text-dim text-xs uppercase tracking-widest mb-1">Gold</div>
        <div className="resource-value text-3xl">{Math.floor(gold).toLocaleString()}</div>
        {goldPerSecond > 0 && (
          <div className="text-game-green text-xs mt-1">+{goldPerSecond}/sec</div>
        )}
      </div>

      <div className="flex gap-4">
        <button className="btn-primary" onClick={collect}>
          Collect Gold
        </button>
        <button
          className="btn-primary disabled:opacity-40"
          onClick={addWorker}
          disabled={Math.floor(gold) < workers * 10 + 10}
        >
          Hire Worker ({workers * 10 + 10}g)
        </button>
      </div>

      <div className="panel w-full max-w-sm">
        <div className="text-game-text-dim text-xs uppercase tracking-widest mb-3">Workers</div>
        <div className="text-2xl font-semibold">{workers}</div>
        <div className="text-game-text-dim text-xs mt-1">
          {workers === 0 ? 'Hire your first worker to automate gold collection.' : `${workers} worker${workers > 1 ? 's' : ''} generating ${goldPerSecond} gold/sec`}
        </div>
      </div>

      <p className="text-game-muted text-xs text-center max-w-xs">
        Hello World — full UI overhaul coming soon
      </p>
    </div>
  )
}
