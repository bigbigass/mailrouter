import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";

type D1Client = NonNullable<CloudflareEnv["DB"]>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaD1Binding?: D1Client;
};

function getPrismaClient(): PrismaClient {
  const d1Binding = getD1Binding();

  if (
    globalForPrisma.prisma &&
    (!d1Binding || globalForPrisma.prismaD1Binding === d1Binding)
  ) {
    return globalForPrisma.prisma;
  }

  const client = new PrismaClient({
    ...(d1Binding ? { adapter: new PrismaD1(d1Binding) } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaD1Binding = d1Binding;
  }

  return client;
}

function getD1Binding(): D1Client | undefined {
  if (process.env.APP_RUNTIME !== "cloudflare") {
    return undefined;
  }

  const { env } = getCloudflareContext();

  if (!env.DB) {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }

  return env.DB;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrismaClient(), property, receiver);
  },
});
