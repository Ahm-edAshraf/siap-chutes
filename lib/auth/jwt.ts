import { importJWK, SignJWT, type JWK } from "jose";
import type { ChutesUser, SiapRole } from "./types";

let signingKeyPromise: Promise<CryptoKey | Uint8Array> | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function getSigningKey() {
  if (!signingKeyPromise) {
    const privateJwk = JSON.parse(required("AUTH_JWT_PRIVATE_JWK")) as JWK;
    signingKeyPromise = importJWK(privateJwk, "ES256");
  }
  return signingKeyPromise;
}

export async function mintConvexToken(
  user: ChutesUser,
  role: SiapRole,
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return await new SignJWT({
    role,
    username: user.username,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: "JWT",
      kid: required("AUTH_JWT_KID"),
    })
    .setSubject(user.sub)
    .setIssuer(required("AUTH_JWT_ISSUER"))
    .setAudience(required("AUTH_JWT_AUDIENCE"))
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(await getSigningKey());
}
