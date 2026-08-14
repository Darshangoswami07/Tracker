import os
versions_dir = r'D:\DeliveryHub\backend\alembic\versions'
for fname in sorted(os.listdir(versions_dir)):
    if fname.endswith('.py') and not fname.startswith('_'):
        fpath = os.path.join(versions_dir, fname)
        with open(fpath) as f:
            content = f.read()
        # Extract revision id
        for line in content.split('\n'):
            if line.startswith('revision'):
                rev = line.split('=')[1].strip().strip("'").strip('"')
                print(f"{fname}: revision={rev}")
                break