import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readdirSync, readFileSync } from "node:fs";
export async function applyLocalMigration(db: PGlite, sql: string) {
  // Match InsForge: one checked-out connection, one outer transaction and
  // one execution of the complete file; errors roll back DDL, data and ACLs.
  await db.transaction(async (tx) => {
    await tx.exec("SET LOCAL search_path TO public");
    await tx.exec(sql);
  });
}
export async function localPostgres(options: { through?: string } = {}) {
  const db = new PGlite({ extensions: { vector } });
  // Local-only stand-ins for InsForge managed identity objects; never executed remotely.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE project_admin BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email_verified boolean NOT NULL DEFAULT true);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user_id',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated,project_admin; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,project_admin;`);
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (options.through && file > options.through) break;
    let sql = readFileSync("migrations/" + file, "utf8");
    if (file === "20261116133716_meridian-schema.sql")
      sql = sql.split("ALTER TABLE storage.objects")[0];
    try {
      await applyLocalMigration(db, sql);
    } catch (e) {
      await db.close();
      throw new Error(
        file +
          ": " +
          (e as Error).message +
          " " +
          JSON.stringify({
            position: (e as any).position,
            internalPosition: (e as any).internalPosition,
            internalQuery: (e as any).internalQuery,
            where: (e as any).where,
          }),
      );
    }
  }
  return db;
}
