"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1c2e48] transition-colors"
      title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
    >
      {theme === "dark"
        ? <Sun className="w-4 h-4 text-yellow-500" />
        : <Moon className="w-4 h-4" />
      }
    </button>
  );
}
