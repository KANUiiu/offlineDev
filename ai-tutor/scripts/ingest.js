const fs = require("fs");
const path = require("path");

const RAW_DOCS_DIR = path.join(__dirname, "../data/raw-mdn");
const VDB_STORE_DIR = path.join(__dirname, "../data/vdb-store");
const VECTORS_PATH = path.join(VDB_STORE_DIR, "vectors.json");
const MAPPING_PATH = path.join(VDB_STORE_DIR, "mapping.json");

// 遞迴獲取所有 Markdown 檔案
function getMdFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getMdFiles(filePath, fileList);
    } else if (path.extname(file) === ".md") {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function chunkMarkdown(text) {
  // 1. 清理 YAML Frontmatter 與模板語法
  const cleanText = text
    .replace(/^---[\s\S]+?---\n*/, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/```js interactive-example/g, "```js")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 2. 嚴格按段落或固定長度切分，避免任何 chunk 超過 500 字元
  const paragraphs = cleanText.split(/\n+/);
  let finalChunks = [];
  let currentChunk = "";

  paragraphs.forEach((para) => {
    const p = para.trim();
    if (!p) return;

    // 如果單行本身就超級長，強制把它切成小段
    if (p.length > 400) {
      if (currentChunk) {
        finalChunks.push(currentChunk.trim());
        currentChunk = "";
      }
      // 每 400 字元強行切一刀
      for (let i = 0; i < p.length; i += 400) {
        finalChunks.push(p.slice(i, i + 400));
      }
      return;
    }

    // 累積段落直到接近 400~500 字元
    if ((currentChunk + "\n" + p).length > 400) {
      if (currentChunk.length > 20) {
        finalChunks.push(currentChunk.trim());
      }
      currentChunk = p;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + p : p;
    }
  });

  if (currentChunk.length > 20) {
    finalChunks.push(currentChunk.trim());
  }

  return finalChunks;
}

async function runIngestion() {
  console.log("🚀 啟動優化版本地知識庫向量化引擎...");

  const allMdFiles = getMdFiles(RAW_DOCS_DIR);
  if (allMdFiles.length === 0) {
    console.log("❌ 找不到任何 .md 檔案，請檢查路徑。");
    return;
  }

  const mapping = {};
  const vectorStore = [];
  let globalId = 0;

  for (const filePath of allMdFiles) {
    const relativePath = path.relative(RAW_DOCS_DIR, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const chunks = chunkMarkdown(content);

    console.log(`📦 正在處理: ${relativePath} (${chunks.length} 個有效片段)`);

    for (const chunk of chunks) {
      try {
        console.log(`正在送出請求，字串長度: ${chunk.length}`);
        // 呼叫 Ollama 生成向量
        const response = await fetch("http://localhost:11434/api/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "all-minilm", prompt: chunk }),
        });

        if (!response.ok) {
          const errDetail = await response.text();
          throw new Error(`API 錯誤: ${response.status} - ${errDetail}`);
        }

        const json = await response.json();

        // 確保向量維度正確 (all-minilm 為 384)
        if (json.embedding && json.embedding.length === 384) {
          vectorStore.push({ id: globalId, vector: json.embedding });
          mapping[globalId] = { source: relativePath, text: chunk };
          globalId++;
        } else {
          console.warn(`⚠️ 片段 ID ${globalId} 向量異常，跳過。`);
        }
      } catch (err) {
        console.error(`❌ 處理片段失敗: ${relativePath}`, err.message);
      }
    }
  }

  if (!fs.existsSync(VDB_STORE_DIR)) {
    fs.mkdirSync(VDB_STORE_DIR, { recursive: true });
  }

  fs.writeFileSync(VECTORS_PATH, JSON.stringify(vectorStore, null, 2), "utf8");
  fs.writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), "utf8");

  console.log(`\n✨ 向量化完成！`);
  console.log(`總共存入片段: ${globalId}`);
}

runIngestion();
