const inquirer = require("inquirer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 定義 ai-tutor 的根目錄
const AI_TUTOR_ROOT = path.resolve(__dirname, "..");
const RAG_SCRIPT = path.join(AI_TUTOR_ROOT, "scripts", "rag-query.js");
const AIDER_RAG_SCRIPT = path.join(AI_TUTOR_ROOT, "scripts", "aider-rag.js");
const CONTEXT_FILE = path.join(AI_TUTOR_ROOT, "context.md");

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
    console.warn("⚠️ Please check if Ollama is running");
  }
}

async function main() {
  warmUpOllama().catch((err) => console.error("⚠️ Error from Ollama:", err));
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
    execSync(`node "${RAG_SCRIPT}" "${query}"`, { stdio: "inherit" });
  } else if (choice === "改 Code 模式 (Aider)") {
    const { fileName } = await inquirer.prompt([
      { name: "fileName", message: "你要修改哪個檔案？(例如: practice.js)" },
    ]);

    // 關鍵：保留 absoluteFilePath 以確保 Aider 鎖定正確檔案
    const absoluteFilePath = path.resolve(AI_TUTOR_ROOT, fileName);

    const { task } = await inquirer.prompt([
      { name: "task", message: "描述任務：" },
    ]);

    console.log(`🔍 搜尋與 ${fileName} 相關的知識庫中...`);

    // 修正：單一邏輯處理，確保 Context 生成乾淨
    try {
      const output = execSync(`node "${AIDER_RAG_SCRIPT}" "${task}"`, {
        encoding: "utf-8",
      });

      if (output && output.trim().length > 10) {
        fs.writeFileSync(CONTEXT_FILE, output);
        console.log("✅ 相關參考程式碼已載入。");
      } else {
        fs.writeFileSync(CONTEXT_FILE, "無參考資料。");
        console.log("⚠️ 未搜尋到相關知識，將以空 Context 啟動。");
      }
    } catch (err) {
      fs.writeFileSync(CONTEXT_FILE, "無參考資料。");
      console.log("⚠️ RAG 搜尋失敗，將以空 Context 啟動。");
    }

    console.log(`🤖 啟動 Aider 針對 ${fileName} 進行修改...`);
    try {
      execSync(
        `aider --model ollama/phi3:mini --read "${CONTEXT_FILE}" --message "${task}" "${absoluteFilePath}" --yes --no-show-model-warnings --no-check-update --no-analytics`,
        {
          stdio: "inherit",
          cwd: AI_TUTOR_ROOT,
          env: { ...process.env, OLLAMA_API_BASE: "http://localhost:11434" },
        },
      );
    } finally {
      if (fs.existsSync(CONTEXT_FILE)) fs.unlinkSync(CONTEXT_FILE);
      console.log("🧹 清理臨時檔完成。");
    }
  } else if (choice === "離開") {
    process.exit(0);
  }
}

main();
