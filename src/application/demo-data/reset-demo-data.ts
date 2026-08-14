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

const skus = [
  ["WJ-LS-001", "304 不锈钢六角螺栓 M8×30", "紧固件", "盒", 4_850, 5, 12],
  ["WJ-QP-002", "树脂切割片 105mm", "切削耗材", "片", 380, 6, 6],
  ["WJ-ZT-003", "高速钢直柄麻花钻 8mm", "钻削工具", "支", 1_890, 5, 3],
  ["WJ-BS-004", "镀锌扁头自攻螺丝 M4", "紧固件", "盒", 1_590, 5, 10],
  ["WJ-JD-005", "绝缘电工胶带 黑色", "电工耗材", "卷", 580, 2, 0],
  ["WJ-LM-006", "尼龙膨胀螺栓 M8", "紧固件", "包", 1_280, 8, 60],
  ["WJ-BS-007", "不锈钢抱箍 32mm", "管件", "个", 650, 8, 40],
  ["WJ-QS-008", "强力砂纸 240 目", "研磨耗材", "张", 120, 20, 40],
  ["WJ-MP-009", "百叶磨片 100mm", "研磨耗材", "片", 850, 10, 50],
  ["WJ-BS-010", "玻璃胶透明 300ml", "密封材料", "支", 7_200, 10, 50],
  ["WJ-GJ-011", "高强度结构胶 50ml", "胶粘剂", "支", 1_500, 8, 50],
  ["WJ-DL-012", "通用断路器 2P 32A", "电工耗材", "个", 2_600, 6, 50],
  ["WJ-BS-013", "活动扳手 10 英寸", "手动工具", "把", 12_500, 5, 50],
  ["WJ-ST-014", "生料带 20m", "密封材料", "卷", 980, 15, 50],
  ["WJ-ZJ-015", "重型角码 50mm", "五金配件", "个", 4_350, 8, 50],
  ["WJ-KG-016", "明装单控开关", "电工耗材", "个", 2_150, 8, 50],
  ["WJ-LD-017", "LED 球泡 12W", "照明", "只", 1_150, 10, 50],
  ["WJ-SL-018", "塑料扎带 4×200mm", "五金配件", "包", 3_900, 12, 50],
  ["WJ-FH-019", "防护眼镜透明款", "劳保用品", "副", 5_250, 6, 50],
  ["WJ-ST-020", "丁腈涂层手套", "劳保用品", "双", 1_750, 10, 50],
  ["WJ-GG-021", "镀锌钢管卡 25mm", "管件", "个", 680, 10, 40],
  ["WJ-DX-022", "阻燃电线 2.5mm²", "电工耗材", "卷", 18_900, 5, 40],
  ["WJ-GP-023", "PVC 给水管 20mm", "管件", "根", 1_450, 10, 40],
  ["WJ-ML-024", "木工锯片 7 英寸", "切削耗材", "片", 9_800, 5, 40],
  ["WJ-TC-025", "陶瓷钻头 6mm", "钻削工具", "支", 2_350, 8, 40],
  ["WJ-HJ-026", "焊锡丝 0.8mm", "焊接耗材", "卷", 6_600, 6, 40],
  ["WJ-YG-027", "液压管卡 16mm", "管件", "个", 920, 10, 40],
  ["WJ-CT-028", "磁性十字批头", "手动工具", "支", 780, 12, 40],
  ["WJ-FX-029", "防锈润滑剂 450ml", "维护耗材", "罐", 2_900, 8, 40],
  ["WJ-GZ-030", "工业擦拭纸", "清洁耗材", "卷", 3_200, 8, 40],
] as const;

const customers = [
  ["KH-0001", "广顺五金商行", "李海峰", "138 0000 0001", "广东省深圳市宝安区工业路 18 号", "demo-user-sales", 30],
  ["KH-0002", "华南机电工程部", "周志成", "138 0000 0002", "广东省深圳市龙华区民治大道 27 号", "demo-user-sales", 15],
  ["KH-0003", "明达设备维修部", "黄玉兰", "138 0000 0003", "广东省东莞市长安镇振安路 66 号", "demo-user-multi", 30],
  ["KH-0004", "安成装饰材料行", "孙国强", "138 0000 0004", "广东省佛山市禅城区季华路 32 号", "demo-user-multi", 7],
  ["KH-0005", "鑫源水电安装队", "马春梅", "138 0000 0005", "广东省惠州市惠城区麦地路 19 号", "demo-user-sales", 45],
  ["KH-0006", "恒泰物业维修中心", "罗俊", "138 0000 0006", "广东省深圳市南山区科技园 8 号", "demo-user-multi", 30],
  ["KH-0007", "联盛机械加工厂", "何志勇", "138 0000 0007", "广东省东莞市大朗镇富民路 51 号", "demo-user-sales", 15],
  ["KH-0008", "德康工程服务部", "姚丽", "138 0000 0008", "广东省深圳市龙岗区龙城大道 90 号", "demo-user-multi", 0],
] as const;

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
  const atChinaTime = (offset: number, hour: number) =>
    new Date(`${dateText(offset)}T${pad(hour)}:00:00.000+08:00`);
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
          skuCode: sku[0],
          name: sku[1],
          category: sku[2],
          inventoryUnit: sku[3],
          referencePriceFen: sku[4],
          warningThreshold: sku[5],
          enabled: true,
          createdAt: atChinaTime(-60, 10),
          updatedAt: atChinaTime(0, 12),
        })),
      });
      await transaction.customer.createMany({
        data: customers.map((customer, index) => ({
          id: `demo-customer-${pad(index + 1)}`,
          customerCode: customer[0],
          name: customer[1],
          contactName: customer[2],
          phone: customer[3],
          address: customer[4],
          responsibleSalesId: customer[5],
          paymentTermDays: customer[6],
          enabled: true,
          createdAt: atChinaTime(-55 + index, 10),
          updatedAt: atChinaTime(-55 + index, 10),
        })),
      });

      const inventoryState = skus.map((sku) => ({
        onHand: sku[6],
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
        onHandDelta: sku[6],
        reservedDelta: 0,
        onHandAfter: sku[6],
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
        const totalAmountFen = order.items.reduce(
          (total, item) => total + item.quantity * item.priceFen,
          0,
        );
        await transaction.salesOrder.create({
          data: {
            id: orderId,
            salesOrderNumber: orderNumber,
            status: order.status,
            customerId: `demo-customer-${pad(order.customer + 1)}`,
            creatorId: customer[5],
            customerCodeSnapshot: customer[0],
            customerNameSnapshot: customer[1],
            customerContactNameSnapshot: customer[2],
            customerPhoneSnapshot: customer[3],
            customerAddressSnapshot: customer[4],
            responsibleSalesIdSnapshot: customer[5],
            responsibleSalesNameSnapshot:
              accounts.find(({ id }) => id === customer[5])!.name,
            paymentTermDaysSnapshot: customer[6],
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
                  skuCodeSnapshot: sku[0],
                  skuNameSnapshot: sku[1],
                  inventoryUnitSnapshot: sku[3],
                  referencePriceFenSnapshot: sku[4],
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
          actorId: customer[5],
          actorName: accounts.find(({ id }) => id === customer[5])!.name,
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
          actorId: customer[5],
          actorName: accounts.find(({ id }) => id === customer[5])!.name,
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
            actorId: customer[5],
            actorName: accounts.find(({ id }) => id === customer[5])!.name,
          });
        }

        if (order.status === "CANCELLED") {
          auditRows.push({
            id: `demo-sales-order-cancelled-audit-${pad(number)}`,
            actorId: customer[5],
            actorName: accounts.find(({ id }) => id === customer[5])!.name,
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
              actorId: customer[5],
              actorName: accounts.find(({ id }) => id === customer[5])!.name,
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
        const totalAmountFen = order.items.reduce(
          (total, item) => total + item.quantity * item.priceFen,
          0,
        );
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
            customerCodeSnapshot: customer[0],
            customerNameSnapshot: customer[1],
            responsibleSalesIdSnapshot: customer[5],
            originalAmountFen: totalAmountFen,
            receivedAmountFen,
            remainingAmountFen,
            paymentTermDaysSnapshot: customer[6],
            outboundAt: atChinaTime(order.terminalDay, 10),
            dueDate: addUtcCalendarDays(
              calendarDate(order.terminalDay),
              customer[6],
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
