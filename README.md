# Yiqun GitHub Stars

这是我的 GitHub Stars 个人资产库：把收藏过的仓库按技术领域、语言和用途整理成可搜索的索引，并持续保留历史快照。

## 在线使用

- [打开 Stars 索引](https://alalagong.github.io/yiqun-github-stars/demo/)
- [查看公开数据](./data/stars.json)
- [查看历史快照](./data/history/)

网页支持全文搜索、组合筛选、Star 数排序、仓库详情和本地个人标注。个人标注保存在浏览器中，不会上传到这个公开 Repo。

## 当前数据

- 数据源：[alalagong 的 GitHub Stars](https://github.com/alalagong?tab=stars)
- 初始采集日期：2026-09-06
- 当前公开记录：730 条
- 分类领域：机器人、自主系统、计算机视觉、AI、开发者工具、系统基础设施等
- 低置信度记录：在网页中以“建议复核”标记

## 自动同步

GitHub Actions 每周一北京时间 10:17 自动同步一次，也可以在仓库的 Actions 页面手动运行“同步 GitHub Stars”。同步脚本会：

1. 读取公开 Stars API。
2. 更新 `data/stars.json`。
3. 在 `data/history/` 保存成功同步的历史快照。
4. 输出新增、移除、变化和未变化数量。
5. 保留 `data/classification_overrides.json` 中的人工分类修正。

详细说明见 [`docs/sync.md`](./docs/sync.md) 和 [`docs/data-model.md`](./docs/data-model.md)。

## 本地运行

```bash
python -m http.server 8765
```

然后打开 <http://127.0.0.1:8765/demo/>。同步脚本的 dry-run：

```bash
python scripts/sync_stars.py --username alalagong --data-dir data --dry-run
```

## Notion 的使用方式

Notion 只用来记录真正读过或用过的仓库，不复制完整 Stars 数据。教程在 Repo 外单独保存，不参与自动同步。

