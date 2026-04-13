# Pretext Runtime (Slim Local Vendor)

这个目录现在只保留盐憩站点真正使用到的运行时部分。

当前保留内容：
- `dist/`：浏览器实际加载的 ESM 运行时代码
- `LICENSE`：原项目许可证
- `README.md`：这份本地瘦身说明

当前站点的接入方式：
- `js/text-layout-adapter.js` 会直接动态导入 `../pretext-main/dist/layout.js`
- 也就是说，网站真正依赖的是 `dist/`，不再依赖原始 TypeScript 源码、demo、研究数据或构建脚本

为什么现在可以删掉源码：
- 这份目录已经生成了可直接运行的 `dist/`
- 当前网站只把它当作本地 vendor 运行时，不再把它当作开发中的完整仓库副本

如果后续还想继续修改 pretext 内部算法：
- 需要重新放回源码版目录，或重新从原始仓库恢复 `src/`
- 现在这份目录的目标是：更少文件、可直接运行、适合放进当前网站仓库
