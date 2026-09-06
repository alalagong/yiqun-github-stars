(function (root) {
  "use strict";

  const STORAGE_KEY = "github-stars-kb:annotations";
  const PAGE_SIZE = 24;
  const STATUSES = ["Inbox", "Read next", "Experimented", "Reusable", "Archived"];
  const STATUS_LABELS = { Inbox: "收件箱", "Read next": "待读", Experimented: "已实践", Reusable: "可复用", Archived: "已归档" };
  const EMPTY_LANGUAGE = "__none__";

  function labelForStatus(status) {
    return STATUS_LABELS[status] || status;
  }

  function rowKey(row) {
    return `${row.owner}/${row.repo}`;
  }

  function splitValues(value) {
    return String(value || "").split(/[；;,]/).map((part) => part.trim()).filter(Boolean);
  }

  function effectiveStatus(row, annotations) {
    return annotations[rowKey(row)]?.status || "Inbox";
  }

  function matchesRow(row, query, filters, annotations) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    const haystack = [row.name, row.owner, row.repo, row.description, row.primary_domain, row.secondary_domains, row.purpose_tags, row.tags]
      .join(" ").toLocaleLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    if (filters.domain && row.primary_domain !== filters.domain) return false;
    if (filters.language) {
      const language = row.language || EMPTY_LANGUAGE;
      if (language !== filters.language) return false;
    }
    if (filters.purpose && !splitValues(row.purpose_tags).includes(filters.purpose)) return false;
    if (filters.activity && row.activity !== filters.activity) return false;
    if (filters.status && effectiveStatus(row, annotations) !== filters.status) return false;
    if (filters.confidence && row.confidence !== filters.confidence) return false;
    return true;
  }

  function sortRows(rows, sort) {
    const sorted = rows.slice();
    const compareText = (a, b) => String(a.repo || "").localeCompare(String(b.repo || ""));
    const tie = (a, b) => Number(a.index || 0) - Number(b.index || 0) || compareText(a, b);
    const comparators = {
      "stars-desc": (a, b) => Number(b.stars || 0) - Number(a.stars || 0) || tie(a, b),
      "stars-asc": (a, b) => Number(a.stars || 0) - Number(b.stars || 0) || tie(a, b),
      "updated-desc": (a, b) => new Date(b.updated || 0) - new Date(a.updated || 0) || tie(a, b),
      "updated-asc": (a, b) => new Date(a.updated || 0) - new Date(b.updated || 0) || tie(a, b),
      "index-asc": (a, b) => Number(a.index || 0) - Number(b.index || 0) || compareText(a, b)
    };
    return sorted.sort(comparators[sort] || comparators["stars-desc"]);
  }

  function applyRows(rows, query, filters, sort, annotations) {
    return sortRows(rows.filter((row) => matchesRow(row, query, filters, annotations || {})), sort);
  }

  function paginateRows(rows, page, pageSize) {
    const size = pageSize || PAGE_SIZE;
    return rows.slice((page - 1) * size, page * size);
  }

  function normalizeAnnotation(value, timestamp) {
    const status = STATUSES.includes(value?.status) ? value.status : "Inbox";
    const priority = ["1", "2", "3"].includes(String(value?.priority || "")) ? String(value.priority) : "";
    return {
      status,
      priority,
      nextAction: String(value?.nextAction || "").trim(),
      notes: String(value?.notes || "").trim(),
      updatedAt: timestamp || value?.updatedAt || new Date().toISOString()
    };
  }

  function hasContent(annotation) {
    return Boolean(annotation && (annotation.status !== "Inbox" || annotation.priority || annotation.nextAction || annotation.notes));
  }

  function buildExportPayload(annotations) {
    const payload = {};
    Object.keys(annotations || {}).sort().forEach((key) => {
      const annotation = normalizeAnnotation(annotations[key], annotations[key]?.updatedAt);
      if (hasContent(annotation)) payload[key] = annotation;
    });
    return payload;
  }

  const api = { PAGE_SIZE, STORAGE_KEY, applyRows, buildExportPayload, matchesRow, normalizeAnnotation, paginateRows, rowKey, sortRows, splitValues };
  root.GithubStarsKB = api;
  if (typeof document === "undefined") return;

  const state = {
    rows: [],
    view: [],
    annotations: {},
    query: "",
    filters: { domain: "", language: "", purpose: "", activity: "", status: "", confidence: "" },
    sort: "stars-desc",
    page: 1,
    selectedKey: "",
    lastFocus: null
  };

  const ids = ["stat-total", "stat-results", "stat-status", "stat-status-label", "stat-review", "data-meta", "search", "filter-domain", "filter-language", "filter-purpose", "filter-activity", "filter-status", "filter-confidence", "sort", "clear-button", "apply-focus", "export-button", "results-body", "results-empty", "app-status", "previous-page", "next-page", "page-info", "drawer-backdrop", "details-drawer", "close-drawer", "detail-title", "detail-link", "detail-description", "detail-metadata", "annotation-form", "annotation-status", "annotation-priority", "annotation-action", "annotation-notes", "save-message"];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  function setStatus(message, isError) {
    el["app-status"].textContent = message;
    el["app-status"].style.color = isError ? "#a22d24" : "";
  }

  function loadAnnotations() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_error) {
      setStatus("无法读取已有标注，将从空白状态开始。", true);
      return {};
    }
  }

  function persistAnnotations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.annotations));
  }

  function addOptions(select, values, emptyLabel) {
    const current = select.value;
    select.replaceChildren(new Option(emptyLabel, ""));
    values.forEach((value) => select.add(new Option(value.label || value, value.value ?? value)));
    select.value = current;
  }

  function uniqueValues(field, split) {
    const values = state.rows.flatMap((row) => split ? splitValues(row[field]) : [row[field]]).filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }

  function populateFilters() {
    addOptions(el["filter-domain"], uniqueValues("primary_domain"), "全部领域");
    const languages = uniqueValues("language").map((value) => ({ label: value, value }));
    if (state.rows.some((row) => !row.language)) languages.push({ label: "未列出语言", value: EMPTY_LANGUAGE });
    addOptions(el["filter-language"], languages, "全部语言");
    addOptions(el["filter-purpose"], uniqueValues("purpose_tags", true), "全部用途");
    addOptions(el["filter-activity"], uniqueValues("activity"), "全部活跃度");
    addOptions(el["filter-confidence"], uniqueValues("confidence"), "全部置信度");
  }

  function makeCell(label, value) {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    if (value instanceof Node) cell.append(value); else cell.textContent = value ?? "—";
    return cell;
  }

  function statusClass(status) {
    return `status-${status.replace(/\s+/g, "-")}`;
  }

  function formatAge(updated) {
    const date = new Date(updated);
    if (Number.isNaN(date.getTime())) return "更新时间未知";
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (days < 30) return `${days} 天前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
  }

  function renderResults() {
    const rows = paginateRows(state.view, state.page, PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      const repoWrap = document.createElement("div");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "repo-button";
      button.textContent = row.name || rowKey(row);
      button.addEventListener("click", () => openDetails(row, button));
      const description = document.createElement("span");
      description.className = "description";
      description.textContent = row.description || "暂无简介。";
      repoWrap.append(button, description);

      const domain = document.createElement("span");
      domain.className = "pill";
      domain.textContent = row.primary_domain || "未分类";
      const purpose = document.createElement("span");
      purpose.className = "pill";
      purpose.textContent = splitValues(row.purpose_tags)[0] || "未标注";
      purpose.title = row.purpose_tags || "";
      const language = document.createElement("span");
      language.textContent = row.language || "—";
      const stars = document.createElement("div");
      stars.className = "metric";
      stars.textContent = Number(row.stars || 0).toLocaleString();
      const age = document.createElement("div");
      age.className = "muted";
      age.textContent = formatAge(row.updated);
      age.style.fontSize = ".72rem";
      stars.append(age);
      const status = effectiveStatus(row, state.annotations);
      const statusPill = document.createElement("span");
      statusPill.className = `pill ${statusClass(status)}`;
      statusPill.textContent = labelForStatus(status);

      tr.append(makeCell("仓库", repoWrap), makeCell("领域", domain), makeCell("用途", purpose), makeCell("语言", language), makeCell("Stars / 更新", stars), makeCell("状态", statusPill));
      fragment.append(tr);
    });
    el["results-body"].replaceChildren(fragment);
    el["results-empty"].hidden = state.view.length !== 0;
    const pages = Math.max(1, Math.ceil(state.view.length / PAGE_SIZE));
    el["page-info"].textContent = `第 ${state.page} 页，共 ${pages} 页`;
    el["previous-page"].disabled = state.page <= 1;
    el["next-page"].disabled = state.page >= pages;
  }

  function updateSummary() {
    el["stat-total"].textContent = state.rows.length.toLocaleString();
    el["stat-results"].textContent = state.view.length.toLocaleString();
    const selected = state.filters.status
      ? state.rows.filter((row) => effectiveStatus(row, state.annotations) === state.filters.status).length
      : Object.values(state.annotations).filter(hasContent).length;
    el["stat-status"].textContent = selected.toLocaleString();
    el["stat-status-label"].textContent = state.filters.status ? `${labelForStatus(state.filters.status)}仓库` : "已标注";
    el["stat-review"].textContent = state.view.filter((row) => Boolean(row.review_flag)).length.toLocaleString();
  }

  function applyView(resetPage) {
    if (resetPage) state.page = 1;
    state.view = applyRows(state.rows, state.query, state.filters, state.sort, state.annotations);
    const maxPage = Math.max(1, Math.ceil(state.view.length / PAGE_SIZE));
    state.page = Math.min(state.page, maxPage);
    updateSummary();
    renderResults();
    setStatus(`${state.view.length.toLocaleString()} 个仓库 · 当前显示 ${Math.min(PAGE_SIZE, state.view.length - (state.page - 1) * PAGE_SIZE)} 个`);
  }

  function metadataEntries(row) {
    return [
      ["一级领域", row.primary_domain], ["二级领域", row.secondary_domains],
      ["用途", row.purpose_tags], ["技术标签", row.tags],
      ["语言", row.language], ["Stars", Number(row.stars || 0).toLocaleString()],
      ["Forks", row.forks == null ? "暂无数据" : Number(row.forks).toLocaleString()], ["更新时间", row.updated ? new Date(row.updated).toLocaleString("zh-CN") : "未知"],
      ["活跃度", row.activity], ["受欢迎程度", row.popularity],
      ["置信度", row.confidence], ["复核标记", row.review_flag || "无"],
      ["分类依据", row.classification_basis], ["原始收藏顺序", row.index]
    ];
  }

  function openDetails(row, trigger) {
    state.selectedKey = rowKey(row);
    state.lastFocus = trigger || document.activeElement;
    el["detail-title"].textContent = row.name || state.selectedKey;
    el["detail-link"].href = row.url;
    el["detail-description"].textContent = row.description || "暂无简介。";
    const fragment = document.createDocumentFragment();
    metadataEntries(row).forEach(([term, value]) => {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = term;
      dd.textContent = value || "—";
      wrap.append(dt, dd);
      fragment.append(wrap);
    });
    el["detail-metadata"].replaceChildren(fragment);
    const annotation = normalizeAnnotation(state.annotations[state.selectedKey] || {}, state.annotations[state.selectedKey]?.updatedAt);
    el["annotation-status"].value = annotation.status;
    el["annotation-priority"].value = annotation.priority;
    el["annotation-action"].value = annotation.nextAction;
    el["annotation-notes"].value = annotation.notes;
    el["save-message"].textContent = "";
    el["drawer-backdrop"].hidden = false;
    el["details-drawer"].hidden = false;
    el["details-drawer"].setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    el["close-drawer"].focus();
  }

  function closeDetails() {
    el["drawer-backdrop"].hidden = true;
    el["details-drawer"].hidden = true;
    el["details-drawer"].setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    const focus = state.lastFocus;
    state.selectedKey = "";
    if (focus?.isConnected) focus.focus();
  }

  function saveAnnotation(key) {
    const annotation = normalizeAnnotation({
      status: el["annotation-status"].value,
      priority: el["annotation-priority"].value,
      nextAction: el["annotation-action"].value,
      notes: el["annotation-notes"].value
    });
    if (hasContent(annotation)) state.annotations[key] = annotation; else delete state.annotations[key];
    try {
      persistAnnotations();
      el["save-message"].textContent = "已保存在当前浏览器。";
      applyView(false);
    } catch (_error) {
      el["save-message"].textContent = "当前浏览器无法保存。";
      el["save-message"].style.color = "#a22d24";
    }
  }

  function exportAnnotations() {
    const payload = buildExportPayload(state.annotations);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "github-stars-annotations.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${Object.keys(payload).length.toLocaleString()} 条标注。`);
  }

  function syncControls() {
    state.query = el.search.value;
    state.filters.domain = el["filter-domain"].value;
    state.filters.language = el["filter-language"].value;
    state.filters.purpose = el["filter-purpose"].value;
    state.filters.activity = el["filter-activity"].value;
    state.filters.status = el["filter-status"].value;
    state.filters.confidence = el["filter-confidence"].value;
    state.sort = el.sort.value;
    applyView(true);
  }

  function bindEvents() {
    el.search.addEventListener("input", syncControls);
    ["filter-domain", "filter-language", "filter-purpose", "filter-activity", "filter-status", "filter-confidence", "sort"].forEach((id) => el[id].addEventListener("change", syncControls));
    el["clear-button"].addEventListener("click", () => {
      el.search.value = "";
      ["filter-domain", "filter-language", "filter-purpose", "filter-activity", "filter-status", "filter-confidence"].forEach((id) => { el[id].value = ""; });
      el.sort.value = "stars-desc";
      syncControls();
      el.search.focus();
    });
    el["apply-focus"].addEventListener("click", () => {
      document.getElementById("results-title").scrollIntoView({ behavior: "smooth", block: "start" });
      el["results-body"].querySelector("button")?.focus();
    });
    el["previous-page"].addEventListener("click", () => { state.page -= 1; applyView(false); document.getElementById("results-title").scrollIntoView(); });
    el["next-page"].addEventListener("click", () => { state.page += 1; applyView(false); document.getElementById("results-title").scrollIntoView(); });
    el["close-drawer"].addEventListener("click", closeDetails);
    el["drawer-backdrop"].addEventListener("click", closeDetails);
    el["annotation-form"].addEventListener("submit", (event) => { event.preventDefault(); if (state.selectedKey) saveAnnotation(state.selectedKey); });
    el["export-button"].addEventListener("click", exportAnnotations);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !el["details-drawer"].hidden) closeDetails(); });
  }

  async function loadData() {
    bindEvents();
    state.annotations = loadAnnotations();
    try {
      const response = await fetch("../data/stars.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.rows)) throw new Error("数据文件中没有 rows 数组。");
      state.rows = data.rows.slice();
      const summary = data.summary || {};
      el["data-meta"].textContent = `数据更新时间：${summary.collected_at || "未知"} · 公开仓库：${Number(summary.collected_public_rows || state.rows.length).toLocaleString()} 个`;
      populateFilters();
      applyView(true);
    } catch (error) {
      setStatus(`无法加载数据：${error.message}。请通过 HTTP 服务打开网页。`, true);
      el["results-empty"].hidden = false;
      el["results-empty"].textContent = "仓库数据加载失败。";
    }
  }

  api.loadData = loadData;
  api.applyView = applyView;
  api.openDetails = openDetails;
  api.saveAnnotation = saveAnnotation;
  api.exportAnnotations = exportAnnotations;
  loadData();
}(typeof globalThis !== "undefined" ? globalThis : window));

