import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  forgotPasswordOTP as forgotPasswordApi,
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
  registerCustomer as registerCustomerApi,
  verifyOTP as verifyOTPApi,
} from '../features/auth/api/authApi';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  OTPVerificationPayload,
  RegisterCustomerPayload,
  RegisterPayload,
} from '../features/auth/types';
import { useAuthStore } from '../store/authStore';
import { toAppError } from '../services/errorMapper';

export const QUERY_KEYS = {
  currentUser: ['auth', 'current-user'],
} as const;

/**
 * Central auth facade used by screens. Wraps the API calls in TanStack Query
 * mutations and persists the resulting session into the Zustand stores.
 */
export const useAuth = () => {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  const loginMutation = useMutation({
    mutationFn: (payload: LoginPayload) => loginApi(payload),
    onSuccess: (result) => {
      setSession(result.tokens, result.user);
      queryClient.setQueryData(QUERY_KEYS.currentUser, result.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterPayload) => registerApi(payload),
    onSuccess: (result) => {
      // For registration requests, we don't set session immediately
      // The user must wait for admin approval and OTP verification
    },
  });

  const registerCustomerMutation = useMutation({
    mutationFn: (payload: RegisterCustomerPayload) => registerCustomerApi(payload),
    onSuccess: (result) => {
      // Customers are active immediately, so sign them straight in.
      setSession(result.tokens, result.user);
      queryClient.setQueryData(QUERY_KEYS.currentUser, result.user);
    },
  });

  const verifyOTPMutation = useMutation({
    mutationFn: (payload: OTPVerificationPayload) => verifyOTPApi(payload),
    // Session persistence + navigation is handled by the OTP screen so the
    // "account activated" success screen can be shown before switching stacks.
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: (payload: ForgotPasswordPayload) => forgotPasswordApi(payload),
  });

  const signOut = useCallback(async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    // Clear the local session first so logout always succeeds locally, then
    // best-effort revoke the refresh token server-side.
    clearSession();
    queryClient.clear();
    try {
      await logoutApi(refreshToken ?? undefined);
    } catch {
      // A failed logout request must not block the local sign-out.
    }
  }, [clearSession, queryClient]);

  return {
    login: {
      ...loginMutation,
      error: loginMutation.error ? toAppError(loginMutation.error) : null,
    },
    register: {
      ...registerMutation,
      error: registerMutation.error ? toAppError(registerMutation.error) : null,
    },
    registerCustomer: {
      ...registerCustomerMutation,
      error: registerCustomerMutation.error ? toAppError(registerCustomerMutation.error) : null,
    },
    verifyOTP: {
      ...verifyOTPMutation,
      error: verifyOTPMutation.error ? toAppError(verifyOTPMutation.error) : null,
    },
    forgotPasswordOTP: {
      ...forgotPasswordMutation,
      error: forgotPasswordMutation.error ? toAppError(forgotPasswordMutation.error) : null,
    },
    signOut,
  };
};