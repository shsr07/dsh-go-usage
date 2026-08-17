# dsh-go-usage

[English](README.md) | [中文](README.zh.md)

**dsh-go-usage** is a [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) web plugin that shows your [OpenCode](https://opencode.ai) **GO** subscription usage as a bottom-right corner widget: rolling / weekly / monthly usage percentages with reset countdowns, collapsible to a right-edge vertical tab.

**dsh-go-usage** 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的 Web 插件：在页面右下角以角标组件显示你的 [OpenCode](https://opencode.ai) **GO** 套餐用量——滚动 / 每周 / 每月用量百分比与重置倒计时，可收起为右边缘竖条标签。

## Features

- **Three usage buckets** — rolling / weekly / monthly, matching the OpenCode console page.
- **Progress bars** — color shifts to amber at 80% and red at 100% (rate-limited).
- **Live countdowns** — "Resets in X days X hours / X hours X minutes" ticking every 15 seconds.
- **Auto refresh** — re-fetches every 60 seconds; the ↻ button refreshes manually.
- **Collapsible** — the » button collapses the card into a slim right-edge tab; click the tab to expand.
- **Theme-aware** — follows the DSH theme: pure white in light mode, pure black in dark mode.
- **Bilingual** — copy follows the DSH locale setting: Chinese (滚动用量 / 重置于 X 天 X 小时) or English (Rolling usage / Resets in X days X hours), switching live.

## Requirements

- Windows only (usage data is fetched via `powershell.exe`).
- Node.js >= 24, pnpm.

## Installation

### Prerequisites

- DeepSeek Harness (`dsh`) installed — `npm install -g @deepseek-ai/dsh`
- An [OpenCode](https://opencode.ai) account with an active **GO** subscription
- The `opencode-go` API key present in the local opencode auth file (set up by the OpenCode CLI):
  `%USERPROFILE%\.local\share\opencode\auth.json`

### From npm

```sh
dsh plugin --profile web add dsh-go-usage
```

### From source / GitHub

```sh
git clone https://github.com/shsr07/dsh-go-usage.git
cd dsh-go-usage
pnpm install
pnpm build
dsh plugin --profile web add link:<absolute-path-to-this-checkout>
```

> `link:` points at the local checkout — after editing, re-run `pnpm build` and restart the web service. You can also install straight from a git host: `dsh plugin --profile web add github:shsr07/dsh-go-usage#<sha>` (the package ships a `prepare` script that builds from source; allow the build when pnpm asks).

### After installation

Restart the web service (`dsh web`), then look at the **bottom-right corner** of the page.

## Configuration

All settings are optional; the defaults work out of the box. Add a `config:` block to the plugin row in your profile's `cordis.patch.yml` to override:

```yaml
- id: go-usage
  name: 'dsh-go-usage'
  config:
    authJsonPath: 'C:\Users\me\.local\share\opencode\auth.json'
    apiUrl: 'https://opencode.ai/zen/go/v1/usage'
    powershellExe: 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
    timeoutSec: 15
```

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `authJsonPath` | string | `$USERPROFILE/.local/share/opencode/auth.json` (or `$HOME`) | Absolute path of the opencode `auth.json` containing the `opencode-go` API key. |
| `apiUrl` | string | `https://opencode.ai/zen/go/v1/usage` | The OpenCode GO usage API endpoint. |
| `powershellExe` | string | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | The PowerShell executable the fetch runs. |
| `timeoutSec` | number | `15` | API request timeout in seconds (1–120). |

## How it works

- The **host half** registers a fenced JSON route `/go-usage/api/usage` on the DSH web server. Each request runs one `powershell.exe` invocation: it reads the `opencode-go` API key from the local opencode `auth.json`, calls `https://opencode.ai/zen/go/v1/usage`, and returns the parsed buckets. TLS 1.2 is enabled explicitly because Windows PowerShell 5.1 defaults to older TLS.
- The **browser half** registers the corner widget into the frame overlay (`shell.overlay`) and fetches the same-origin route every 60 seconds.
- The route is protected by the same trust fence as the DSH `/api` gateway (loopback Host header or the connection row's `trustedHosts`), so a cross-site page cannot reach it.

## Privacy

- The API key stays on your machine: it is read from your local `auth.json` by the host process and never leaves it.
- Only the three usage percentages and reset timestamps are displayed; nothing is sent anywhere except the request to `opencode.ai` itself.

## License

[MIT](https://github.com/shsr07/dsh-go-usage/blob/main/LICENSE)
