'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api, endpoints } from '@/lib/api/client';
import {
  getAuthToken,
  setAuthToken,
  setRefreshToken,
  removeAuthToken,
  getRefreshToken,
} from '@/lib/auth';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}

interface AuthApiResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    tokens: Tokens;
  };
}

interface MeApiResponse {
  success: boolean;
  message: string;
  data: User;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token && !getRefreshToken()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get<MeApiResponse>(endpoints.auth.me);
      setUser(response.data);
    } catch {
      removeAuthToken();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const response = await api.post<AuthApiResponse>(endpoints.auth.login, { email, password });
    const { user: userData, tokens } = response.data;
    setAuthToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.post(endpoints.auth.logout, { refreshToken: getRefreshToken() });
    } finally {
      removeAuthToken();
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}