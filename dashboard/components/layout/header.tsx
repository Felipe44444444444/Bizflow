"use client";
import { Bell, Search, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function Header({ title, description, action }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal,  setSearchVal]  = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [searchOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchVal("");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-neon-cyan/[0.08] bg-space-card/80 px-6 sticky top-0 z-20 backdrop-blur-xl">
      {/* Left: title */}
      <div className="flex flex-col justify-center min-w-0">
        <h1 className="font-display font-semibold text-base leading-tight text-white truncate">
          {title}
        </h1>
        {description && (
          <p className="text-[11px] text-[#A0AEC0] mt-0.5 truncate">{description}</p>
        )}
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-2 ml-4 shrink-0">
        {/* Search */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border transition-all duration-300 overflow-hidden",
            searchOpen
              ? "w-64 bg-space-el border-neon-cyan/30 px-3 py-1.5"
              : "w-8 h-8 bg-transparent border-transparent hover:bg-white/5 hover:border-neon-cyan/10 cursor-pointer px-0 py-0 justify-center"
          )}
          onClick={() => !searchOpen && setSearchOpen(true)}
        >
          <Search
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-colors",
              searchOpen ? "text-neon-cyan" : "text-[#4A5568] hover:text-[#A0AEC0]"
            )}
          />
          {searchOpen && (
            <>
              <input
                ref={inputRef}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Buscar... (⌘K)"
                className="flex-1 bg-transparent text-xs text-white placeholder-[#4A5568] outline-none border-none"
              />
              <button
                onClick={(e) => { e.stopPropagation(); setSearchOpen(false); setSearchVal(""); }}
                className="text-[#4A5568] hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* Bell */}
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-transparent hover:bg-white/5 hover:border-neon-cyan/10 transition-all text-[#4A5568] hover:text-[#A0AEC0]">
          <Bell className="h-3.5 w-3.5" />
        </button>

        {/* Divider */}
        {action && <div className="h-5 w-px bg-neon-cyan/10" />}

        {/* Slot for page-level action (e.g. "+ New Agent" button) */}
        {action}
      </div>
    </header>
  );
}
