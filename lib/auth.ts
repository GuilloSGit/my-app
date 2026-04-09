"use client";

import { useEffect, useState } from "react";

const AUTH_KEY = "media-agua-auth";
const AUTH_TIMESTAMP = "media-agua-timestamp";
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas

export interface AuthUser {
  email: string;
  name?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    const timestamp = localStorage.getItem(AUTH_TIMESTAMP);
    
    if (stored && timestamp) {
      const elapsed = Date.now() - parseInt(timestamp);
      if (elapsed < SESSION_DURATION) {
        setUser(JSON.parse(stored));
      } else {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = (email: string, name?: string) => {
    const user = { email, name };
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_TIMESTAMP, Date.now().toString());
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_TIMESTAMP);
    setUser(null);
  };

  return { user, loading, login, logout };
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(AUTH_KEY);
  const timestamp = localStorage.getItem(AUTH_TIMESTAMP);
  
  if (stored && timestamp) {
    const elapsed = Date.now() - parseInt(timestamp);
    if (elapsed < SESSION_DURATION) {
      return JSON.parse(stored);
    }
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getStoredUser() !== null;
}
