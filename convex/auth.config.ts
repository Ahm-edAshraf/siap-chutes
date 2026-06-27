import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: process.env.AUTH_JWT_AUDIENCE!,
      issuer: process.env.AUTH_JWT_ISSUER!,
      jwks: process.env.AUTH_JWKS_DATA_URI!,
      algorithm: "ES256",
    },
  ],
} satisfies AuthConfig;
