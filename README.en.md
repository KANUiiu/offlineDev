# Offline Dev AI

This is an offline-first AI-assisted development environment designed for local use. By integrating Docker containerization and a local LLM (Ollama), we enable high-quality code development and knowledge retrieval without the need for an internet connection.

## Project Structure

```text
offlineDev/
├── docker-compose.yaml       # Infrastructure: Ollama LLM service & Verdaccio private registry
├── registry/
│   └── config.yaml           # Verdaccio configuration settings
├── ollama_data/              # Local LLM cache and database
└── ai-tutor/                 # 【Core Application Directory】
    ├── .npmrc                # Forces all npm packages to use the local registry for offline development
    ├── context.md            # Temporary context file for Aider to read
    ├── data/                 # Knowledge base storage
    │   ├── raw-mdn/          # Raw Markdown technical documentation for AI learning
    │   └── vdb-store/        # Vector database used for fast retrieval by the AI
    │       ├── vectors.json          # Stores vector embeddings of technical docs for retrieval
    │       ├── mapping.json          # Index file mapping IDs to raw Markdown content
    │       └── semantic-cache.json   # Stores semantic cache of AI responses to reduce inference costs
    └── scripts/              # 【Core Operation Area】
        ├── helper.js         # Interactive main menu
        ├── ingest.js         # Converts documentation into vector data
        ├── rag-query.js      # Retrieval logic for querying the vector database
        ├── aider-rag.js      # Bridge connecting the local knowledge base to coding tools
        └── cache.js          # Semantic cache matching and management engine
```

## Quick Start

### 1. Prerequisites

Ensure the following are installed in your development environment:

- **Docker Desktop (to run local services)**

- **Node.js (v18+)**

- **Python 3.10+ (to run Aider)**

### 2. Initialization

```Bash
# 1. Clone the repository and enter the directory
git clone https://github.com/KANUiiu/offlineDev.git
cd offlineDev

# 2. Install necessary Node.js packages
cd ai-tutor
npm install
```

### 3. Start Offline Services

In the project root directory (offlineDev/), run:

```Bash
docker-compose up -d
```

This will start the local npm registry (Verdaccio) and the LLM engine (Ollama).

### 4. Knowledge Base Ingestion

In the ai-tutor/ directory, run:

```Bash
npm run ingest
```

### 5. Launch Interactive Assistant

In the ai-tutor/ directory, run:

```Bash
npm run help
This will launch an interactive menu, allowing you to choose between "Q&A Mode" or "Coding Mode (Aider)."
```

## Attribution & Licensing

The web technical documentation contained in the data/raw-mdn/ directory of this project is copied (or modified) from MDN Web Docs.

Original Authors: Mozilla Contributors

License: CC-BY-SA 2.5 or later.

Note: The copyright of the documentation content belongs to the original authors. The source code of this project is licensed under the [MIT License].
