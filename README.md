# cc-usage

A Claude Code status line showing your plan usage, tokens, cost and live speed. Works in the desktop app's Code tab and the CLI.

```
cc-usage  ⏳ 5% | 2h 11m   📅 1% | 5d 6h   ⬆️ 99.9k   ⬇️ 6.2k   💵 10.6   ⚡ 𝟷𝟺𝟺.𝟶 t/s
```

| Field | Meaning |
|---|---|
| ⏳ | 5-hour limit used, and time until it resets |
| 📅 | 7-day limit used, and time until it resets |
| ⬆️ | Input tokens sent this session (fresh input plus prompt-cache reads and writes, summed over every request) |
| ⬇️ | Output tokens this session; counts up live while Claude replies |
| 💵 | Session cost in US dollars |
| ⚡ | Output tokens per second; live while Claude replies, then the exact figure for the last reply. Fixed width (monospace digits) so the line does not shift as it updates |

## Install

In Claude Code:

```
/plugin marketplace add leonardokidd/cc-usage
/plugin install cc-usage@cc-usage
```

Requires Claude Code 2.1.286 or newer (function-hook plugins, an early-access feature that may change between releases).

## Commands

- `/usage-bar` shows or hides the line.
- `/usage-bar raw` prints the raw rate-limit and cost figures Claude Code hands the plugin.

## Notes

- **Usage figures need a Claude subscription.** Off a subscription the ⏳ and 📅 fields show `--`.
- **Usage can lag Settings → Usage by up to one reply.** The figures arrive with each API response, so use in other chats appears after this session's next reply.
- **Percentages are whole numbers.** Claude Code reports whole points, so they can differ from Settings by 1.
- **⬆️ and ⬇️ cover the main conversation only.** Subagent turns pass through uncounted.
- **Read-only.** The plugin observes the session and adds one status line; it does not change prompts, tool calls, replies or anything else Claude Code draws.

## License

MIT. See [LICENSE](LICENSE).
