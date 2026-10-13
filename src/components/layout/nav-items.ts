import { BarChart3, History, LayoutDashboard, Settings, Upload, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/matches", label: "History", icon: History },
  { href: "/upload", label: "Upload", icon: Upload, primary: true },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Room", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
