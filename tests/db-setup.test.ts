import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MIGRATIONS } from "@/db/migrations.generated";
import { parseDatabaseUrl } from "@/db/client";
import { sanitizeError } from "@/server/diagnose";

describe("Eingebettete Migrationen", () => {
  it("entsprechen exakt den SQL-Dateien (sonst npm run db:embed ausführen)", () => {
    const journal = JSON.parse(fs.readFileSync(path.join("drizzle", "meta", "_journal.json"), "utf8"));
    expect(MIGRATIONS.map((m) => m.tag)).toEqual(journal.entries.map((e: { tag: string }) => e.tag));
    for (const m of MIGRATIONS) {
      const q = fs.readFileSync(path.join("drizzle", `${m.tag}.sql`), "utf8");
      expect(m.hash).toBe(crypto.createHash("sha256").update(q).digest("hex"));
    }
  });
});

describe("DATABASE_URL-Prüfung", () => {
  it("akzeptiert die Transaction-Pooler-Adresse", () => {
    expect(parseDatabaseUrl("postgresql://postgres.abc:Pw123@aws-1-eu-central-1.pooler.supabase.com:6543/postgres").problems).toEqual([]);
  });
  it("erkennt Platzhalter, Session-Port, Direktverbindung und Anführungszeichen", () => {
    expect(parseDatabaseUrl("postgresql://postgres.abc:[YOUR-PASSWORD]@x.pooler.supabase.com:6543/postgres").problems.join()).toContain("Platzhalter");
    expect(parseDatabaseUrl("postgresql://postgres.abc:pw@x.pooler.supabase.com:5432/postgres").problems.join()).toContain("6543");
    expect(parseDatabaseUrl("postgresql://postgres:pw@db.abc.supabase.co:5432/postgres").problems.join()).toContain("IPv6");
    expect(parseDatabaseUrl(' "postgresql://u:p@h:6543/d" ').url).toBe("postgresql://u:p@h:6543/d");
  });
  it("Fehlermeldungen enthalten keine Zugangsdaten", () => {
    expect(sanitizeError("connect failed postgresql://postgres.abc:Geheim1@host:6543/postgres")).not.toContain("Geheim1");
  });
});
