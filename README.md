# 雨课堂刷课+刷题助手

> 雨课堂视频全自动播放 + AI 大模型自动作答，一键挂机。

[![Version](https://img.shields.io/badge/version-2.5.1-blue)](https://github.com/CAZAMA1/YuketangGoodbye)
[![License](https://img.shields.io/badge/license-GPL--3.0-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Tampermonkey-orange)](https://www.tampermonkey.net/)
[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-install-red)](https://greasyfork.org/zh-CN/scripts/YOUR_SCRIPT_ID)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🎬 视频自动播放 | 自动进入课程并开始播放，支持 2x/3x 等多倍速 |
| 🔇 自动静音 | 播放时自动静音，不影响其他操作 |
| ⏩ PPT 自动翻页 | 自动播放 PPT 课件 |
| 🔄 批量课程 | 支持批量（合集）课程的全自动逐集播放 |
| 🛡️ 防切屏检测 | 阻止雨课堂切屏/失焦检测，切换标签页不中断 |
| ✅ 智能跳过 | 在列表页直接识别已完成项目并跳过，无需进入详情页 |
| 🤖 AI 自动答题 | 截图 + OCR 识别题目，调用 AI 大模型返回答案并自动点击提交 |
| 🔧 可视化配置 | 内置浮窗配置面板，支持服务商下拉选择、一键获取模型列表 |

---

## 🌐 适配网站

- `*.yuketang.cn`（雨课堂主站，含长江版等各分站）
- `*.gdufemooc.cn`（广东金融学院 MOOC）
- `*.xuetangx.com`（学堂在线，限考试页面）

---

## 🤖 支持的 AI 服务商

| 服务商 | 推荐模型 |
|--------|---------|
| DeepSeek | `deepseek-chat`、`deepseek-reasoner` |
| Kimi (Moonshot) | `moonshot-v1-8k`、`moonshot-v1-32k` |
| 通义千问 (DashScope) | `qwen-plus`、`qwen-max` |
| OpenAI | `gpt-4o`、`gpt-4o-mini` |
| Google Gemini | `gemini-2.0-flash`、`gemini-1.5-pro` |
| 自定义 | 任意 OpenAI 兼容接口 |

---

## 📦 安装方式

### 方式一：Greasy Fork（推荐）

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)
2. 点击下方按钮一键安装：

[![Install from Greasy Fork](https://img.shields.io/badge/Install%20from-Greasy%20Fork-red?style=for-the-badge)](https://greasyfork.org/zh-CN/scripts/YOUR_SCRIPT_ID)

### 方式二：手动安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)
2. 打开 Tampermonkey 面板 → 新建脚本
3. 将 [main.js](main.js) 内容粘贴进去保存，或直接从 Raw 地址安装：

```
https://raw.githubusercontent.com/CAZAMA1/YuketangGoodbye/main/main.js
```

---

## 🚀 使用方法

### 刷视频课（零配置）

1. 安装脚本后打开雨课堂课程页面
2. 页面右侧会出现悬浮控制面板
3. 直接点击 **[开始刷课]** 即可，脚本自动处理视频/PPT/批量课程

### AI 自动答题（需配置 Key）

1. 点击面板上的 **[AI配置]** 按钮
2. 在弹出面板中：
   - 选择 **服务商**（如 DeepSeek）
   - 填入对应的 **API Key**
   - 点击 **[获取列表]** 自动拉取可用模型，选择一个
3. 点击 **[保存并关闭]**
4. 点击 **[开始刷课]**，遇到作业/考试时脚本会自动截图 → OCR → 请求 AI → 点击提交

---

## ⚙️ 个性化配置

打开 `main.js` 顶部修改 `basicConf`：

```js
const basicConf = {
  rate: 2,        // 视频倍速，可选 1 / 1.25 / 1.5 / 2 / 3
  pptTime: 3000,  // PPT 每页停留时间（毫秒）
}
```

---

## 📋 常见问题

**Q：脚本没有运应/浮窗不出现？**  
A：确认当前页面 URL 包含 `/v2/web/` 或 `/pro/lms/`，其他页面不会触发。

**Q：AI 答题返回 401？**  
A：API Key 填写有误或账户余额不足，请检查后重新保存配置。

**Q：AI 答题返回 403（Gemini）？**  
A：Gemini Key 需在 [Google AI Studio](https://aistudio.google.com/) 申请，且需科学上网。

**Q：视频播放一半卡住不动？**  
A：可尝试降低倍速（修改 `rate` 为 `1.5` 或 `1`），或刷新页面重新开始。

**Q：能同时刷多个课程吗？**  
A：脚本会记录进度到 localStorage，刷完一门后手动切换到下一门课程页面再点开始即可。

---

## 📜 许可证

本项目基于 [GPL-3.0](LICENSE) 协议开源。

---

## ⚠️ 免责声明

本脚本仅供学习交流使用，请勿用于违反学校规定的场景。使用本脚本产生的任何后果由使用者自行承担。
