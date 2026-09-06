# 同步与历史版本

## 自动同步

`.github/workflows/sync-stars.yml` 每周一北京时间 10:17 运行一次。也可以进入 GitHub Repo 的 **Actions → 同步 GitHub Stars → Run workflow** 手动运行。

工作流使用 GitHub Actions 自带的 `GITHUB_TOKEN` 访问公开 API，不需要把个人 Token 写入仓库。第一版同步公开 Stars；私有 Star 不会出现在公开数据中。

## 本地 dry-run

在安装 Python 3.10 或更高版本的电脑上运行：

```bash
python -m unittest discover -s tests -v
python scripts/sync_stars.py --username alalagong --data-dir data --dry-run
```

dry-run 只读取 API 并打印变更报告，不修改 `data/`。

## 人工分类修正

在 `data/classification_overrides.json` 中用 `owner/repo` 作为键，例如：

```json
{
  "example/project": {
    "primary_domain": "开发者工具与编程代理",
    "purpose_tags": "实践项目",
    "confidence": "高"
  }
}
```

同步时人工修正优先于自动分类。修改后提交这个文件，再运行下一次同步即可保留修正。

## 历史版本

- `data/stars.json`：最近一次成功同步的数据。
- `data/history/stars-YYYY-MM-DDTHH-MM-SSZ.json`：某次成功同步的完整快照。
- `data/sync-manifest.json`：最近一次同步的时间、条数和变更数量。
- Git commit：可以在 GitHub 的 **History** 中查看每次数据差异。

同步失败时脚本返回失败状态，不替换最近一次成功的数据，也不会生成新的正式快照。

