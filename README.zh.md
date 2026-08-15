# dsh-go-usage

[English](README.md) | [中文](README.zh.md)

**dsh-go-usage** 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的 Web 插件：在页面右下角显示你的 [OpenCode](https://opencode.ai) **GO** 套餐用量——滚动 / 每周 / 每月用量百分比与重置倒计时，可收起为右边缘竖条标签。

## 功能

- **三个用量条** —— 滚动 / 每周 / 每月，与 OpenCode 控制台页面一致。
- **进度条** —— 达到 80% 变黄、100%（限流）变红。
- **实时倒计时** —— 「重置于 X 天 X 小时 / X 小时 X 分钟」，每 15 秒刷新。
- **自动刷新** —— 每 60 秒重新拉取；↻ 按钮手动刷新。
- **可收起** —— » 按钮把卡片收起为右边缘的细竖条；点击竖条展开。
- **跟随主题** —— 与 DSH 主题一致：浅色模式纯白，深色模式纯黑。
- **双语** —— 文案跟随 DSH 语言设置：中文（滚动用量 / 重置于 X 天 X 小时）或英文（Rolling usage / Resets in X days X hours），切换即时生效。

## 安装

### 前置条件

- 已安装 DeepSeek Harness（`dsh`）—— `npm install -g @deepseek-ai/dsh`
- 拥有 [OpenCode](https://opencode.ai) 账号且已开通 **GO** 订阅
- 本地 opencode auth 文件中存在 `opencode-go` API key（由 OpenCode CLI 生成）：
  `%USERPROFILE%\.local\share\opencode\auth.json`

### 从 npm 安装

```sh
dsh plugin --profile web add dsh-go-usage
```

### 从源码 / GitHub 安装

```sh
git clone https://github.com/shsr07/dsh-go-usage.git
cd dsh-go-usage
pnpm install
pnpm build
dsh plugin --profile web add link:<本仓库绝对路径>
```

> `link:` 指向本地检出——修改代码后重新 `pnpm build` 并重启 web 服务即可生效。也可以直接从 git 主机安装：`dsh plugin --profile web add github:shsr07/dsh-go-usage#<sha>`（包内 `prepare` 脚本会从源码构建；pnpm 询问时请允许构建）。

### 安装后

重启 web 服务（`dsh web`），查看页面**右下角**。

## 工作原理

- **host 半** 在 DSH web 服务器上注册受信任围栏保护的 JSON 路由 `/go-usage/api/usage`。每次请求运行一次 `powershell.exe`：读取本地 opencode `auth.json` 中的 `opencode-go` API key，调用 `https://opencode.ai/zen/go/v1/usage`，返回解析后的用量桶。显式启用 TLS 1.2，因为 Windows PowerShell 5.1 默认使用旧版 TLS。
- **浏览器半** 把角标组件注册进帧级浮动层（`shell.overlay`），每 60 秒请求同源路由。
- 路由使用与 DSH `/api` 网关相同的信任围栏（回环 Host 头或 connection 行的 `trustedHosts`），跨站页面无法访问。

## 隐私

- API key 只留在本机：由 host 进程从你的本地 `auth.json` 读取，不会离开机器。
- 只展示三个用量百分比和重置时间戳；除对 `opencode.ai` 自身的请求外，不向任何地方发送数据。

## 要求

- 仅支持 Windows（用量数据通过 `powershell.exe` 获取）。
- Node.js >= 24，pnpm。

## License

[MIT](https://github.com/shsr07/dsh-go-usage/blob/main/LICENSE)
