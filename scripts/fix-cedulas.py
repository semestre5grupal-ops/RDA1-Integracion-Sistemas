import re

files_to_fix = [
    'contracts/atracciones-openapi-v3.yaml',
    'contracts/autos-openapi-v3.yaml',
    'Faltantes RDA2/docs/GUIA_INTEGRACION_SOCIOS.md',
    'Faltantes RDA2/docs/GUIA_INTEGRACION_AUTOS.md',
    'Faltantes RDA2/Atracciones individuales/GUIA_INTEGRACION_AUTOS.md'
]

for file_path in files_to_fix:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace 1723456789 with valid 1710034065 or 1723456784
        new_content = content.replace('1723456789', '1710034065').replace('1724589632', '1724589633')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated cedulas in {file_path}")
    except Exception as e:
        print(f"Error in {file_path}: {e}")

print("Cedula replacement complete!")
