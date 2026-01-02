# Meechi 🧠🌿

**Meechi** is a private cognitive layer designed to walk beside you, not just work for you. Unlike traditional "assistants" that perform tasks, Meechi is a **Travel Partner**—a wise peer that documents your unique journey, connects your fragmented thoughts, and helps you navigate life with clarity.

> **Privacy First**: Your thoughts belong to you. Meechi runs locally. No data is sent to our servers.
> **Bring Your Own Brain**: Connect your own AI (Gemini/Groq) and Storage (Google Drive) for complete control.

---

## 🌿 The Philosophy: Paper, Sage, and Soul

In a digital world of stark screens and cold logic, Meechi offers a sanctuary.
-   **Paper & Sage**: The interface is grounded in the organic tones of warm paper (#F9F7F2) and calming sage (#6B8E6B), creating a space where long-form writing feels natural and safe.
-   **The Wise Peer**: Meechi doesn't just output data; it mirrors your tone, asks thoughtful questions, and helps you untangle the knots in your mind.
-   **Journal as a Roadmap**: Every entry is a data point on your map. By documenting the "now," you create a compass for the "next."

---

## 🏗️ Local-First Architecture

Meechi is built on a **Local-First** philosophy. Your device is the source of truth, ensuring zero-latency journaling and total privacy. Cloud sync is purely for backup and multi-device continuity.

```mermaid
graph LR
    User[User] -->|Writes/Chats| UI[Meechi UI]
    UI -->|Stores| DB[(Dexie.js / IndexedDB)]
    
    subgraph "Local Cognitive Device"
    UI
    DB
    RAG[TensorFlow.js RAG Engine]
    LocalAI[WebLLM (Llama 3)]
    end
    
    DB <-->|Syncs (Background)| Drive[Google Drive / Cloud]
    RAG -->|Indexes| DB
    UI <-->|Queries| LocalAI
```

---

## 🚀 Journey-Centric Features

### 🔒 Private Cognitive Layer
-   **Local RAG**: Your entire knowledge base is indexed natively in the browser using **TensorFlow.js**.
-   **Zero-Data Leak**: Search happens on-device. Your massive library of notes is never sent to a third-party vector DB.

### ✍️ Proactive Journaling
-   **Auto-Summarization**: Uploaded PDFs and messy notes are automatically distilled into concise "anchors" for the AI, keeping context windows efficient.
-   **The "Rolling Window"**: Meechi remembers the flow of your day, maintaining a 6-hour conversational context so you never have to repeat yourself.

### 📂 The Memory System
-   **Topic Explorer**: A "Windows-like" file manager for your cloud storage, supporting drag-and-drop organization.
-   **Journey Map**: A calendar tracking your consistency and providing a visual history of your path.

---

## 🛠 Tech Stack

Meechi is built with the latest web technologies to ensure speed, privacy, and robustness.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16** (Turbopack) | The React framework for the web. |
| **Storage** | **Dexie.js** (IndexedDB) | Local-first synchronous database. |
| **Sync** | Google Drive API | Background worker for cloud backup. |
| **Vectors** | **TensorFlow.js** + USE | In-browser semantic search (Local RAG). |
| **Local AI** | **WebLLM** (MLC-AI) | Client-side Llama 3 inference (WebGPU). |
| **Server AI** | Vercel AI SDK (Gemini/Groq) | Optional cloud fallback for heavy reasoning. |
| **Styling** | **Tailwind CSS v3** | variables-based theming engine. |

---

## 📜 Development Changelog

### v0.9.95 - Living History (Jan 2026)
*   **Continuous Chat History**: The chat no longer feels ephemeral.
    *   **Auto-Load**: Automatically loads previous days if the current day is quiet (Min 20 / Max 30 User Turns).
    *   **Time Gaps**: Displays "X hours ago" dividers to visualize time passed between sessions.
    *   **Mode Tagging**: Messages are now tagged with icons (📝 Log, 💬 Chat, 🔍 Research) for future filtering.
*   **UI/UX Polish**:
    *   **Right-Aligned Bubbles**: User messages are now distinctively right-aligned and cleaner.
    *   **Scroll Fix**: Removed the jarring scroll animation on page reload; history now appears instantly.
    *   **Time Format**: Switched to 24h format with Date context for older messages.

### v0.9.9 - Stability & Grounding (Jan 2026)
*   **Strict Grounding**:
    *   **Orphan Clean-up**: Added a dedicated `cleanup_orphans` tool to safely remove "ghost" source files from deleted PDFs.
    *   **Role Correction**: Fixed tool result protocol (Result must be `user` role) to satisfy strict Llama-3 requirements.
    *   **Prompt Hardening**: Enforced strict XML tool output compliance for 8B models to prevent "chatting instead of doing".
*   **Stability**:
    *   **Crash Prevention**: Implemented strict 6000-char context limit and reduced WebLLM Safe Context to 4096 tokens to prevent GPU OOM errors.
    *   **Recursion Logic**: Fixed `MessageOrderError` by making recursive self-correction conditional on tool usage.
*   **UI Polish**:
    *   **Smart Labels**: Chat input now correctly identifies "High-Power Mode" (8B) models.
    *   **Stuck UI Fix**: Resolved "Using Tools..." hang by correctly revealing partial AI responses.

### v0.9.5 - The Local Cortex (Jan 2026)
*   **True Local-First RAG**: 
    *   **Direct Context Injection**: Refactored the prompt engineering pipeline to inject retrieved file content directly into the User Message, bypassing model "safety filters" that previously ignored system context.
    *   **Memory Expansion**: Increased Local AI context window from 2k -> **8k tokens**, allowing analysis of large PDF extracts.
*   **Smart PDF Handling**:
    *   **Raw PDF Reprocessing**: Implemented a recovery flow to re-extract text from raw binary PDFs if the summary is missing, correctly generating `.source.md` files without overwriting the original.
    *   **Double-Embedding Fix**: Solved a race condition where files were indexed twice (as binary and text).
*   **Stability**:
    *   **Initialization Logs**: Added granular console logging for WebLLM/WebGPU initialization to debug hang-ups.
    *   **Scope Fixes**: Repaired `useMeechi.ts` scope issues for hardware detection.

### v0.9.0 - Rebranding & UI Polish (Dec 2025)
*   **Complete Rebranding**: Officially transitioned all "Michio" references to **"Meechi"** across UI, Database, and System Prompts.
