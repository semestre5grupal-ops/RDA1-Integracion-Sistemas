import yaml
import json
import os

with open('contracts/autos-openapi-v3.yaml', 'r', encoding='utf-8') as f:
    spec = yaml.safe_load(f)

schemas = spec.get('components', {}).get('schemas', {})

os.makedirs('contracts/schemas', exist_ok=True)

# Build a master JSON Schema bundle with both definitions and components.schemas
bundle = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "https://booking.epn.edu.ec/schemas/autos.json",
    "title": "AutosOpenAPIv3Schemas",
    "definitions": schemas,
    "components": {
        "schemas": schemas
    }
}

with open('contracts/schemas/autos.schema.json', 'w', encoding='utf-8') as f:
    json.dump(bundle, f, indent=2, ensure_ascii=False)

print(f"Exported {len(schemas)} schemas to contracts/schemas/autos.schema.json with components.schemas resolution")
