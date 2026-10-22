package nro.models.npc_list;

import nro.models.consts.ConstNpc;
import nro.models.database.PlayerDAO;
import nro.models.item.Item;
import nro.models.map.service.NpcService;
import nro.models.npc.Npc;
import nro.models.player.Player;
import nro.models.services.InventoryService;
import nro.models.services.ItemService;
import nro.models.services.PetService;
import nro.models.services.Service;
import nro.models.services.TaskService;
import nro.models.services_func.Input;
import nro.models.shop.ShopService;
import nro.models.utils.Util;

public class OngGohan extends Npc {

    private static final int MEMBER_COST_VND = 20_000;

    public OngGohan(int mapId, int status, int cx, int cy, int tempId, int avartar) {
        super(mapId, status, cx, cy, tempId, avartar);
    }

    @Override
    public void openBaseMenu(Player player) {
        if (canOpenNpc(player)) {
            if (!TaskService.gI().checkDoneTaskTalkNpc(player, this)) {
                createMemberMenu(player, "Con cố gắng theo Quy Lão Kame học thành tài, đừng lo lắng cho ta.");
            }
        }
    }

    @Override
    public void confirmMenu(Player player, int select) {
        if (canOpenNpc(player)) {
            if (player.idMark.isBaseMenu()) {
                handleMemberMenu(player, select);
            }
        }
    }

    protected void createMemberMenu(Player player, String npcSay) {
        if (player.getSession().actived) {
            createOtherMenu(player, ConstNpc.BASE_MENU, npcSay,
                    "Đổi ngọc xanh sang hồng ngọc", "Đóng");
        } else {
            createOtherMenu(player, ConstNpc.BASE_MENU, npcSay,
                    "Mở thành viên (20.000 VND)", "Mở miễn phí (hoàn thành nhiệm vụ 19)",
                    "Đổi ngọc xanh sang hồng ngọc", "Đóng");
        }
    }

    protected void handleMemberMenu(Player player, int select) {
        if (player.getSession().actived) {
            if (select == 0) {
                Input.gI().createFormConvertGemToRuby(player);
            }
            return;
        }

        switch (select) {
            case 0 -> {
                if (player.getSession().vnd < MEMBER_COST_VND) {
                    Service.gI().sendThongBao(player, "Tài khoản cần có 20.000 VND để mở thành viên.");
                } else if (PlayerDAO.MuaThanhVien(player, MEMBER_COST_VND)) {
                    Service.gI().sendMoney(player);
                    Service.gI().sendThongBao(player, "Mở thành viên thành công.");
                } else {
                    Service.gI().sendThongBao(player, "Không thể mở thành viên, vui lòng thử lại.");
                }
            }
            case 1 -> {
                if (player.playerTask == null || player.playerTask.taskMain == null
                        || player.playerTask.taskMain.id <= 19) {
                    Service.gI().sendThongBao(player, "Bạn cần hoàn thành nhiệm vụ 19 để mở thành viên miễn phí.");
                } else if (PlayerDAO.KichHoatThanhVien(player)) {
                    Service.gI().sendThongBao(player, "Mở thành viên miễn phí thành công.");
                } else {
                    Service.gI().sendThongBao(player, "Không thể mở thành viên, vui lòng thử lại.");
                }
            }
            case 2 -> Input.gI().createFormConvertGemToRuby(player);
        }
    }
}
