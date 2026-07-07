const fs = require("fs");
const path = require("path");

const CACHE_PATH = path.join(
  __dirname,
  "../data/vdb-store/semantic-cache.json",
);

class CacheManager {
  constructor() {
    this.cache = this.loadCache();
  }

  // 初始化載入：啟動時讀取一次，之後都走記憶體
  loadCache() {
    if (!fs.existsSync(CACHE_PATH)) return [];
    try {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    } catch (e) {
      console.error("⚠️ Cache 讀取失敗，初始化為空陣列");
      return [];
    }
  }

  // 1. 搜尋邏輯：比對相似度
  lookup(queryEmbedding, threshold = 0.95) {
    let bestScore = -1;
    let bestMatch = null;

    for (const item of this.cache) {
      const score = this.cosineSimilarity(queryEmbedding, item.embedding);
      if (score > threshold && score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    return bestMatch ? bestMatch.answer : null;
  }

  // 2. 寫入邏輯：非同步寫入硬碟
  save(question, embedding, answer) {
    this.cache.push({ question, embedding, answer });
    // 非同步寫入，不卡住主程式
    fs.writeFile(CACHE_PATH, JSON.stringify(this.cache, null, 2), (err) => {
      if (err) console.error("❌ 快取寫入失敗:", err);
    });
  }

  // 數學核心：餘弦相似度
  cosineSimilarity(vecA, vecB) {
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
}

module.exports = new CacheManager();
