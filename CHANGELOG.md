
## Changelog



### v1.2.0 - The Autonomous Desktop (Jan 2026)
*   **Static Desktop Architecture**:
    *   **Serverless Core**: The application can now be built as a purely static export (`next export`), enabling native desktop apps without a Node.js backend.
    *   **Client-Side AI**: Refactored `useMeechi.ts` to call Groq and Gemini APIs directly from the client when in desktop mode, ensuring full AI functionality without server API routes.
    *   **Client-Side Drive**: Implemented a standalone `ClientDriveService` and `DesktopGoogleAuth` flow to authenticate and sync with Google Drive directly from the desktop app.
    *   **Mock Authentication**: Introduced `MockSessionProvider` to simulate user sessions in static builds, preventing NextAuth crashes.
*   **DevOps**:
    *   **Automated Build**: Added `scripts/build-desktop.js` to automatically handle the complex process of disabling API routes, building static assets, and packaging with Tauri.

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

### v1.1.0 - The Color & Personality Update (Jan 2026)
*   **Theme Harmonization (OKLCH Engine)**:
    *   **True Color Science**: Implemented a mathematical color engine (`src/lib/colors.ts`) that converts user Hex input to the OKLCH color space for superior perceptual uniformity.
    *   **Harmonious UI**: The Accent color now flows through the entire app, tinting the **Topic Explorer selection** and **Model Loading Bar**.
    *   **Stop Button**: Added a manual "Stop Generation" button with a spinning ring animation. Its "Destructive Red" color is dynamically calculated to match the exact Lightness and Chroma of your chosen Accent.
*   **Personality Upgrade**:
    *   **"Wise Peer" Integration**: Overhauled the System Prompt to adopt a warmer, more creative tone, shedding the robotic "I have logged..." meta-commentary.
    *   **Identity Injection**: The AI now actively reads your **Name & Tone Preferences** from Settings and addresses you personally.
    *   **Context Narratives**: Fixed 1B model hallucinations by framing past logs as "Internal Memory" rather than external context instructions.
*   **Fixes**:
    *   **Log Mode**: Fixed a bug where "Log Mode" triggered a "Thinking..." state. It now acts purely as a Journal.
    *   **1B Model Stability**: Simplified prompts to prevent the model from getting lost in history context.

### v0.9.98 - The Writer's Studio (Jan 2026)
*   **Notion-Like Editor**: A complete overhaul of the writing experience.
    *   **Slash Commands**: Type `/` to instantly insert Headings, Lists, Quotes, Code Blocks, and Dividers.
    *   **Floating Toolbar**: Select text to access a context-aware menu for Formatting, Colors, and Comments. (Fixed "Add Comment" visibility regression).
    *   **Restricted Link Editing**: "Add Link" button is now correctly restricted to Edit Mode only.
    *   **Comment System**: Inline, annotated comments with a dedicated sidebar UI.
    *   **Smart Typography**: Styled Headings (H1-H3), Blockquotes, and Code blocks with JetBrains Mono.
*   **Visual Polish**:
    *   **Iconography Audit**: Standardized the entire application to use `lucide-react` icons (20+ icons replaced).
    *   **UI Consistency**: Unified styles for Buttons, Modals, and Menus to match the "Paper & Sage" aesthetic.
    *   **Clearer Navigation**: Distinct icons for Chat (`MessageCircle`) vs Comments (`MessageSquareText`).

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

### v0.2.0 - User Customization & Gemini Integration
- **Gemini AI Support**: Added Google Gemini as a fallback and alternative AI provider.
- **Settings UI**: New configuration page for managing Identity (Name, Tone) and AI Providers.
- **Conversational Onboarding**: New users are greeted by Michio and can set their preferences via natural language.
- **Tool Calling**: Implemented basic tool execution for Gemini (e.g., updating settings via chat).
- **Architecture**: Refactored `AIManager` to support multiple providers and fallback logic.

### v0.1.0 - Initial Release
- Basic Chat Interface
- Local Storage (Knowledge Base & History)
- Groq Integration

