'use client';

import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";
import GuestJournal from './components/GuestJournal';
import styles from './page.module.css';

export default function Home() {
  const { data: session } = useSession();
  const [chatInput, setChatInput] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setIsChatting(true);
    setChatResponse("Michio is thinking...");
    
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: chatInput }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unknown error");
      setChatResponse(data.response);
    } catch (err: any) {
      setChatResponse(`Michio paused. (Error: ${err.message})`);
    } finally {
      setIsChatting(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.authBar}>
        {session ? (
          <div className={styles.userBadge}>
            <span>Connected: {session.user?.name}</span>
            <button onClick={() => signOut()} className={styles.authBtn}>Disconnect</button>
          </div>
        ) : (
          <button onClick={() => signIn("google")} className={styles.authBtn}>
            Connect Memory (Google Drive)
          </button>
        )}
      </div>

      <div className={styles.hero}>
        <h1 className={styles.title}>Michio</h1>
        <p className={styles.subtitle}>
          &quot;Man on a Journey&quot; — Every step is a story, every pause a reflection.
          Capture your thoughts as you wander through the digital expanse.
        </p>
      </div>

      <div className={styles.journeyPath} aria-hidden="true" />

      {session ? (
        <div className={styles.chatSection}>
            <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
              <button 
                onClick={async () => {
                  if(!confirm("Create 'Michio Journal' folder in Drive?")) return;
                  try {
                    const res = await fetch('/api/setup', { method: 'POST' });
                    const d = await res.json();
                    alert(d.message);
                  } catch (e: any) {
                    alert("Error: " + e.message);
                  }
                }}
                className={styles.authBtn}
                style={{ background: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6' }}
              >
                Initialize "Michio Journal" Folder
              </button>
            </div>

            <h2>Talk to Michio</h2>
            <p className={styles.chatHint}>Michio can read your recent Drive files to answer questions.</p>
            <form onSubmit={handleChat} className={styles.chatForm}>
                <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Michio something..."
                    className={styles.chatInput}
                />
                <button type="submit" disabled={isChatting} className={styles.chatBtn}>
                    {isChatting ? "..." : "Ask"}
                </button>
            </form>
            {chatResponse && (
                <div className={styles.chatResponse}>
                    <strong>Michio:</strong>
                    <p>{chatResponse}</p>
                </div>
            )}
        </div>
      ) : (
        <GuestJournal />
      )}
    </main>
  );
}
