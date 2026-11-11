import zipfile
import os

zip_path = 'deploy_saga_update.zip'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, '.').replace('\\', '/')
            zf.write(full, rel)
    for f in ['package.json', 'package-lock.json']:
        if os.path.exists(f):
            zf.write(f, f)

print(f"Zip created successfully: {os.path.getsize(zip_path)} bytes")

