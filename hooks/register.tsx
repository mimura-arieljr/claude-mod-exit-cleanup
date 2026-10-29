import { atom, read, update } from 'claude-code'
import type { CoreEngineInterface, Register } from 'claude-code'

const isAsking = atom({ plugin: 'exit-cleanup', key: 'isAsking' } as const, false)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// - Renames each path into the trash folder ($1), which is instant on one disk.
// - Then lets a background `rm` go, so a slow delete outlives the exit bound.
const TRASH_AND_DELETE = `
t=$1; shift
mkdir -p "$t" || exit 1
i=0
for p; do i=$((i+1)); if [ -e "$p" ]; then mv -- "$p" "$t/$i"; fi; done
nohup rm -rf -- "$t" >/dev/null 2>&1 &
`

// Finishes deletes an earlier exit cut short; skips ones still being moved in.
const SWEEP_TRASH = `
[ -d "$1" ] || exit 0
nohup find "$1" -mindepth 1 -maxdepth 1 -mmin +1 -exec rm -rf -- {} + >/dev/null 2>&1 &
`

async function configDir($: CoreEngineInterface): Promise<string> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom) return custom

  return `${await $.env.get('HOME')}/.claude`
}

function trashRoot(dir: string): string {
  return `${dir}/exit-cleanup-trash`
}

// This session's transcript, its sidecar folder, and its file checkpoints; null when the lookup failed.
async function historyPaths($: CoreEngineInterface, dir: string, id: string): Promise<string[] | null> {
  if (!UUID.test(id)) return []

  const found = await $.process.run(['find', `${dir}/projects`, '-maxdepth', '2', '-name', `${id}.jsonl`]).catch(() => null)
  const transcripts = found ? found.stdout.split('\n').filter(line => line.endsWith(`/${id}.jsonl`)) : []

  // A failed find that still found the transcript (e.g. one unreadable folder) is fine.
  if (transcripts.length === 0 && (!found || found.exitCode !== 0)) return null

  return [
    ...transcripts,
    ...transcripts.map(path => path.slice(0, -'.jsonl'.length)),
    `${dir}/file-history/${id}`,
    `${dir}/session-env/${id}`,
  ]
}

// What to remove once the session has ended; null keeps everything.
let doomed: { paths: string[]; trash: string } | null = null
let isLeaving = false

async function leave($: CoreEngineInterface, wipe: boolean) {
  doomed = null

  if (wipe) {
    const dir = await configDir($)
    const id = await $.session.id()
    const paths = await historyPaths($, dir, id)

    // Keep the choice row up rather than exit with the transcript silently kept.
    if (!paths) {
      $.ui.toast("Couldn't look up this session's transcript, so nothing was deleted. Pick 2 to exit anyway.")
      return
    }

    doomed = { paths, trash: `${trashRoot(dir)}/${id}` }
  }

  isLeaving = true
  await update($, isAsking, () => false)
  await $.command.run({ command: 'exit' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.process.run(['sh', '-c', SWEEP_TRASH, 'sh', trashRoot(await configDir($))]).catch(() => undefined)

    return next(e)
  })

  // `/quit` arrives here too, its alias resolved to `exit`.
  on('command.run', { command: 'exit' }, async ($, e, next) => {
    if (isLeaving || e.origin.kind !== 'composer') return next(e)

    await update($, isAsking, () => true)

    return { text: "Delete this session's history too? Press 1, 2 or 3." }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isAsking))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text>Exit: </Text>
        <Button key="wipe" hotkey="1" plain label="Delete history and exit" onPress={() => leave($, true)} />
        <Text>  </Text>
        <Button key="keep" hotkey="2" plain label="Keep history and exit" onPress={() => leave($, false)} />
        <Text>  </Text>
        <Button key="cancel" hotkey="3" plain label="Cancel" onPress={() => update($, isAsking, () => false)} />
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)

    if (doomed && doomed.paths.length > 0 && e.reason === 'prompt_input_exit') {
      // Nothing can be shown at exit; the next session's sweep retries leftovers.
      await $.process.run(['sh', '-c', TRASH_AND_DELETE, 'sh', doomed.trash, ...doomed.paths]).catch(() => undefined)
    }

    return result
  })
}
