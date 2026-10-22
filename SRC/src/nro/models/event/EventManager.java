package nro.models.event;

import nro.models.event_list.TopUp;
import nro.models.event_list.TrungThu;
import nro.models.event_list.HungVuong;
import nro.models.event_list.Christmas;
import nro.models.event_list.Halloween;
import nro.models.event_list.LunarNewYear;
import nro.models.event_list.Default;
import nro.models.event_list.InternationalWomensDay;
import nro.models.boss.Boss;
import nro.models.boss.BossID;
import nro.models.boss.Boss_Manager.BossManager;
import nro.models.boss.Boss_Manager.ChristmasEventManager;
import nro.models.boss.Boss_Manager.HalloweenEventManager;
import nro.models.boss.Boss_Manager.HungVuongEventManager;
import nro.models.boss.Boss_Manager.LunarNewYearEventManager;
import nro.models.boss.Boss_Manager.TrungThuEventManager;
import nro.models.map.Zone;
import nro.models.npc.Npc;
import nro.models.server.Manager;
import java.util.ArrayList;
import java.util.List;

public class EventManager {

    private static EventManager instance;

    public static boolean LUNNAR_NEW_YEAR = false;

    public static boolean INTERNATIONAL_WOMANS_DAY = false;

    public static boolean CHRISTMAS = false;

    public static boolean HALLOWEEN = false;

    public static boolean HUNG_VUONG = false;

    public static boolean TRUNG_THU = false;

    public static boolean TOP_UP = true;

    public static EventManager gI() {
        if (instance == null) {
            instance = new EventManager();
        }
        return instance;
    }

    public void init() {
        new Default().init();
                if (LUNNAR_NEW_YEAR) new LunarNewYear().init();
                if (HALLOWEEN) new Halloween().init();
                if (CHRISTMAS) new Christmas().init();
        if (HUNG_VUONG) {
            new HungVuong().init();
        }
          if (TRUNG_THU) new TrungThu().init();
        if (TOP_UP) {
            new TopUp().init();
        }
    }

    public synchronized boolean isEnabled(String eventId) {
        return switch (eventId) {
            case "lunar_new_year" -> LUNNAR_NEW_YEAR;
            case "halloween" -> HALLOWEEN;
            case "christmas" -> CHRISTMAS;
            case "hung_vuong" -> HUNG_VUONG;
            case "trung_thu" -> TRUNG_THU;
            default -> false;
        };
    }

    public synchronized boolean setEnabled(String eventId, boolean enabled) {
        if (isEnabled(eventId) == enabled) return enabled;
        if (enabled) {
            switch (eventId) {
                case "lunar_new_year" -> new LunarNewYear().init();
                case "halloween" -> new Halloween().init();
                case "christmas" -> new Christmas().init();
                case "hung_vuong" -> new HungVuong().init();
                case "trung_thu" -> new TrungThu().init();
                default -> throw new IllegalArgumentException("Event chưa hỗ trợ");
            }
        } else {
            cleanupEvent(eventId);
        }
        setFlag(eventId, enabled);
        return enabled;
    }

    private void setFlag(String eventId, boolean enabled) {
        switch (eventId) {
            case "lunar_new_year" -> LUNNAR_NEW_YEAR = enabled;
            case "halloween" -> HALLOWEEN = enabled;
            case "christmas" -> CHRISTMAS = enabled;
            case "hung_vuong" -> HUNG_VUONG = enabled;
            case "trung_thu" -> TRUNG_THU = enabled;
        }
    }

    private void cleanupEvent(String eventId) {
        BossManager manager;
        int[] bossIds;
        switch (eventId) {
            case "lunar_new_year" -> {
                manager = LunarNewYearEventManager.gI();
                bossIds = new int[]{BossID.LAN_CON};
                removeLunarNewYearNpc();
            }
            case "halloween" -> {
                manager = HalloweenEventManager.gI();
                bossIds = new int[]{BossID.BIMA, BossID.MATROI, BossID.DOI};
            }
            case "christmas" -> {
                manager = ChristmasEventManager.gI();
                bossIds = new int[]{BossID.ONG_GIA_NOEL};
            }
            case "hung_vuong" -> {
                manager = HungVuongEventManager.gI();
                bossIds = new int[]{BossID.SON_TINH, BossID.THUY_TINH};
            }
            case "trung_thu" -> {
                manager = TrungThuEventManager.gI();
                bossIds = new int[]{BossID.KHIDOT, BossID.NGUYETTHAN, BossID.NHATTHAN};
            }
            default -> throw new IllegalArgumentException("Event chưa hỗ trợ");
        }
        List<Boss> snapshot = new ArrayList<>(manager.getBosses());
        for (Boss boss : snapshot) {
            if (boss != null && contains(bossIds, boss.id)) {
                if (boss.zone != null) {
                    boss.currentLevel = Math.max(0, boss.data.length - 1);
                    boss.leaveMap();
                }
                manager.removeBoss(boss);
            }
        }
    }

    private void removeLunarNewYearNpc() {
        if (Manager.MAPS == null || Manager.MAPS.isEmpty()) return;
        List<Npc> npcs = new ArrayList<>(Manager.MAPS.get(0).npcs);
        for (Npc npc : npcs) {
            if (npc.tempId == 49 && npc.cx == 850 && npc.cy == 432) {
                Manager.MAPS.get(0).npcs.remove(npc);
                Manager.NPCS.remove(npc);
            }
        }
    }

    private boolean contains(int[] values, long target) {
        for (int value : values) if (value == target) return true;
        return false;
    }
}
