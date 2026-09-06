# 数据模型与分类

## 稳定主键

每个仓库用 `owner/repo` 作为稳定主键。网页中的个人标注也使用同一主键，因此仓库 Star 数或简介变化不会丢失浏览器中的标注。

## 主要字段

| 字段 | 含义 |
|---|---|
| `owner` / `repo` | GitHub 所有者和仓库名 |
| `url` | GitHub 仓库地址 |
| `description` | GitHub 仓库简介 |
| `language` | GitHub 检测到的主要语言 |
| `stars` / `forks` | 当前 Star 和 Fork 数 |
| `updated` | 最近推送或更新时间 |
| `primary_domain` | 一级技术领域 |
| `secondary_domains` | 交叉领域 |
| `purpose_tags` | 学习资料、工具、代码项目等用途 |
| `tags` | 可检索的技术关键词 |
| `confidence` | 分类置信度 |
| `review_flag` | 是否建议人工复核 |
| `classification_basis` | 分类依据 |

## 一级领域

当前使用 12 个一级领域：机器人与自主系统、计算机视觉与三维、人工智能与机器学习、开发者工具与编程代理、系统/基础设施与性能、教育/论文与资料库、数据与分析、图形/游戏与多媒体、嵌入式/硬件与物联网、Web/应用与软件工程、科学/工程与地理空间、其他/待确认。

分类规则优先使用仓库名称、简介和 GitHub 语言。关键词冲突、信息不足或低置信度的条目会标记为“建议复核”。人工修正写入 `data/classification_overrides.json`，自动同步不会覆盖它。

