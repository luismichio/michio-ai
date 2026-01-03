"use client"

import { useEffect } from "react";

export default function AuthCallback() {
  useEffect(() => {
    // Just exist to capture the URL hash. The opener window polls this window.
    // Optionally postMessage back to opener.
    if (window.opener) {
        // window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', hash: window.location.hash }, '*');
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-xl font-bold mb-2">Authenticated</h1>
        <p className="text-muted-foreground">You can close this window.</p>
      </div>
    </div>
  )
}
