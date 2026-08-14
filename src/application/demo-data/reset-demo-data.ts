import { hashPassword } from "better-auth/crypto";

import type {
  PaymentMethod,
  PrismaClient,
  ReceivableStatus,
  RoleCode,
  SalesOrderStatus,
} from "../../generated/prisma/client";
import {
  addUtcCalendarDays,
  formatChinaCalendarDate,
  parseCalendarDate,
  utcCalendarDateString,
} from "../../lib/china-calendar";

const demoPassword = "demo123456";

const accounts: Array<{
  id: string;
  name: string;
  email: string;
  roles: RoleCode[];
}> = [
  { id: "demo-user-owner", name: "张伟", email: "owner@example.local", roles: ["OWNER"] },
  { id: "demo-user-sales", name: "陈敏", email: "sales@example.local", roles: ["SALES"] },
  { id: "demo-user-warehouse", name: "王强", email: "warehouse@example.local", roles: ["WAREHOUSE"] },
  { id: "demo-user-finance", name: "刘芳", email: "finance@example.local", roles: ["FINANCE"] },
  { id: "demo-user-multi", name: "赵磊", email: "multi@example.local", roles: ["SALES", "WAREHOUSE"] },
];

type SkuBlueprint = {
  skuCode: string;
  name: string;
  category: string;
  inventoryUnit: string;
  referencePriceFen: number;
  warningThreshold: number;
  openingOnHandQuantity: number;
};

const skus: SkuBlueprint[] = [
  { skuCode: "WJ-LS-001", name: "304 不锈钢六角螺栓 M8×30", category: "紧固件", inventoryUnit: "盒", referencePriceFen: 4_850, warningThreshold: 5, openingOnHandQuantity: 12 },
  { skuCode: "WJ-QP-002", name: "树脂切割片 105mm", category: "切削耗材", inventoryUnit: "片", referencePriceFen: 380, warningThreshold: 6, openingOnHandQuantity: 6 },
  { skuCode: "WJ-ZT-003", name: "高速钢直柄麻花钻 8mm", category: "钻削工具", inventoryUnit: "支", referencePriceFen: 1_890, warningThreshold: 5, openingOnHandQuantity: 3 },
  { skuCode: "WJ-BS-004", name: "镀锌扁头自攻螺丝 M4", category: "紧固件", inventoryUnit: "盒", referencePriceFen: 1_590, warningThreshold: 5, openingOnHandQuantity: 10 },
  { skuCode: "WJ-JD-005", name: "绝缘电工胶带 黑色", category: "电工耗材", inventoryUnit: "卷", referencePriceFen: 580, warningThreshold: 2, openingOnHandQuantity: 0 },
  { skuCode: "WJ-LM-006", name: "尼龙膨胀螺栓 M8", category: "紧固件", inventoryUnit: "包", referencePriceFen: 1_280, warningThreshold: 8, openingOnHandQuantity: 60 },
  { skuCode: "WJ-BS-007", name: "不锈钢抱箍 32mm", category: "管件", inventoryUnit: "个", referencePriceFen: 650, warningThreshold: 8, openingOnHandQuantity: 40 },
  { skuCode: "WJ-QS-008", name: "强力砂纸 240 目", category: "研磨耗材", inventoryUnit: "张", referencePriceFen: 120, warningThreshold: 20, openingOnHandQuantity: 40 },
  { skuCode: "WJ-MP-009", name: "百叶磨片 100mm", category: "研磨耗材", inventoryUnit: "片", referencePriceFen: 850, warningThreshold: 10, openingOnHandQuantity: 50 },
  { skuCode: "WJ-BS-010", name: "玻璃胶透明 300ml", category: "密封材料", inventoryUnit: "支", referencePriceFen: 7_200, warningThreshold: 10, openingOnHandQuantity: 50 },
  { skuCode: "WJ-GJ-011", name: "高强度结构胶 50ml", category: "胶粘剂", inventoryUnit: "支", referencePriceFen: 1_500, warningThreshold: 8, openingOnHandQuantity: 50 },
  { skuCode: "WJ-DL-012", name: "通用断路器 2P 32A", category: "电工耗材", inventoryUnit: "个", referencePriceFen: 2_600, warningThreshold: 6, openingOnHandQuantity: 50 },
  { skuCode: "WJ-BS-013", name: "活动扳手 10 英寸", category: "手动工具", inventoryUnit: "把", referencePriceFen: 12_500, warningThreshold: 5, openingOnHandQuantity: 50 },
  { skuCode: "WJ-ST-014", name: "生料带 20m", category: "密封材料", inventoryUnit: "卷", referencePriceFen: 980, warningThreshold: 15, openingOnHandQuantity: 50 },
  { skuCode: "WJ-ZJ-015", name: "重型角码 50mm", category: "五金配件", inventoryUnit: "个", referencePriceFen: 4_350, warningThreshold: 8, openingOnHandQuantity: 50 },
  { skuCode: "WJ-KG-016", name: "明装单控开关", category: "电工耗材", inventoryUnit: "个", referencePriceFen: 2_150, warningThreshold: 8, openingOnHandQuantity: 50 },
  { skuCode: "WJ-LD-017", name: "LED 球泡 12W", category: "照明", inventoryUnit: "只", referencePriceFen: 1_150, warningThreshold: 10, openingOnHandQuantity: 50 },
  { skuCode: "WJ-SL-018", name: "塑料扎带 4×200mm", category: "五金配件", inventoryUnit: "包", referencePriceFen: 3_900, warningThreshold: 12, openingOnHandQuantity: 50 },
  { skuCode: "WJ-FH-019", name: "防护眼镜透明款", category: "劳保用品", inventoryUnit: "副", referencePriceFen: 5_250, warningThreshold: 6, openingOnHandQuantity: 50 },
  { skuCode: "WJ-ST-020", name: "丁腈涂层手套", category: "劳保用品", inventoryUnit: "双", referencePriceFen: 1_750, warningThreshold: 10, openingOnHandQuantity: 50 },
  { skuCode: "WJ-GG-021", name: "镀锌钢管卡 25mm", category: "管件", inventoryUnit: "个", referencePriceFen: 680, warningThreshold: 10, openingOnHandQuantity: 40 },
  { skuCode: "WJ-DX-022", name: "阻燃电线 2.5mm²", category: "电工耗材", inventoryUnit: "卷", referencePriceFen: 18_900, warningThreshold: 5, openingOnHandQuantity: 40 },
  { skuCode: "WJ-GP-023", name: "PVC 给水管 20mm", category: "管件", inventoryUnit: "根", referencePriceFen: 1_450, warningThreshold: 10, openingOnHandQuantity: 40 },
  { skuCode: "WJ-ML-024", name: "木工锯片 7 英寸", category: "切削耗材", inventoryUnit: "片", referencePriceFen: 9_800, warningThreshold: 5, openingOnHandQuantity: 40 },
  { skuCode: "WJ-TC-025", name: "陶瓷钻头 6mm", category: "钻削工具", inventoryUnit: "支", referencePriceFen: 2_350, warningThreshold: 8, openingOnHandQuantity: 40 },
  { skuCode: "WJ-HJ-026", name: "焊锡丝 0.8mm", category: "焊接耗材", inventoryUnit: "卷", referencePriceFen: 6_600, warningThreshold: 6, openingOnHandQuantity: 40 },
  { skuCode: "WJ-YG-027", name: "液压管卡 16mm", category: "管件", inventoryUnit: "个", referencePriceFen: 920, warningThreshold: 10, openingOnHandQuantity: 40 },
  { skuCode: "WJ-CT-028", name: "磁性十字批头", category: "手动工具", inventoryUnit: "支", referencePriceFen: 780, warningThreshold: 12, openingOnHandQuantity: 40 },
  { skuCode: "WJ-FX-029", name: "防锈润滑剂 450ml", category: "维护耗材", inventoryUnit: "罐", referencePriceFen: 2_900, warningThreshold: 8, openingOnHandQuantity: 40 },
  { skuCode: "WJ-GZ-030", name: "工业擦拭纸", category: "清洁耗材", inventoryUnit: "卷", referencePriceFen: 3_200, warningThreshold: 8, openingOnHandQuantity: 40 },
];

type CustomerBlueprint = {
  customerCode: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  responsibleSalesId: string;
  paymentTermDays: number;
};

const customers: CustomerBlueprint[] = [
  { customerCode: "KH-0001", name: "广顺五金商行", contactName: "李海峰", phone: "138 0000 0001", address: "广东省深圳市宝安区工业路 18 号", responsibleSalesId: "demo-user-sales", paymentTermDays: 30 },
  { customerCode: "KH-0002", name: "华南机电工程部", contactName: "周志成", phone: "138 0000 0002", address: "广东省深圳市龙华区民治大道 27 号", responsibleSalesId: "demo-user-sales", paymentTermDays: 15 },
  { customerCode: "KH-0003", name: "明达设备维修部", contactName: "黄玉兰", phone: "138 0000 0003", address: "广东省东莞市长安镇振安路 66 号", responsibleSalesId: "demo-user-multi", paymentTermDays: 30 },
  { customerCode: "KH-0004", name: "安成装饰材料行", contactName: "孙国强", phone: "138 0000 0004", address: "广东省佛山市禅城区季华路 32 号", responsibleSalesId: "demo-user-multi", paymentTermDays: 7 },
  { customerCode: "KH-0005", name: "鑫源水电安装队", contactName: "马春梅", phone: "138 0000 0005", address: "广东省惠州市惠城区麦地路 19 号", responsibleSalesId: "demo-user-sales", paymentTermDays: 45 },
  { customerCode: "KH-0006", name: "恒泰物业维修中心", contactName: "罗俊", phone: "138 0000 0006", address: "广东省深圳市南山区科技园 8 号", responsibleSalesId: "demo-user-multi", paymentTermDays: 30 },
  { customerCode: "KH-0007", name: "联盛机械加工厂", contactName: "何志勇", phone: "138 0000 0007", address: "广东省东莞市大朗镇富民路 51 号", responsibleSalesId: "demo-user-sales", paymentTermDays: 15 },
  { customerCode: "KH-0008", name: "德康工程服务部", contactName: "姚丽", phone: "138 0000 0008", address: "广东省深圳市龙岗区龙城大道 90 号", responsibleSalesId: "demo-user-multi", paymentTermDays: 0 },
];

type ItemBlueprint = { sku: number; quantity: number; priceFen: number };
type OrderBlueprint = {
  status: SalesOrderStatus;
  terminalDay: number;
  customer: number;
  items: ItemBlueprint[];
};

const orders: OrderBlueprint[] = [
  { status: "DRAFT", terminalDay: 0, customer: 0, items: [{ sku: 2, quantity: 3, priceFen: 1_890 }] },
  { status: "DRAFT", terminalDay: 0, customer: 0, items: [{ sku: 4, quantity: 4, priceFen: 580 }] },
  { status: "DRAFT", terminalDay: -1, customer: 1, items: [{ sku: 9, quantity: 2, priceFen: 7_200 }] },
  { status: "CANCELLED", terminalDay: -3, customer: 2, items: [{ sku: 6, quantity: 2, priceFen: 650 }] },
  { status: "CANCELLED", terminalDay: -8, customer: 3, items: [{ sku: 7, quantity: 3, priceFen: 120 }] },
  { status: "OUTBOUND", terminalDay: -45, customer: 0, items: [{ sku: 8, quantity: 10, priceFen: 850 }] },
  { status: "OUTBOUND", terminalDay: -35, customer: 1, items: [{ sku: 9, quantity: 2, priceFen: 7_200 }] },
  { status: "OUTBOUND", terminalDay: -28, customer: 2, items: [{ sku: 10, quantity: 5, priceFen: 1_500 }] },
  { status: "OUTBOUND", terminalDay: -21, customer: 4, items: [{ sku: 11, quantity: 4, priceFen: 2_600 }] },
  { status: "OUTBOUND", terminalDay: -14, customer: 6, items: [{ sku: 12, quantity: 1, priceFen: 12_500 }] },
  { status: "OUTBOUND", terminalDay: -10, customer: 5, items: [{ sku: 13, quantity: 5, priceFen: 980 }] },
  { status: "OUTBOUND", terminalDay: -7, customer: 2, items: [{ sku: 14, quantity: 2, priceFen: 4_350 }] },
  { status: "OUTBOUND", terminalDay: -5, customer: 4, items: [{ sku: 15, quantity: 3, priceFen: 2_150 }] },
  { status: "OUTBOUND", terminalDay: -2, customer: 0, items: [{ sku: 16, quantity: 6, priceFen: 1_150 }] },
  { status: "OUTBOUND", terminalDay: -1, customer: 5, items: [{ sku: 17, quantity: 2, priceFen: 3_900 }] },
  { status: "OUTBOUND", terminalDay: 0, customer: 0, items: [{ sku: 18, quantity: 2, priceFen: 5_250 }] },
  { status: "OUTBOUND", terminalDay: 0, customer: 2, items: [{ sku: 19, quantity: 4, priceFen: 1_750 }] },
  { status: "CONFIRMED", terminalDay: -2, customer: 0, items: [{ sku: 0, quantity: 3, priceFen: 4_850 }] },
  { status: "CONFIRMED", terminalDay: -1, customer: 0, items: [{ sku: 0, quantity: 4, priceFen: 4_850 }, { sku: 1, quantity: 2, priceFen: 380 }] },
  { status: "CONFIRMED", terminalDay: 0, customer: 4, items: [{ sku: 3, quantity: 5, priceFen: 1_590 }, { sku: 5, quantity: 3, priceFen: 1_280 }] },
];

function orderTotalAmountFen(order: OrderBlueprint): number {
  return order.items.reduce(
    (total, item) => total + item.quantity * item.priceFen,
    0,
  );
}

type PaymentPlan = {
  order: number;
  amountFen: number;
  day: number;
  method: PaymentMethod;
  reversed?: boolean;
};

const payments: PaymentPlan[] = [
  { order: 5, amountFen: 3_000, day: -10, method: "BANK_TRANSFER" },
  { order: 6, amountFen: 7_200, day: -5, method: "WECHAT" },
  { order: 9, amountFen: 12_500, day: -12, method: "BANK_TRANSFER" },
  { order: 11, amountFen: 8_700, day: 0, method: "ALIPAY" },
  { order: 16, amountFen: 7_000, day: 0, method: "BANK_TRANSFER" },
  { order: 7, amountFen: 2_000, day: 0, method: "CASH", reversed: true },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export async function resetDemoData(
  database: PrismaClient,
  now = new Date(),
): Promise<{ asOfDate: string }> {
  const todayText = formatChinaCalendarDate(now);
  const today = parseCalendarDate(todayText)!;
  const passwordHash = await hashPassword(demoPassword);
  const calendarDate = (offset: number) => addUtcCalendarDays(today, offset);
  const dateText = (offset: number) => utcCalendarDateString(calendarDate(offset));
  const atChinaTime = (offset: number, hour: number) => {
    const candidate = new Date(
      `${dateText(offset)}T${pad(hour)}:00:00.000+08:00`,
    );
    return candidate > now ? new Date(now) : candidate;
  };
  const dateCode = (offset: number) => dateText(offset).replaceAll("-", "");

  await database.$transaction(
    async (transaction) => {
      await transaction.$executeRawUnsafe(
        `TRUNCATE TABLE
          "payment_reversal", "payment", "receivable", "sales_order_item",
          "sales_order", "inventory_movement", "inventory_balance", "data_import",
          "business_audit", "customer", "sku", "verification", "session",
          "account", "user_role", "user"
         RESTART IDENTITY CASCADE`,
      );

      const accountCreatedAt = atChinaTime(-60, 9);
      await transaction.user.createMany({
        data: accounts.map((account, index) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          enabled: true,
          createdAt: new Date(accountCreatedAt.getTime() - index),
          updatedAt: new Date(accountCreatedAt.getTime() - index),
        })),
      });
      await transaction.account.createMany({
        data: accounts.map((account) => ({
          id: `demo-account-${account.id.slice("demo-user-".length)}`,
          accountId: account.id,
          providerId: "credential",
          userId: account.id,
          password: passwordHash,
          createdAt: accountCreatedAt,
          updatedAt: accountCreatedAt,
        })),
      });
      await transaction.userRole.createMany({
        data: accounts.flatMap((account) =>
          account.roles.map((role) => ({ userId: account.id, role })),
        ),
      });

      await transaction.sku.createMany({
        data: skus.map((sku, index) => ({
          id: `demo-sku-${pad(index + 1)}`,
          skuCode: sku.skuCode,
          name: sku.name,
          category: sku.category,
          inventoryUnit: sku.inventoryUnit,
          referencePriceFen: sku.referencePriceFen,
          warningThreshold: sku.warningThreshold,
          enabled: true,
          createdAt: atChinaTime(-60, 10),
          updatedAt: atChinaTime(0, 12),
        })),
      });
      await transaction.customer.createMany({
        data: customers.map((customer, index) => ({
          id: `demo-customer-${pad(index + 1)}`,
          customerCode: customer.customerCode,
          name: customer.name,
          contactName: customer.contactName,
          phone: customer.phone,
          address: customer.address,
          responsibleSalesId: customer.responsibleSalesId,
          paymentTermDays: customer.paymentTermDays,
          enabled: true,
          createdAt: atChinaTime(-55 + index, 10),
          updatedAt: atChinaTime(-55 + index, 10),
        })),
      });

      const inventoryState = skus.map((sku) => ({
        onHand: sku.openingOnHandQuantity,
        reserved: 0,
      }));
      const movementRows: Array<{
        id: string;
        skuId: string;
        movementType: "OPENING" | "RESERVATION" | "RELEASE" | "OUTBOUND";
        onHandDelta: number;
        reservedDelta: number;
        onHandAfter: number;
        reservedAfter: number;
        occurredAt: Date;
        relatedType: string;
        relatedId: string;
        relatedReference: string;
        dataImportId?: string;
        actorId: string;
        actorName: string;
      }> = skus.map((sku, index) => ({
        id: `demo-opening-movement-${pad(index + 1)}`,
        skuId: `demo-sku-${pad(index + 1)}`,
        movementType: "OPENING",
        onHandDelta: sku.openingOnHandQuantity,
        reservedDelta: 0,
        onHandAfter: sku.openingOnHandQuantity,
        reservedAfter: 0,
        occurredAt: atChinaTime(-60, 11),
        relatedType: "DATA_IMPORT",
        relatedId: "demo-opening-import",
        relatedReference: "虚构演示期初库存.xlsx",
        dataImportId: "demo-opening-import",
        actorId: "demo-user-owner",
        actorName: "张伟",
      }));
      const auditRows: Array<{
        id: string;
        actorId: string;
        actorName: string;
        action: string;
        objectType: string;
        objectId: string;
        occurredAt: Date;
        referenceCode?: string;
        reason?: string;
        summary?: string;
      }> = [
        {
          id: "demo-opening-audit",
          actorId: "demo-user-owner",
          actorName: "张伟",
          action: "OPENING_INVENTORY_IMPORTED",
          objectType: "DATA_IMPORT",
          objectId: "demo-opening-import",
          occurredAt: atChinaTime(-60, 11),
          referenceCode: "虚构演示期初库存.xlsx",
          summary: "通过虚构演示期初库存.xlsx 导入 30 个 SKU 的期初库存",
        },
      ];

      await transaction.dataImport.create({
        data: {
          id: "demo-opening-import",
          importType: "OPENING_INVENTORY",
          fileName: "虚构演示期初库存.xlsx",
          rowCount: 30,
          actorId: "demo-user-owner",
          confirmedAt: atChinaTime(-60, 11),
        },
      });

      for (const [orderIndex, order] of orders.entries()) {
        const number = orderIndex + 1;
        const customer = customers[order.customer]!;
        const orderId = `demo-sales-order-${pad(number)}`;
        const createdAt = atChinaTime(order.terminalDay - (order.status === "DRAFT" ? 0 : 2), 9);
        const terminalAt = atChinaTime(order.terminalDay, 10);
        const orderNumber = `XSD-${dateCode(order.terminalDay)}-${String(number).padStart(4, "0")}`;
        const totalAmountFen = orderTotalAmountFen(order);
        await transaction.salesOrder.create({
          data: {
            id: orderId,
            salesOrderNumber: orderNumber,
            status: order.status,
            customerId: `demo-customer-${pad(order.customer + 1)}`,
            creatorId: customer.responsibleSalesId,
            customerCodeSnapshot: customer.customerCode,
            customerNameSnapshot: customer.name,
            customerContactNameSnapshot: customer.contactName,
            customerPhoneSnapshot: customer.phone,
            customerAddressSnapshot: customer.address,
            responsibleSalesIdSnapshot: customer.responsibleSalesId,
            responsibleSalesNameSnapshot:
              accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
            paymentTermDaysSnapshot: customer.paymentTermDays,
            totalAmountFen,
            createdAt,
            updatedAt: terminalAt,
            items: {
              create: order.items.map((item, itemIndex) => {
                const sku = skus[item.sku]!;
                return {
                  id: `demo-sales-order-item-${pad(number)}-${pad(itemIndex + 1)}`,
                  position: itemIndex,
                  skuId: `demo-sku-${pad(item.sku + 1)}`,
                  skuCodeSnapshot: sku.skuCode,
                  skuNameSnapshot: sku.name,
                  inventoryUnitSnapshot: sku.inventoryUnit,
                  referencePriceFenSnapshot: sku.referencePriceFen,
                  quantity: item.quantity,
                  transactionPriceFen: item.priceFen,
                  subtotalFen: item.quantity * item.priceFen,
                };
              }),
            },
          },
        });
        auditRows.push({
          id: `demo-sales-order-created-audit-${pad(number)}`,
          actorId: customer.responsibleSalesId,
          actorName: accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
          action: "SALES_ORDER_DRAFT_CREATED",
          objectType: "SALES_ORDER",
          objectId: orderId,
          occurredAt: createdAt,
          referenceCode: orderNumber,
          summary: `创建销售单草稿，共 ${order.items.length} 个 SKU`,
        });

        if (order.status === "DRAFT") continue;
        const confirmedAt = atChinaTime(order.terminalDay - 1, 10);
        auditRows.push({
          id: `demo-sales-order-confirmed-audit-${pad(number)}`,
          actorId: customer.responsibleSalesId,
          actorName: accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
          action: "SALES_ORDER_CONFIRMED",
          objectType: "SALES_ORDER",
          objectId: orderId,
          occurredAt: confirmedAt,
          referenceCode: orderNumber,
          summary: `确认销售单并预占 ${order.items.length} 个 SKU`,
        });
        for (const [itemIndex, item] of order.items.entries()) {
          const state = inventoryState[item.sku]!;
          state.reserved += item.quantity;
          movementRows.push({
            id: `demo-reservation-${pad(number)}-${pad(itemIndex + 1)}`,
            skuId: `demo-sku-${pad(item.sku + 1)}`,
            movementType: "RESERVATION",
            onHandDelta: 0,
            reservedDelta: item.quantity,
            onHandAfter: state.onHand,
            reservedAfter: state.reserved,
            occurredAt: confirmedAt,
            relatedType: "SALES_ORDER",
            relatedId: orderId,
            relatedReference: orderNumber,
            actorId: customer.responsibleSalesId,
            actorName: accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
          });
        }

        if (order.status === "CANCELLED") {
          auditRows.push({
            id: `demo-sales-order-cancelled-audit-${pad(number)}`,
            actorId: customer.responsibleSalesId,
            actorName: accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
            action: "SALES_ORDER_CANCELLED",
            objectType: "SALES_ORDER",
            objectId: orderId,
            occurredAt: terminalAt,
            referenceCode: orderNumber,
            reason: "客户调整采购计划",
            summary: `取消销售单并释放 ${order.items.length} 个 SKU 的预占`,
          });
          for (const [itemIndex, item] of order.items.entries()) {
            const state = inventoryState[item.sku]!;
            state.reserved -= item.quantity;
            movementRows.push({
              id: `demo-release-${pad(number)}-${pad(itemIndex + 1)}`,
              skuId: `demo-sku-${pad(item.sku + 1)}`,
              movementType: "RELEASE",
              onHandDelta: 0,
              reservedDelta: -item.quantity,
              onHandAfter: state.onHand,
              reservedAfter: state.reserved,
              occurredAt: terminalAt,
              relatedType: "SALES_ORDER",
              relatedId: orderId,
              relatedReference: orderNumber,
              actorId: customer.responsibleSalesId,
              actorName: accounts.find(({ id }) => id === customer.responsibleSalesId)!.name,
            });
          }
        }

        if (order.status === "OUTBOUND") {
          auditRows.push({
            id: `demo-sales-order-outbound-audit-${pad(number)}`,
            actorId: "demo-user-warehouse",
            actorName: "王强",
            action: "SALES_ORDER_OUTBOUND",
            objectType: "SALES_ORDER",
            objectId: orderId,
            occurredAt: terminalAt,
            referenceCode: orderNumber,
            summary: `完整出库 ${order.items.length} 个 SKU，并自动生成应收`,
          });
          for (const [itemIndex, item] of order.items.entries()) {
            const state = inventoryState[item.sku]!;
            state.onHand -= item.quantity;
            state.reserved -= item.quantity;
            movementRows.push({
              id: `demo-outbound-${pad(number)}-${pad(itemIndex + 1)}`,
              skuId: `demo-sku-${pad(item.sku + 1)}`,
              movementType: "OUTBOUND",
              onHandDelta: -item.quantity,
              reservedDelta: -item.quantity,
              onHandAfter: state.onHand,
              reservedAfter: state.reserved,
              occurredAt: terminalAt,
              relatedType: "SALES_ORDER",
              relatedId: orderId,
              relatedReference: orderNumber,
              actorId: "demo-user-warehouse",
              actorName: "王强",
            });
          }
        }
      }

      await transaction.inventoryBalance.createMany({
        data: inventoryState.map((state, index) => ({
          skuId: `demo-sku-${pad(index + 1)}`,
          onHandQuantity: state.onHand,
          reservedQuantity: state.reserved,
          updatedAt: atChinaTime(0, 12),
        })),
      });
      await transaction.inventoryMovement.createMany({ data: movementRows });

      for (const [orderIndex, order] of orders.entries()) {
        if (order.status !== "OUTBOUND") continue;
        const number = orderIndex + 1;
        const customer = customers[order.customer]!;
        const totalAmountFen = orderTotalAmountFen(order);
        const effectivePayments = payments.filter(
          (payment) => payment.order === orderIndex && !payment.reversed,
        );
        const receivedAmountFen = effectivePayments.reduce(
          (total, payment) => total + payment.amountFen,
          0,
        );
        const remainingAmountFen = totalAmountFen - receivedAmountFen;
        const status: ReceivableStatus =
          remainingAmountFen === 0
            ? "SETTLED"
            : receivedAmountFen > 0
              ? "PARTIAL"
              : "PENDING";
        await transaction.receivable.create({
          data: {
            id: `demo-receivable-${pad(number)}`,
            receivableNumber: `YS-${dateCode(order.terminalDay)}-${String(number).padStart(4, "0")}`,
            salesOrderId: `demo-sales-order-${pad(number)}`,
            customerId: `demo-customer-${pad(order.customer + 1)}`,
            customerCodeSnapshot: customer.customerCode,
            customerNameSnapshot: customer.name,
            responsibleSalesIdSnapshot: customer.responsibleSalesId,
            originalAmountFen: totalAmountFen,
            receivedAmountFen,
            remainingAmountFen,
            paymentTermDaysSnapshot: customer.paymentTermDays,
            outboundAt: atChinaTime(order.terminalDay, 10),
            dueDate: addUtcCalendarDays(
              calendarDate(order.terminalDay),
              customer.paymentTermDays,
            ),
            status,
            createdAt: atChinaTime(order.terminalDay, 10),
            updatedAt: atChinaTime(0, 12),
          },
        });
      }

      for (const [paymentIndex, payment] of payments.entries()) {
        const paymentNumber = paymentIndex + 1;
        const orderNumber = payment.order + 1;
        const paymentId = `demo-payment-${pad(paymentNumber)}`;
        await transaction.payment.create({
          data: {
            id: paymentId,
            receivableId: `demo-receivable-${pad(orderNumber)}`,
            paymentDate: calendarDate(payment.day),
            amountFen: payment.amountFen,
            method: payment.method,
            referenceNumber: `DEMO-${dateCode(payment.day)}-${pad(paymentNumber)}`,
            note: "虚构演示收款",
            idempotencyKey: `demo-payment-key-${pad(paymentNumber)}`,
            recordedAt: atChinaTime(payment.day, payment.reversed ? 11 : 10),
            actorId: "demo-user-finance",
            actorName: "刘芳",
          },
        });
        auditRows.push({
          id: `demo-payment-audit-${pad(paymentNumber)}`,
          actorId: "demo-user-finance",
          actorName: "刘芳",
          action: "PAYMENT_RECORDED",
          objectType: "PAYMENT",
          objectId: paymentId,
          occurredAt: atChinaTime(payment.day, payment.reversed ? 11 : 10),
          referenceCode: `YS-${dateCode(orders[payment.order]!.terminalDay)}-${String(orderNumber).padStart(4, "0")}`,
          summary: `登记收款 ¥${(payment.amountFen / 100).toFixed(2)}`,
        });
        if (payment.reversed) {
          await transaction.paymentReversal.create({
            data: {
              id: `demo-payment-reversal-${pad(paymentNumber)}`,
              paymentId,
              receivableId: `demo-receivable-${pad(orderNumber)}`,
              amountFen: payment.amountFen,
              reason: "演示错误收款撤销",
              idempotencyKey: `demo-payment-reversal-key-${pad(paymentNumber)}`,
              reversedAt: atChinaTime(payment.day, 12),
              actorId: "demo-user-owner",
              actorName: "张伟",
            },
          });
          auditRows.push({
            id: `demo-payment-reversal-audit-${pad(paymentNumber)}`,
            actorId: "demo-user-owner",
            actorName: "张伟",
            action: "PAYMENT_REVERSED",
            objectType: "PAYMENT",
            objectId: paymentId,
            occurredAt: atChinaTime(payment.day, 12),
            referenceCode: `YS-${dateCode(orders[payment.order]!.terminalDay)}-${String(orderNumber).padStart(4, "0")}`,
            reason: "演示错误收款撤销",
            summary: `撤销收款 ¥${(payment.amountFen / 100).toFixed(2)}`,
          });
        }
      }

      await transaction.businessAudit.createMany({ data: auditRows });
      await transaction.$executeRawUnsafe(
        `SELECT setval('sales_order_number_seq', 20, true),
                setval('receivable_number_seq', 20, true)`,
      );
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return { asOfDate: todayText };
}
