import { exportJWK, generateKeyPair } from "jose";

const issuer = process.argv[2] ?? "http://localhost:3000";
const audience = process.argv[3] ?? "siap-convex";
const kid = process.argv[4] ?? `siap-${new Date().toISOString().slice(0, 10)}`;
const issuerOrigin = new URL(issuer).origin;
if (issuer.replace(/\/$/, "") !== issuerOrigin) {
  throw new Error("Issuer must be an origin without a path");
}
if (!audience.trim() || !kid.trim()) {
  throw new Error("Audience and key ID must not be empty");
}
const normalizedAudience = audience.trim();
const normalizedKid = kid.trim();

const { privateKey, publicKey } = await generateKeyPair("ES256", {
  extractable: true,
});
const privateJwk = {
  ...(await exportJWK(privateKey)),
  kid: normalizedKid,
  alg: "ES256",
  use: "sig",
};
const publicJwk = {
  ...(await exportJWK(publicKey)),
  kid: normalizedKid,
  alg: "ES256",
  use: "sig",
};
const jwks = Buffer.from(
  JSON.stringify({ keys: [publicJwk] }),
  "utf8",
).toString("base64");

process.stdout.write(
  [
    "Add these values to .env.local / Vercel:",
    `AUTH_JWT_PRIVATE_JWK=${JSON.stringify(privateJwk)}`,
    `AUTH_JWT_ISSUER=${issuerOrigin}`,
    `AUTH_JWT_AUDIENCE=${normalizedAudience}`,
    `AUTH_JWT_KID=${normalizedKid}`,
    "",
    "Add these values to the Convex deployment:",
    `AUTH_JWT_ISSUER=${issuerOrigin}`,
    `AUTH_JWT_AUDIENCE=${normalizedAudience}`,
    `AUTH_JWKS_DATA_URI=data:text/plain;charset=utf-8;base64,${jwks}`,
    "",
  ].join("\n"),
);
