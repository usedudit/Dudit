import { formatDateTime } from "@/lib/utils";
import {
  formatPaymentMethodLabel,
  toCanonicalPaymentType,
} from "@/lib/payments/payment-method";
import { formatAddressParts, stripCep } from "@/lib/utils/format-address";
import { cleanOrderNotes } from "@/lib/orders/order-utils";
import { getLegReceivedAmount } from "@/lib/payments/payment-ledger";

export type SaleReceiptFormat = "thermal" | "thermal-58" | "a4";

export type SaleReceiptItem = {
  index: number;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
};

export type SaleReceiptPaymentLine = {
  label: string;
  amount: number;
};

export type SaleReceiptInstallmentDetail = {
  number: number;
  total: number;
  dueDate: string;
  amount: number;
  status?: string | null;
};

export type SaleReceiptPartnerHeader = {
  fantasyName: string;
  legalName: string;
  addressLine: string;
  taxIdLine: string;
  phone?: string | null;
};

export type SaleReceiptReturnPolicyBlock = {
  commercialDeadlineDays: number;
  additionalWarrantyDays: number;
  message?: string | null;
  showBlock: boolean;
};

export type SaleReceiptData = {
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  orderNumber: string;
  saleDateTime: string;
  items: SaleReceiptItem[];
  itemsTotal: number;
  subtotal: number;
  total: number;
  change: number;
  paymentLines: SaleReceiptPaymentLine[];
  installmentDetails?: SaleReceiptInstallmentDetail[];
  methodDiscount: number;
  generalDiscount: number;
  couponDiscount: number;
  methodFee: number;
  methodInterest: number;
  methodFixedFee?: number;
  shippingFee: number;
  otherCosts: number;
  sellerName: string;
  orderSource?: string;
  isOnlineOrder?: boolean;
  deliveryType?: "delivery" | "pickup" | string;
  isOnlinePayment?: boolean;
  notes?: string | null;
  showAcknowledgment?: boolean;
  partner: SaleReceiptPartnerHeader;
  primaryColor?: string;
  secondaryColor?: string;
  partnerAvatar?: string;
  returnPolicyBlock?: SaleReceiptReturnPolicyBlock | null;
  deliveryPayer?: "seller" | "customer";
};

export const DEFAULT_RECEIPT_FOOTER_MESSAGE = "* OBRIGADO E VOLTE SEMPRE *";

export const DEFAULT_RECEIPT_ACKNOWLEDGMENT =
  "Recebi a(s) mercadoria(s) acima descrita(s), concordando plenamente com os prazos e condições de garantia.";

export function formatReceiptAmount(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatTaxId(cnpj?: string | null, cpf?: string | null): string {
  const raw = String(cnpj || cpf || "").replace(/\D/g, "");
  if (!raw) return "";
  if (raw.length === 14) {
    return raw.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  if (raw.length === 11) {
    return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return raw;
}

export function buildPartnerTaxIdLine(params: {
  cnpj?: string | null;
  cpf?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  ieIsento?: boolean | null;
}): string {
  const parts: string[] = [];
  const doc = formatTaxId(params.cnpj, params.cpf);
  if (doc) {
    const label =
      String(params.cnpj || "").replace(/\D/g, "").length === 14
        ? "CNPJ"
        : "CPF";
    parts.push(`${label}: ${doc}`);
  }
  const ie = params.ieIsento ? "Isento" : params.stateRegistration;
  if (ie) parts.push(`IE: ${ie}`);
  if (params.municipalRegistration)
    parts.push(`IM: ${params.municipalRegistration}`);
  return parts.join("  ");
}

export function mapOrderItemsToReceiptItems(
  orderItems: any[],
): SaleReceiptItem[] {
  return (orderItems || []).map((item, idx) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(
      item.product_price ?? item.unit_price ?? item.unitPrice ?? 0,
    );
    const subtotal = Number(item.subtotal ?? qty * unitPrice);
    const name =
      item.product_name ||
      item.custom_name ||
      item.name ||
      item.products?.name ||
      "Item";
    return {
      index: idx + 1,
      code: "",
      description: String(name),
      quantity: qty,
      unit: "UN",
      unitPrice,
      totalPrice: subtotal,
    };
  });
}

export function mapCartItemsToReceiptItems(cart: any[]): SaleReceiptItem[] {
  return (cart || []).map((item, idx) => {
    const qty = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    return {
      index: idx + 1,
      code: "",
      description: String(item.name || "Item"),
      quantity: qty,
      unit: "UN",
      unitPrice,
      totalPrice: qty * unitPrice,
    };
  });
}

function getReceiptMethodTypeLabel(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "Método não definido";

  // Ignora o que vier entre parênteses para obter apenas o tipo do método
  // Ex.: "Pix (Pix 2%)" -> "Pix", "Cartão de Crédito (Visa) (2x)" -> "Cartão de Crédito"
  const base = raw.split(/[()]/)[0].trim();

  const canonical = toCanonicalPaymentType(base);
  if (canonical !== "other") {
    return formatPaymentMethodLabel(canonical);
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes("store_credit") ||
    lower.includes("store-credit") ||
    lower.includes("vale-compra") ||
    lower.includes("vale_compra") ||
    lower.includes("vale")
  ) {
    return "Vale-compra";
  }
  if (lower.includes("exchange") || lower.includes("troca")) {
    return "Crédito de troca";
  }
  if (base) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function groupPaymentMethods(
  methods: Array<{
    method: string;
    amount: number;
    wantsChange?: boolean;
    payWithAmount?: number;
  }>,
): Array<{
  method: string;
  label: string;
  amount: number;
  wantsChange?: boolean;
  payWithAmount?: number;
}> {
  const grouped = methods.reduce<
    Record<
      string,
      {
        label: string;
        amount: number;
        wantsChange?: boolean;
        payWithAmount?: number;
      }
    >
  >((acc, curr) => {
    const key = getReceiptMethodTypeLabel(curr.method);
    if (!acc[key]) {
      acc[key] = {
        label: key,
        amount: 0,
        wantsChange: curr.wantsChange,
        payWithAmount: curr.payWithAmount,
      };
    }
    acc[key].amount += curr.amount;
    if (curr.wantsChange) acc[key].wantsChange = curr.wantsChange;
    if (curr.payWithAmount != null) acc[key].payWithAmount = curr.payWithAmount;
    return acc;
  }, {});
  return Object.entries(grouped).map(([method, data]) => ({
    method,
    label: data.label,
    amount: Number(data.amount),
    wantsChange: data.wantsChange,
    payWithAmount: data.payWithAmount,
  }));
}

function buildInstallmentDetailsFromOrder(
  order: any,
): SaleReceiptInstallmentDetail[] | undefined {
  const breakdown = Array.isArray(order.payment_breakdown)
    ? order.payment_breakdown
    : [];
  const installmentEntries = breakdown.filter(
    (e: any) =>
      e?.method &&
      Number(e.amount || 0) > 0.009 &&
      Math.floor(Number(e.installmentNumber || 1)) > 1,
  );
  if (installmentEntries.length === 0) return undefined;

  const saleDate = new Date(order.created_at || order.order_date || new Date());
  const result: SaleReceiptInstallmentDetail[] = [];

  for (const entry of installmentEntries) {
    const totalInstallments = Math.floor(Number(entry.installmentNumber || 1));
    const grossAmount = Number(entry.amount || 0);
    const installmentValue =
      Math.round((grossAmount / totalInstallments) * 100) / 100;
    const diff =
      Math.round((grossAmount - installmentValue * totalInstallments) * 100) /
      100;

    for (let i = 0; i < totalInstallments; i++) {
      const due = new Date(saleDate);
      due.setMonth(due.getMonth() + (i + 1));
      const day = String(due.getDate()).padStart(2, "0");
      const month = String(due.getMonth() + 1).padStart(2, "0");
      const year = due.getFullYear();
      result.push({
        number: i + 1,
        total: totalInstallments,
        dueDate: `${day}/${month}/${year}`,
        amount:
          i === totalInstallments - 1
            ? Math.round((installmentValue + diff) * 100) / 100
            : installmentValue,
      });
    }
  }

  return result.length > 0 ? result : undefined;
}

export function buildPaymentLinesFromOrder(
  order: any,
): SaleReceiptPaymentLine[] {
  const breakdown = Array.isArray(order.payment_breakdown)
    ? order.payment_breakdown
    : [];
  const filtered = breakdown.filter(
    (e: any) => e?.method && getLegReceivedAmount(e) > 0.009,
  );
  if (filtered.length > 0) {
    const grouped = groupPaymentMethods(
      filtered.map((e: any) => ({
        method: String(e.method),
        amount: getLegReceivedAmount(e),
        wantsChange: e.wantsChange,
        payWithAmount: e.payWithAmount,
      })),
    );
    return grouped.map((e) => {
      let label = e.label;
      if (toCanonicalPaymentType(e.method) === "cash" && e.wantsChange) {
        const trocoPara =
          e.payWithAmount != null ? Number(e.payWithAmount) : e.amount;
        label = `Dinheiro (Troco para R$ ${trocoPara.toFixed(2).replace(".", ",")})`;
      } else if (
        toCanonicalPaymentType(e.method) === "cash" &&
        e.wantsChange === false
      ) {
        label = "Dinheiro (Valor exato)";
      }
      return {
        label,
        amount: e.amount,
      };
    });
  }
  if (Number(order.paid_amount || 0) > 0.009 && order.payment_method) {
    return [
      {
        label: getReceiptMethodTypeLabel(String(order.payment_method)),
        amount: Number(order.paid_amount || 0),
      },
    ];
  }
  return [];
}

export function buildPaymentLinesFromBreakdown(
  breakdown:
    | Array<{
        method?: string;
        amount?: number;
        wantsChange?: boolean;
        payWithAmount?: number;
      }>
    | undefined,
  fallbackMethod?: string,
  fallbackAmount?: number,
): SaleReceiptPaymentLine[] {
  const filtered = (breakdown || []).filter(
    (
      e,
    ): e is {
      method: string;
      amount?: number;
      amountReceived?: number;
      wantsChange?: boolean;
      payWithAmount?: number;
    } => Boolean(e?.method) && getLegReceivedAmount(e as any) > 0.009,
  );
  if (filtered.length > 0) {
    const grouped = groupPaymentMethods(
      filtered.map((e) => ({
        method: e.method,
        amount: getLegReceivedAmount(e as any),
        wantsChange: e.wantsChange,
        payWithAmount: e.payWithAmount,
      })),
    );
    return grouped.map((e) => {
      let label = e.label;
      if (toCanonicalPaymentType(e.method) === "cash" && e.wantsChange) {
        const trocoPara =
          e.payWithAmount != null ? Number(e.payWithAmount) : e.amount;
        label = `Dinheiro (Troco para R$ ${trocoPara.toFixed(2).replace(".", ",")})`;
      } else if (
        toCanonicalPaymentType(e.method) === "cash" &&
        e.wantsChange === false
      ) {
        label = "Dinheiro (Valor exato)";
      }
      return {
        label,
        amount: e.amount,
      };
    });
  }
  if (fallbackMethod && Number(fallbackAmount || 0) > 0.009) {
    return [
      {
        label: getReceiptMethodTypeLabel(fallbackMethod),
        amount: Number(fallbackAmount || 0),
      },
    ];
  }
  return [];
}

export function formatCustomerContact(order: any): {
  phone?: string | null;
  address?: string | null;
} {
  const customers = order.customers || {};
  const phone =
    customers.phone || order.customer_phone || order.customerPhone || null;

  const addresses = Array.isArray(customers.addresses)
    ? customers.addresses
    : [];
  let address: string | null = null;
  if (addresses.length > 0) {
    const primary =
      addresses.find(
        (a: any) => a.address_type === "primary" || a.is_default,
      ) || addresses[0];
    address = formatAddressParts(primary);
  }
  if (!address && order.delivery_address) {
    address = stripCep(String(order.delivery_address));
  }
  return { phone, address };
}

export function buildSaleReceiptFromOrder(
  order: any,
  partner: SaleReceiptPartnerHeader,
  options?: {
    sellerName?: string;
    primaryColor?: string;
    secondaryColor?: string;
    partnerAvatar?: string;
  },
): SaleReceiptData {
  const manualDiscount = Math.max(0, Number(order.discount_value || 0));
  const couponDiscount = Math.max(0, Number(order.coupon_discount_amount || 0));
  const methodDiscount = Math.max(
    0,
    Number(order.payment_method_discount_amount || 0),
  );
  const methodInterest = Math.max(
    0,
    Number(order.payment_method_interest_amount || 0),
  );
  const methodFee = Math.max(0, Number(order.payment_method_fee_amount || 0));
  const methodFixedFee = Math.max(
    0,
    Number(order.payment_method_fixed_fee_amount || 0),
  );
  const shippingFee = Math.max(
    0,
    Number(order.delivery_fee || order.shipping_cost || 0),
  );
  const otherCosts = Math.max(0, Number(order.additional_costs || 0));
  const items = mapOrderItemsToReceiptItems(order.order_items || []);
  const itemsTotal = items.reduce((acc, it) => acc + it.totalPrice, 0);
  const subtotal =
    Number(order.subtotal_value || 0) > 0
      ? Number(order.subtotal_value || 0)
      : itemsTotal;
  const total = Number(order.total_amount || 0);
  const paid = Number(order.paid_amount || 0);
  const breakdown = Array.isArray(order.payment_breakdown)
    ? order.payment_breakdown
    : [];
  const totalReceived = breakdown.reduce(
    (sum: number, e: any) => sum + Number(e.amountReceived || 0),
    0,
  );
  const change =
    totalReceived > 0.005
      ? Math.max(0, totalReceived - total)
      : Math.max(0, paid - total);
  const policySnap = order.return_policy_snapshot;
  const customerContact = formatCustomerContact(order);

  const orderSource = String(order.order_source || "").toLowerCase();
  const isPresencialOrBalcao =
    orderSource.includes("presencial") ||
    orderSource.includes("balcão") ||
    orderSource.includes("balcao");
  const isOnlineOrder = orderSource.includes("vitrine");

  const rawDeliveryType = String(order.delivery_type || "").toLowerCase();
  const deliveryType =
    rawDeliveryType === "pickup" ||
    orderSource.includes("retirada") ||
    orderSource.includes("balcão")
      ? "pickup"
      : "delivery";

  const paymentProvider = String(order.payment_provider || "").toLowerCase();
  const paymentMethod = String(order.payment_method || "").toLowerCase();
  const isOnlinePayment = Boolean(
    order.mp_payment_id ||
    order.mpPaymentId ||
    paymentProvider.includes("mercado") ||
    paymentMethod.includes("mercado") ||
    order.is_online_payment === true,
  );

  const notes =
    cleanOrderNotes(order.notes || order.observation || order.customer_notes) ||
    null;

  const returnPolicyBlock =
    policySnap && policySnap.receipt_show_policy_block !== false
      ? {
          commercialDeadlineDays: Number(
            policySnap?.commercial?.commercial_deadline_days ?? 30,
          ),
          additionalWarrantyDays: Number(
            policySnap?.commercial?.additional_warranty_days ?? 0,
          ),
          message: policySnap?.receipt_message ?? null,
          showBlock: true,
        }
      : null;

  const showAcknowledgment = policySnap
    ? policySnap.receipt_show_acknowledgment !== false
    : true;

  return {
    customerName:
      order.customers?.name || order.customer_name || "Consumidor final",
    customerPhone: customerContact.phone,
    customerAddress: customerContact.address,
    orderNumber: String(order.order_number || order.id || ""),
    saleDateTime: formatDateTime(
      order.created_at || order.order_date || new Date(),
    ),
    items,
    itemsTotal,
    subtotal,
    total,
    change,
    paymentLines: buildPaymentLinesFromOrder(order),
    installmentDetails: buildInstallmentDetailsFromOrder(order),
    methodDiscount,
    generalDiscount: manualDiscount,
    couponDiscount,
    methodFee: methodFee + methodFixedFee,
    methodInterest,
    shippingFee,
    otherCosts,
    sellerName: options?.sellerName || order.seller_name || "Não informado",
    orderSource: order.order_source || undefined,
    isOnlineOrder,
    deliveryType,
    isOnlinePayment,
    notes,
    showAcknowledgment,
    partner,
    primaryColor: options?.primaryColor,
    secondaryColor: options?.secondaryColor,
    partnerAvatar: options?.partnerAvatar,
    returnPolicyBlock,
    deliveryPayer: order.delivery_payer as "seller" | "customer" | undefined,
  };
}

export type SaleReceiptCartSnapshot = {
  cart: any[];
  orderNumber: string;
  saleDateTime?: string;
  customerName?: string;
  subTotal: number;
  shippingFee: number;
  otherCosts: number;
  discountAmount: number;
  couponDiscount?: number;
  total: number;
  totalPaid: number;
  change: number;
  paymentBreakdown?: Array<{
    method?: string;
    amount?: number;
    amountReceived?: number;
    installmentNumber?: number;
    wantsChange?: boolean;
    payWithAmount?: number;
  }>;
  paymentMethod?: string;
  methodDiscount?: number;
  methodFee?: number;
  methodInterest?: number;
  methodFixedFee?: number;
  deliveryPayer?: "seller" | "customer";
  sellerName?: string;
  notes?: string;
};

export function buildSaleReceiptFromCartSnapshot(
  snapshot: SaleReceiptCartSnapshot,
  partner: SaleReceiptPartnerHeader,
  options?: {
    primaryColor?: string;
    secondaryColor?: string;
    partnerAvatar?: string;
  },
): SaleReceiptData {
  const couponDiscount = Math.max(0, Number(snapshot.couponDiscount || 0));
  const totalDiscount = Math.max(0, Number(snapshot.discountAmount || 0));
  const generalDiscount = Math.max(0, totalDiscount - couponDiscount);
  const items = mapCartItemsToReceiptItems(snapshot.cart);
  const itemsTotal = items.reduce((acc, it) => acc + it.totalPrice, 0);

  const installmentEntries = (snapshot.paymentBreakdown || []).filter(
    (e) =>
      e?.method &&
      Number(e.amount || 0) > 0.009 &&
      Math.floor(Number(e.installmentNumber || 1)) > 1,
  );
  let installmentDetails: SaleReceiptInstallmentDetail[] | undefined;
  if (installmentEntries.length > 0) {
    const saleDate = new Date();
    const details: SaleReceiptInstallmentDetail[] = [];
    for (const entry of installmentEntries) {
      const totalInstallments = Math.floor(
        Number(entry.installmentNumber || 1),
      );
      const grossAmount = Number(entry.amount || 0);
      const installmentValue =
        Math.round((grossAmount / totalInstallments) * 100) / 100;
      const diff =
        Math.round((grossAmount - installmentValue * totalInstallments) * 100) /
        100;
      for (let i = 0; i < totalInstallments; i++) {
        const due = new Date(saleDate);
        due.setMonth(due.getMonth() + (i + 1));
        const day = String(due.getDate()).padStart(2, "0");
        const month = String(due.getMonth() + 1).padStart(2, "0");
        const year = due.getFullYear();
        details.push({
          number: i + 1,
          total: totalInstallments,
          dueDate: `${day}/${month}/${year}`,
          amount:
            i === totalInstallments - 1
              ? Math.round((installmentValue + diff) * 100) / 100
              : installmentValue,
        });
      }
    }
    installmentDetails = details.length > 0 ? details : undefined;
  }

  return {
    customerName: snapshot.customerName || "Consumidor final",
    orderNumber: snapshot.orderNumber,
    saleDateTime: snapshot.saleDateTime || formatDateTime(new Date()),
    items,
    itemsTotal,
    subtotal: Number(snapshot.subTotal || 0),
    total: Number(snapshot.total || 0),
    change: Math.max(0, Number(snapshot.change || 0)),
    paymentLines: buildPaymentLinesFromBreakdown(
      snapshot.paymentBreakdown,
      snapshot.paymentMethod,
      snapshot.totalPaid,
    ),
    installmentDetails,
    methodDiscount: Math.max(0, Number(snapshot.methodDiscount || 0)),
    generalDiscount,
    couponDiscount,
    methodFee: Math.max(0, Number(snapshot.methodFee || 0)),
    methodInterest: Math.max(0, Number(snapshot.methodInterest || 0)),
    methodFixedFee: 0,
    shippingFee: Math.max(0, Number(snapshot.shippingFee || 0)),
    otherCosts: Math.max(0, Number(snapshot.otherCosts || 0)),
    sellerName: snapshot.sellerName || "Não informado",
    orderSource: undefined,
    isOnlineOrder: false,
    deliveryType: "pickup",
    isOnlinePayment: false,
    notes: snapshot.notes?.trim() || null,
    showAcknowledgment: true,
    partner,
    primaryColor: options?.primaryColor,
    secondaryColor: options?.secondaryColor,
    partnerAvatar: options?.partnerAvatar,
    deliveryPayer: snapshot.deliveryPayer,
  };
}
