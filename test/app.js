(function () {
  "use strict";

  const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
  const DEEPSEEK_MODEL = "deepseek-v4-flash";
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const ESTIMATED_CHARS_PER_PAGE = 900;

  const state = {
    file: null,
    fileBuffer: null,
    documentXml: "",
    paragraphs: [],
    changes: [],
    accepted: new Set(),
    progressTimer: null,
    progressHideTimer: null,
    progressValue: 0
  };

  const els = {
    form: document.getElementById("revision-form"),
    fileInput: document.getElementById("docx-file"),
    dropZone: document.getElementById("drop-zone"),
    fileDetail: document.getElementById("file-detail"),
    instruction: document.getElementById("instruction"),
    apiKey: document.getElementById("api-key"),
    runButton: document.getElementById("run-button"),
    parseStatus: document.getElementById("parse-status"),
    aiStatus: document.getElementById("ai-status"),
    progressPanel: document.getElementById("progress-panel"),
    progressLabel: document.getElementById("progress-label"),
    progressPercent: document.getElementById("progress-percent"),
    progressFill: document.getElementById("progress-fill"),
    docStats: document.getElementById("doc-stats"),
    reviewTitle: document.getElementById("review-title"),
    acceptAll: document.getElementById("accept-all"),
    rejectAll: document.getElementById("reject-all"),
    exportButton: document.getElementById("export-button"),
    emptyState: document.getElementById("empty-state"),
    diffList: document.getElementById("diff-list")
  };

  init();

  function init() {
    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      if (file) {
        parseFile(file);
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-dragging");
      });
    });

    els.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        parseFile(file);
      }
    });

    els.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await generateRevision();
    });

    els.acceptAll.addEventListener("click", () => {
      state.accepted = new Set(state.changes.map((change) => change.index));
      renderChanges();
    });

    els.rejectAll.addEventListener("click", () => {
      state.accepted.clear();
      renderChanges();
    });

    els.exportButton.addEventListener("click", exportDocx);
    renderChanges();
  }

  async function parseFile(file) {
    clearMessage();
    resetRevision();

    if (!file.name.toLowerCase().endsWith(".docx")) {
      resetDocument();
      setParseStatus("文件格式不支持");
      showMessage("请上传 .docx 格式的 Word 文档。", true);
      return;
    }

    setParseStatus("解析中");
    els.fileDetail.textContent = `${file.name}，${formatFileSize(file.size)}`;

    try {
      const fileBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(fileBuffer.slice(0));
      const documentFile = zip.file("word/document.xml");

      if (!documentFile) {
        throw new Error("未找到 Word 主文档内容。");
      }

      const documentXml = await documentFile.async("string");
      const documentDom = parseXml(documentXml);
      const paragraphNodes = wordElements(documentDom, "p");
      const pageInfo = getParagraphPageInfo(paragraphNodes);
      const paragraphs = paragraphNodes.map((node, index) => ({
        index,
        text: textNodes(node).map((textNode) => textNode.textContent).join(""),
        page: pageInfo[index].page,
        endPage: pageInfo[index].endPage,
        pageEstimated: pageInfo[index].estimated
      }));

      state.file = file;
      state.fileBuffer = fileBuffer;
      state.documentXml = documentXml;
      state.paragraphs = paragraphs;
      els.dropZone.classList.add("is-ready");

      const visibleParagraphs = paragraphs.filter((paragraph) => paragraph.text.trim()).length;
      const totalChars = paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
      setParseStatus("已解析");
      const pageMode = pageInfo.some((item) => item.estimated) ? "页码为估算" : "已读取 Word 分页";
      els.docStats.textContent = `共 ${paragraphs.length} 个段落，${visibleParagraphs} 个非空段落，约 ${totalChars.toLocaleString("zh-CN")} 字，${pageMode}。`;
    } catch (error) {
      resetDocument();
      setParseStatus("解析失败");
      showMessage(error.message || "Word 文档解析失败。", true);
    }
  }

  async function generateRevision() {
    clearMessage();

    const instruction = els.instruction.value.trim();
    const apiKey = els.apiKey.value.trim();

    if (!state.file || !state.fileBuffer || !state.paragraphs.length) {
      showMessage("请先上传并解析 Word 文档。", true);
      return;
    }

    if (!instruction) {
      showMessage("请填写自然语言修改要求。", true);
      els.instruction.focus();
      return;
    }

    if (!apiKey) {
      showMessage("请填写 DeepSeek API Key。", true);
      els.apiKey.focus();
      return;
    }

    const promptText = buildDocumentPrompt(instruction, state.paragraphs);
    if (promptText.length > 180000) {
      showMessage("当前文档文本较长，可能超过当前 DeepSeek 模型的单次上下文限制。请先拆分文档或缩小修改范围。", true);
      return;
    }

    resetRevision();
    setBusy(true);
    setAiStatus("生成中");
    startFakeProgress();

    try {
      const response = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content: [
                "你是一名执业经验丰富、写作严谨的中国律师，擅长合同、债权申报、诉讼与非诉法律文书的定点修订。",
                "你的任务是按照用户要求做最小必要修改：增强法律文书的事实链条、权利义务、因果关系、请求依据和表述严密性，但不得重写整篇文档。",
                "你必须保持原文的法律关系、主体名称、金额、日期、编号、事实基础、证据状态和责任边界准确稳定；除非用户明确要求或原文已经提供依据，不得臆造事实、承诺、法条、判例或履行情况。",
                "语言风格应当专业、克制、清楚、可执行，符合中文法律文书习惯；避免夸张、空泛、营销化、口语化表达。",
                "输出必须是严格 JSON，不要输出 Markdown、解释文本或代码块。"
              ].join("\n")
            },
            {
              role: "user",
              content: promptText
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 32000
        })
      });

      const payload = await readDeepseekResponse(response);
      const content = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;

      if (!content) {
        throw new Error("DeepSeek 未返回可读取的修改内容。");
      }

      const changes = normalizeChanges(parseJsonContent(content));
      state.changes = changes;
      state.accepted = new Set(changes.map((change) => change.index));

      setAiStatus(changes.length ? "已生成" : "无可用建议");
      finishFakeProgress(changes.length ? "修改建议已生成" : "未发现需要修改的段落");
      renderChanges();
    } catch (error) {
      setAiStatus("生成失败");
      finishFakeProgress("生成已停止");
      renderChanges();
      showMessage(formatNetworkError(error), true);
    } finally {
      setBusy(false);
    }
  }

  function buildDocumentPrompt(instruction, paragraphs) {
    const numberedParagraphs = paragraphs
      .filter((paragraph) => paragraph.text.trim())
      .map((paragraph) => `[${paragraph.index} | ${formatPageLocation(paragraph)}] ${paragraph.text}`)
      .join("\n");

    return [
      "用户修改要求：",
      instruction,
      "",
      "下面是从 Word 文档中按段落抽取出的正文。方括号中的第一个数字是段落 index，返回时必须原样使用该 index；页码只用于定位和理解上下文。",
      numberedParagraphs,
      "",
      "请返回 JSON，结构如下：",
      "{\"changes\":[{\"index\":0,\"revised\":\"修改后的完整段落文字\",\"reason\":\"简短说明\"}]}",
      "",
      "规则：",
      "1. 只返回确实需要修改的段落；不需要修改的段落不要返回。",
      "2. revised 必须是该段落修改后的完整纯文本，不要包含段落 index 或页码。",
      "3. 不要在 revised 中插入换行；如果需要扩写，请仍放在同一个段落内。",
      "4. 保持原文段落用途、语气、称谓、金额、日期、编号和主体名称稳定；没有明确依据不得新增事实。",
      "5. 修改应体现专业律师的谨慎表达，避免夸张、营销化、口语化和结论跳跃。",
      "6. 不要返回原文全文，不要改变未被要求修改的内容。"
    ].join("\n");
  }

  async function readDeepseekResponse(response) {
    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : text || `请求失败，HTTP ${response.status}`;
      throw new Error(message);
    }

    if (!payload) {
      throw new Error("DeepSeek 响应不是有效 JSON。");
    }

    return payload;
  }

  function parseJsonContent(content) {
    try {
      return JSON.parse(content);
    } catch (error) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(content.slice(start, end + 1));
      }
      throw new Error("DeepSeek 返回内容不是有效 JSON。");
    }
  }

  function normalizeChanges(parsed) {
    const rawChanges = Array.isArray(parsed) ? parsed : parsed.changes;
    const changes = [];
    const seen = new Set();

    if (!Array.isArray(rawChanges)) {
      throw new Error("DeepSeek 返回 JSON 中缺少 changes 数组。");
    }

    rawChanges.forEach((rawChange) => {
      const index = Number(rawChange && rawChange.index);
      if (!Number.isInteger(index) || index < 0 || index >= state.paragraphs.length || seen.has(index)) {
        return;
      }

      const revisedValue = rawChange.revised ?? rawChange.new_text ?? rawChange.newText ?? rawChange.text;
      if (typeof revisedValue !== "string") {
        return;
      }

      const paragraph = state.paragraphs[index];
      const original = paragraph.text;
      const revised = normalizeParagraphText(revisedValue);
      if (revised === original) {
        return;
      }

      seen.add(index);
      changes.push({
        index,
        original,
        revised,
        page: paragraph.page,
        endPage: paragraph.endPage,
        pageEstimated: paragraph.pageEstimated,
        reason: normalizeParagraphText(String(rawChange.reason || rawChange.explanation || ""))
      });
    });

    return changes.sort((a, b) => a.index - b.index);
  }

  function normalizeParagraphText(value) {
    return value
      .replace(/\r\n?/g, "\n")
      .replace(/\n+/g, " ")
      .trim();
  }

  function renderChanges() {
    els.diffList.innerHTML = "";

    const hasChanges = state.changes.length > 0;
    const acceptedCount = state.accepted.size;
    els.acceptAll.disabled = !hasChanges;
    els.rejectAll.disabled = !hasChanges;
    els.exportButton.disabled = !hasChanges || !state.fileBuffer;
    els.emptyState.style.display = hasChanges ? "none" : "grid";
    els.acceptAll.classList.toggle("is-active", hasChanges && acceptedCount === state.changes.length);
    els.rejectAll.classList.toggle("is-active", hasChanges && acceptedCount === 0);

    if (!hasChanges) {
      els.reviewTitle.textContent = "暂无修改建议";
      return;
    }

    els.reviewTitle.textContent = `${state.changes.length} 处修改建议，已保留 ${acceptedCount} 处`;

    state.changes.forEach((change) => {
      const accepted = state.accepted.has(change.index);
      const card = document.createElement("article");
      card.className = `change-card${accepted ? "" : " is-rejected"}`;

      const head = document.createElement("div");
      head.className = "change-head";

      const meta = document.createElement("div");
      meta.className = "change-meta";

      const pill = document.createElement("span");
      pill.className = `pill ${accepted ? "pill-accept" : "pill-reject"}`;
      pill.textContent = accepted ? "保留" : "抛弃";

      const locationInfo = document.createElement("span");
      locationInfo.textContent = formatPageLocation(change);

      const charInfo = document.createElement("span");
      const delta = change.revised.length - change.original.length;
      charInfo.textContent = `字数 ${change.original.length} → ${change.revised.length}${delta === 0 ? "" : `（${delta > 0 ? "+" : ""}${delta}）`}`;

      meta.append(pill, locationInfo, charInfo);

      const actions = document.createElement("div");
      actions.className = "change-actions";
      actions.append(
        createChoiceButton("保留", "accept", accepted, () => {
          state.accepted.add(change.index);
          renderChanges();
        }),
        createChoiceButton("抛弃", "reject", !accepted, () => {
          state.accepted.delete(change.index);
          renderChanges();
        })
      );

      head.append(meta, actions);
      card.append(head, createDiffBody(change.original, change.revised));

      if (change.reason) {
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = `修改说明：${change.reason}`;
        card.append(reason);
      }

      els.diffList.append(card);
    });
  }

  function createChoiceButton(text, variant, active, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tiny-button ${variant}-button${active ? " is-active" : ""}`;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function createDiffBody(original, revised) {
    const body = document.createElement("div");
    body.className = "diff-body";

    if (original) {
      body.append(createDiffLine("-", original, revised, "delete"));
    }

    if (revised) {
      body.append(createDiffLine("+", original, revised, "insert"));
    }

    if (!original && !revised) {
      body.append(createPlainLine(" ", "空段落"));
    }

    return body;
  }

  function createDiffLine(mark, original, revised, mode) {
    const line = document.createElement("div");
    line.className = `diff-line ${mode}`;

    const markEl = document.createElement("div");
    markEl.className = "diff-mark";
    markEl.textContent = mark;

    const textEl = document.createElement("div");
    textEl.className = "diff-text";
    appendInlineDiff(textEl, original, revised, mode);

    line.append(markEl, textEl);
    return line;
  }

  function createPlainLine(mark, text) {
    const line = document.createElement("div");
    line.className = "diff-line";

    const markEl = document.createElement("div");
    markEl.className = "diff-mark";
    markEl.textContent = mark;

    const textEl = document.createElement("div");
    textEl.className = "diff-text";
    textEl.textContent = text;

    line.append(markEl, textEl);
    return line;
  }

  function appendInlineDiff(container, original, revised, mode) {
    const diff = tokenDiff(original, revised);
    diff.forEach((part) => {
      if (part.type === "equal") {
        container.append(document.createTextNode(part.text));
      } else if (mode === "delete" && part.type === "delete") {
        appendSpan(container, part.text, "inline-delete");
      } else if (mode === "insert" && part.type === "insert") {
        appendSpan(container, part.text, "inline-insert");
      }
    });
  }

  function appendSpan(container, text, className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    container.append(span);
  }

  function tokenDiff(original, revised) {
    const oldTokens = tokenize(original);
    const newTokens = tokenize(revised);

    if (!oldTokens.length) {
      return newTokens.length ? [{ type: "insert", text: revised }] : [];
    }

    if (!newTokens.length) {
      return [{ type: "delete", text: original }];
    }

    if (oldTokens.length * newTokens.length > 600000) {
      return [
        { type: "delete", text: original },
        { type: "insert", text: revised }
      ];
    }

    const rows = oldTokens.length + 1;
    const cols = newTokens.length + 1;
    const table = Array.from({ length: rows }, () => new Uint16Array(cols));

    for (let i = oldTokens.length - 1; i >= 0; i -= 1) {
      for (let j = newTokens.length - 1; j >= 0; j -= 1) {
        table[i][j] = oldTokens[i] === newTokens[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    const parts = [];
    let i = 0;
    let j = 0;

    while (i < oldTokens.length && j < newTokens.length) {
      if (oldTokens[i] === newTokens[j]) {
        parts.push({ type: "equal", text: oldTokens[i] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        parts.push({ type: "delete", text: oldTokens[i] });
        i += 1;
      } else {
        parts.push({ type: "insert", text: newTokens[j] });
        j += 1;
      }
    }

    while (i < oldTokens.length) {
      parts.push({ type: "delete", text: oldTokens[i] });
      i += 1;
    }

    while (j < newTokens.length) {
      parts.push({ type: "insert", text: newTokens[j] });
      j += 1;
    }

    return mergeDiffParts(parts);
  }

  function tokenize(text) {
    const tokens = [];
    let buffer = "";
    let bufferType = "";

    for (const char of text) {
      const type = getTokenType(char);
      if (type === "word" || type === "space") {
        if (bufferType === type) {
          buffer += char;
        } else {
          flushBuffer();
          buffer = char;
          bufferType = type;
        }
      } else {
        flushBuffer();
        tokens.push(char);
      }
    }

    flushBuffer();
    return tokens;

    function flushBuffer() {
      if (buffer) {
        tokens.push(buffer);
        buffer = "";
        bufferType = "";
      }
    }
  }

  function getTokenType(char) {
    if (/\s/.test(char)) {
      return "space";
    }
    if (/[A-Za-z0-9_]/.test(char)) {
      return "word";
    }
    return "char";
  }

  function mergeDiffParts(parts) {
    return parts.reduce((merged, part) => {
      const previous = merged[merged.length - 1];
      if (previous && previous.type === part.type) {
        previous.text += part.text;
      } else {
        merged.push({ ...part });
      }
      return merged;
    }, []);
  }

  async function exportDocx() {
    clearMessage();

    if (!state.fileBuffer || !state.file) {
      showMessage("请先上传 Word 文档。", true);
      return;
    }

    const acceptedChanges = state.changes.filter((change) => state.accepted.has(change.index));
    els.exportButton.disabled = true;
    els.exportButton.textContent = "输出中";

    try {
      const zip = await JSZip.loadAsync(state.fileBuffer.slice(0));
      const documentFile = zip.file("word/document.xml");

      if (!documentFile) {
        throw new Error("未找到 Word 主文档内容。");
      }

      if (acceptedChanges.length) {
        const documentXml = await documentFile.async("string");
        const documentDom = parseXml(documentXml);
        const paragraphNodes = wordElements(documentDom, "p");

        acceptedChanges.forEach((change) => {
          const paragraphNode = paragraphNodes[change.index];
          if (paragraphNode) {
            replaceParagraphText(paragraphNode, change.revised);
          }
        });

        const serialized = new XMLSerializer().serializeToString(documentDom);
        zip.file("word/document.xml", serialized);
      }

      const blob = await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });

      downloadBlob(blob, createOutputFileName(state.file.name, acceptedChanges.length));
      showMessage(`已输出 Word 文档，保留 ${acceptedChanges.length} 处修改。`, false);
    } catch (error) {
      showMessage(error.message || "Word 文档输出失败。", true);
    } finally {
      els.exportButton.textContent = "输出 Word";
      renderChanges();
    }
  }

  function replaceParagraphText(paragraphNode, revisedText) {
    const nodes = textNodes(paragraphNode);

    if (!nodes.length) {
      if (revisedText) {
        const run = paragraphNode.ownerDocument.createElementNS(W_NS, "w:r");
        const text = paragraphNode.ownerDocument.createElementNS(W_NS, "w:t");
        setTextNode(text, revisedText);
        run.append(text);
        paragraphNode.append(run);
      }
      return;
    }

    let remaining = revisedText;
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1;
      const originalLength = node.textContent.length;
      const nextText = isLast ? remaining : remaining.slice(0, originalLength);
      setTextNode(node, nextText);
      remaining = isLast ? "" : remaining.slice(originalLength);
    });
  }

  function setTextNode(node, value) {
    node.textContent = value;
    if (/^\s|\s$|\s{2,}/.test(value)) {
      node.setAttributeNS(XML_NS, "xml:space", "preserve");
    }
  }

  function parseXml(xmlText) {
    const dom = new DOMParser().parseFromString(xmlText, "application/xml");
    const parseError = dom.getElementsByTagName("parsererror")[0];
    if (parseError) {
      throw new Error("Word XML 解析失败。");
    }
    return dom;
  }

  function wordElements(root, localName) {
    const namespaced = Array.from(root.getElementsByTagNameNS(W_NS, localName));
    if (namespaced.length) {
      return namespaced;
    }

    return Array.from(root.getElementsByTagName("*")).filter((element) => (
      element.localName === localName || element.tagName === `w:${localName}`
    ));
  }

  function textNodes(root) {
    return wordElements(root, "t");
  }

  function getParagraphPageInfo(paragraphNodes) {
    let currentPage = 1;
    let pageBreakCount = 0;
    const useRenderedBreaks = paragraphNodes.some((paragraphNode) => (
      wordElements(paragraphNode, "lastRenderedPageBreak").length > 0
    ));

    const markerBased = paragraphNodes.map((paragraphNode) => {
      const startPage = currentPage;
      let firstTextPage = null;
      let lastTextPage = null;

      walkElements(paragraphNode, (element) => {
        if (isWordPageBreak(element, useRenderedBreaks)) {
          currentPage += 1;
          pageBreakCount += 1;
          return;
        }

        if (firstTextPage === null && isWordElement(element, "t") && element.textContent.trim()) {
          firstTextPage = currentPage;
        }

        if (isWordElement(element, "t") && element.textContent.trim()) {
          lastTextPage = currentPage;
        }
      });

      return {
        page: firstTextPage || startPage,
        endPage: lastTextPage || firstTextPage || startPage,
        estimated: false
      };
    });

    if (pageBreakCount > 0) {
      return markerBased;
    }

    let runningChars = 0;
    return paragraphNodes.map((paragraphNode) => {
      const text = textNodes(paragraphNode).map((textNode) => textNode.textContent).join("");
      const page = Math.max(1, Math.floor(runningChars / ESTIMATED_CHARS_PER_PAGE) + 1);
      runningChars += text.length + (text.trim() ? 2 : 0);

      return {
        page,
        endPage: page,
        estimated: true
      };
    });
  }

  function walkElements(root, callback) {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType !== 1) {
        return;
      }

      callback(node);
      walkElements(node, callback);
    });
  }

  function isWordPageBreak(element, useRenderedBreaks) {
    if (useRenderedBreaks) {
      return isWordElement(element, "lastRenderedPageBreak");
    }

    if (isWordElement(element, "lastRenderedPageBreak")) {
      return true;
    }

    return isWordElement(element, "br") && getWordAttribute(element, "type") === "page";
  }

  function isWordElement(element, localName) {
    return element.localName === localName || element.tagName === `w:${localName}`;
  }

  function getWordAttribute(element, attributeName) {
    return element.getAttributeNS(W_NS, attributeName)
      || element.getAttribute(`w:${attributeName}`)
      || element.getAttribute(attributeName);
  }

  function formatPageLocation(item) {
    const page = Number.isInteger(item.page) && item.page > 0 ? item.page : 1;
    const endPage = Number.isInteger(item.endPage) && item.endPage > page ? item.endPage : page;
    if (item.pageEstimated) {
      return `约第 ${page} 页`;
    }
    return endPage > page ? `第 ${page}-${endPage} 页` : `第 ${page} 页`;
  }

  function resetRevision() {
    state.changes = [];
    state.accepted.clear();
    clearProgressTimer();
    clearProgressHideTimer();
    els.progressPanel.hidden = true;
    setProgress(0, "准备生成");
    setAiStatus("未开始");
    renderChanges();
  }

  function resetDocument() {
    state.file = null;
    state.fileBuffer = null;
    state.documentXml = "";
    state.paragraphs = [];
    els.dropZone.classList.remove("is-ready");
    els.fileDetail.textContent = "尚未选择文件";
    els.docStats.textContent = "";
  }

  function setBusy(isBusy) {
    els.runButton.disabled = isBusy;
    els.runButton.textContent = isBusy ? "生成中" : "生成修改建议";
    document.body.classList.toggle("is-busy", isBusy);
  }

  function startFakeProgress() {
    clearProgressTimer();
    clearProgressHideTimer();
    state.progressValue = 6;
    els.progressPanel.hidden = false;
    setProgress(6, "正在读取文档结构");

    state.progressTimer = window.setInterval(() => {
      const remaining = 92 - state.progressValue;
      const step = Math.max(0.8, remaining * 0.08);
      state.progressValue = Math.min(92, state.progressValue + step);
      setProgress(Math.round(state.progressValue), getProgressLabel(state.progressValue));
    }, 520);
  }

  function finishFakeProgress(label) {
    clearProgressTimer();

    if (els.progressPanel.hidden) {
      return;
    }

    setProgress(100, label);
    clearProgressHideTimer();
    state.progressHideTimer = window.setTimeout(() => {
      els.progressPanel.hidden = true;
      setProgress(0, "准备生成");
      state.progressHideTimer = null;
    }, 700);
  }

  function clearProgressTimer() {
    if (state.progressTimer) {
      window.clearInterval(state.progressTimer);
      state.progressTimer = null;
    }
  }

  function clearProgressHideTimer() {
    if (state.progressHideTimer) {
      window.clearTimeout(state.progressHideTimer);
      state.progressHideTimer = null;
    }
  }

  function setProgress(percent, label) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    state.progressValue = value;
    els.progressFill.style.width = `${value}%`;
    els.progressPercent.textContent = `${value}%`;
    els.progressLabel.textContent = label;
  }

  function getProgressLabel(percent) {
    if (percent < 24) {
      return "正在读取合同条款";
    }
    if (percent < 48) {
      return "正在识别修改范围";
    }
    if (percent < 72) {
      return "正在生成法律表述";
    }
    return "正在整理差异结果";
  }

  function setParseStatus(text) {
    els.parseStatus.textContent = text;
  }

  function setAiStatus(text) {
    els.aiStatus.textContent = text;
  }

  function showMessage(text, isError) {
    clearMessage();
    const message = document.createElement("div");
    message.className = `message${isError ? " is-error" : ""}`;
    message.textContent = text;
    els.docStats.after(message);
  }

  function clearMessage() {
    document.querySelectorAll(".message").forEach((message) => message.remove());
  }

  function formatNetworkError(error) {
    if (error instanceof TypeError) {
      return "请求 DeepSeek API 失败。若浏览器控制台出现跨域提示，说明当前纯前端页面无法被 DeepSeek API 允许直接调用，需要通过你控制的后端代理转发请求。";
    }

    return error.message || "请求 DeepSeek API 失败。";
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function createOutputFileName(fileName, acceptedCount) {
    const suffix = acceptedCount ? "已修改" : "未修改";
    return fileName.replace(/\.docx$/i, "") + `-${suffix}.docx`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
