export type IsAsking = boolean

declare module 'claude-code' {
  interface PluginState {
    'exit-cleanup': { isAsking: IsAsking }
  }
}
