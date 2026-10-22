package nro.models.boss.Baby;

import java.util.List;
import nro.models.consts.ConstPlayer;
import nro.models.boss.Boss;
import nro.models.boss.BossesData;
import nro.models.boss.BossID;
import nro.models.item.Item;
import nro.models.map.ItemMap;
import nro.models.player.Player;
import nro.models.services.EffectSkillService;
import nro.models.services.ItemService;
import nro.models.services.Service;
import nro.models.services.SkillService;
import nro.models.utils.Util;

public class Baby extends Boss {

    public Baby() throws Exception {
        super(BossID.BABY, BossesData.BABY, BossesData.BABY_2, BossesData.BABY_3);
    }

    @Override
    public void reward(Player plKill) {
        int x = this.location.x; // đâyyyy
        int y = this.zone.map.yPhysicInTop(x, this.location.y - 24);
        int drop = 457; // 100% rơi item ID 190
        int quantity = Util.nextInt(1, 10);
        // Tạo itemMap cho item ID 190
        if (Util.isTrue(20, 100)) {
            ItemMap it = ItemService.gI().randDoTLBoss(this.zone, 1, x, y, plKill.id);
            if (it != null) {
                Service.gI().dropItemMap(zone, it);
            }
        }
        plKill.bossBabyDefeatParticipationCount++;
        if (Util.isTrue(1, 100)) {
            int[] costumes = {1785, 1786, 1788};
            int costumeId = costumes[Util.nextInt(costumes.length)];

            ItemMap itemMap = new ItemMap(this.zone, costumeId, 1, x, y, plKill.id);

            itemMap.options.add(new Item.ItemOption(50, Util.nextInt(30, 40)));
            itemMap.options.add(new Item.ItemOption(77, Util.nextInt(30, 40)));
            itemMap.options.add(new Item.ItemOption(103, Util.nextInt(30, 40)));
            itemMap.options.add(new Item.ItemOption(94, Util.nextInt(10, 20)));
            itemMap.options.add(new Item.ItemOption(5, Util.nextInt(10, 20)));
            itemMap.options.add(new Item.ItemOption(204, Util.nextInt(10, 20)));
            itemMap.options.add(new Item.ItemOption(30, 0));
            itemMap.options.add(new Item.ItemOption(93, Util.nextInt(2, 5)));

            Service.gI().dropItemMap(this.zone, itemMap);
        }
        ItemMap itemMap = new ItemMap(this.zone, drop, quantity, x, y, plKill.id);
        Item item = ItemService.gI().createNewItem((short) drop);
        Service.gI().dropItemMap(zone, itemMap);
        // 30% xác suất để rơi đồ
        if (Util.isTrue(30, 100)) {
            ItemMap optionalItemMap = ItemService.gI().randDoShopBoss(this.zone, x, y, plKill.id);
            // Drop vật phẩm tùy chọn xuống bản đồ
            Service.gI().dropItemMap(zone, optionalItemMap);
        }
        // 80% xác suất rơi ngọc rồng
        if (Util.isTrue(10, 100)) {
            int[] dropItems = {15, 16, 17, 18, 19, 20, 992};
            int dropOptional = dropItems[Util.nextInt(0, dropItems.length - 1)];
            // Tạo và rơi vật phẩm ngọc rồng hoặc item cấp 2
            ItemMap optionalItemMap = new ItemMap(this.zone, dropOptional, Util.nextInt(1, 3), x, y, plKill.id);
            Item optionalItem = ItemService.gI().createNewItem((short) dropOptional);
            Service.gI().dropItemMap(zone, optionalItemMap);
        }
    }

    @Override
    public void active() {
        if (this.typePk == ConstPlayer.NON_PK) {
            this.changeToTypePK();
        }
        this.attack();
    }

    @Override
    public synchronized int injured(Player plAtt, long damage, boolean piercing, boolean isMobAttack
    ) {
        if (!this.isDie()) {
            if (!piercing && Util.isTrue(this.nPoint.tlNeDon, 1000)) {
                this.chat("Xí hụt");
                return 0;
            }

            damage = (long) (damage * 0.7);

            damage = this.nPoint.subDameInjureWithDeff(damage / 2);

            if (!piercing && effectSkill.isShielding) {
                if (damage > nPoint.hpMax) {
                    EffectSkillService.gI().breakShield(this);
                }
                damage = damage / 4;
            }

            this.nPoint.subHP(damage);

            if (isDie()) {
                this.setDie(plAtt);
                die(plAtt);
            }
            return (int) damage;
        } else {
            return 0;
        }
    }

}
