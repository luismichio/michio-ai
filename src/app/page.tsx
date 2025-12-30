'use client';
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import GuestJournal from './components/GuestJournal';
import styles from './page.module.css';
import CalendarView from './components/CalendarView';

// ... imports
import { LocalStorageProvider } from '@/lib/storage/local';
import { useSync } from '@/hooks/useSync';
import AddSourceModal from './components/AddSourceModal';
import FileExplorer from './components/FileExplorer';
import SourceViewer from './components/SourceViewer';

export default function Home() {
  const { data: session, update } = useSession();
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{role: 'user' | 'michio', content: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // Fix Hydration Error: Initialize empty, set on mount
  const [currentDate, setCurrentDate] = useState<string>(""); 
  
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [viewingSource, setViewingSource] = useState<{title: string, content: string} | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  
  // Storage Provider
  const [storage] = useState(() => new LocalStorageProvider());

  // Set Date on Mount (Client-side only)
  useEffect(() => {
      const date = new Date();
      const str = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      setCurrentDate(str);
      
      // TRIGGER MIGRATION (Ensures DB is ready before usage)
      storage.init().catch(err => console.error("Storage Init Failed", err));
  }, [storage]);

  // Sync Engine (Background & Manual)
  const { isSyncing, syncNow, syncError, syncMessage, syncLogs } = useSync(storage, session, update, currentDate);

  const handleSaveSource = async (topic: string, fileName: string, content: string) => {
      // Save to: misc/topic/filename
      await storage.saveFile(`misc/${topic}/${fileName}`, content);
      
      // Notify Chat (System Message?) or just trigger Sync
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `### ${timestamp}\n**Michio**: I have added *${fileName}* to the *${topic}* collection.\n`;
      await storage.appendFile(`history/${currentDate}.md`, logEntry);
      
      setMessages(prev => [...prev, { role: 'michio', content: `I have added *${fileName}* to the *${topic}* collection.` }]);
      
      // Trigger Source Sync
      syncNow();
  };

  // Reset scroll tracker when date changes
  useEffect(() => {
      hasScrolledRef.current = false;
  }, [currentDate]);

  // Load history (Run once on mount/date change - then Sync keeps it updated)
  useEffect(() => {
    async function load() {
        if (currentDate) {
            setIsLoadingHistory(true);
            try {
                // Always init storage first
                await storage.init();
                const content = await storage.readFile(`history/${currentDate}.md`) || "";

                if (content && typeof content === 'string' && !content.startsWith("No journal")) {
                    const parsed = parseLogToMessages(content);
                    setMessages(parsed);
                    if (parsed.length > 0 && !hasScrolledRef.current) {
                        scrollToBottom();
                        hasScrolledRef.current = true;
                    }
                } else {
                    setMessages([]);
                }
            } catch (err) {
                console.error("Failed to load history", err);
            } finally {
                setIsLoadingHistory(false);
            }
        }
    }
    load();
  }, [currentDate, storage]); // Removed 'session' dependency - strictly local load

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput("");
    setIsChatting(true);
    scrollToBottom();
    
    try {
        // 1. Save User Message Locally
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `### ${timestamp}\n**User**: ${userMsg}\n`;
        await storage.appendFile(`history/${currentDate}.md`, logEntry);
        
        // 2. Read Context (Local History + Knowledge Base)
        const localHistory = await storage.readFile(`history/${currentDate}.md`) || "";
        const knowledgeContext = await storage.getKnowledgeContext(userMsg);
        
        const fullContext = `${knowledgeContext}\n\n--- Current Conversation History ---\n${localHistory}`;

        // 3. Call AI (Stateless - just compute)
        const res = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({ 
                message: userMsg,
                history: messages.slice(-10),
                context: fullContext
            }), 
            headers: { "Content-Type": "application/json" },
        });
      
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Unknown error");
        
        const responseText = data.response;

        setMessages(prev => [...prev, { role: 'michio', content: responseText }]);
        
        // 4. Save Michio Response Locally
        const michioEntry = `**Michio**: ${responseText}\n`;
        await storage.appendFile(`history/${currentDate}.md`, michioEntry);

        // 5. Trigger Cloud Sync (if online)
        syncNow();

        scrollToBottom();
    } catch (err: any) {
      console.error("Chat Error:", err);
      setMessages(prev => [...prev, { role: 'michio', content: `(Entry saved. Offline mode: AI unavailable. Reason: ${err.message || 'Unknown'})` }]);
      scrollToBottom();
    } finally {
      setIsChatting(false);
    }
  }

  const handleDateSelect = (date: string) => {
      setCurrentDate(date);
      setIsCalendarOpen(false);
  };

  const handleOpenFile = async (path: string) => {
      try {
          const content = await storage.readFile(path);
          if (content && typeof content === 'string') {
              setViewingSource({ 
                  title: path.split('/').pop() || path, 
                  content 
              });
              setIsExplorerOpen(false); // Close Explorer if open
          } else {
              alert("Failed to read file content.");
          }
      } catch (e) {
          console.error("Read Error", e);
          alert("Error reading file.");
      }
  };

  // Helper to scroll to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
        if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
    }, 10);
  };

  function parseLogToMessages(log: string) {
    if (!log) return [];
    const chunks = log.split('###').filter(c => c.trim());
    const msgs: {role: 'user' | 'michio', content: string}[] = [];
    chunks.forEach(chunk => {
      const userMatch = chunk.match(/\*\*User\*\*: ([\s\S]*?)(?=\n\*\*Michio\*\*|$)/);
      const michioMatch = chunk.match(/\*\*Michio\*\*: ([\s\S]*)/);
      if (userMatch && userMatch[1]) msgs.push({ role: 'user', content: userMatch[1].trim() });
      if (michioMatch && michioMatch[1]) msgs.push({ role: 'michio', content: michioMatch[1].trim() });
    });
    return msgs;
  }

  return (
    <main className={styles.main}>
      {/* 1. Header */}
      <header className={styles.header}>
        <div style={{display:'flex', alignItems: 'center', gap: 10}}>
             <button className={styles.dateTitle} onClick={() => setIsCalendarOpen(true)}>
                <span>{currentDate}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>▼</span>
             </button>
             <button 
                onClick={() => setIsSourceModalOpen(true)}
                style={{
                    fontSize: '1.2rem', 
                    background: '#f3f4f6', 
                    border: 'none', 
                    borderRadius: '50%', 
                    width: 32, height: 32, 
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title="Add Source"
             >
                +
             </button>
             
             <button 
                onClick={() => setIsExplorerOpen(true)}
                style={{
                    fontSize: '1.2rem', 
                    background: 'transparent', 
                    border: 'none', 
                    cursor: 'pointer',
                    marginLeft: '0.5rem',
                    opacity: 0.7
                }}
                title="File Explorer"
             >
                📁
             </button>
        </div>
        
        <div className={styles.authBadge}>
             {session ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* Sync Status Indicator */}
                    <div style={{ 
                        fontSize: '0.8rem', 
                        color: syncError ? 'red' : (isSyncing ? '#3b82f6' : '#10b981'),
                        display: 'flex', alignItems: 'center', gap: 4
                    }}>
                        <div style={{ 
                            width: 8, height: 8, borderRadius: '50%', 
                            background: syncError ? 'red' : (isSyncing ? '#3b82f6' : '#10b981'),
                            animation: isSyncing ? 'pulse 1s infinite' : 'none'
                        }} />
                        {syncError ? 'Error' : (isSyncing ? (syncMessage || 'Syncing...') : 'Online')}
                    </div>

                    <button 
                        onClick={() => signOut()} 
                        style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                    >
                        Disconnect
                    </button>
                    
                    {syncError && (
                        <button onClick={() => alert(syncError)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>⚠️</button>
                    )}
                </div>
             ) : (
                 <button onClick={() => signIn("google")} className={styles.authBtn}>Enable Sync</button>
             )}
        </div>
      </header>
      
      {/* 2. Scrollable Chat Stream */}
      <div className={styles.chatContainer} ref={streamRef}>
             <div className={styles.chatStream}>
                {isLoadingHistory && messages.length === 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20vh' }}>
                        <div style={{ width: 20, height: 20, border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                )}
                
                {!isLoadingHistory && messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '10vh' }}>
                        <h1>Michio</h1>
                        <p>Traveler, I am listening.</p>
                        {!session && <p style={{fontSize: '0.8rem', opacity: 0.6}}>(Guest Mode: History is saved on this device)</p>}
                    </div>
                )}
                
                {messages.map((msg, i) => (
                    <div key={i} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.michioMessage}`}>
                        {msg.role === 'michio' && <strong style={{display:'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.5}}>Michio</strong>}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    </div>
                ))}
                
                {isLoadingHistory && messages.length > 0 && (
                     <div style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.5, margin: '1rem 0' }}>Syncing...</div>
                )}

                {isChatting && (
                    <div className={styles.michioMessage} style={{ fontStyle: 'italic', opacity: 0.5 }}>
                        Thinking...
                    </div>
                )}
             </div>
      </div>

      {/* 3. Fixed Input Area */}
      <div className={styles.inputArea}>
        <form onSubmit={handleChat} className={styles.inputWrapper}>
            <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message Michio..."
                className={styles.chatInput}
            />
            <button type="submit" disabled={isChatting} className={styles.sendBtn}>
                {isChatting ? (
                    <span style={{ fontSize: '1.2rem', animation: 'spin 1s linear infinite' }}>⟳</span>
                ) : (
                    <span>↑</span>
                )}
            </button>
        </form>
      </div>

      {/* 4. Calendar Modal */}
      {isCalendarOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsCalendarOpen(false)}>
              <div onClick={e => e.stopPropagation()}>
                <CalendarView onClose={() => setIsCalendarOpen(false)} />
              </div>
          </div>
      )}
      
      {isSourceModalOpen && (
          <AddSourceModal 
            onClose={() => setIsSourceModalOpen(false)} 
            onSave={handleSaveSource}
          />
      )}

      {isExplorerOpen && (
        <FileExplorer storage={storage} onClose={() => setIsExplorerOpen(false)} syncLogs={syncLogs} onOpenFile={handleOpenFile} />
      )}

      {viewingSource && (
        <SourceViewer 
            title={viewingSource.title} 
            content={viewingSource.content} 
            onClose={() => setViewingSource(null)} 
        />
      )}
    </main>
  );
}
