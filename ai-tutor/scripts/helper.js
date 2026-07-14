const inquirer = require("inquirer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 1. ai-tutor/scripts/
const SCRIPT_DIR = __dirname;

// 2. ROOTS
const AI_TUTOR_ROOT = path.resolve(SCRIPT_DIR, ".."); // 指向 ai-tutor/
const PROJECT_ROOT = path.resolve(AI_TUTOR_ROOT, ".."); // 指向 offlineDev/

// 3. Absolute paths
const RAG_SCRIPT = path.join(SCRIPT_DIR, "rag-query.js");
const AIDER_RAG_SCRIPT = path.join(SCRIPT_DIR, "aider-rag.js");
const CONTEXT_FILE = path.join(AI_TUTOR_ROOT, "context.md");
const MODEL_PRICES_FILE = path.join(
  AI_TUTOR_ROOT,
  "data/aider-config/model_prices_and_context_window.json",
);

// 設定統一執行環境 (cwd 永遠指向最外層的 Git 根目錄)
const execOptions = {
  stdio: "inherit",
  cwd: PROJECT_ROOT,
  env: {
    ...process.env,
    OLLAMA_API_BASE: "http://localhost:11434",
    LITELLM_MODEL_PRICES_JSON: MODEL_PRICES_FILE,
  },
};

async function warmUpOllama() {
  try {
    await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: "phi3:mini",
        prompt: "hi",
        stream: false,
        options: { num_predict: 1 },
      }),
    });
  } catch (e) {
    console.warn("⚠️ 請檢查 Ollama");
  }
}

async function main() {
  warmUpOllama();

  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "選擇你的開發模式：",
      choices: ["問答模式", "改 Code 模式 (Aider)", "離開"],
    },
  ]);

  if (choice === "問答模式") {
    const { query } = await inquirer.prompt([
      { name: "query", message: "你的問題是？" },
    ]);
    execSync(`node "${RAG_SCRIPT}" "${query}"`, execOptions);
  } else if (choice === "改 Code 模式 (Aider)") {
    const { fileName } = await inquirer.prompt([
      {
        name: "fileName",
        message: "你要修改哪個檔案？(請輸入相對於 ai-tutor 的路徑):",
      },
    ]);

    // 關鍵路徑修正：給予完整相對於 Git 根目錄的路徑
    const relativePath = path.join("ai-tutor", fileName);
    const absoluteFilePath = path.resolve(PROJECT_ROOT, relativePath);

    if (!fs.existsSync(path.dirname(absoluteFilePath))) {
      fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    }

    const { task } = await inquirer.prompt([
      { name: "task", message: "描述任務：" },
    ]);

    // 處理 RAG 內容
    try {
      const output = execSync(`node "${AIDER_RAG_SCRIPT}" "${task}"`, {
        encoding: "utf-8",
      });
      fs.writeFileSync(
        CONTEXT_FILE,
        output.includes("SYSTEM:") ? "無參考資料。" : output,
      );
    } catch (err) {
      fs.writeFileSync(CONTEXT_FILE, "無參考資料。");
    }

    // 確保檔案存在並加入 Git
    if (!fs.existsSync(absoluteFilePath))
      fs.writeFileSync(absoluteFilePath, "// Initial content");
    execSync(`git add "${relativePath}"`, execOptions);

    // 啟動 Aider (關鍵修正：--only-file 鎖定在該路徑)
    console.log(`🤖 啟動 Aider 針對 ${relativePath} 進行修改...`);

    const taskWithFormat = `${task}。請嚴格遵守：只輸出 SEARCH/REPLACE 區塊，禁止包含路徑或標題。`;

    try {
      execSync(
        `aider --model ollama/phi3:mini --read "context.md" --message "${taskWithFormat}" "${relativePath}" --no-git --map-tokens 0 --yes --no-show-model-warnings --no-check-update --no-analytics`,
        execOptions,
      );
    } catch (err) {
      console.error("❌ Aider 執行錯誤。");
    } finally {
      if (fs.existsSync(CONTEXT_FILE)) fs.unlinkSync(CONTEXT_FILE);
    }
  }
}

main();
