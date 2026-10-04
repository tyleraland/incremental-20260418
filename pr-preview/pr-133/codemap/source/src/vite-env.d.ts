/// <reference types="vite/client" />

// Build-time git info injected by Vite `define` (see vite.config.ts). Global so
// both the Time→Debug panel and the ☰ Menu drawer can surface the latest commit.
declare const __GIT_HASH__: string
declare const __GIT_LOG__: { hash: string; message: string }[]
