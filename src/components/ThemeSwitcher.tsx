"use client";

import * as React from "react";
import Icon from "@/components/Icon";
import { useTheme } from "next-themes";

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-8 h-8" />; // Placeholder
  }

  return (
    <div className="flex items-center gap-2 p-1 bg-white/10 rounded-full border border-white/10 backdrop-blur-sm">
      <button
        onClick={() => setTheme("light")}
        className={`p-1.5 rounded-full transition-colors ${
          theme === 'light' ? 'bg-accent text-white' : 'text-zinc-400 hover:text-accent'
        }`}
        title="Light Mode"
      >
        <Icon name="Sun" size={16} />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`p-1.5 rounded-full transition-colors ${
          theme === 'system' ? 'bg-accent text-white' : 'text-zinc-400 hover:text-accent'
        }`}
        title="System Mode"
      >
        <Icon name="Monitor" size={16} />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`p-1.5 rounded-full transition-colors ${
          theme === 'dark' ? 'bg-accent text-white' : 'text-zinc-400 hover:text-accent'
        }`}
        title="Dark Mode"
      >
        <Icon name="Moon" size={16} />
      </button>
    </div>
  );
}
