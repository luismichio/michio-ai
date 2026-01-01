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
*   **Typography Overhaul**:
    *   **Headings**: Switched to **Lora** (Serif) for a warm, distinguished aesthetic.
    *   **UI & Inputs**: Unified on **Inter** (Sans-serif) for maximum legibility.
    *   **Markdown**: Added full markdown supporting via `react-markdown` (Bold, Italic, Lists) in both Chat and Source Viewer.
*   **UX Enhancements**:
    *   **Smart Explorer**: Topic Explorer now persists your folder state and automatically re-opens when closing a file (Back Navigation).
    *   **Chat Layout**: Improved visual separation between User (Right) and Meechi (Left) messages.
    *   **Legibility**: Standardized base font size to 16px with optimized line-height (1.6).

### v0.8.0 - The Meechi Rebrand (Dec 2025)
*   **Identity**: Transitioned to "Meechi" with the Sage & Paper design language.
*   **Typography**: Adopted Inter (Headings) and Merriweather (Content) for a book-like reading experience.
*   **Local Intelligence**: Fully stabilized WebGPU-based Local AI implementation with auto-crash recovery on GPU context loss.
*   **Theme Engine**: Implemented `next-themes` with a reliable light/dark mode toggle.

### v0.7.0 - The Agentic Upgrade (Dec 2025)
*   **AI Agency**:
    *   **File Creation & Editing**: Meechi can now create, edit, and organize notes directly via chat (e.g., "Create a shopping list folder").
    *   **Tool Usage**: Implemented a robust "Tool Calling" loop where the AI requests actions (Create/Update) and the client executes them securely.
*   **Auto-Summarization**:
    *   **Smart Ingestion**: Uploaded PDFs and text files are automatically summarized by a smaller LLM call, creating concise "anchors" for better RAG retrieval.
    *   **Dynamic Updates**: Edited files are re-summarized on the fly to keep the Knowledge Base fresh.

### v0.6.0 - The "Rolling Context" (Dec 2025)
*   **Rolling Window Context**: Replaced static "Daily Log" context with a dynamic "6-Hour Rolling Window". This ensures conversation memory persists across midnight while optimizing token usage.
*   **Context Transparency**: Added real-time Token Counters (Session Total & Per-Message).
*   **UX Polish**:
    *   **Auto-Expanding Chat**: Input box grows with content.
    *   **Timestamps**: Precise messaging timing.
    *   **Load More**: Efficient pagination for long chat histories.

### v0.5.0 - Local-First Stabilization (Dec 2025)
*   **TensorFlow.js Migration**: Moved RAG engine from Transformers.js to **TensorFlow.js** + Universal Sentence Encoder.
    *   *Why?* Native JS/WebGL support ensures superior stability and build reliability in Next.js 16/Turbopack, preventing Web Worker crashes.
*   **Splinter-Proof Sync**: Implemented ID-based synchronization logic to robustly handle folder moves and renames between Local DB and Google Drive.
*   **Offline-First**: Re-architected storage to use Dexie.js (IndexedDB) as the source of truth.

### v0.2.0 - Customization & Gemini (Dec 2025)
*   **Gemini AI Support**: Added Google Gemini as a fallback AI provider.
*   **Conversational Onboarding**: New users are greeted by Meechi and can set preferences naturally.
*   **Settings UI**: Configuration page for Identity (Name, Tone).

### v0.1.0 - The Genesis (Dec 2025)
*   **Core Setup**: Initialized Next.js 16 app.
*   **Guest Mode**: Local-only usage for privacy.
*   **Cloud Integration**: Google Drive OAuth via NextAuth.
*   **AI Integration**: Groq (Llama 3) connection.
