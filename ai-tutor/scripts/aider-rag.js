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
  const vectorStore = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf8"));
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));

  const OLLAMA_HOST = process.env.OLLAMA_API_URL;
  const embeddingRes = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: "all-minilm", prompt: task }),
  });

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

  // 若相似度低於門檻，回傳空字串 (Aider 自行發揮)
  if (bestMatchId === null || bestScore < 0.3) {
    process.stdout.write("無相關知識參考。"); // 保持 stdout 輸出，讓 helper.js 捕捉
  } else {
    const matchData = mapping[bestMatchId];
    process.stdout.write(
      `### 相關程式碼參考 (來源: ${matchData.source}):\n\`\`\`javascript\n${matchData.text}\n\`\`\`\n`,
    );
  }

  const matchData = mapping[bestMatchId];
  // 輸出純淨格式，讓 Aider 直接參照
  process.stdout.write(`### 相關程式碼參考 (來源: ${matchData.source}):
\`\`\`javascript
${matchData.text}
\`\`\`
`);
}

const task = process.argv[2];
if (task) {
  runAiderRag(task);
}
