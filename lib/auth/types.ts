export interface ChutesUser {
  sub: string;
  username: string;
  email?: string;
  name?: string;
}

export interface ChutesSession {
  user: ChutesUser;
  accessToken: string;
  expiresAt: number;
}

export type SiapRole = "user" | "analysis_service";
