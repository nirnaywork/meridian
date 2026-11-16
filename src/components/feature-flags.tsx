"use client";
import { createContext, useContext } from "react";
const BadgeVisibility = createContext(true);
export const useMatchPercent = () => useContext(BadgeVisibility);
export function FeatureFlags({
  showMatchPercent,
  children,
}: {
  showMatchPercent: boolean;
  children: React.ReactNode;
}) {
  return (
    <BadgeVisibility.Provider value={showMatchPercent}>
      {children}
    </BadgeVisibility.Provider>
  );
}
