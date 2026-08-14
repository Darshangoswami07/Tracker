/** Token pair issued by the authentication API. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/** Payload returned by register/login/refresh endpoints. */
export interface AuthResponse {
  user: import('./user').User;
  tokens: TokenPair;
}