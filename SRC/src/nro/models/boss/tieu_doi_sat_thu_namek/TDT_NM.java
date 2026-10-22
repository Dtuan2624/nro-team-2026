package nro.models.boss.tieu_doi_sat_thu_namek;

import nro.models.boss.Boss;
import nro.models.boss.BossID;
import nro.models.consts.BossStatus;
import java.util.List;
import nro.models.boss.BossesData;
import nro.models.item.Item;
import nro.models.map.ItemMap;
import nro.models.player.Player;
import nro.models.services.ItemService;
import nro.models.services.Service;
import nro.models.utils.Util;

public class TDT_NM extends Boss {

    private long st;

    public TDT_NM() throws Exception {
        super(BossID.TIEU_DOI_TRUONG_NM, false, true, BossesData.TIEU_DOI_TRUONG_NM);
    }

    @Override
    public void moveTo(int x, int y) {
        if (this.currentLevel == 1) {
            return;
        }
        super.moveTo(x, y);
    }

    @Override
    public void reward(Player plKill) {
        short thoivang = 457;
        ItemMap thoivangItem = new ItemMap(zone, thoivang,Util.nextInt(1, 5), this.location.x + Util.nextInt(-50, 50), this.zone.map.yPhysicInTop(this.location.x, this.location.y - 24), plKill.id);
        thoivangItem.options.add(new Item.ItemOption(73,0));
        Service.gI().dropItemMap(this.zone, thoivangItem); 
        short itTemp = 433;
        short nr6s = 19;
        short nr7s = 20;
        ItemMap it = new ItemMap(zone, itTemp, 1, this.location.x + Util.nextInt(-50, 50), this.zone.map.yPhysicInTop(this.location.x, this.location.y - 24), plKill.id);
        ItemMap it1 = new ItemMap(zone, nr6s, 1, this.location.x + Util.nextInt(-50, 50), this.zone.map.yPhysicInTop(this.location.x, this.location.y - 24), plKill.id);
        ItemMap it2 = new ItemMap(zone, nr7s, 1, this.location.x + Util.nextInt(-50, 50), this.zone.map.yPhysicInTop(this.location.x, this.location.y - 24), plKill.id);

        List<Item.ItemOption> ops = ItemService.gI().getListOptionItemShop(itTemp);
        if (!ops.isEmpty()) {
            it.options = ops;
        }
        Service.gI().dropItemMap(this.zone, it);
        Service.gI().dropItemMap(this.zone, it1);
        Service.gI().dropItemMap(this.zone, it2);
        // int diem = 5;
        // plKill.event.addEventPoint(diem);
        // Service.gI().sendThongBao(plKill, "+5 Point");
    }

    @Override
    protected void notifyJoinMap() {
        if (this.currentLevel == 1) {
            return;
        }
        super.notifyJoinMap();
    }

    @Override
    public void joinMap() {
        super.joinMap();
        st = System.currentTimeMillis();
    }

    @Override
    public void doneChatS() {
        this.changeStatus(BossStatus.AFK);
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
