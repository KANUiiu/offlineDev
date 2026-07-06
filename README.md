# Offline Dev AI

這是一個為本地開發設計的離線 AI 輔助開發環境。透過整合 Docker 容器化服務與本地 LLM (Ollama)，我們實現了在無網路環境下依然能進行高品質代碼開發與知識檢索的開發體驗。

## 專案結構

```
offlineDev/
├── docker-compose.yaml       # 統一管理 Ollama & Verdaccio
├── registry/
│   └── config.yaml           # 只留設定檔，刪除 storage/
├── ollama_data/              # 本機 LLM 快取
└── ai-tutor/                 # 【核心主目錄】
    ├── .npmrc                # 移至此處，統一設定 npm 鏡像指向 Verdaccio
    ├── context.md            # 臨時生成的文件
    ├── data/                 # 知識庫儲存區
    │   ├── raw-mdn/
    │   └── vdb-store/
    └── scripts/              # 【核心操作區】
        ├── helper.js         # 統一的入口選單 (取代原本的 bin/)
        ├── ingest.js
        ├── rag-query.js
        └── aider-rag.js
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
git clone <你的-repo-url>
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
