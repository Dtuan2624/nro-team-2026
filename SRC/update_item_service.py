import os
import re

file_path = r"d:\Downloads\src_nr\Teamobi2026\SRC\src\nro\models\services\ItemService.java"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_method = """
    public ItemMap randDoShopBoss(nro.models.map.Zone zone, int x, int y, long plKillId) {
        int group = nro.models.utils.Util.nextInt(1, 100) <= 70 ? 0 : 1;
        int[][] drops = {
            {230, 231, 232, 234, 235, 236, 238, 239, 240, 242, 243, 244, 246, 247, 248, 250, 251, 252, 266, 267, 268, 270, 271, 272, 274, 275, 276},
            {254, 255, 256, 258, 259, 260, 262, 263, 264, 278, 279, 280}
        };
        int dropOptional = drops[group][nro.models.utils.Util.nextInt(0, drops[group].length - 1)];
        nro.models.map.ItemMap optionalItemMap = new nro.models.map.ItemMap(zone, dropOptional, 1, x, y, plKillId);
        java.util.List<nro.models.item.Item.ItemOption> optionalOps = ItemService.gI().getListOptionItemShop((short) dropOptional);
        optionalOps.forEach(option -> option.param = (int) (option.param * nro.models.utils.Util.nextInt(100, 115) / 100.0));
        optionalItemMap.options.addAll(optionalOps);
        int rand = nro.models.utils.Util.nextInt(1, 100);
        int value = 0;
        if (rand <= 80) {
            value = nro.models.utils.Util.nextInt(1, 3);
        } else if (rand <= 97) {
            value = nro.models.utils.Util.nextInt(4, 5);
        } else {
            value = 6;
        }
        optionalItemMap.options.add(new nro.models.item.Item.ItemOption(107, value));
        return optionalItemMap;
    }
"""

if "randDoShopBoss" not in content:
    content = content.replace("public static ItemService gI() {", new_method + "\n    public static ItemService gI() {")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added randDoShopBoss to ItemService.")
else:
    print("randDoShopBoss already exists.")
