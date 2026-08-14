import { useQuery } from '@tanstack/react-query';
import type { RegistrationRequestResult } from '../features/auth/types';
import { registrationService } from '../services/registrationService';
import { toAppError } from '../services/errorMapper';
import type { AppError } from '../types/api';

interface UseRegistrationStatusOptions {
  /**
   * Polls the backend every `intervalMs` so approval/rejection reaches the app
   * without a manual refresh. Pausing stops polling (e.g. navigating away).
   */
  enabled?: boolean;
  intervalMs?: number;
}

export interface RegistrationStatusState {
  data?: RegistrationRequestResult;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  error?: AppError;
  refetch: () => void;
}

/**
 * Polls `GET /registration-requests/{id}` until it is navigated away from.
 * The status value lives on `data.status` where:
 *   pending               -> still awaiting admin approval
 *   approved_pending_otp  -> approve: send to OTP verification
 *   rejected              -> navigate to the rejected screen
 */
export const useRegistrationStatus = (
  requestId: string | undefined,
  options: UseRegistrationStatusOptions = {}
): RegistrationStatusState => {
  const { enabled = true, intervalMs = 5000 } = options;

  const query = useQuery({
    queryKey: ['registration-request', requestId],
    queryFn: () => registrationService.getRegistrationRequest(requestId as string),
    enabled: Boolean(requestId) && enabled,
    refetchInterval: enabled && requestId ? intervalMs : false,
    refetchIntervalInBackground: false,
    staleTime: intervalMs - 1000,
    retry: 2,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching,
    isError: query.isError,
    error: query.error ? toAppError(query.error) : undefined,
    refetch: () => void query.refetch(),
  };
};