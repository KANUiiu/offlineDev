# Offline Dev AI

這是一個為本地開發設計的離線 AI 輔助開發環境。透過整合 Docker 容器化服務與本地 LLM (Ollama)，我們實現了在無網路環境下依然能進行高品質代碼開發與知識檢索的開發體驗。

## 專案結構

```
offlineDev/
├── docker-compose.yaml       # 基礎設施編排 (Ollama LLM 服務 & Verdaccio 私有倉庫)
├── registry/
│   └── config.yaml           # Verdaccio 配置設定
├── ollama_data/              # 本機 LLM 快取
└── ai-tutor/                 # 【核心主目錄】
    ├── .npmrc                # 強制將所有套件安裝導向本地私服，確保離線開發
    ├── context.md            # 暫存對話脈絡檔案供 aider 讀取
    ├── data/                 # 知識庫儲存區
    │   ├── raw-mdn/          # 存放 AI 學習用的原始 Markdown 技術文檔
    │   └── vdb-store/        # 存放 AI 用來進行快速檢索的向量化資料庫
    │       ├── vectors.json          # 儲存技術文檔的向量特徵陣列，供檢索使用
    │       ├── mapping.json          # 知識庫的索引檔，儲存 ID 與原始 Markdown 文字對應
    │       └── semantic-cache.json   # 存放 AI 歷史回答的語義快取，用於降低重複推理成本
    └── scripts/              # 【核心操作區】
        ├── helper.js         # 入口選單
        ├── ingest.js         # 將文檔轉換成向量資料
        ├── rag-query.js      # 負責查詢向量資料庫並整合回答的檢索邏輯
        ├── aider-rag.js      # 將本地知識庫與編碼工具串接的橋樑
        └── cache.js          # Semantic Cache 的語義比對與管理引擎
```

---

## 快速開始 (Quick Start)

### 1. 前置需求 (Prerequisites)

確保你的開發環境已安裝：

- **Docker Desktop** (用於運行本地服務)
- **Node.js (v18+)**
- **Python 3.10+** (用於運行 Aider)

### 2. 初始化專案

```bash
# 1. 下載並進入目錄
git clone https://github.com/KANUiiu/offlineDev.git
cd offlineDev

# 2. 安裝必要的 Node.js 套件
cd ai-tutor
npm install
```

### 3. 啟動離線服務

在專案根目錄 (offlineDev/) 執行：

```bash
docker-compose up -d
```

這將會啟動本地的 npm 倉庫 (Verdaccio) 與 LLM 引擎 (Ollama)。

### 4. 知識庫預熱 (Ingestion)

在 ai-tutor/ 目錄下執行：

```bash
npm run ingest
```

### 5. 啟動互動助手

在 ai-tutor/ 目錄下執行：

```bash
npm run help
```

這將開啟互動式選單，讓你選擇「問答模式」或「改 Code 模式 (Aider)」。

## Attribution & Licensing (資料來源與授權)

本專案之 `data/raw-mdn/` 目錄下所包含的 Web 技術文件，複製（或修改）自 [MDN Web Docs](https://developer.mozilla.org/)。

- **原始作者：** [Mozilla Contributors](https://developer.mozilla.org/)
- **授權條款：** [CC-BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) 或更新版本
- **說明：** 該部分文件內容之著作權屬原創作者所有。本專案之主體程式碼仍依據 [MIT License] 授權釋出。
