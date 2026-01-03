# Meechi 🧠🌿

**Meechi** is a private cognitive layer designed to walk beside you, not just work for you. Unlike traditional "assistants" that perform tasks, Meechi is a **Travel Partner**—a wise peer that documents your unique journey, connects your fragmented thoughts, and helps you navigate life with clarity.

> **Privacy First**: Your thoughts belong to you. Meechi runs locally. No data is sent to our servers.
> **Bring Your Own Brain**: Connect your own AI (Gemini/Groq) and Storage (Google Drive) for complete control.

---

## 📜 The Meechi Manifesto: A Path of One’s Own

### 1. The Digital Sanctuary
Your thoughts are the most private thing you own. In an era where every keystroke is "mined" for training data, Meechi stands as a sanctuary. We believe that your self-reflection shouldn't be a product for a cloud provider; privacy is not a setting, it is our architecture.
- **Sovereign Intelligence**: Your "Sage" (AI) runs on your terms—keep it entirely in your browser, on your local machine, or use the cloud.
- **Data Sovereignty**: You own the keys, the memory, and the path.

### 2. Presence Over Achievement
The name Meechi is rooted in the Japanese concept of Michi (道)—meaning "The Path" or "The Way". While other tools focus only on what you achieved, Meechi focuses on how you navigate your unique journey.
- **The Journal is the Path**: Unlike static databases, Meechi treats your entries as a "Ship’s Log," keeping you on track and helping you navigate towards your personal goals.
- **Reflection as a Mirror**: By mirroring your innermost feelings and aspirations, Meechi provides the clarity needed to navigate life's complexities.

### 3. Intelligence Without the Tether
We reject the idea that AI requires an internet connection to be "smart." A true companion should be there when you are offline, deep in thought, or away from the noise.
- **Offline-First Resilience**: Built on Dexie.js, Meechi ensures you can journal, search, and browse your history without an internet connection.
- **Zero-Lag Flow**: By running models locally, we eliminate "cloud lag," allowing your companion to react to your thoughts at the speed of your own mind.

### 4. Bring Your Own (BYO) Soul
Meechi is built for the individual who values autonomy. It is designed to be an extension of your own cognitive capabilities and a part of your consciousness.
- **BYO Brain**: Use the AI models you trust, whether through private API keys or local LLMs.
- **BYO Memory**: Connect your personal data—Google Drive, health logs, and research—to create a continuous narrative of personal growth.
- **Untangling the Knot**: Meechi helps you process "raw material" from daily life, turning unprocessed experience into documented wisdom.

> "Meechi: Documenting the Path of You."

---

## 🌿 The Design Philosophy: Paper, Sage, and Soul

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
| **Styling** | **Tailwind CSS v3** + OKLCH | Dynamic variables-based theming engine. |

---


## 📜 Development Changelog

### v0.9.99 - The Desktop Era (Jan 2026)
*   **Meechi Desktop**: First official desktop release (Windows MSI / macOS DMG).
    *   **Bundled App**: Runs locally with no browser required.
    *   **System Tray**: Quick access to your companion.
    *   **Local Proxy**: Acts as a "Local Cloud" server to sync data with other browsers on your network.
*   **Settings Redesign**: A completely overhauled, Google-style settings interface.
    *   **Sidebar Navigation**: Persistent access to Profile, Appearance, AI, and Storage.
    *   **Appearance Customization**: Real-time color pickers (Accent, Background, Surface) and Font controls.
    *   **AI Management**: Drag-and-drop provider ordering and simplified model selection.
*   **Browser Sync**: Sync your "Ship's Log" across Chrome, Safari, and Desktop using the file system as the bridge.

> [!NOTE]  
> See [CHANGELOG.md](./CHANGELOG.md) for full version history.

