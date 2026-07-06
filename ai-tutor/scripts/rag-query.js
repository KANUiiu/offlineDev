const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const fs = require("fs");

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
    return;
  }

  const { embedding } = await embeddingRes.json();

  if (!embedding) {
    console.error("❌ Embedding 生成失敗，回傳為空。");
    return;
  }

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

  const prompt = `### Role
  你是一位資深的軟體技術導師，教學風格嚴謹、精簡且專業。

  ### Task
  請根據提供的【參考文件】回答【學生問題】。

  ### Constraints 
  1. 語言：強制使用「繁體中文」回答。若參考文件為英文，必須先進行翻譯並歸納，不可輸出原文。
  2. 長度：回答內容控制在 150 個中文字以內。
  3. 語氣：專業、條列式說明，並提供一段範例代碼。
  4. 結構：請直接開始回答，不要有任何開場白（如「好的，我為您說明...」）。

  ### Input
  【參考文件】
  ${mdnKnowledge}

  【學生問題】
  ${studentQuestion}

  ### Response (請使用繁體中文)
  `;
  console.time("LLM 生成時間");
  const chatRes = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: "phi3:mini",
      prompt: prompt,
      stream: true,
      options: {
        num_predict: 250, // 限制回答長度
        temperature: 0.1,
        repeat_penalty: 1.3,
        top_k: 10, // 限制候選詞數量，運算會變快
        num_ctx: 2048, // 上下文長度
        stop: ["###", "【學生問題】", "【參考文件】", "\n\n\n"],
      },
    }),
  });
  console.timeEnd("LLM 生成時間");

  console.log("--- AI 導師的回答 ---");

  let fullResponse = ""; // 收集完整回應
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
            // 關鍵修正：偵測並移除結束標籤
            const cleanedText = json.response.replace(/<\|im_end\|>/g, "");

            // 檢查這段文字是否包含重複的 Prompt 結構 (如 <|im_start|>system)
            if (cleanedText.includes("<|im_start|>")) {
              // 如果模型開始產生亂七八糟的 Prompt 標籤，代表回答其實已經結束了
              console.log("\n\n--- AI 導師回答完畢 ---");
              reader.cancel();
              return;
            }

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

  // const finalData = await chatRes.json();
  // console.log("--- AI 導師的回答 ---");
  // console.log(finalData.response);
}

const question = process.argv[2];

if (question) {
  askAI(question);
} else {
  console.log("❌ 請輸入問題！使用方式: node rag-query.js '您的問題'");
}
