import os
import re

boss_dir = r"d:\Downloads\src_nr\Teamobi2026\SRC\src\nro\models\boss"

pattern = re.compile(r"int\s+group\s*=\s*Util\.nextInt\(1,\s*100\)\s*<=\s*70\s*\?\s*0\s*:\s*1;\s*//\s*70%.*?optionalItemMap\.options\.add\(new\s+Item\.ItemOption\(107,\s*value\)\);", re.DOTALL)

for root, _, files in os.walk(boss_dir):
    for f in files:
        if f.endswith(".java"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            if pattern.search(content):
                replacement = "ItemMap optionalItemMap = ItemService.gI().randDoShopBoss(this.zone, x, y, plKill.id);"
                new_content = pattern.sub(replacement, content)
                with open(path, "w", encoding="utf-8") as file:
                    file.write(new_content)
                print(f"Updated {f}")
