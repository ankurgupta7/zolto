import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

// Normalise env vars to strings ("" for unset) so validation reports empty
// values consistently rather than "expected string, received undefined".
const source = {
  VITE_APP_ID: process.env.VITE_APP_ID ?? "",
  JWT_SECRET: process.env.JWT_SECRET ?? "",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL ?? "",
  OWNER_OPEN_ID: process.env.OWNER_OPEN_ID ?? "",
  BUILT_IN_FORGE_API_URL: process.env.BUILT_IN_FORGE_API_URL ?? "",
  BUILT_IN_FORGE_API_KEY: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

// Secrets that must be present in production. Missing them there means a broken
// deploy — better to fail fast at boot with a clear message than to sign
// cookies with an empty key or run without a database. In development/test we
// tolerate empty values so the app can boot with partial configuration.
const requiredInProduction = z.string().min(1);
const optional = z.string();

const schema = z.object({
  VITE_APP_ID: optional,
  JWT_SECRET: isProduction ? requiredInProduction : optional,
  DATABASE_URL: isProduction ? requiredInProduction : optional,
  OAUTH_SERVER_URL: optional,
  OWNER_OPEN_ID: optional,
  BUILT_IN_FORGE_API_URL: optional,
  BUILT_IN_FORGE_API_KEY: optional,
});

const parsed = schema.safeParse(source);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration (NODE_ENV=${process.env.NODE_ENV ?? "undefined"}):\n${details}`,
  );
}

export const ENV = {
  appId: parsed.data.VITE_APP_ID,
  cookieSecret: parsed.data.JWT_SECRET,
  databaseUrl: parsed.data.DATABASE_URL,
  oAuthServerUrl: parsed.data.OAUTH_SERVER_URL,
  ownerOpenId: parsed.data.OWNER_OPEN_ID,
  isProduction,
  forgeApiUrl: parsed.data.BUILT_IN_FORGE_API_URL,
  forgeApiKey: parsed.data.BUILT_IN_FORGE_API_KEY,
  // Self-hosted: LLM and storage are configured via their own env vars
  // (LLM_BASE_URL, LLM_API_KEY, S3_BUCKET, etc.) — see storage.ts and llm.ts
};
