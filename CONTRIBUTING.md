# 贡献指南

感谢你愿意改进 Bennett Toolbox。本文说明如何搭建开发环境、提交聚焦的改动，
以及在提交拉取请求前完成必要验证。

## 开发环境

项目使用 Electron、React、Vite、TypeScript 和 npm。请使用 Node.js 18 或
更高版本。

在仓库根目录安装依赖并启动桌面应用：

```bash
npm install
npm run electron:dev
```

`npm run electron:dev` 会启动 Vite 开发服务，并打开 Electron 桌面应用。

## 分支规范

所有改动都以 `master` 作为基础分支。请尽量让每次改动保持聚焦，方便审查
和测试。

开始修改前创建本地分支：

```bash
git switch -c feature/简短说明
```

## 验证方式

提交拉取请求前，请根据改动范围运行相关检查：

```bash
npm test
npm run typecheck
npm exec vite -- build
```

如果改动影响安装包、Electron 主进程或平台能力，请额外运行对应打包命令：

```bash
npm run build:mac
npm run build:win
```

## MarkItDown 运行时

文档转 Markdown 功能使用随包的 MarkItDown 可执行文件。本地打包前需要先
生成对应平台的转换器：

```bash
npm run setup:markitdown
```

生成的可执行文件和平台绑定，已经在 `.gitignore` 中忽略，不应提交到 Git。

## 拉取请求要求

请向 `master` 分支提交拉取请求，并说明改动内容、改动原因和已运行的
检查。

提交前请确认：

1. 应用可以正常启动。
2. 受影响的工具仍然可用。
3. `release/`、`dist/`、`dist-electron/` 等生成产物没有被提交。
4. 行为发生变化时，已同步更新 `README.md` 或 `CHANGELOG.md`。
