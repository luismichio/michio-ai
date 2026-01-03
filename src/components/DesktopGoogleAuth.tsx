"use client"

import { useState } from 'react';
import { clientDrive } from '@/lib/sync/client-drive';
import { Check, Cloud, Loader2 } from 'lucide-react';

export const DesktopGoogleAuth = () => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'connected'>(() => {
        return typeof window !== 'undefined' && localStorage.getItem('google_access_token') ? 'connected' : 'idle';
    });

    const handleConnect = () => {
        setStatus('loading');
        
        // Implicit Grant Flow for Desktop/Client-Side
        const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID; // Fallback
        const REDIRECT_URI = window.location.origin + '/auth/callback';
        const SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.profile';
        
        if (!CLIENT_ID) {
            alert("Missing Google Client ID");
            setStatus('idle');
            return;
        }

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(SCOPE)}&prompt=consent`;

        // Open Popup
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(authUrl, 'Google Auth', `width=${width},height=${height},top=${top},left=${left}`);

        // Poll for Token from Popup
        const timer = setInterval(() => {
            if (popup?.closed) {
                clearInterval(timer);
                setStatus('idle');
                return;
            }

            try {
                // Check if popup has redirected to our callback
                if (popup?.location.href.includes(REDIRECT_URI)) {
                    const hash = popup.location.hash;
                    const params = new URLSearchParams(hash.replace('#', '?'));
                    const accessToken = params.get('access_token');
                    
                    if (accessToken) {
                        clientDrive.setToken(accessToken);
                        setStatus('connected');
                        popup.close();
                        clearInterval(timer);
                    }
                }
            } catch (e) {
                // Ignore cross-origin errors
            }
        }, 500);
    };

    const handleDisconnect = () => {
        localStorage.removeItem('google_access_token');
        clientDrive.setToken('');
        setStatus('idle');
    };

    const btnBase = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
    const btnPrimary = "bg-primary text-primary-foreground hover:bg-primary/90";
    const btnGhost = "hover:bg-accent hover:text-accent-foreground";

    if (status === 'connected') {
        return (
            <div className="flex items-center gap-2 p-3 border border-green-500/30 bg-green-500/10 rounded-lg">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-sm">Google Drive Connected</span>
                <button onClick={handleDisconnect} className={`${btnBase} ${btnGhost} ml-auto text-xs text-muted-foreground h-8 px-2`}>
                    Disconnect
                </button>
            </div>
        )
    }

    return (
        <button onClick={handleConnect} disabled={status === 'loading'} className={`${btnBase} ${btnPrimary} w-full gap-2`}>
            {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            Connect Google Drive (Desktop)
        </button>
    )
}
