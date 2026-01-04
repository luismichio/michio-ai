# Meechi Product Manual 📘

> **The Single Source of Truth for Strategy, Design, and Development.**
> This document defines the "grounded rules" for the Meechi project.

---

## 1. 🧠 AI Agent Rules & Context
**For AI Contributors (Antigravity/Gemini):**
You must adhere to these rules strictly to maintain the "Soul" of the project.

### Core Directive
*   **Check Context First**: Always read the `README.md` and this `MANUAL.md` before proposing major architectural changes.
*   **Concise Reasoning**: Do not over-explain. Be technical, direct, and efficient.
*   **The "Wise Peer" Persona**: When generating user-facing text, avoid robotic slop. The tone is warm, reflective, and intelligent—like a travel partner, not a servant.

### Technical Constraints
*   **Local-First strictness**:
    *   **NO** cloud databases (Postgres, MySQL, Firebase) unless explicitly requested for optional sync.
    *   **NO** server-side only features that break offline mode.
    *   **Dexie.js** is the primary database.
    *   **FileSystem** (via Tauri) is the primary bridge for Desktop.
*   **Stack Consistency**:
    *   Use **Next.js 16 (App Router)**.
    *   Use **React Server Components** where possible, but remember `useEffect` is often needed for local-first (client-side) logic.
    *   Use **Tailwind CSS**.

---

## 2. 🎨 Design System: "Paper & Sage"
The aesthetic is critical. It must feel **organic, premium, and calm**.

### Typography
*   **Headings**: **Lora** (Serif). Elegant, editorial feel.
*   **Body**: **Inter** (Sans). High legibility for long-form reading.
*   **Customization**: Users can BYO fonts (Google Fonts link) or system fonts.

### Color Palette (OKLCH / HEX Support)
Users can define their own, but these are the defaults:

#### Light Theme (Default)
**Foundation**:
*   **Surface**: `oklch(97% 0.01 80)` (Warm Paper).
*   **Background**: `oklch(99% 0.005 80)` (Lighter Paper).
*   **Primary**: `oklch(58% 0.08 145)` (Sage Green).
*   **Text**: `oklch(20% 0 0)` (Soft Black).
*   **Muted**: `oklch(55% 0.01 80)` (Faded Ink).

**Semantic**:
*   **Success**: `oklch(62% 0.12 150)` (Forest Affirmation).
*   **Warning**: `oklch(68% 0.15 75)` (Amber Caution).
*   **Error**: `oklch(58% 0.18 25)` (Terracotta Alert).
*   **Info**: `oklch(62% 0.10 230)` (Slate Blue).

**Interactive**:
*   **Border**: `oklch(85% 0.01 80)` (Subtle Line).
*   **Hover**: `oklch(92% 0.01 80)` (Gentle Lift).
*   **Focus**: `oklch(58% 0.08 145)` (Sage Ring).

#### Dark Theme (Deep Forest)
**Foundation**:
*   **Surface**: `oklch(15% 0.02 150)` (Deep Mossy Charcoal).
*   **Background**: `oklch(12% 0.02 150)` (Darker Forest).
*   **Primary**: `oklch(65% 0.15 140)` (Luminous Sage).
*   **Text**: `oklch(92% 0.01 100)` (Mist White).
*   **Muted**: `oklch(60% 0.02 150)` (Fog).

**Semantic**:
*   **Success**: `oklch(68% 0.15 145)` (Bright Moss).
*   **Warning**: `oklch(75% 0.18 80)` (Warm Glow).
*   **Error**: `oklch(65% 0.20 25)` (Ember).
*   **Info**: `oklch(70% 0.12 230)` (Moonlit Blue).

**Interactive**:
*   **Border**: `oklch(25% 0.02 150)` (Shadow Line).
*   **Hover**: `oklch(20% 0.02 150)` (Subtle Depth).
*   **Focus**: `oklch(65% 0.15 140)` (Luminous Ring).

**Backlog**: "Community Palettes" allow users to share/import JSON themes.

### Iconography
*   **Default**: **Lucide-react** (Clean, consistent stroke).
*   **BYO**: Support for Emoji, ASCII, or custom SVG sets.

### Design Tokens (Physicality)
*   **Radius**:
    *   `radii-sm` (4px): Buttons, tags.
    *   `radii-lg` (12px): Cards, modals (Soft edges).
*   **Spacing**:
    *   `gap-content` (1.5rem): Breathing room for text.
    *   `padding-card` (1.5rem): Comfortable containers.
*   **Depth (Shadows)**:
    *   `elevation-1`: Subtle lift (Menu dropdowns). `0 4px 6px -1px rgb(0 0 0 / 0.1)`
    *   `elevation-2`: Floating (Modals). `0 20px 25px -5px rgb(0 0 0 / 0.1)`
*   **Motion**:
    *   **Spring**: `stiffness: 300, damping: 30` (Snappy but organic).
    *   **Scale**: Hover elements scale `1.02` (Tactile feedback).

---

## 3. 🗺️ Strategy & Roadmap
**Goal**: Create the world's best **Local-First Cognitive layer** with zero-friction onboarding.

### Core Philosophy: "Browser First, Desktop Powered"
1.  **Low Friction Entry (PWA)**:
    *   **The "One-Click" Start**: Users open Meechi in the browser and start immediately.
    *   **Defaults**: Uses **WebLLM (Llama 1B)** and **IndexedDB**. No accounts, no installs, no setup.
2.  **Bring Your Own (BYO) Everything**:
    *   **AI**: Stick with WebLLM (Llama 8B/70B), connect to **Meechi Desktop** (Ollama), or use Cloud Keys (Gemini, Groq, OpenAI, DeepSeek).
    *   **Storage**: Keep it in Browser (IndexedDB), sync to **Local Disk** (via Meechi Desktop), or sync to Cloud Storage.
3.  **The Desktop "Proxy"**:
    *   **Role**: Ideally, the user stays in the browser PWA.
    *   **Function**: The Desktop App runs in the background (System Tray). It acts as a bridge to:
        *   **Serve Local AI**: Bundles and manages Ollama automatically (user never sees a terminal).
        *   **Sync Files**: Writes browser data to the local OS filesystem.
    *   **Control**: Meechi Web can "control" the Desktop instance to setup models.

### Future Implementations (Backlog)
*   **MCP Servers**: Implement Model Context Protocol. Meechi provides "default" modules, but users can **BYO** servers for infinite extensibility.
*   **Audio/Voice Mode**: "Walk & Talk" using **Whisper** (STT) and **Kokoro** (TTS). Fully BYO-compatible.
*   **Mobile Sync**: Relay mechanism for React Native mobile app.
*   **Ubiquitous Interfaces**: Mobile Widgets, Wearables (Watch), Car (Android Auto/CarPlay), and TV support.
*   **Plugin System**: Allow users to write small JS "Skills".

---

## 4. 🧩 Feature Architecture
**How complex things work.**

### The Three Modes
Every interaction in Meechi is categorized into one of three modes, each with distinct behavior and data access patterns.

#### 📝 Log Mode (Passive Recording)
**Purpose**: The "Ship's Log" — passive documentation of your journey.
*   **Behavior**: 
    *   No AI response. User writes freely.
    *   Entries are timestamped and stored in history.
*   **Data Access**: Write-only to history.
*   **Hallucination**: N/A (no generation).
*   **Future Enhancements**:
    *   **Rich Media**: Photos, stamps, locations, videos, audio.
    *   **Visualization**: "Travel Notebook" or scrapbook view.

#### 💬 Chat Mode (Interactive Companion)
**Purpose**: Conversational partner for general questions, planning, and tool use.
*   **Behavior**:
    *   Engages in dialogue about history or general topics.
    *   Can access internet for current information.
    *   Can use tools (create notes, change settings, MCP actions).
*   **Data Access**: 
    *   **Avoid** looking at stored sources/notes unless explicitly requested.
    *   Prioritize conversation history and web search.
*   **Hallucination**: Moderate (creative, conversational).
*   **Future Enhancements**:
    *   **In-Note Chat**: Assist with writing, analysis, tone changes within notes.

#### 🔍 Research Mode (Grounded Analysis)
**Purpose**: Deep, citation-backed work using your stored knowledge.
*   **Behavior**:
    *   Strictly grounded in stored sources and notes.
    *   Low hallucination — only cite what exists.
    *   Access internet **only if user explicitly requests**.
*   **Data Access**: 
    *   Primary: RAG over stored sources/notes.
    *   Secondary: Web (on request).
*   **Hallucination**: Minimal (factual, citation-required).
*   **Future Enhancements**:
    *   **Content Generation**: Video presentations, PowerPoints, podcasts (NotebookLM-style).

### Mode Metadata
*   Every history entry is tagged with its mode (`log`, `chat`, `research`).
*   Allows Meechi to organize, filter, and visualize your journey by context.

---

### Authentication
*   **Web**: `next-auth` (Google) -> Used *only* for Drive API tokens and user identity.
*   **Desktop**: Mock Session / Local Profile. Auth is bypassed or handled via local key storage.

### Data Sync (BYO Storage)
Meechi supports multiple sync strategies. Users choose their preferred backend.

#### Sync Options
1.  **Browser-Only** (IndexedDB): No sync. Data stays local to browser.
2.  **Local Disk** (via Meechi Desktop): Syncs IndexedDB ↔ Local Filesystem.
3.  **Cloud Storage**: Google Drive API, Dropbox, OneDrive (future).

#### Sync Mechanism (Generic)
1.  **App Start** → Check remote manifest (timestamp + hash).
2.  **If Remote > Local** → Pull changes → Update Dexie.
3.  **If Local > Remote** → Push changes → Update Remote.
4.  **Conflict Resolution**: Last-write-wins (currently).

#### Edge Case: Dual-Sync Conflict
**Scenario**: User sets Meechi Desktop to sync to a folder that is **also** synced by Google Drive Desktop.

**Problem**: Two sync mechanisms (Meechi ↔ Filesystem, Filesystem ↔ Google Drive) can create race conditions.

**Solution**:
*   **Detection**: On Desktop setup, warn if selected folder is inside a known cloud sync path (Google Drive, Dropbox, OneDrive).
*   **Recommendation**: 
    *   **Option A**: Use Meechi's native cloud sync (Google Drive API) instead of Desktop sync.
    *   **Option B**: Choose a folder **outside** cloud-synced directories.
*   **Advanced**: If user insists, Meechi Desktop acts as "read-only relay" — it watches the folder but doesn't write, letting the cloud provider handle sync.

### AI Persona Rules (Local-First Strictness)
*   **ACT, DON'T TALK**:
    *   If the user asks to save, move, or create a file, the AI must **silently execute** the tool.
    *   **Prohibited**: "I effectively saved the file..." (Long winded logs).
    *   **Required**: "Done." or "Saved to [path]."
*   **Tool Usage**:
    *   Use explicit XML blocks `<function>` for 1B model compatibility.
    *   No "planning" stages in chat output. Just do it.

### Embedded MCP Server (Local Tools) 🛠️
Meechi implements the **Model Context Protocol (MCP)** as an internal, in-process server.
*   **Architecture**: "Loopback" Server. It runs within the application memory space, sharing access to `IndexedDB` and the local filesystem cache.
*   **Benefits**: Zero latency (no network overhead) and strict safety controls (programmatic blocking of system files).

#### Available Internal Tools
The following tools are exposed to the AI for file management:
1.  **`create_file` / `update_file`**: Manage user notes.
2.  **`move_file`**: Organize content.
3.  **`read_pdf`**: Extract text from local PDFs (using `pdfjs-dist`).
4.  **`summarize_file`**: Generate summaries using Local AI or Cloud fallback.
5.  **`fetch_html`**: Scrape and clean web pages (using `cheerio`).
6.  **`query_rag`**: Manually search the Knowledge Base (for Chat Mode).

### RAG (Retrieval Augmented Generation)
*   **Engine**: `TensorFlow.js` (Universal Sentence Encoder) + Vector Store in IndexedDB.
*   **Strategy (Hybrid Mode)**:
    *   **Research Mode**:
        *   **Automatic**. Every query is embedded and searched against the database.
        *   Context is injected into the prompt *before* the AI sees it.
        *   Strict citation rules.
    *   **Chat Mode**:
        *   **Manual**. The AI does *not* search by default (for speed).
        *   **Tool-Based**: If the AI needs information, it calls `query_rag`.
        *   **Memory**: Relies on short-term conversation history for context.
*   **Pipeline**:
    1.  File Added -> Parsed (Client-side).
    2.  Chunked -> Embedded (TF.js).
    3.  Stored in Dexie.
    4.  Query -> Embed Query -> Cosine Similarity Scan -> Top K context.

---

## 5. 🛠️ Core Mechanics

### Sources & Notes 📄
The distinction between **static reference** and **active thought** is central.

*   **Sources**:
    *   **Definition**: Immutable reference material (PDFs, Web Clips, original Paste).
    *   **State**: Read-only key information.
    *   **Summarization**: Auto-generated by AI upon ingest to create high-quality context anchors.
*   **Notes**:
    *   **Definition**: Editable markdown documents created by you or the AI.
    *   **Conversion**:
        *   **Source → Note**: Clicking "Edit" on a Source duplicates it into a Note, preserving the original Source as a "Reference Link".
        *   **Reset**: A Note derived from a Source can be "Reset" to discard changes and revert to the original Source state (if the link exists).
*   **Delete**: Removes the item from Dexie and the RAG index. If it was synced to a file, the file is deleted.

### Comments 💬
An annotation layer that sits *on top* of the text.
*   **Mechanism**: Text range selection (Start/End Index).
*   **Storage**: Stored as metadata JSON associated with the file ID, not embedded in the Markdown content itself (to keep the text clean).
*   **Anchoring**: Comments are robust; if the underlying text changes, we attempt to fuzzy-match the original anchor context.

### Markdown Editor ✍️
*   **Engine**: GitHub Flavored Markdown (GFM).
*   **Features**:
    *   **Hybrid View**: WYSIWYG-like rendering for reading, raw parsing for editing.
    *   **Extensions**: Tables, Task Lists (`- [ ]`), Code Blocks (with highlighting), Mermaid Diagrams.
    *   **Frontmatter**: YAML header for metadata (tags, dates, linked source IDs).

### Tags 🏷️
*   **System**: `#hashtag` based.
*   **Scope**: Universal. A tag used in a Note is the same object as a tag used in a Chat or Source.
*   **Organization**:
### Smart Layout Behaviors (The "Premium" Feel) 🧠
The interface must adapt to the user's context intelligently.
*   **Sticky Toolbars**:
    *   **Logic**: Formatting toolbars (for markdown) must remain visible while editing long documents.
    *   **Positioning**: Floats at the top of the viewport or anchors to the selection, never scrolling out of view.
*   **Adaptive Comments**:
    *   **Non-Blocking**: Comment cards must **never** obscure the text they highlight.
    *   **Collision Detection**:
        *   If screen is tight, move to side column (margin).
        *   If mobile, stack below or use a drawer.
    *   **Resizing**: Panels resize based on content density but respect a "comfortable reading width" (65ch).
