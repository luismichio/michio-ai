"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { settingsManager } from "@/lib/settings";
import { getOklch } from "@/lib/colors";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false);

  // Appearance Sync
  React.useEffect(() => {
    setMounted(true);
    
    async function loadAppearance() {
        // Load initial appearance settings
        const config = await settingsManager.getConfig();
        applyAppearance(config.appearance);
    }
    loadAppearance();

    // Listen to storage changes for multi-tab sync (and settings page updates)
    // Note: LocalStorageProvider doesn't emit storage events on same tab write unless specific hook used.
    // We can rely on a simpler polling or event listener if needed.
    // For now, let's assume valid reload or Settings Page will signal us?
    // In a real app, use a Context or Event Bus. 
    // Hack for immediate feedback from Settings Page:
    window.addEventListener('meechi-appearance-update', async () => {
         const config = await settingsManager.getConfig();
         applyAppearance(config.appearance);
    });

    return () => {
        window.removeEventListener('meechi-appearance-update', () => {});
    };

  }, []);

  const applyAppearance = (appearance: any) => {
      if (!appearance) return;
      
      const root = document.documentElement;
      
      // Font Handling
      if (appearance.fontFamily) {
          if (appearance.fontFamily.startsWith('http')) {
              // Custom URL - Load it?
              // Security risk? Assume user trusts source for now.
              // Logic: Add <link> tag to head if not exists
              // We won't do full font loader here for simplicity, 
              // just handle generic names for now like "Inter", "Lora", "Mono".
          } else {
             // Map standard names to CSS Vars or font-family stacks
             // Default Tailwind vars are --font-sans, --font-serif
             if (appearance.fontFamily === 'Inter') {
                 root.style.setProperty('--font-sans', 'var(--font-inter)');
             } else if (appearance.fontFamily === 'Lora') {
                 root.style.setProperty('--font-sans', 'var(--font-lora)'); // Use serif as primary sans variable for full UI switch
             } else if (appearance.fontFamily === 'Mono') {
                 root.style.setProperty('--font-sans', 'monospace');
             }
          }
      }

      // Accent Color (OKLCH Engine)
      if (appearance.accentColor) {
           const { l, c, h, cssValue } = getOklch(appearance.accentColor);
           root.style.setProperty('--accent', cssValue);
           root.style.setProperty('--accent-l', String(l));
           root.style.setProperty('--accent-c', String(c));
           root.style.setProperty('--accent-h', String(h));
           root.style.setProperty('--destructive', `oklch(${l} ${c} 25)`);
      }

      // Backgrounds & Surfaces
      if (appearance.backgroundColor) root.style.setProperty('--background', appearance.backgroundColor);
      if (appearance.surfaceColor) root.style.setProperty('--surface', appearance.surfaceColor);
      if (appearance.foregroundColor) root.style.setProperty('--foreground', appearance.foregroundColor);
      if (appearance.secondaryColor) root.style.setProperty('--secondary', appearance.secondaryColor);

      // Radius
      if (appearance.radius) {
          // Map abstract size "0.5rem" to actual vars if we had --radius
          // Currently hardcoded in Tailwind? No, we plan to use it.
          // Let's assume we add --radius to globals.css later?
          // For now, direct injection handles it if we use style={{borderRadius: var(--radius)}}? 
          // Or update tailwind config to use var(--radius).
      }
  };

  if (!mounted) {
      // Prevent hydration mismatch
      return <>{children}</>;
  }

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
