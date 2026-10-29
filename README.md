# exit-cleanup

A Claude Code mod: when you type `/exit` or `/quit`, it asks whether to delete this session's history before leaving.

A row appears above the prompt:

- **1** Delete history and exit
- **2** Keep history and exit
- **3** Cancel

Choosing 1 removes, under `~/.claude` (or `$CLAUDE_CONFIG_DIR`):

- the session's transcript, `projects/<project>/<session-id>.jsonl`, and its sidecar folder
- its file checkpoints, `file-history/<session-id>`
- its environment folder, `session-env/<session-id>`

The session then no longer shows in `/resume`.

## How the delete works

Claude Code gives exit hooks about 1.5 seconds in total, so the mod does not delete in place:

- At exit, it renames the files into `~/.claude/exit-cleanup-trash/<session-id>/`, which is instant.
- A background `rm` then deletes that folder, finishing even after Claude has quit.
- Each new session clears anything left in the trash folder that is over a minute old.

If the transcript can't be located when you press 1, nothing is deleted: a toast says so and the row stays up, so you can press 2 to exit anyway.

Only a normal exit from the prompt asks. Ctrl+C, Ctrl+D or closing the terminal exits without asking and keeps everything.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install exit-cleanup --marketplace mimura-arieljr/claude-mod-exit-cleanup
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```sh
claude plugin install exit-cleanup --marketplace mimura-arieljr/claude-mod-exit-cleanup
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `mimura-arieljr/claude-mod-exit-cleanup`, then Add plugin.

## Run from this folder

```sh
claude --plugin-dir /path/to/claude-mod-exit-cleanup
```

## Develop

```sh
claude plugin validate .
```
