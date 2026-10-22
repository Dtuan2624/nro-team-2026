package nro.models.combine;

import nro.models.consts.ConstNpc;
import nro.models.item.Item;
import java.util.ArrayList;
import java.util.List;
import nro.models.player.Player;
import nro.models.services.InventoryService;
import nro.models.services.ItemService;
import nro.models.services.Service;
import nro.models.utils.Util;


/**
 *
 * @author MrBlue
 */
public class TaiTaoCapsuleKichHoatThuong {

    private static final int GOLD_TAI_TAO = 1_000_000_000;
    private static final int RATIO_TAI_TAO = 100;

    private static final int NGOC_RONG_1S = 14;
    private static final int ITEM_REWARD_ID = 1559;

    private static final int SO_DO_THAN_LINH_CAN = 3;

    // Hàm kiểm tra trang bị Thần Linh
    private static boolean isDoThanLinh(Item item) {
        if (item == null || item.template == null) {
            return false;
        }

        int id = item.template.id;
        return id >= 555 && id <= 567;
    }

    public static void showInfoCombine(Player player) {
    if (player.combineNew.itemsCombine.isEmpty()) {
        CombineService.gI().baHatMit.createOtherMenu(
                player,
                ConstNpc.IGNORE_MENU,
                "Cần đặt đủ vật phẩm!",
                "Đóng"
        );
        return;
    }

    int countDoThanLinh = 0;
    Item doThanLinh = null;

    for (Item item : player.combineNew.itemsCombine) {
        if (isDoThanLinh(item)) {
            countDoThanLinh++;

            if (doThanLinh == null) {
                doThanLinh = item;
            }
        }
    }

    if (countDoThanLinh < SO_DO_THAN_LINH_CAN) {
        CombineService.gI().baHatMit.createOtherMenu(
                player,
                ConstNpc.IGNORE_MENU,
                "Thiếu vật phẩm cần thiết!\n"
                + "- Cần: " + SO_DO_THAN_LINH_CAN + " Trang bị Thần Linh\n"
                + "- Đã có: " + countDoThanLinh + " Trang bị Thần Linh",
                "Đóng"
        );
        return;
    }

    player.combineNew.goldCombine = GOLD_TAI_TAO;
    player.combineNew.ratioCombine = RATIO_TAI_TAO;

    String npcSay = "|2|Tỉ lệ thành công: " + RATIO_TAI_TAO + "%\n"
            + "|2|Cần: " + SO_DO_THAN_LINH_CAN + " Trang bị Thần Linh\n"
            + "|2|Cần: " + Util.numberToMoney(GOLD_TAI_TAO) + " vàng\n";

    if (player.inventory.gold < GOLD_TAI_TAO) {
        npcSay += "|7|Còn thiếu "
                + Util.powerToString(GOLD_TAI_TAO - player.inventory.gold)
                + " vàng\n";

        CombineService.gI().baHatMit.createOtherMenu(
                player,
                ConstNpc.IGNORE_MENU,
                npcSay,
                "Đóng"
        );
    } else {
        CombineService.gI().baHatMit.createOtherMenu(
                player,
                ConstNpc.MENU_START_COMBINE,
                npcSay,
                "Nâng set\nkích hoạt\n"
                        + Util.numberToMoney(GOLD_TAI_TAO) + " vàng",
                "Từ chối"
        );
    }
}

    public static void thucHienTaiTao(Player player) {
    if (player.combineNew.itemsCombine.isEmpty()) {
        Service.gI().sendThongBao(player, "Cần đặt đủ vật phẩm");
        return;
    }

    List<Item> doThanLinhList = new ArrayList<>();

    for (Item item : player.combineNew.itemsCombine) {
        if (isDoThanLinh(item)) {
            doThanLinhList.add(item);
        }
    }

    if (doThanLinhList.size() < SO_DO_THAN_LINH_CAN) {
        Service.gI().sendThongBao(
                player,
                "Cần " + SO_DO_THAN_LINH_CAN
                + " trang bị Thần Linh!"
        );
        return;
    }

    if (player.inventory.gold < GOLD_TAI_TAO) {
        Service.gI().sendThongBao(
                player,
                "Không đủ vàng để thực hiện!"
        );
        return;
    }

    // Lấy thông tin từ item đầu tiên để xác định type
    Item doThanLinh = doThanLinhList.get(0);

    int type = doThanLinh.template.type;

    if (type > 4) {
        type = 4;
    }

    // Trừ vàng
    player.inventory.gold -= GOLD_TAI_TAO;

    // Trừ 3 đồ Thần Linh
    for (int i = 0; i < SO_DO_THAN_LINH_CAN; i++) {
        InventoryService.gI().subQuantityItemsBag(
                player,
                doThanLinhList.get(i),
                1
        );
    }

    if (Util.isTrue(RATIO_TAI_TAO, 100)) {

        int gender = player.gender;

        if (gender > 2) {
            gender = 2;
        }

        int[][][] itemIds = {
            {{0}, {6}, {21}, {27}, {12}},
            {{1}, {7}, {22}, {28}, {12}},
            {{2}, {8}, {23}, {29}, {12}}
        };

        int[][] optionIds = {
            {128, 129, 127, 233, 245},
            {130, 131, 132, 233, 237},
            {133, 135, 134, 233, 241}
        };

        int itemId = itemIds[gender][type][0];

        int optionRandom = optionIds[gender][
                Util.nextInt(optionIds[gender].length)
        ];

        Item newItem = ItemService.gI().createItemSKH(
                itemId,
                optionRandom
        );

        InventoryService.gI().addItemBag(player, newItem);

        CombineService.gI().sendEffectSuccessCombine(player);

        Service.gI().sendThongBao(
                player,
                "Nâng cấp thành công"
        );

    } else {

        CombineService.gI().sendEffectFailCombine(player);

        Service.gI().sendThongBao(
                player,
                "Nâng cấp thất bại"
        );
    }

    InventoryService.gI().sendItemBags(player);
    Service.gI().sendMoney(player);
    CombineService.gI().reOpenItemCombine(player);
}
}
