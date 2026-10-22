package nro.models.boss.MajinBuu_12h;


import nro.models.boss.Boss;
import nro.models.boss.BossID;
import nro.models.consts.BossStatus;
import nro.models.boss.BossesData;
import nro.models.consts.AppearType;
import static nro.models.consts.BossType.FINAL;
import nro.models.item.Item;
import java.util.List;
import nro.models.map.ItemMap;
import nro.models.player.Player;
import nro.models.services.EffectSkillService;
import nro.models.services.ItemService;
import nro.models.services.Service;
import nro.models.utils.Util;
import nro.models.services.TaskService;
import nro.models.map.service.ChangeMapService;
import nro.models.skill.Skill;

public class Drabura2 extends Boss {

    private boolean callBoss = true;

    private long lastTimeJoin;

    public Drabura2() throws Exception {
        super(FINAL, BossID.DRABURA_2, BossesData.DRABURA_2);
    }

    @Override
    public void joinMap() {
        if (zoneFinal != null) {
            this.zone = zoneFinal;
        }
        this.lastTimeJoin = System.currentTimeMillis();
        this.callBoss = false;
        ChangeMapService.gI().changeMap(this, this.zone, Util.nextInt(300, 400), 336);
        this.changeStatus(BossStatus.CHAT_S);
    }

    @Override
    public void reward(Player plKill) {
        // int diem = 5;
        // plKill.event.addEventPoint(diem);
        // Service.gI().sendThongBao(plKill, "+5 Point");
        int x = this.location.x; // đâyyyy
        int y = this.zone.map.yPhysicInTop(x, this.location.y - 24);
        int drop = 190; // 100% rơi item ID 190
        int quantity = Util.nextInt(20000, 30000);
        // Tạo itemMap cho item ID 190
        if (Util.isTrue(1 , 100)) {
        ItemMap it = ItemService.gI().randDoTLBoss(this.zone, 1, x, y, plKill.id);
        if (it != null) {
        Service.gI().dropItemMap(zone, it);
        }
        }
        ItemMap itemMap = new ItemMap(this.zone, drop, quantity, x, y, plKill.id);
        Item item = ItemService.gI().createNewItem((short) drop);
        Service.gI().dropItemMap(zone, itemMap);
        // 30% xác suất để rơi đồ
        if (Util.isTrue(1, 100)) {
            ItemMap optionalItemMap = ItemService.gI().randDoShopBoss(this.zone, x, y, plKill.id);
            // Drop vật phẩm tùy chọn xuống bản đồ
            Service.gI().dropItemMap(zone, optionalItemMap);
        }
        // 80% xác suất rơi ngọc rồng
        if (Util.isTrue(10, 100)) {
            int[] dropItems = {15,16,17,18,19,20};
            int dropOptional = dropItems[Util.nextInt(0, dropItems.length - 1)];
            // Tạo và rơi vật phẩm ngọc rồng hoặc item cấp 2
            ItemMap optionalItemMap = new ItemMap(this.zone, dropOptional, Util.nextInt(1, 3), x, y, plKill.id);
            Item optionalItem = ItemService.gI().createNewItem((short) dropOptional);
            Service.gI().dropItemMap(zone, optionalItemMap);
        }
        plKill.fightMabu.changePoint((byte) 10);
        TaskService.gI().checkDoneTaskKillBoss(plKill, this);
    }

    @Override
    public synchronized int injured(Player plAtt, long damage, boolean piercing, boolean isMobAttack) {
        if (!this.isDie()) {
            if (!piercing && Util.isTrue(200, 1000)) {
                this.chat("Xí hụt");
                return 0;
            }

            if (plAtt != null) {
                switch (plAtt.playerSkill.skillSelect.template.id) {
                    case Skill.KAMEJOKO:
                    case Skill.MASENKO:
                    case Skill.ANTOMIC:
                    case Skill.LIEN_HOAN:
                        return 0;
                }
            }

            if (plAtt.isPl() && Util.isTrue(1, 5)) {
                plAtt.fightMabu.changePercentPoint((byte) 1);
            }
            if (damage >= 20000000) {
                damage = 20000000;
            }

            if (damage >= this.nPoint.hp) {
                this.changeStatus(BossStatus.AFK);
                damage = 0;
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

    @Override
    public void rest() {
        int nextLevel = this.currentLevel + 1;
        if (nextLevel >= this.data.length) {
            nextLevel = 0;
        }
        if (this.data[nextLevel].getTypeAppear() == AppearType.DEFAULT_APPEAR
                && Util.canDoWithTime(lastTimeRest, secondsRest * 1000)) {
            this.changeStatus(BossStatus.RESPAWN);
        }

        if (Util.canDoWithTime(lastTimeRest, 5000)) {
            if (!this.callBoss) {
                for (Boss boss : this.bossAppearTogether[this.currentLevel]) {
                    boss.changeStatus(BossStatus.RESPAWN);
                }
                this.callBoss = true;
            }
        }

    }

    @Override
    public void autoLeaveMap() {
        if (Util.canDoWithTime(this.lastTimeJoin, 250000)) {
            this.leaveMap();
        }
    }

    @Override
    public void afk() {
        this.changeToTypeNonPK();
        this.changeStatus(BossStatus.DIE);
    }

    @Override
    public void leaveMap() {
        ChangeMapService.gI().exitMap(this);
        this.lastZone = null;
        this.lastTimeRest = System.currentTimeMillis();
        this.changeStatus(BossStatus.REST);
    }

}
