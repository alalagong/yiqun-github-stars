"""Deterministic, explainable classification rules for GitHub repositories."""

from __future__ import annotations

import re
from copy import deepcopy


DOMAINS = [
    ("机器人与自主系统", ("robot", "robotics", "ros", "slam", "autonomous", "navigation", "planner", "planning", "drone", "uav", "manipulator", "quadruped", "lidar", "odometry")),
    ("计算机视觉与三维", ("computer vision", "vision", "opencv", "image", "video understanding", "3d", "point cloud", "depth", "nerf", "gaussian splatting", "segmentation", "detection", "feature matching", "reconstruction")),
    ("人工智能与机器学习", ("artificial intelligence", "machine learning", "deep learning", "llm", "language model", "transformer", "pytorch", "tensorflow", "diffusion", "reinforcement learning", "whisper", "nlp", "generative")),
    ("开发者工具与编程代理", ("developer tool", "cli", "sdk", "plugin", "agent", "coding", "code quality", "debug", "terminal", "shell", "mcp", "workflow", "library")),
    ("系统、基础设施与性能", ("linux", "kernel", "compiler", "cuda", "gpu", "npu", "inference", "distributed", "database", "network", "storage", "kubernetes", "docker", "performance")),
    ("教育、论文与资料库", ("paper", "papers", "course", "tutorial", "textbook", "learn", "learning", "awesome", "resource", "knowledge base", "reading list")),
    ("数据与分析", ("dataset", "data science", "data engineering", "scraper", "crawler", "analytics", "visualization", "benchmark", "pandas", "sql")),
    ("图形、游戏与多媒体", ("game", "graphics", "render", "shader", "audio", "music", "media", "blender", "ffmpeg", "animation")),
    ("嵌入式、硬件与物联网", ("embedded", "firmware", "arduino", "esp32", "microcontroller", "fpga", "hardware", "iot", "sensor", "chip")),
    ("Web、应用与软件工程", ("web", "frontend", "backend", "full stack", "fullstack", "react", "vue", "mobile", "desktop", "api", "application")),
    ("科学、工程与地理空间", ("physics", "mathematics", "chemistry", "simulation", "medical", "engineering", "gis", "geospatial", "geography")),
]
DOMAIN_ORDER = {domain: index for index, (domain, _) in enumerate(DOMAINS)}

CLASSIFICATION_FIELDS = (
    "primary_domain",
    "secondary_domains",
    "purpose_tags",
    "tags",
    "confidence",
    "review_flag",
    "classification_basis",
)


def _text(row: dict) -> str:
    return " ".join(
        str(row.get(field) or "")
        for field in ("name", "owner", "repo", "description", "language")
    ).lower()


def _contains(text: str, phrase: str) -> bool:
    if " " in phrase:
        return phrase in text
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", text) is not None


def classify(row: dict) -> dict:
    """Return a copy of *row* with deterministic classification metadata."""

    result = deepcopy(row)
    text = _text(result)
    scored = []
    matched_tags = []
    for domain, keywords in DOMAINS:
        matches = [keyword for keyword in keywords if _contains(text, keyword)]
        if matches:
            scored.append((len(matches), domain))
            matched_tags.extend(matches[:3])
    scored.sort(key=lambda item: (-item[0], DOMAIN_ORDER[item[1]]))

    if not scored:
        primary = "其他/待确认"
        secondary = ""
        confidence = "低"
        review_flag = "建议复核"
    else:
        primary = scored[0][1]
        secondary = "；".join(domain for _, domain in scored[1:3])
        confidence = "高" if scored[0][0] >= 3 else "中"
        review_flag = "建议复核" if confidence == "低" else ""

    if any(_contains(text, word) for word in ("paper", "course", "tutorial", "textbook", "learn", "awesome", "resource")):
        purpose = "学习资料"
    elif any(_contains(text, word) for word in ("dataset", "benchmark", "data")):
        purpose = "数据资源"
    elif any(_contains(text, word) for word in ("tool", "cli", "sdk", "library", "agent", "plugin")):
        purpose = "工具"
    else:
        purpose = "代码项目"

    language = str(result.get("language") or "").strip()
    tags = list(dict.fromkeys(matched_tags))
    if language:
        tags.insert(0, language)
    result.update(
        {
            "primary_domain": primary,
            "secondary_domains": secondary,
            "purpose_tags": purpose,
            "tags": "；".join(tags),
            "confidence": confidence,
            "review_flag": review_flag,
            "classification_basis": "简介、GitHub语言" if result.get("description") or language else "仓库名称",
        }
    )
    return result


def apply_override(row: dict, override: dict | None) -> dict:
    """Apply only supported manual classification fields, preserving the row."""

    result = deepcopy(row)
    for field in CLASSIFICATION_FIELDS:
        if override and field in override and override[field] is not None:
            result[field] = override[field]
    if override:
        result["classification_basis"] = "人工修正"
    return result

