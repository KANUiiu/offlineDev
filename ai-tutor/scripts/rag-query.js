const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");
const cacheManager = require("./cache");

const VDB_STORE_DIR = path.join(__dirname, "../data/vdb-store");
const VECTORS_PATH = path.join(VDB_STORE_DIR, "vectors.json");
const MAPPING_PATH = path.join(VDB_STORE_DIR, "mapping.json");

// 1. 餘弦相似度計算 (取代 C++ 套件的數學運算)
function cosineSimilarity(vecA, vecB) {
  // 檢查維度是否一致，如果不一致，直接回傳 -1 (視為不匹配)
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.warn(
      `⚠️ 維度不匹配: vecA(${vecA?.length}) vs vecB(${vecB?.length})`,
    );
    return -1;
  }

  let dotProduct = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0; // 避免除以零

  return dotProduct / denominator;
}

async function askAI(studentQuestion) {
  if (!fs.existsSync(VECTORS_PATH) || !fs.existsSync(MAPPING_PATH)) {
    console.log("❌ 找不到向量檔案，請先確認 ingest.js 執行成功！");
    return;
  }
  console.time("讀取與解析 JSON");
  const vectorStore = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf8"));
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));
  console.timeEnd("讀取與解析 JSON");

  const OLLAMA_HOST = process.env.OLLAMA_API_URL;
  console.time("Embedding 請求");
  const embeddingRes = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: "all-minilm", prompt: studentQuestion }),
  });
  console.timeEnd("Embedding 請求");

  // 加入檢查：若 API 失敗，embedding 會是 undefined
  if (!embeddingRes.ok) {
    console.error("❌ 無法從 Ollama 獲取 Embedding，請檢查服務是否啟動。");
  }

  const { embedding } = await embeddingRes.json();

  if (!embedding) {
    console.error("❌ Embedding 生成失敗，回傳為空。");
    return;
  }

  // --- 新增：快取層攔截 ---
  const cachedAnswer = cacheManager.lookup(embedding, 0.95);
  if (cachedAnswer) {
    console.log("⚡ [Cache Hit] 發現相似問題，直接回傳結果！");
    process.stdout.write(cachedAnswer); // 直接顯示答案
    return; // 結束，不跑模型
  }
  // -----------------------

  let bestScore = -1;
  let bestMatchId = null;
  console.time("向量搜尋");
  for (const item of vectorStore) {
    const score = cosineSimilarity(embedding, item.vector);
    if (score > bestScore) {
      bestScore = score;
      bestMatchId = item.id;
    }
  }
  console.timeEnd("向量搜尋");

  // --- 修正區域開始 ---
  // 1. 增加相似度檢查 (門檻值 0.3)
  if (bestMatchId === null || bestScore < 0.3) {
    console.log("⚠️ 很抱歉，知識庫中找不到與您問題高度相關的資訊。");
    return;
  }

  // 2. 確保 mapping 中真的有這個 ID
  const matchData = mapping[bestMatchId];
  if (!matchData || !matchData.text) {
    console.log("⚠️ 匹配到的 ID 無法取得對應內容，資料庫可能已損壞。");
    return;
  }

  const mdnKnowledge = matchData.text;
  const sourceFile = matchData.source;
  // --- 修正區域結束 ---

  console.log(`🔍 [本地檢索成功] 相似度: ${bestScore.toFixed(4)}`);
  console.log(`📄 最佳匹配片段來自: ${sourceFile}\n`);

  const prompt = `[SYSTEM]
  你是一位資深的軟體技術導師，風格嚴謹、精簡且專業。
  請嚴格依據【參考文件】回答【學生問題】，若文件中沒有答案，請回答「參考文件中未提及相關資訊」。

  [CONSTRAINTS]
  1. 繁體中文，先翻譯再歸納，不可輸出原文。
  2. 回答長度控制在 150 字以內。
  3. 必須包含一段簡短的程式碼範例。
  4. 禁止任何開場白與結尾寒暄，直接輸出內容。

  [INPUT]
  ### 參考文件 ###
  ${mdnKnowledge}

  ### 學生問題 ###
  ${studentQuestion}

  [RESPONSE]
  `;
  console.time("LLM 生成時間");
  const chatRes = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: "phi3:mini",
      prompt: prompt,
      stream: true,
      options: {
        num_predict: 800,
        temperature: 0.1,
        repeat_penalty: 1.1,
        top_k: 40,
        num_ctx: 4096,
        stop: ["[SYSTEM]", "[RESPONSE]"],
      },
    }),
  });
  console.timeEnd("LLM 生成時間");

  console.log("--- AI 導師的回答 ---");

  let fullResponse = "";
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.response) {
            const cleanedText = json.response.replace(/<\|im_end\|>/g, "");
            if (cleanedText.includes("<|im_start|>")) {
              console.log("\n\n--- AI 導師回答完畢 ---");
              reader.cancel();
              // 離開前也要存入快取
              cacheManager.save(studentQuestion, embedding, fullResponse);
              return;
            }
            fullResponse += cleanedText;
            process.stdout.write(cleanedText);
          }
        } catch (e) {
          /* 忽略 */
        }
      }
    }
  } catch (err) {
    console.error("串流讀取發生錯誤:", err);
  } finally {
    reader.releaseLock();
  }

  console.log("\n--- 回答結束 ---");

  // --- 新增：回填快取 ---
  cacheManager.save(studentQuestion, embedding, fullResponse);
}

const question = process.argv[2];

if (question) {
  askAI(question);
} else {
  console.log("❌ 請輸入問題！使用方式: node rag-query.js '您的問題'");
}
