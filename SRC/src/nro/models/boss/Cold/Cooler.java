package nro.models.boss.Cold;


import nro.models.boss.Boss;
import nro.models.boss.BossID;
import nro.models.boss.BossesData;
import nro.models.item.Item;
import java.util.List;
import nro.models.map.ItemMap;
import nro.models.player.Player;
import nro.models.services.EffectSkillService;
import nro.models.services.Service;
import nro.models.utils.Util;

import java.util.Random;
import nro.models.consts.ConstTaskBadges;
import nro.models.services.ItemService;
import nro.models.services.TaskService;
import nro.models.task.BadgesTaskService;

public class Cooler extends Boss {

    private long st;

    public Cooler() throws Exception {
        super(BossID.COOLER, BossesData.COOLER, BossesData.COOLER_2);
    }

    @Override
    public void reward(Player plKill) {
        BadgesTaskService.updateCountBagesTask(plKill, ConstTaskBadges.TRUM_SAN_BOSS, 1);
        int diem = 1;
        plKill.event.addEventPoint(diem);
        Service.gI().sendThongBao(plKill, "+1 Point");
        int x = this.location.x;
        int y = this.zone.map.yPhysicInTop(x, this.location.y - 24);
        int drop = 457; // 100% rơi item ID 190
        int quantity = Util.nextInt(1, 10);
        // Tạo itemMap cho item ID 190
        if (Util.isTrue(20 , 100)) {
        ItemMap it = ItemService.gI().randDoTLBoss(this.zone, 1, x, y, plKill.id);
        if (it != null) {
        Service.gI().dropItemMap(zone, it);
        }
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
        if (Util.isTrue(80, 100)) {
            int[] dropItems = {15,16,17,18,19,20};
            int dropOptional = dropItems[Util.nextInt(0, dropItems.length - 1)];
            // Tạo và rơi vật phẩm ngọc rồng hoặc item cấp 2
            ItemMap optionalItemMap = new ItemMap(this.zone, dropOptional, Util.nextInt(1, 3), x, y, plKill.id);
            Item optionalItem = ItemService.gI().createNewItem((short) dropOptional);
            Service.gI().dropItemMap(zone, optionalItemMap);
        }
    }

    @Override
    public synchronized int injured(Player plAtt, long damage, boolean piercing, boolean isMobAttack) {
        if (!this.isDie()) {
            if (Util.isTrue(10, 1000)) {
                this.chat("Xí hụt");
                return 0;
            }
            damage = this.nPoint.subDameInjureWithDeff(damage);
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

    @Override
    public void joinMap() {
        super.joinMap();
        st = System.currentTimeMillis();
//        System.out.println("Cooler join map" + this.zone.map.mapId + " Zone: " + this.zone.zoneId);
    }

    @Override
    public void autoLeaveMap() {
        if (Util.canDoWithTime(st, 900000)) {
            this.leaveMapNew();
        }
        if (this.zone != null && this.zone.getNumOfPlayers() > 0) {
            st = System.currentTimeMillis();
        }
    }

}
