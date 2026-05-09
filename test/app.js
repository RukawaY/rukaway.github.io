(function () {
  "use strict";

  const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
  const MODEL_BY_MODE = {
    quick: "deepseek-v4-flash",
    expert: "deepseek-v4-pro"
  };
  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const ESTIMATED_CHARS_PER_PAGE = 900;
  const PDFJS_WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const LEGAL_KB = buildLegalKnowledgeBase();

  const state = {
    file: null,
    fileBuffer: null,
    sourceType: null,
    paragraphs: [],
    changes: [],
    accepted: new Set(),
    progressTimer: null,
    progressHideTimer: null,
    progressValue: 0,
    mode: "quick",
    exportComments: false,
    exportCommentsPreference: false
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
    exportComments: document.getElementById("export-comments"),
    emptyState: document.getElementById("empty-state"),
    diffList: document.getElementById("diff-list"),
    modeButtons: Array.from(document.querySelectorAll(".mode-button"))
  };

  init();

  function init() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    }

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

    els.exportButton.addEventListener("click", exportDocument);

    els.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        if (!mode || mode === state.mode) {
          return;
        }
        state.mode = mode;
        els.modeButtons.forEach((other) => {
          const isActive = other.dataset.mode === mode;
          other.classList.toggle("is-active", isActive);
          other.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      });
    });

    els.exportComments.addEventListener("change", () => {
      if (state.sourceType === "pdf") {
        els.exportComments.checked = true;
        return;
      }
      state.exportCommentsPreference = els.exportComments.checked;
      state.exportComments = els.exportComments.checked;
      els.exportComments.parentElement.classList.toggle("is-active", state.exportComments);
    });

    renderChanges();
  }

  function applySourceTypeUi() {
    const isPdf = state.sourceType === "pdf";
    const hasSource = !!state.sourceType;
    if (isPdf) {
      state.exportComments = true;
      els.exportComments.checked = true;
      els.exportComments.disabled = true;
      els.exportComments.parentElement.classList.add("is-active", "is-locked");
      if (!els.exportButton.dataset.busy) {
        els.exportButton.textContent = "导出批注 PDF";
      }
    } else {
      state.exportComments = state.exportCommentsPreference;
      els.exportComments.checked = state.exportCommentsPreference;
      els.exportComments.disabled = false;
      els.exportComments.parentElement.classList.remove("is-locked");
      els.exportComments.parentElement.classList.toggle("is-active", state.exportComments);
      if (!els.exportButton.dataset.busy) {
        els.exportButton.textContent = hasSource ? "导出 Word" : "导出文档";
      }
    }
  }

  async function parseFile(file) {
    clearMessage();
    resetRevision();

    const ext = getFileExtension(file.name);
    if (!["docx", "pdf", "doc"].includes(ext)) {
      resetDocument();
      setParseStatus("文件格式不支持");
      showMessage("请上传 .docx / .pdf / .doc 格式的文档。", true);
      return;
    }

    setParseStatus("解析中");
    els.fileDetail.textContent = `${file.name}，${formatFileSize(file.size)}`;

    try {
      if (ext === "docx") {
        await parseDocxFile(file);
      } else if (ext === "pdf") {
        await parsePdfFile(file);
      } else {
        await parseDocFile(file);
      }

      els.dropZone.classList.add("is-ready");
      applySourceTypeUi();
      const visibleParagraphs = state.paragraphs.filter((paragraph) => paragraph.text.trim()).length;
      const totalChars = state.paragraphs.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
      setParseStatus("已解析");
      const pageMode = describePageMode(state.paragraphs, state.sourceType);
      els.docStats.textContent = `${labelForSource(state.sourceType)} · 共 ${state.paragraphs.length} 个段落，${visibleParagraphs} 个非空段落，约 ${totalChars.toLocaleString("zh-CN")} 字，${pageMode}。`;
    } catch (error) {
      resetDocument();
      setParseStatus("解析失败");
      showMessage(error.message || "文档解析失败。", true);
    }
  }

  async function parseDocxFile(file) {
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
    state.paragraphs = paragraphs;
    state.sourceType = "docx";
  }

  async function parsePdfFile(file) {
    if (!window.pdfjsLib) {
      throw new Error("PDF 解析库尚未加载完成，请稍后再试。");
    }

    const fileBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: fileBuffer.slice(0) }).promise;
    const paragraphs = [];
    let runningIndex = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = groupPdfItemsIntoLines(textContent.items);
      lines.forEach((line) => {
        if (!line.text) {
          return;
        }
        paragraphs.push({
          index: runningIndex,
          text: line.text,
          page: pageNumber,
          endPage: pageNumber,
          pageEstimated: false,
          pdfPage: pageNumber,
          pdfY: line.y
        });
        runningIndex += 1;
      });
    }

    state.file = file;
    state.fileBuffer = fileBuffer;
    state.paragraphs = paragraphs;
    state.sourceType = "pdf";
  }

  async function parseDocFile(file) {
    const fileBuffer = await file.arrayBuffer();
    const segments = extractDocText(fileBuffer);
    if (!segments.length) {
      throw new Error(".doc 文档未能提取出有效文本，请尝试转存为 .docx 后重试。");
    }

    let runningChars = 0;
    const paragraphs = segments.map((text, index) => {
      const page = Math.max(1, Math.floor(runningChars / ESTIMATED_CHARS_PER_PAGE) + 1);
      runningChars += text.length + (text.trim() ? 2 : 0);
      return {
        index,
        text,
        page,
        endPage: page,
        pageEstimated: true
      };
    });

    state.file = file;
    state.fileBuffer = fileBuffer;
    state.paragraphs = paragraphs;
    state.sourceType = "doc";
  }

  function groupPdfItemsIntoLines(items) {
    if (!items || !items.length) {
      return [];
    }

    const lines = [];
    let currentLine = null;
    const tolerance = 2;

    const flush = () => {
      if (!currentLine) {
        return;
      }
      const text = joinLineItems(currentLine.items);
      if (text) {
        lines.push({ text, y: currentLine.y });
      }
      currentLine = null;
    };

    items.forEach((item) => {
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const y = transform[5];
      const x = transform[4];
      const text = item.str || "";

      if (item.hasEOL) {
        flush();
        return;
      }

      if (!currentLine) {
        currentLine = { y, items: [{ x, text }] };
        return;
      }

      if (Math.abs(currentLine.y - y) <= tolerance) {
        currentLine.items.push({ x, text });
      } else {
        flush();
        currentLine = { y, items: [{ x, text }] };
      }
    });

    flush();
    return lines;
  }

  function joinLineItems(items) {
    return items
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractDocText(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const segments = [];
    let buffer = "";

    for (let i = 0; i + 1 < view.byteLength; i += 2) {
      const code = view.getUint16(i, true);
      if (isReadableUtf16(code)) {
        buffer += String.fromCharCode(code);
      } else {
        if (buffer.length >= 6) {
          segments.push(buffer);
        }
        buffer = "";
      }
    }
    if (buffer.length >= 6) {
      segments.push(buffer);
    }

    const cleaned = [];
    const seen = new Set();
    segments.forEach((raw) => {
      const text = raw.replace(/[ -]+/g, " ").replace(/\s+/g, " ").trim();
      if (!text || text.length < 6) {
        return;
      }
      if (!/[一-龥A-Za-z]/.test(text)) {
        return;
      }
      if (seen.has(text)) {
        return;
      }
      seen.add(text);
      cleaned.push(text);
    });

    return cleaned;
  }

  function isReadableUtf16(code) {
    if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
    if (code >= 0x20 && code <= 0x7e) return true;
    if (code >= 0x3000 && code <= 0x303f) return true;
    if (code >= 0x4e00 && code <= 0x9fff) return true;
    if (code >= 0xff00 && code <= 0xffef) return true;
    if (code === 0x2014 || code === 0x2019 || code === 0x201c || code === 0x201d || code === 0x2026) return true;
    return false;
  }

  async function generateRevision() {
    clearMessage();

    const instruction = els.instruction.value.trim();
    const apiKey = els.apiKey.value.trim();

    if (!state.file || !state.paragraphs.length) {
      showMessage("请先上传并解析文档。", true);
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

    const ragEntries = state.mode === "expert" ? retrieveLegalKB(instruction, state.paragraphs) : [];
    const promptText = buildDocumentPrompt(instruction, state.paragraphs, ragEntries);

    if (promptText.length > 180000) {
      showMessage("当前文档文本较长，可能超过当前 DeepSeek 模型的单次上下文限制。请先拆分文档或缩小修改范围。", true);
      return;
    }

    resetRevision();
    setBusy(true);
    setAiStatus(state.mode === "expert" ? "深度生成中" : "生成中");
    startFakeProgress(state.mode);

    try {
      const response = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL_BY_MODE[state.mode],
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(state.mode, ragEntries)
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

  function buildSystemPrompt(mode, ragEntries) {
    const isPdfSource = state.sourceType === "pdf";

    let base;
    if (isPdfSource) {
      base = [
        "你是一名执业经验丰富、写作严谨的中国律师，擅长合同、债权申报、诉讼与非诉法律文书的审阅与批注。",
        "当前任务是『PDF 批注模式』：用户上传一份法律文书 PDF，你需要逐段审阅，对存在问题或可改进的段落给出律师批注。批注会以侧边注的形式插入原 PDF，原文不会被改写——你的输出不是修改稿，而是审阅意见。",
        "对每条批注（reason 字段）的硬性要求：(1) 1-3 句话之内完成，简明扼要；(2) 同时点出『问题』和『建议』两部分，例如『当前事实陈述过于笼统，建议补充违约时间、金额与具体行为』；(3) 语言专业、克制、可执行，符合中文法律文书惯例；(4) 仅在确有问题或明显可优化时返回该段，不要凑数。",
        "你必须严格基于原文事实，不得臆造金额、日期、主体、法条、判例或履行情况；如需在批注中引用法条，应仅以现行有效法律为准，且使用准确的条文编号，无法确认时不写编号。",
        "revised 字段是辅助字段：你可以填入对该段落的建议改写文本，但不会被应用到原 PDF；如果只想给出批注，revised 可以与原文一致或省略——reason 才是你必须保证质量的输出。",
        "输出必须是严格 JSON，不要输出 Markdown、解释文本或代码块。"
      ];
    } else {
      base = [
        "你是一名执业经验丰富、写作严谨的中国律师，擅长合同、债权申报、诉讼与非诉法律文书的定点修订。",
        "你的任务是按照用户要求做最小必要修改：增强法律文书的事实链条、权利义务、因果关系、请求依据和表述严密性，但不得重写整篇文档。",
        "你必须保持原文的法律关系、主体名称、金额、日期、编号、事实基础、证据状态和责任边界准确稳定；除非用户明确要求或原文已经提供依据，不得臆造事实、承诺、法条、判例或履行情况。",
        "若必须在修改稿中引用法条，应仅以现行有效的法律文本为准，并使用准确的法律名称与条文编号；如果不能确认条文编号，宁可不写编号也不得伪造或猜测。",
        "语言风格应当专业、克制、清楚、可执行，符合中文法律文书习惯；避免夸张、空泛、营销化、口语化表达。",
        "输出必须是严格 JSON，不要输出 Markdown、解释文本或代码块。"
      ];
    }

    if (mode === "expert") {
      base.push(isPdfSource
        ? "当前模式：专家模式。请进行更细致的法律分析，对于专业性问题可在 reason 中简要援引下方法律依据；只有在能直接对应原文事实时才援引，避免生搬硬套。"
        : "当前模式：专家模式。请进行更细致的法律分析，必要时援引下方提供的法律依据；只有在能直接对应原文事实关系时才使用，避免生搬硬套。");
      base.push("下方法律条文仅作内容参考，其条文编号已尽量对齐《民法典》(2021年施行)、《公司法》(2024年7月1日施行)、《民事诉讼法》(2021年修正)等现行版本；若你已知更新版本的条文编号有所不同，请以现行有效法律为准。");
      if (ragEntries.length) {
        base.push(isPdfSource
          ? "以下是与本次审阅相关的法律条文检索结果，仅供你判断是否援引："
          : "以下是与本次修改相关的法律条文检索结果，仅供你判断是否援引：");
        ragEntries.forEach((entry) => {
          base.push(`- ${entry.title}：${entry.content}`);
        });
      }
    } else {
      base.push(isPdfSource
        ? "当前模式：快速模式。请高效产出最小必要的批注，无需展开法律论证。"
        : "当前模式：快速模式。请高效给出最小必要修改，无需展开法律论证。");
    }

    return base.join("\n");
  }

  function buildDocumentPrompt(instruction, paragraphs, ragEntries) {
    const isPdf = state.sourceType === "pdf";
    const numberedParagraphs = paragraphs
      .filter((paragraph) => paragraph.text.trim())
      .map((paragraph) => `[${paragraph.index} | ${formatPageLocation(paragraph)}] ${paragraph.text}`)
      .join("\n");

    const sections = [
      isPdf ? "用户审阅要求：" : "用户修改要求：",
      instruction
    ];

    if (ragEntries.length) {
      sections.push("");
      sections.push(isPdf
        ? "已为本次审阅检索到的相关法律条文（专家模式 RAG）："
        : "已为本次修改检索到的相关法律条文（专家模式 RAG）：");
      ragEntries.forEach((entry) => {
        sections.push(`- ${entry.title}：${entry.content}`);
      });
    }

    sections.push("");
    sections.push("下面是从文档中按段落抽取出的正文。方括号中的第一个数字是段落 index，返回时必须原样使用该 index；页码只用于定位和理解上下文。");
    sections.push(numberedParagraphs);
    sections.push("");
    sections.push("请返回 JSON，结构如下：");
    sections.push("{\"changes\":[{\"index\":0,\"revised\":\"建议改写后的完整段落文字\",\"reason\":\"批注或修改说明\"}]}");
    sections.push("");

    if (isPdf) {
      sections.push("PDF 批注模式规则：");
      sections.push("1. 只返回确有问题或值得批注的段落；不要为了凑数而批注。");
      sections.push("2. reason 是最终批注内容（必填），需在 1-3 句之内同时给出『问题』与『具体建议』，作为律师写在原 PDF 侧边的备注，应能被独立阅读。");
      sections.push("3. reason 不要重复段落 index、页码或大段引用原文。");
      sections.push("4. revised 是辅助字段，可填入对该段落的建议改写文本，但不会被应用到原 PDF；如不必要可与原文一致。");
      sections.push("5. 严格基于原文事实，不得臆造金额、日期、主体名称、法条、判例或履行情况。");
      sections.push("6. 表达保持专业、克制，避免营销化和结论跳跃。");
    } else {
      sections.push("修改模式规则：");
      sections.push("1. 只返回确实需要修改的段落；不需要修改的段落不要返回。");
      sections.push("2. revised 必须是该段落修改后的完整纯文本，不要包含段落 index 或页码。");
      sections.push("3. 不要在 revised 中插入换行；如果需要扩写，请仍放在同一个段落内。");
      sections.push("4. 保持原文段落用途、语气、称谓、金额、日期、编号和主体名称稳定；没有明确依据不得新增事实。");
      sections.push("5. 修改应体现专业律师的谨慎表达，避免夸张、营销化、口语化和结论跳跃。");
      sections.push("6. 不要返回原文全文，不要改变未被要求修改的内容。");
    }

    return sections.join("\n");
  }

  function buildLegalKnowledgeBase() {
    return [
      { title: "《民法典》第五百零九条", content: "当事人应当按照约定全面履行自己的义务。当事人应当遵循诚信原则，根据合同的性质、目的和交易习惯履行通知、协助、保密等义务。", keywords: ["合同", "履行", "诚信", "协助", "通知"] },
      { title: "《民法典》第五百七十七条", content: "当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。", keywords: ["违约", "继续履行", "赔偿损失", "补救"] },
      { title: "《民法典》第五百八十五条", content: "当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。", keywords: ["违约金", "损失", "赔偿", "约定"] },
      { title: "《民法典》第五百八十四条", content: "当事人一方不履行合同义务或者履行合同义务不符合约定，造成对方损失的，损失赔偿额应当相当于因违约所造成的损失，包括合同履行后可以获得的利益。", keywords: ["损失", "赔偿", "可得利益", "违约"] },
      { title: "《民法典》第五百六十三条", content: "因不可抗力致使不能实现合同目的；或者一方明确表示或者以自己的行为表明不履行主要债务等情形，当事人可以解除合同。", keywords: ["解除合同", "不可抗力", "不履行"] },
      { title: "《民法典》第六百七十五条", content: "借款人应当按照约定的期限返还借款。对借款期限没有约定或者约定不明确，依据本法第五百一十条的规定仍不能确定的，借款人可以随时返还。", keywords: ["借款", "返还", "期限", "贷款"] },
      { title: "《民法典》第六百七十六条", content: "借款人未按照约定的期限返还借款的，应当按照约定或者国家有关规定支付逾期利息。", keywords: ["借款", "逾期", "利息"] },
      { title: "《民法典》第一百八十六条", content: "因当事人一方的违约行为，损害对方人身权益、财产权益的，受损害方有权选择请求其承担违约责任或者侵权责任。", keywords: ["违约", "侵权", "请求权", "竞合"] },
      { title: "《民法典》第一千一百六十五条", content: "行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。依照法律规定推定行为人有过错，其不能证明自己没有过错的，应当承担侵权责任。", keywords: ["侵权", "过错", "损害", "举证"] },
      { title: "《民法典》第一千一百七十九条", content: "侵害他人造成人身损害的，应当赔偿医疗费、护理费、交通费、营养费、住院伙食补助费等为治疗和康复支出的合理费用，以及因误工减少的收入。", keywords: ["人身损害", "医疗费", "误工", "赔偿"] },
      { title: "《民法典》第一百八十八条", content: "向人民法院请求保护民事权利的诉讼时效期间为三年。法律另有规定的，依照其规定。诉讼时效期间自权利人知道或者应当知道权利受到损害以及义务人之日起计算。", keywords: ["诉讼时效", "三年", "起算"] },
      { title: "《民法典》第六百八十八条", content: "当事人在保证合同中约定保证人和债务人对债务承担连带责任的，为连带责任保证。连带责任保证的债务人不履行到期债务或者发生当事人约定的情形时，债权人可以请求债务人履行债务，也可以请求保证人在其保证范围内承担保证责任。", keywords: ["保证", "连带责任", "债权人", "保证人"] },
      { title: "《民事诉讼法》第六十四条", content: "当事人对自己提出的主张，有责任提供证据。当事人及其诉讼代理人因客观原因不能自行收集的证据，或者人民法院认为审理案件需要的证据，人民法院应当调查收集。", keywords: ["举证责任", "证据", "调查取证"] },
      { title: "《民事诉讼法》第一百二十条", content: "起诉应当向人民法院递交起诉状，并按照被告人数提出副本。书写起诉状确有困难的，可以口头起诉，由人民法院记入笔录，并告知对方当事人。", keywords: ["起诉", "起诉状", "立案"] },
      { title: "《民事诉讼法》第二百三十六条", content: "发生法律效力的民事判决、裁定，当事人必须履行。一方拒绝履行的，对方当事人可以向人民法院申请执行。", keywords: ["执行", "强制执行", "判决"] },
      { title: "《企业破产法》第四十八条", content: "债权人应当在人民法院确定的债权申报期限内向管理人申报债权。债权人申报债权时，应当书面说明债权的数额和有无财产担保，并提交有关证据。", keywords: ["破产", "债权申报", "管理人"] },
      { title: "《企业破产法》第五十八条", content: "依照本法第五十七条规定编制的债权表，应当提交第一次债权人会议核查。债务人、债权人对债权表记载的债权无异议的，由人民法院裁定确认。", keywords: ["破产", "债权表", "债权人会议"] },
      { title: "《公司法》第二十一条（2024年7月1日施行）", content: "公司股东应当遵守法律、行政法规和公司章程，依法行使股东权利，不得滥用股东权利损害公司或者其他股东的利益；不得滥用公司法人独立地位和股东有限责任损害公司债权人的利益。", keywords: ["股东", "公司", "滥用权利", "法人独立"] },
      { title: "《公司法》第一百八十条（2024年7月1日施行）", content: "董事、监事、高级管理人员对公司负有忠实义务，应当采取措施避免自身利益与公司利益冲突，不得利用职权牟取不正当利益。董事、监事、高级管理人员对公司负有勤勉义务，执行职务应当为公司的最大利益尽到管理者通常应有的合理注意。", keywords: ["董事", "高管", "忠实义务", "勤勉义务", "利益冲突"] },
      { title: "《劳动合同法》第三十九条", content: "劳动者有下列情形之一的，用人单位可以解除劳动合同：在试用期间被证明不符合录用条件的；严重违反用人单位的规章制度的；严重失职、营私舞弊，给用人单位造成重大损害的等。", keywords: ["劳动合同", "解除", "违纪"] },
      { title: "《劳动合同法》第四十七条", content: "经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。六个月以上不满一年的，按一年计算；不满六个月的，向劳动者支付半个月工资的经济补偿。", keywords: ["劳动合同", "经济补偿", "解除"] },
      { title: "《民法典》第五百零二条", content: "依法成立的合同，自成立时生效，但是法律另有规定或者当事人另有约定的除外。", keywords: ["合同", "成立", "生效"] },
      { title: "《民法典》第四百九十条", content: "当事人采用合同书形式订立合同的，自当事人均签名、盖章或者按指印时合同成立。", keywords: ["合同", "签订", "成立"] },
      { title: "《民法典》第一百四十三条", content: "具备下列条件的民事法律行为有效：行为人具有相应的民事行为能力；意思表示真实；不违反法律、行政法规的强制性规定，不违背公序良俗。", keywords: ["民事行为", "效力", "意思表示"] },
      { title: "《民法典》第一百五十三条", content: "违反法律、行政法规的强制性规定的民事法律行为无效。但是，该强制性规定不导致该民事法律行为无效的除外。违背公序良俗的民事法律行为无效。", keywords: ["无效", "强制性规定", "公序良俗"] },
      { title: "《民法典》第一百四十八条", content: "一方以欺诈手段，使对方在违背真实意思的情况下实施的民事法律行为，受欺诈方有权请求人民法院或者仲裁机构予以撤销。", keywords: ["欺诈", "撤销", "意思表示"] },
      { title: "《民法典》第一百五十一条", content: "一方利用对方处于危困状态、缺乏判断能力等情形，致使民事法律行为成立时显失公平的，受损害方有权请求人民法院或者仲裁机构予以撤销。", keywords: ["显失公平", "撤销", "危困"] },
      { title: "《民法典》第七百零三条", content: "租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。", keywords: ["租赁", "出租人", "承租人"] },
      { title: "《民法典》第七百二十一条", content: "承租人应当按照约定的期限支付租金。对支付租金的期限没有约定或者约定不明确，依据本法第五百一十条的规定仍不能确定的，租赁期限不满一年的，应当在租赁期限届满时支付。", keywords: ["租赁", "租金", "支付"] },
      { title: "《民法典》第三百九十四条", content: "为担保债务的履行，债务人或者第三人不转移财产的占有，将该财产抵押给债权人的，债务人不履行到期债务或者发生当事人约定的实现抵押权的情形，债权人有权就该财产优先受偿。", keywords: ["抵押", "担保", "优先受偿"] }
    ];
  }

  function retrieveLegalKB(instruction, paragraphs, topK = 6) {
    const corpus = buildRetrievalQuery(instruction, paragraphs);
    if (!corpus) {
      return [];
    }

    const scored = LEGAL_KB.map((entry) => ({
      entry,
      score: scoreEntry(entry, corpus)
    })).filter((item) => item.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((item) => item.entry);
  }

  function buildRetrievalQuery(instruction, paragraphs) {
    const sample = paragraphs
      .filter((p) => p.text.trim())
      .slice(0, 12)
      .map((p) => p.text)
      .join(" ");
    return `${instruction || ""} ${sample}`.toLowerCase();
  }

  function scoreEntry(entry, corpus) {
    let score = 0;
    entry.keywords.forEach((keyword) => {
      if (corpus.includes(keyword.toLowerCase())) {
        score += 3;
      }
    });
    const fragments = entry.content.match(/[一-龥]{2,4}/g) || [];
    fragments.forEach((fragment) => {
      if (corpus.includes(fragment)) {
        score += 1;
      }
    });
    return score;
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

    const isPdfSource = state.sourceType === "pdf";

    rawChanges.forEach((rawChange) => {
      const index = Number(rawChange && rawChange.index);
      if (!Number.isInteger(index) || index < 0 || index >= state.paragraphs.length || seen.has(index)) {
        return;
      }

      const revisedRaw = rawChange.revised ?? rawChange.new_text ?? rawChange.newText ?? rawChange.text;
      const revisedValue = typeof revisedRaw === "string" ? revisedRaw : "";
      const reason = normalizeParagraphText(String(rawChange.reason || rawChange.explanation || ""));

      const paragraph = state.paragraphs[index];
      const original = paragraph.text;
      const revised = normalizeParagraphText(revisedValue);

      if (isPdfSource) {
        if (!reason) {
          return;
        }
      } else {
        if (!revisedValue || revised === original) {
          return;
        }
      }

      seen.add(index);
      changes.push({
        index,
        original,
        revised,
        page: paragraph.page,
        endPage: paragraph.endPage,
        pageEstimated: paragraph.pageEstimated,
        reason
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
    const isPdf = state.sourceType === "pdf";
    els.acceptAll.disabled = !hasChanges;
    els.rejectAll.disabled = !hasChanges;
    els.exportButton.disabled = !hasChanges || !state.paragraphs.length;
    els.emptyState.style.display = hasChanges ? "none" : "grid";
    els.acceptAll.classList.toggle("is-active", hasChanges && acceptedCount === state.changes.length);
    els.rejectAll.classList.toggle("is-active", hasChanges && acceptedCount === 0);

    const emptyParagraph = els.emptyState.querySelector("p");
    if (emptyParagraph) {
      emptyParagraph.innerHTML = isPdf
        ? "上传 PDF 并分析后，这里会显示逐段的批注建议。<br>每条建议都可以单独保留或抛弃，保留的项将作为侧边批注插入原 PDF。"
        : "上传文档并分析后，这里会显示逐段的修改建议。<br>每一处修改都可以单独保留或抛弃。";
    }

    if (!hasChanges) {
      els.reviewTitle.textContent = isPdf ? "暂无批注建议" : "暂无修改建议";
      return;
    }

    els.reviewTitle.textContent = isPdf
      ? `${state.changes.length} 条批注建议，已保留 ${acceptedCount} 条`
      : `${state.changes.length} 处修改建议，已保留 ${acceptedCount} 处`;

    if (isPdf) {
      const notice = document.createElement("div");
      notice.className = "pdf-mode-notice";
      notice.textContent = "PDF 批注模式：保留的项将以侧边批注形式插入原 PDF，原文内容不会被修改。";
      els.diffList.append(notice);
    }

    state.changes.forEach((change) => {
      const accepted = state.accepted.has(change.index);
      const card = document.createElement("article");
      card.className = `change-card${accepted ? "" : " is-rejected"}${isPdf ? " is-annotation" : ""}`;

      const head = document.createElement("div");
      head.className = "change-head";

      const meta = document.createElement("div");
      meta.className = "change-meta";

      const pill = document.createElement("span");
      pill.className = `pill ${accepted ? "pill-accept" : "pill-reject"}`;
      pill.textContent = accepted ? "保留" : "抛弃";

      const locationInfo = document.createElement("span");
      locationInfo.textContent = formatPageLocation(change);

      meta.append(pill, locationInfo);

      if (!isPdf) {
        const charInfo = document.createElement("span");
        const delta = change.revised.length - change.original.length;
        charInfo.textContent = `字数 ${change.original.length} → ${change.revised.length}${delta === 0 ? "" : `（${delta > 0 ? "+" : ""}${delta}）`}`;
        meta.append(charInfo);
      }

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

      if (isPdf) {
        card.append(head, createAnnotationBody(change));
      } else {
        card.append(head, createDiffBody(change.original, change.revised));
      }

      if (change.reason) {
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = isPdf ? `批注内容：${change.reason}` : `修改说明：${change.reason}`;
        card.append(reason);
      }

      els.diffList.append(card);
    });
  }

  function createAnnotationBody(change) {
    const body = document.createElement("div");
    body.className = "diff-body annotation-body";

    const line = document.createElement("div");
    line.className = "diff-line plain";

    const markEl = document.createElement("div");
    markEl.className = "diff-mark";
    markEl.textContent = "·";

    const textEl = document.createElement("div");
    textEl.className = "diff-text";
    textEl.textContent = change.original || "（空段落）";

    line.append(markEl, textEl);
    body.append(line);
    return body;
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

  async function exportDocument() {
    clearMessage();

    if (!state.paragraphs.length) {
      showMessage("请先上传文档。", true);
      return;
    }

    const acceptedChanges = state.changes.filter((change) => state.accepted.has(change.index));
    els.exportButton.disabled = true;
    els.exportButton.dataset.busy = "1";
    els.exportButton.textContent = "导出中";

    try {
      if (state.sourceType === "pdf") {
        await exportPdfAnnotatedFlow(acceptedChanges);
      } else {
        await exportDocxFlow(acceptedChanges);
      }
    } catch (error) {
      showMessage(error.message || "文档导出失败。", true);
    } finally {
      delete els.exportButton.dataset.busy;
      applySourceTypeUi();
      renderChanges();
    }
  }

  async function exportDocxFlow(acceptedChanges) {
    const includeComments = state.exportComments && acceptedChanges.length > 0;
    let blob;

    if (state.sourceType === "docx" && state.fileBuffer) {
      blob = await buildDocxFromOriginal(acceptedChanges, includeComments);
    } else {
      blob = await buildDocxFromScratch(acceptedChanges, includeComments);
    }

    downloadBlob(blob, createOutputFileName(state.file.name, acceptedChanges.length, "docx"));
    showMessage(`已输出 DOCX 文档，保留 ${acceptedChanges.length} 处修改。`, false);
  }

  async function exportPdfAnnotatedFlow(acceptedChanges) {
    if (!window.PDFLib) {
      throw new Error("PDF 标注库尚未加载完成，请稍后再试。");
    }
    if (!state.fileBuffer) {
      throw new Error("原始 PDF 数据已丢失，请重新上传。");
    }
    if (!acceptedChanges.length) {
      throw new Error("当前没有需要保留的批注，无法导出。");
    }

    const { PDFDocument, PDFName, PDFHexString, PDFString } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(state.fileBuffer.slice(0));
    const pages = pdfDoc.getPages();
    const dateStr = "D:" + formatPdfDate(new Date());
    const annotsKey = PDFName.of("Annots");
    let inserted = 0;

    acceptedChanges.forEach((change) => {
      const paragraph = state.paragraphs[change.index];
      if (!paragraph || typeof paragraph.pdfPage !== "number") {
        return;
      }
      const page = pages[paragraph.pdfPage - 1];
      if (!page) {
        return;
      }

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const baselineY = typeof paragraph.pdfY === "number" ? paragraph.pdfY : pageHeight / 2;
      const clampedY = Math.max(20, Math.min(pageHeight - 20, baselineY));
      const x = Math.max(20, pageWidth - 30);

      const content = change.reason
        || (change.revised ? `建议修改为：${change.revised}` : "AI 建议（无具体说明）");

      const annotationDict = pdfDoc.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [x, clampedY - 6, x + 22, clampedY + 18],
        Contents: PDFHexString.fromText(content),
        T: PDFHexString.fromText("AI审阅"),
        M: PDFString.of(dateStr),
        Name: "Comment",
        C: [0.78, 0.37, 0.24],
        Open: false
      });
      const annotationRef = pdfDoc.context.register(annotationDict);

      let annotsArray = page.node.lookup(annotsKey);
      if (!annotsArray || typeof annotsArray.push !== "function") {
        annotsArray = pdfDoc.context.obj([]);
        page.node.set(annotsKey, annotsArray);
      }
      annotsArray.push(annotationRef);
      inserted += 1;
    });

    if (!inserted) {
      throw new Error("未能在原 PDF 上定位到任何批注位置。");
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    downloadBlob(blob, createOutputFileName(state.file.name, acceptedChanges.length, "pdf"));
    showMessage(`已输出标注 PDF，包含 ${inserted} 处批注。`, false);
  }

  function formatPdfDate(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  }

  async function buildDocxFromOriginal(acceptedChanges, includeComments) {
    const zip = await JSZip.loadAsync(state.fileBuffer.slice(0));
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) {
      throw new Error("未找到 Word 主文档内容。");
    }

    const documentXml = await documentFile.async("string");
    const documentDom = parseXml(documentXml);
    const paragraphNodes = wordElements(documentDom, "p");

    acceptedChanges.forEach((change, slot) => {
      const paragraphNode = paragraphNodes[change.index];
      if (!paragraphNode) {
        return;
      }
      replaceParagraphText(paragraphNode, change.revised);
      if (includeComments) {
        wrapParagraphWithComment(paragraphNode, slot, change);
      }
    });

    const serialized = new XMLSerializer().serializeToString(documentDom);
    zip.file("word/document.xml", serialized);

    if (includeComments) {
      await injectCommentsArtifacts(zip, acceptedChanges);
    }

    return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME });
  }

  async function buildDocxFromScratch(acceptedChanges, includeComments) {
    const zip = new JSZip();
    const acceptedMap = new Map(acceptedChanges.map((change) => [change.index, change]));

    const documentXml = buildDocumentXmlFromParagraphs(state.paragraphs, acceptedMap, includeComments);
    zip.file("[Content_Types].xml", buildContentTypesXml(includeComments));
    zip.file("_rels/.rels", buildRootRelsXml());
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", buildDocumentRelsXml(includeComments));
    zip.file("word/styles.xml", buildMinimalStylesXml());

    if (includeComments) {
      zip.file("word/comments.xml", buildCommentsXml(acceptedChanges));
    }

    return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME });
  }

  function wrapParagraphWithComment(paragraphNode, slot, change) {
    const doc = paragraphNode.ownerDocument;
    const id = String(slot);
    const start = doc.createElementNS(W_NS, "w:commentRangeStart");
    start.setAttributeNS(W_NS, "w:id", id);
    const end = doc.createElementNS(W_NS, "w:commentRangeEnd");
    end.setAttributeNS(W_NS, "w:id", id);
    const refRun = doc.createElementNS(W_NS, "w:r");
    const refRpr = doc.createElementNS(W_NS, "w:rPr");
    const refStyle = doc.createElementNS(W_NS, "w:rStyle");
    refStyle.setAttributeNS(W_NS, "w:val", "CommentReference");
    refRpr.append(refStyle);
    const ref = doc.createElementNS(W_NS, "w:commentReference");
    ref.setAttributeNS(W_NS, "w:id", id);
    refRun.append(refRpr, ref);

    const pPr = wordElements(paragraphNode, "pPr")[0];
    if (pPr && pPr.parentNode === paragraphNode) {
      pPr.after(start);
    } else {
      paragraphNode.insertBefore(start, paragraphNode.firstChild);
    }
    paragraphNode.append(end, refRun);
  }

  async function injectCommentsArtifacts(zip, acceptedChanges) {
    zip.file("word/comments.xml", buildCommentsXml(acceptedChanges));

    const ctFile = zip.file("[Content_Types].xml");
    if (ctFile) {
      const ctXml = await ctFile.async("string");
      const updated = ensureContentTypeOverride(
        ctXml,
        "/word/comments.xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"
      );
      zip.file("[Content_Types].xml", updated);
    }

    const relsPath = "word/_rels/document.xml.rels";
    const relsFile = zip.file(relsPath);
    let relsXml;
    if (relsFile) {
      relsXml = await relsFile.async("string");
    } else {
      relsXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>";
    }
    relsXml = ensureRelationship(
      relsXml,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
      "comments.xml"
    );
    zip.file(relsPath, relsXml);
  }

  function ensureContentTypeOverride(xml, partName, contentType) {
    if (xml.includes(`PartName="${partName}"`)) {
      return xml;
    }
    const insertion = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
    return xml.replace(/<\/Types>\s*$/i, `${insertion}</Types>`);
  }

  function ensureRelationship(xml, type, target) {
    if (xml.includes(`Type="${type}"`)) {
      return xml;
    }
    const idMatches = Array.from(xml.matchAll(/Id="rId(\d+)"/g));
    let nextId = 1;
    idMatches.forEach((match) => {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value) && value >= nextId) {
        nextId = value + 1;
      }
    });
    const insertion = `<Relationship Id="rId${nextId}" Type="${type}" Target="${target}"/>`;
    return xml.replace(/<\/Relationships>\s*$/i, `${insertion}</Relationships>`);
  }

  function buildCommentsXml(acceptedChanges) {
    const now = new Date().toISOString();
    const items = acceptedChanges.map((change, slot) => {
      const body = change.reason || "（无修改说明）";
      const paragraph = `<w:p><w:r><w:t xml:space="preserve">${escapeXml(body)}</w:t></w:r></w:p>`;
      return `<w:comment w:id="${slot}" w:author="AI审阅" w:date="${now}" w:initials="AI">${paragraph}</w:comment>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:comments xmlns:w="${W_NS}">${items}</w:comments>`;
  }

  function buildDocumentXmlFromParagraphs(paragraphs, acceptedMap, includeComments) {
    let commentSlot = 0;
    const body = paragraphs.map((paragraph) => {
      const change = acceptedMap.get(paragraph.index);
      const text = change ? change.revised : paragraph.text;
      const safeText = escapeXml(text || "");
      const runs = `<w:r><w:t xml:space="preserve">${safeText}</w:t></w:r>`;

      if (change && includeComments) {
        const id = String(commentSlot);
        commentSlot += 1;
        return `<w:p><w:commentRangeStart w:id="${id}"/>${runs}<w:commentRangeEnd w:id="${id}"/>` +
          `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r></w:p>`;
      }
      return `<w:p>${runs}</w:p>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="${W_NS}">` +
      `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>` +
      `</w:document>`;
  }

  function buildContentTypesXml(includeComments) {
    const overrides = [
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
    ];
    if (includeComments) {
      overrides.push(`<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      overrides.join("") +
      `</Types>`;
  }

  function buildRootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`;
  }

  function buildDocumentRelsXml(includeComments) {
    const rels = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    ];
    if (includeComments) {
      rels.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rels.join("") +
      `</Relationships>`;
  }

  function buildMinimalStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="${W_NS}">` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="SimSun"/><w:sz w:val="24"/></w:rPr></w:style>` +
      `<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/></w:rPr></w:style>` +
      `</w:styles>`;
  }

  function escapeXml(text) {
    return String(text).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case "\"": return "&quot;";
        case "'": return "&apos;";
        default: return char;
      }
    });
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

  function describePageMode(paragraphs, sourceType) {
    if (sourceType === "pdf") {
      return "已读取 PDF 分页";
    }
    if (sourceType === "doc") {
      return "页码为估算（.doc 格式）";
    }
    return paragraphs.some((item) => item.pageEstimated) ? "页码为估算" : "已读取 Word 分页";
  }

  function labelForSource(sourceType) {
    if (sourceType === "pdf") return "PDF 文档";
    if (sourceType === "doc") return "DOC 文档";
    return "DOCX 文档";
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
    state.paragraphs = [];
    state.sourceType = null;
    els.dropZone.classList.remove("is-ready");
    els.fileDetail.textContent = "尚未选择文件";
    els.docStats.textContent = "";
    applySourceTypeUi();
  }

  function setBusy(isBusy) {
    els.runButton.disabled = isBusy;
    els.runButton.textContent = isBusy ? "生成中" : "生成修改建议";
    document.body.classList.toggle("is-busy", isBusy);
  }

  function startFakeProgress(mode) {
    clearProgressTimer();
    clearProgressHideTimer();
    state.progressValue = 4;
    els.progressPanel.hidden = false;
    setProgress(4, mode === "expert" ? "正在检索法律条文" : "正在读取文档结构");

    const isExpert = mode === "expert";
    const intervalMs = isExpert ? 1500 : 520;
    const stepFactor = isExpert ? 0.04 : 0.08;
    const minStep = isExpert ? 0.3 : 0.8;

    state.progressTimer = window.setInterval(() => {
      const remaining = 92 - state.progressValue;
      const step = Math.max(minStep, remaining * stepFactor);
      state.progressValue = Math.min(92, state.progressValue + step);
      setProgress(Math.round(state.progressValue), getProgressLabel(state.progressValue, mode));
    }, intervalMs);
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

  function getProgressLabel(percent, mode) {
    if (mode === "expert") {
      if (percent < 18) return "正在检索相关法条";
      if (percent < 40) return "正在比对原文与法条";
      if (percent < 64) return "正在生成深度修订";
      if (percent < 86) return "正在校验法律表述";
      return "正在整理差异结果";
    }
    if (percent < 24) return "正在读取合同条款";
    if (percent < 48) return "正在识别修改范围";
    if (percent < 72) return "正在生成法律表述";
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

  function getFileExtension(fileName) {
    const match = /\.([a-z0-9]+)$/i.exec(fileName);
    return match ? match[1].toLowerCase() : "";
  }

  function stripExt(fileName) {
    return fileName.replace(/\.[^.]+$/, "");
  }

  function createOutputFileName(fileName, acceptedCount, ext) {
    const cleanExt = (ext || "docx").toLowerCase();
    const suffix = cleanExt === "pdf"
      ? (acceptedCount ? "已批注" : "未批注")
      : (acceptedCount ? "已修改" : "未修改");
    return `${stripExt(fileName)}-${suffix}.${cleanExt}`;
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
