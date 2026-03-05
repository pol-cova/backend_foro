function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value?.trim()) throw new Error(`${key} environment variable is required`);
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() ?? defaultValue;
}

export const config = {
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
  smtp: {
    host: optionalEnv("SMTP_HOST", "localhost"),
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASS?.trim(),
    from: optionalEnv("SMTP_FROM", "noreply@devspartans.com"),
  },
} as const;
