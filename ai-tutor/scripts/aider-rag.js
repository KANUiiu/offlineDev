const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");

const VDB_STORE_DIR = path.join(__dirname, "../data/vdb-store");
const VECTORS_PATH = path.join(VDB_STORE_DIR, "vectors.json");
const MAPPING_PATH = path.join(VDB_STORE_DIR, "mapping.json");

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return -1;
  let dotProduct = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

async function runAiderRag(task) {
  try {
    // 檢查檔案是否存在，避免讀取錯誤
    if (!fs.existsSync(VECTORS_PATH) || !fs.existsSync(MAPPING_PATH)) {
      process.stdout.write("SYSTEM: 向量資料庫未初始化。");
      return;
    }

    const vectorStore = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf8"));
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));

    const OLLAMA_HOST = process.env.OLLAMA_API_URL;
    const embeddingRes = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "all-minilm", prompt: task }),
    });

    if (!embeddingRes.ok) throw new Error("Embedding API 請求失敗");

    const { embedding } = await embeddingRes.json();
    let bestScore = -1;
    let bestMatchId = null;

    for (const item of vectorStore) {
      const score = cosineSimilarity(embedding, item.vector);
      if (score > bestScore) {
        bestScore = score;
        bestMatchId = item.id;
      }
    }

    // 1. 邏輯閘：如果不相關，給予明確信號
    // 門檻值 0.4 是針對小型模型較為安全的設定
    if (bestMatchId === null || bestScore < 0.4) {
      process.stdout.write("SYSTEM: 無相關參考資料。請依據你的訓練知識回答。");
      return;
    }

    // 2. 準備乾淨的 Context
    const matchData = mapping[bestMatchId];
    const context = `### 相關技術參考 (來源: ${matchData.source}):
\`\`\`javascript
${matchData.text}
\`\`\`
請僅在需要時參考上述資料回答。`;

    // 3. 一次性輸出
    process.stdout.write(context);
  } catch (error) {
    // 若發生錯誤，不影響 Aider 運作，回傳系統信號
    process.stdout.write("SYSTEM: 知識檢索發生錯誤，請依據你的訓練知識回答。");
  }
}

const task = process.argv[2];
if (task) {
  runAiderRag(task);
}
