# GPT Image Playground

基于托管网关的图片生成与编辑工具。提供简洁精美的 Web UI，支持文本生图、参考图与遮罩编辑，历史记录与图片仍保存在浏览器本地，但上游 API、密钥、额度和登录由第一方网关统一管理。

> 若需调用非 HTTPS 的内网或本地 HTTP API，请使用 GitHub Pages 版本或自行部署，Vercel 部署的体验版绑定的 `.dev` 域名因安全策略通常要求接口必须为 HTTPS。

[**🌐 Vercel 在线体验**](https://gpt-image-playground.cooksleep.dev) &nbsp;|&nbsp; [**🌐 GitHub Pages 在线体验**](https://cooksleep.github.io/gpt_image_playground)

---

## 🔐 当前运行模式

当前仓库默认是 **托管网关模式**：

- 终端用户不再填写 `API URL`、`API Key` 或代理地址
- 前端只请求同源的 `/api/*`
- 登录使用「邮箱 + 访问码」
- 剩余额度由服务端校验与扣减
- 上游图片 API 由服务端自动选择和失败切换

第一版限制：

- 生成结果直接通过 `base64` 返回前端
- 单次请求只支持 `1` 张输出图
- 参考图请求体受 Vercel Functions `4.5 MB` 限制影响，过大的参考图会在前端提前拦截

---

## 📸 界面预览

<details>
<summary><b>点击展开截图展示</b></summary>
<br>

<div align="center">
  <b>桌面端主界面</b><br>
  <img src="docs/images/example_pc_1.png" alt="桌面端主界面" />
</div>

<br>

<div align="center">
  <b>任务详情与实际参数</b><br>
  <img src="docs/images/example_pc_2.png" alt="任务详情与实际参数" />
</div>

<br>

<div align="center">
  <b>桌面端批量选择</b><br>
  <img src="docs/images/example_pc_3.png" alt="桌面端批量选择" />
</div>

<br>

<div align="center">
  <b>移动端主界面</b><br>
  <img src="docs/images/example_mb_1.jpg" alt="移动端主界面" width="420" />
</div>

<br>

<div align="center">
  <b>移动端侧滑多选</b><br>
  <img src="docs/images/example_mb_2.jpg" alt="移动端侧滑多选" width="420" />
</div>

</details>

---

## ✨ 核心特性

### 🎨 强大的图像生成与编辑
- **双模接口支持**：自由切换使用常规 `Images API` (`/v1/images`) 或 `Responses API` (`/v1/responses`)。
- **参考图与遮罩**：支持上传最多 16 张参考图（支持剪贴板和拖拽）。内置可视化遮罩编辑器，自动预处理以符合官方分辨率限制。
- **批量与迭代**：支持单次多图生成；一键将满意结果转为参考图，无缝开启下一轮修改。

### ⚙️ 精细化参数追踪
- **智能尺寸控制**：提供 1K/2K/4K 快速预设，自定义宽高时会自动规整至模型安全范围（16 的倍数、总像素校验等）。
- **实际参数对比**：自动提取 API 响应中真实生效的尺寸、质量、耗时以及**模型改写后的提示词**，与你的请求参数高亮对比。

### 📁 高效历史管理 (纯本地)
- **瀑布流与画廊**：历史任务自动保存，支持按状态过滤、全屏大图预览与快捷下载。
- **快捷批量操作**：桌面端支持鼠标拖拽框选、Ctrl/⌘ 连选，移动端支持顺滑侧滑多选；轻松实现批量收藏与清理。
- **极致性能与隐私**：所有记录与图片均存放在浏览器 IndexedDB 中（采用 SHA-256 去重压缩），不经过任何第三方服务器。支持一键打包导出 ZIP 备份。

### 🔌 API 兼容增强
- **Codex CLI 兼容模式**：专为非标准 API (如 Codex CLI) 打造。开启后自动固定无效参数，将 Images API 的多图请求拆分为并发单图。
- **提示词防改写**：Responses API 会始终在请求文本前加入强制指令防止提示词被改写；开启 Codex CLI 模式后，Images API 也会获得同等保护。

---

## 🚀 部署与使用

支持多种部署与开发方式。当前版本的重点部署目标是 **Vercel + Vercel Functions**。

<details>
<summary><strong>▲ 方式一：Vercel 一键部署 (推荐)</strong></summary>

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCookSleep%2Fgpt_image_playground&project-name=gpt-image-playground&repository-name=gpt-image-playground)

点击上方按钮导入仓库即可，Vercel 会自动执行构建并部署前端与 `api/` 函数。

**至少需要配置这些环境变量：**

- `MANAGED_GATEWAY_SESSION_SECRET`
- `ADMIN_SECRET`
- `MANAGED_GATEWAY_PRIMARY_BASE_URL`
- `MANAGED_GATEWAY_PRIMARY_API_KEY`
- `MANAGED_GATEWAY_PRIMARY_MODEL`，例如 `gpt-image-2`

**可选环境变量：**

- `MANAGED_GATEWAY_PRIMARY_LABEL`
- `MANAGED_GATEWAY_SECONDARY_BASE_URL`
- `MANAGED_GATEWAY_SECONDARY_API_KEY`
- `MANAGED_GATEWAY_SECONDARY_MODEL`
- `MANAGED_GATEWAY_SECONDARY_LABEL`
- `MANAGED_GATEWAY_CREDITS_PER_REQUEST`
- `MANAGED_GATEWAY_MAX_INPUT_IMAGE_BYTES`
- `DATABASE_URL`：部署环境建议提供，用于持久化客户、会话和额度

**管理员操作：**

部署完成后，使用管理员脚本创建客户并发放访问码：

```bash
npm run gateway:admin -- create-customer --email customer@example.com --name "Customer" --credits 100

管理员后台入口为 `/admin`。进入后使用 `ADMIN_SECRET` 登录，可查看客户、创建客户、加额度和查看最近使用记录。
```

**配置自动更新**：

本项目已在 `vercel.json` 中关闭了默认的自动部署。若需在同步 GitHub 上游代码后自动更新 Vercel 部署：

1. 在 GitHub 仓库配置 Actions secrets：
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
2. 推送前先在本地执行：

```bash
npm run ci:local
```

3. `.github/workflows/ci.yml` 会在 `pull_request` 和 `main` 分支推送时执行：
   - `npm ci`
   - `npm run build`
   - `npm test`
4. `.github/workflows/vercel-production.yml` 会在 `main` 分支推送或手动触发时执行生产部署，并在部署前再次跑同样的校验，再使用 `vercel build` + `vercel deploy --prebuilt --prod` 发布。

</details>

<details>
<summary><strong>🐳 方式二：Docker 部署</strong></summary>

官方镜像已发布至 GitHub Container Registry。Docker 部署支持在运行时注入默认配置。

**环境变量说明：**

- `DEFAULT_API_URL`：设置页面上默认显示的 API 地址。
- `API_PROXY_URL`：配置内置代理实际转发到的目标 API 地址（仅开启代理时有效）。
- `ENABLE_API_PROXY`：设为 `true` 开启容器内置 Nginx 同源代理，用于解决浏览器跨域（CORS）限制。开启后，浏览器将请求同源的 `/api-proxy/`，再由 Nginx 转发至 `API_PROXY_URL`。
- `HOST` / `PORT`：指定容器内 Nginx 监听的地址和端口（默认 `0.0.0.0:80`）。

> ⚠️ **安全警告**：开启 API 代理后，任何人都能将你的服务器作为代理来请求目标 API。建议仅在有访问控制（如 IP 白名单）或本地网络中开启。

> 💡 **兼容迁移**：旧版本中的 `API_URL` 已拆分为 `DEFAULT_API_URL` 和 `API_PROXY_URL`。容器启动时会自动将遗留的 `API_URL` 作为两个新变量的兜底值，实现无缝兼容。建议更新配置文件，逐步迁移至新变量。

**1. Docker CLI 示例**

```bash
docker run -d -p 8080:80 \
  -e DEFAULT_API_URL=https://api.openai.com/v1 \
  -e ENABLE_API_PROXY=true \
  -e API_PROXY_URL=https://api.openai.com/v1 \
  ghcr.io/cooksleep/gpt_image_playground:latest
```

*(注：使用 host 网络时加 `--network host`，修改容器监听端口使用 `-e PORT=28080`)*

**2. Docker Compose 示例**

```yaml
services:
  gpt-image-playground:
    image: ghcr.io/cooksleep/gpt_image_playground:latest
    environment:
      - DEFAULT_API_URL=https://api.openai.com/v1
    ports:
      - "8080:80"
    restart: unless-stopped
```

**更新说明：**

使用 `latest` 标签时，重新拉取镜像并重启即可更新（如 `docker compose pull && docker compose up -d`）。若需固定版本可使用官方提供的版本号标签（如 `0.2.x`）。

</details>

<details>
<summary><strong>💻 方式三：本地开发与静态构建</strong></summary>

**1. 环境准备与启动**

本地开发不强制依赖数据库。若未提供 `DATABASE_URL`，项目会退回到本地 JSON 文件存储（默认 `.local-managed-gateway-store.json`，已加入 `.gitignore`）。

建议至少配置：

```bash
MANAGED_GATEWAY_SESSION_SECRET=dev-session-secret
MANAGED_GATEWAY_PRIMARY_BASE_URL=https://your-provider.example/v1
MANAGED_GATEWAY_PRIMARY_API_KEY=sk-xxxx
MANAGED_GATEWAY_PRIMARY_MODEL=gpt-image-2
```

然后安装依赖并启动：

```bash
npm install
npm run dev
```

**2. 初始化本地客户账号**

创建一个本地客户并拿到访问码：

```bash
npm run gateway:admin -- create-customer --email demo@example.com --name Demo --credits 10
```

随后在页面里用该邮箱和访问码登录即可。

**3. 构建静态产物**

```bash
npm run build
```

构建输出的文件位于 `dist/` 目录下，可将其部署至任何静态文件服务器（如普通 Nginx、GitHub Pages、Netlify 等）。

</details>

---

## 🧾 账户与运维

当前版本不再支持通过前端 URL 参数注入上游 `apiUrl`、`apiKey` 或 provider 设置。

面向管理员的常用脚本：

```bash
# 创建客户
npm run gateway:admin -- create-customer --email customer@example.com --name "Customer" --credits 100

# 给客户加额度
npm run gateway:admin -- grant-credits --customer-id customer_xxx --credits 50 --reason "manual recharge"

# 查看客户
npm run gateway:admin -- list-customers
```

面向终端用户的操作只有两步：

1. 用管理员分配的邮箱和访问码登录
2. 直接生成图片，额度和上游路由由系统自动处理

---

## 💻 技术栈

- **前端框架**：[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **构建工具**：[Vite](https://vite.dev/)
- **样式方案**：[Tailwind CSS 3](https://tailwindcss.com/)
- **状态管理**：[Zustand](https://zustand.docs.pmnd.rs/)

## 📄 许可证 & 致谢

本项目基于 [MIT License](LICENSE) 开源。

特别致谢：[LINUX DO](https://linux.do)

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CookSleep/gpt_image_playground&type=Date)](https://www.star-history.com/#CookSleep/gpt_image_playground&Date)
