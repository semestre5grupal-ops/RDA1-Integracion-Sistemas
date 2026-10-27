import yaml
import json

with open('contracts/autos-openapi-v2.yaml', 'r', encoding='utf-8') as f:
    data = yaml.safe_load(f)

schemas = data.get('components', {}).get('schemas', {})
print(f"Total schemas: {len(schemas)}")
for name, s in schemas.items():
    props = s.get('properties', {})
    req = s.get('required', [])
    if props:
        print(f"\n--- {name} (required: {req}) ---")
        for p, d in props.items():
            t = d.get('type', 'ref' if '$ref' in d else 'unknown')
            print(f"  {p}: {t}")
            if t == 'object' and 'properties' in d:
                for sub_p in d['properties']:
                    print(f"    -> {sub_p}")
