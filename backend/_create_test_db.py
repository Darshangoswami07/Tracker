import psycopg

DIRECT = "postgresql://neondb_owner:npg_LoCy9suZSJ5b@ep-gentle-moon-azwg35o6.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

with psycopg.connect(DIRECT, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT datname FROM pg_database ORDER BY datname")
        dbs = [r[0] for r in cur.fetchall()]
        print("DATABASES:", dbs)
        if "deliveryhub_test" not in dbs:
            cur.execute("CREATE DATABASE deliveryhub_test")
            print("created deliveryhub_test")
        else:
            print("deliveryhub_test already exists")
