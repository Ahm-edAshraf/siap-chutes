const REQUIRED_SCOPES = new Set(["openid", "profile", "chutes:invoke"]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getAppOrigin(): string {
  const value = required("NEXT_PUBLIC_APP_URL");
  const origin = new URL(value).origin;
  if (value.replace(/\/$/, "") !== origin) {
    throw new Error("NEXT_PUBLIC_APP_URL must be an origin without a path");
  }
  return origin;
}

export function getOAuthConfig() {
  const appOrigin = getAppOrigin();
  const scopes = (
    process.env.CHUTES_OAUTH_SCOPES ?? "openid profile chutes:invoke"
  )
    .split(/\s+/)
    .filter(Boolean);
  if (
    scopes.some((scope) => !REQUIRED_SCOPES.has(scope)) ||
    REQUIRED_SCOPES.size !== scopes.length
  ) {
    throw new Error(
      "CHUTES_OAUTH_SCOPES must contain only: openid profile chutes:invoke",
    );
  }
  return {
    clientId: required("CHUTES_OAUTH_CLIENT_ID"),
    clientSecret: required("CHUTES_OAUTH_CLIENT_SECRET"),
    scopes,
    idpBaseUrl: (
      process.env.CHUTES_IDP_BASE_URL ?? "https://api.chutes.ai"
    ).replace(/\/$/, ""),
    redirectUri: `${appOrigin}/api/auth/chutes/callback`,
  };
}
