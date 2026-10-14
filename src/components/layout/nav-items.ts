import { BarChart3, History, LayoutDashboard, Upload, Users, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/core";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/matches", label: "nav.history", icon: History },
  { href: "/upload", label: "nav.upload", icon: Upload, primary: true },
  { href: "/stats", label: "nav.stats", icon: BarChart3 },
  { href: "/settings", label: "nav.room", icon: Users },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
