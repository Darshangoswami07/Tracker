import { useQuery } from '@tanstack/react-query';
import { getCurrentUser } from '../features/auth/api/authApi';
import { QUERY_KEYS } from './useAuth';
import { toAppError } from '../services/errorMapper';

/** Fetches and caches the authenticated user's profile. */
export const useCurrentUser = () => {
  const query = useQuery({
    queryKey: QUERY_KEYS.currentUser,
    queryFn: getCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    ...query,
    error: query.error ? toAppError(query.error) : null,
  };
};