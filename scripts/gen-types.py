#!/usr/bin/env python3
"""Generate web/lib/database.types.ts from a migrated database (the local test cluster: scripts/test-db.sh --keep).

Same shape as `supabase gen types typescript` (Tables Row/Insert/Update, Views, Functions, helper types), so the
Supabase client stays fully typed without the CLI. Usage: python3 scripts/gen-types.py "psql -h /tmp -p 55432 -U postgres ppi_test"
The helper types after the schema (and hand-written extras) are kept from the current file, from the line
'type DatabaseWithoutInternals' to the end.
"""
import json, subprocess, sys, pathlib

PSQL = sys.argv[1] if len(sys.argv) > 1 else "psql -h /tmp -p 55432 -U postgres ppi_test"
OUT = pathlib.Path(__file__).resolve().parent.parent / "web" / "lib" / "database.types.ts"

def q(sql):
    r = subprocess.run(PSQL.split() + ["-X", "-q", "-t", "-A", "-c", sql], capture_output=True, text=True, check=True)
    return json.loads(r.stdout.strip() or "null")

SCALAR = {
    "uuid": "string", "text": "string", "varchar": "string", "bpchar": "string", "char": "string", "citext": "string", "name": "string",
    "date": "string", "timestamptz": "string", "timestamp": "string", "time": "string", "timetz": "string", "interval": "string", "inet": "string",
    "int2": "number", "int4": "number", "int8": "number", "float4": "number", "float8": "number", "numeric": "number", "oid": "number",
    "bool": "boolean", "json": "Json", "jsonb": "Json", "bytea": "string", "tsvector": "string", "void": "undefined", "record": "Json",
}
def ts(udt):
    if udt.startswith("_"):
        return f"{ts(udt[1:])}[]"
    return SCALAR.get(udt, "unknown")
def key(k):
    return k if k.replace("_", "a").isalnum() and not k[0].isdigit() else json.dumps(k)

cols = q("""select json_agg(json_build_object('t', c.table_name, 'c', c.column_name, 'udt', c.udt_name, 'null', c.is_nullable = 'YES',
              'def', c.column_default is not null or c.is_identity = 'YES' or c.is_generated = 'ALWAYS', 'kind', t.table_type)
              order by c.table_name, c.column_name)
            from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public'""")
fns = q("""select json_agg(json_build_object('n', p.proname, 'args', coalesce(p.proargnames, '{}'), 'modes', coalesce(p.proargmodes::text[], '{}'),
              'types', (select coalesce(array_agg(format_type(x, null)), '{}') from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) x),
              'tnames', (select coalesce(array_agg(t.typname order by o.ord), '{}') from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality o(x, ord) join pg_type t on t.oid = o.x),
              'ndef', p.pronargdefaults, 'nin', p.pronargs, 'set', p.proretset, 'ret', rt.typname, 'rettype', rt.typtype)
              order by p.proname, p.oid)
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
           where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
             and has_function_privilege('authenticated', p.oid, 'execute')""")

fks = q("""select json_agg(json_build_object('t', cl.relname, 'name', co.conname, 'ref', rf.relname,
              'cols', (select array_agg(a.attname order by k.o) from unnest(co.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.n),
              'rcols', (select array_agg(a.attname order by k.o) from unnest(co.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = co.confrelid and a.attnum = k.n),
              'one', exists (select 1 from pg_constraint u where u.conrelid = co.conrelid and u.contype in ('p', 'u')
                              and (select array_agg(x order by x) from unnest(u.conkey) x) = (select array_agg(x order by x) from unnest(co.conkey) x)))
              order by cl.relname, co.conname)
            from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace n on n.oid = cl.relnamespace
            join pg_class rf on rf.oid = co.confrelid join pg_namespace rn on rn.oid = rf.relnamespace
           where co.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'""") or []
# A view column copied straight from a NOT NULL table column keeps NOT NULL (as hand-written before).
vnn = q("""select json_agg(distinct v.view_name || '.' || v.column_name)
             from information_schema.view_column_usage v join information_schema.columns c
               on c.table_schema = v.table_schema and c.table_name = v.table_name and c.column_name = v.column_name
            where v.view_schema = 'public' and c.is_nullable = 'NO'""") or []
rels = {}
for f in fks:
    rels.setdefault(f["t"], []).append("{ foreignKeyName: %s; columns: %s; isOneToOne: %s; referencedRelation: %s; referencedColumns: %s }" % (
        json.dumps(f["name"]), json.dumps(f["cols"]), "true" if f["one"] else "false", json.dumps(f["ref"]), json.dumps(f["rcols"])))
def relblock(t):
    r = rels.get(t, [])
    return "[]" if not r else "[\n          " + ",\n          ".join(r) + "\n        ]"

tables, views = {}, {}
for c in cols:
    (tables if c["kind"] == "BASE TABLE" else views).setdefault(c["t"], []).append(c)

L = []
w = L.append
w('export type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[]\n')
w("// GENERATED by scripts/gen-types.py from the migrated database — do not edit the schema part by hand.")
w("export type Database = {\n  __InternalSupabase: {\n    PostgrestVersion: \"14.18\"\n  }\n  public: {\n    Tables: {")
for t, cs in sorted(tables.items()):
    row = "; ".join(f"{key(c['c'])}: {ts(c['udt'])}{' | null' if c['null'] else ''}" for c in cs)
    ins = "; ".join(f"{key(c['c'])}{'?' if (c['null'] or c['def']) else ''}: {ts(c['udt'])}{' | null' if c['null'] else ''}" for c in cs)
    upd = "; ".join(f"{key(c['c'])}?: {ts(c['udt'])}{' | null' if c['null'] else ''}" for c in cs)
    w(f"      {key(t)}: {{\n        Row: {{ {row} }}\n        Insert: {{ {ins} }}\n        Update: {{ {upd} }}\n        Relationships: {relblock(t)}\n      }}")
w("    }\n    Views: {")
for t, cs in sorted(views.items()):
    row = "; ".join(f"{key(c['c'])}: {ts(c['udt'])}{'' if (t + '.' + c['c']) in vnn else ' | null'}" for c in cs)
    w(f"      {key(t)}: {{\n        Row: {{ {row} }}\n        Relationships: []\n      }}")
w("    }\n    Functions: {")
by = {}
for f in fns or []:
    names, modes, tn = f["args"], f["modes"], f["tnames"]
    if not modes:
        modes = ["i"] * len(tn)
    ins = [(names[i] if i < len(names) and names[i] else f"arg{i}", tn[i]) for i, m in enumerate(modes) if m in ("i", "b", "v")]
    outs = [(names[i], tn[i]) for i, m in enumerate(modes) if m in ("o", "b", "t")]
    nopt = f["ndef"] or 0
    args = "never" if not ins else "{ " + "; ".join(f"{key(n)}{'?' if k >= len(ins) - nopt else ''}: {ts(t)} | null" for k, (n, t) in enumerate(ins)) + " }"
    if outs and (f["set"] or len(outs) > 1):
        obj = "{ " + "; ".join(f"{key(n)}: {ts(t)}" for n, t in outs) + " }"
        ret = f"{obj}[]" if f["set"] else obj
    elif f["rettype"] == "c" and f["ret"] in tables:
        ret = f'Database["public"]["Tables"]["{f["ret"]}"]["Row"]' + ("[]" if f["set"] else "")
    else:
        ret = ts(f["ret"]) + ("[]" if f["set"] and f["ret"] != "void" else "")
    by.setdefault(f["n"], []).append(f"{{ Args: {args}; Returns: {ret} }}")
for n, sigs in sorted(by.items()):
    w(f"      {key(n)}: " + (sigs[0] if len(sigs) == 1 else " | ".join(sigs)))
w("    }\n    Enums: {\n      [_ in never]: never\n    }\n    CompositeTypes: {\n      [_ in never]: never\n    }\n  }\n}\n")

old = OUT.read_text()
tail = old[old.index("\ntype DatabaseWithoutInternals") + 1:]
OUT.write_text("\n".join(L) + "\n" + tail)
print(f"tables={len(tables)} views={len(views)} functions={len(by)} -> {OUT}")
