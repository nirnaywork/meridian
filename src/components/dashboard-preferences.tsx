"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { api } from "./ui";
import {
  dndActive,
  type DashboardPreferences,
  dashboardActionSchema,
} from "@/lib/personal-dashboard";

type PreferencesContext = {
  preferences: DashboardPreferences | null;
  quiet: boolean;
  error: string;
  refresh: () => void;
  save: (values: Record<string, unknown>) => Promise<void>;
};
const Context = createContext<PreferencesContext>({
  preferences: null,
  quiet: false,
  error: "",
  refresh: () => {},
  save: async () => {},
});
export const useDashboardPreferences = () => useContext(Context);
export function DashboardPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<DashboardPreferences | null>(
      null,
    ),
    [error, setError] = useState(""),
    [now, setNow] = useState(0);
  const refresh = useCallback(() => {
    void api<DashboardPreferences>("/api/dashboard/preferences")
      .then((p) => {
        setPreferences(p);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) refresh();
    }, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  async function save(values: Record<string, unknown>) {
    await api(
      "/api/dashboard",
      dashboardActionSchema.parse({ action: "preferences", ...values }),
    );
    setPreferences(
      await api<DashboardPreferences>("/api/dashboard/preferences"),
    );
    setNow(Date.now());
  }
  return (
    <Context.Provider
      value={{
        preferences,
        quiet: dndActive(preferences, now || Date.now()),
        error,
        refresh,
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
