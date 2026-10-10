# 傅一博 · 个人档案

以真实实习经历为主线的中文个人网站。自然空间保留 Three.js 场景，内容按「我是谁 → 实习经历 → 教育与能力 → 个人实践 → 生活 → 联系」组织。

## 本地预览

```sh
python3 -m http.server 4175 --bind 127.0.0.1
```

访问 http://127.0.0.1:4175/ 。入口 `index.html` 保留查询参数和锚点跳转到 `field.html`。

## 内容与设计

- 首屏展示姓名、AI 产品方向、2027 届身份、LSE 会计硕士在读与本人照片。
- 重点展示 OPPO、字节跳动懂车帝、凯度三段实习；可展开查看职责与成果。更早的证券、咨询和银行实习使用紧凑时间线。
- 教育与能力独立成节；AI 需求共创台明确标注为个人项目，不归属 OPPO。
- 23 个旅行地点通过原生横向相册、前后按钮、滑杆浏览，切换地点不移动整页。点击可放大照片。
- 羽毛球游戏、比熊互动及本机记录继续保留。
- 支持手机、键盘焦点、跳过导航、减少动态效果及 WebGL 降级。

视觉参考 ThreeUI 官方公开页面：[Sylva — Living Green](https://threeui.com/hero/sylva/living-green) 的自然场景与内容分层，以及 [Halvorsen](https://threeui.com/landing-pages/halvorsen-landing-page) 的编辑档案与编号排版。未复制模板源码或素材。

## 主要文件

- `field.html`：页面内容与语义结构。
- `intro.css`：履历版本的排版、字体与响应式布局。
- `field.css`：共用基础样式、旅行、游戏、比熊与弹窗。
- `field-core.js`：导航、旅行相册、经历弹窗、联系方式和本地互动。
- `field-world.js`：程序化 Three.js 自然世界与旅行地球。
- `court.js`：Canvas 羽毛球游戏。
- `assets/photos/`：本人提供的个人、旅行与比熊照片。
- `assets/travel/`：Wikimedia Commons 地点摄影与来源。

## 内容依据

内容依据本人提供的简历整理。懂车帝 37.5% 补录率、95% 本店购车率限定于编辑距离 = 1 场景；活动拦截与误伤指标仅对应高考充电券活动；年化收益标为测算。凯度 300+ 表述为用户深访与研究资料整理，不夸大为独立主持访谈。

简历邮箱原文存在格式问题，当前仅提供手机 / 微信联系方式。原始简历不随网站打包。站点无登录、埋点或第三方分析。

旅行摄影的作者、许可证、来源与文件哈希记录在 `assets/travel/ATTRIBUTION.md` 和 `manifest.json`。原文件在 `.backups/2026-10-08-intro/` 留有本次修改前的备份。

## 验证与打包

```sh
FIELD_URL=http://127.0.0.1:4175/ /tmp/yibo-3d-test/bin/python tools/verify_field_atlas.py
python3 tools/package_site.py
```

打包输出 `dist/` 与 `release/yibo-website.zip`。备份、工具与原始简历不包含在部署包中。
