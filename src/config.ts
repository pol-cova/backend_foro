function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value?.trim()) throw new Error(`${key} environment variable is required`);
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() ?? defaultValue;
}

export const config = {
  testing: process.env.TESTING === "true",
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  database: {
    url: requireEnv("DATABASE_URL"),
  },
  jwt: {
    secret: requireEnv("JWT_SECRET"),
  },
  siiau: {
    url: requireEnv("EXTERNAL_API_URL"),
  },
  sispa: {
    url: requireEnv("SISPA_URL"),
    codigo: requireEnv("SISPA_CODIGO"),
    password: requireEnv("SISPA_PASSWORD"),
  },
  cors: {
    origin: optionalEnv("CORS_ORIGIN", "http://localhost:5173"),
  },
  rateLimit: {
    max: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 100,
    duration: 60_000,
  },
  smtp: {
    host: optionalEnv("SMTP_HOST", "localhost"),
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASS?.trim(),
    from: optionalEnv("SMTP_FROM", "noreply@devspartans.com"),
  },
} as const;
