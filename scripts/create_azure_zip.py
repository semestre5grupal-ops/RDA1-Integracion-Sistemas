import os
import sys
import zipfile

def build_zip():
    base_dir = r"c:\Users\ASUS\Documents\6to Semestre\Integración Sistemas\proyecto\plantilla inicial"
    prod_modules = os.path.join(os.environ.get("TEMP", r"C:\Users\ASUS\AppData\Local\Temp"), "booking-prod-app", "node_modules")
    output_zip = os.path.join(os.environ.get("TEMP", r"C:\Users\ASUS\AppData\Local\Temp"), "booking-app-prod.zip")

    if os.path.exists(output_zip):
        os.remove(output_zip)

    print(f"Creando paquete zip en {output_zip}...")
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # 1. dist
        dist_dir = os.path.join(base_dir, "dist")
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
                zf.write(full_path, rel_path)

        # 2. proto files (src/proto)
        proto_dir = os.path.join(base_dir, "src", "proto")
        if os.path.exists(proto_dir):
            for root, dirs, files in os.walk(proto_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
                    zf.write(full_path, rel_path)

        # 3. contracts folder
        contracts_dir = os.path.join(base_dir, "contracts")
        if os.path.exists(contracts_dir):
            for root, dirs, files in os.walk(contracts_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
                    zf.write(full_path, rel_path)

        # 4. package.json
        pkg_json = os.path.join(base_dir, "package.json")
        zf.write(pkg_json, "package.json")

        # 4. production node_modules
        print("Empaquetando node_modules de producción...")
        for root, dirs, files in os.walk(prod_modules):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = "node_modules/" + os.path.relpath(full_path, prod_modules).replace("\\", "/")
                zf.write(full_path, rel_path)

    size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"Paquete creado con éxito: {size_mb:.2f} MB")

if __name__ == "__main__":
    build_zip()
