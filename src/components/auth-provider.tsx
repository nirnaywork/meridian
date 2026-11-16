"use client";
import { createContext, useContext, useEffect, useState } from "react";
type AuthState = { loading: boolean; signedIn: boolean };
const AuthContext = createContext<AuthState>({
  loading: true,
  signedIn: false,
});
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    signedIn: false,
  });
  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then(async (r) => {
        if (active)
          setState({
            loading: false,
            signedIn: r.ok && (await r.json()).signedIn,
          });
      })
      .catch(() => {
        if (active) setState({ loading: false, signedIn: false });
      });
    return () => {
      active = false;
    };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
