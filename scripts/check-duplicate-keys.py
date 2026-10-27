import yaml

class UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        mapping = set()
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                print(f'DUPLICATE KEY: "{key}" at line {key_node.start_mark.line + 1}')
            mapping.add(key)
        return super().construct_mapping(node, deep=deep)

print("Checking atracciones-openapi-v3.yaml for duplicate keys...")
with open('contracts/atracciones-openapi-v3.yaml', 'r', encoding='utf-8') as f:
    yaml.load(f, Loader=UniqueKeyLoader)
print("Finished checking!")
