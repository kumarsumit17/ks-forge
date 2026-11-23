// The Lucide icons the app uses, imported one by one so only these are bundled.
import {
  Terminal, SquareTerminal, SquareChevronRight, Code, Braces, Server, Database, Cloud, Container, Box, GitBranch, Bug,
  FlaskConical, Rocket, Flame, Hammer, Wrench, Cpu, Globe, House, Folder, BookOpen, Music, Star, Heart, Zap, Shield, Fish,
  Plus, X, ChevronDown, Settings, Search, ArrowUp, ArrowDown, CaseSensitive, WholeWord, Regex, Columns2, Rows2, Command,
  Palette, Keyboard, User, RefreshCw, Info, Trash2, Copy, Download, Upload, TriangleAlert, Check, FileText, Maximize2,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  terminal: Terminal, "square-terminal": SquareTerminal, "square-chevron-right": SquareChevronRight, code: Code, braces: Braces,
  server: Server, database: Database, cloud: Cloud, container: Container, box: Box, "git-branch": GitBranch, bug: Bug,
  "flask-conical": FlaskConical, rocket: Rocket, flame: Flame, hammer: Hammer, wrench: Wrench, cpu: Cpu, globe: Globe, house: House,
  folder: Folder, "book-open": BookOpen, music: Music, star: Star, heart: Heart, zap: Zap, shield: Shield, fish: Fish,
  plus: Plus, x: X, "chevron-down": ChevronDown, settings: Settings, search: Search, "arrow-up": ArrowUp, "arrow-down": ArrowDown,
  "case-sensitive": CaseSensitive, "whole-word": WholeWord, regex: Regex, "columns-2": Columns2, "rows-2": Rows2, command: Command,
  palette: Palette, keyboard: Keyboard, user: User, "refresh-cw": RefreshCw, info: Info, "trash-2": Trash2, copy: Copy,
  download: Download, upload: Upload, "triangle-alert": TriangleAlert, check: Check, "file-text": FileText, "maximize-2": Maximize2,
};

export function Icon({ name, size = 15, className }: { name: string; size?: number; className?: string }) {
  const C = ICONS[name] ?? Terminal;
  return <C size={size} strokeWidth={1.8} className={className} aria-hidden="true" />;
}
