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

### v0.9.98 - The Writer's Studio (Jan 2026)
*   **Notion-Like Editor**: A complete overhaul of the writing experience.
    *   **Slash Commands**: Type `/` to instantly insert Headings, Lists, Quotes, Code Blocks, and Dividers.
    *   **Floating Toolbar**: Select text to access a context-aware menu for Formatting, Colors, and Comments.
    *   **Comment System**: Inline, annotated comments with a dedicated sidebar UI.
    *   **Smart Typography**: Styled Headings (H1-H3), Blockquotes, and Code blocks with JetBrains Mono.
*   **Visual Polish**:
    *   **Iconography Audit**: Standardized the entire application to use `lucide-react` icons (20+ icons replaced).
    *   **UI Consistency**: Unified styles for Buttons, Modals, and Menus to match the "Paper & Sage" aesthetic.
    *   **Clearer Navigation**: Distinct icons for Chat (`MessageCircle`) vs Comments (`MessageSquareText`).

> [!NOTE]  
> See [CHANGELOG.md](./CHANGELOG.md) for full version history.

