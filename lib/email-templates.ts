const STREAM = "#2dd4bf";
const MIST = "#f8fafc";
const DARK = "#0f172a";
const BORDER = "#e2e8f0";
const MUTED = "#64748b";

type OrderLineItem = {
  title: string;
  variant?: string | null;
  qty: number;
  price: number;
};

type ShippingAddr = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  zip: string;
  country: string;
};

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function itemRows(items: OrderLineItem[]): string {
  return items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${DARK};">
        ${item.title}${item.variant ? `<br/><span style="color:${MUTED};font-size:12px;">${item.variant}</span>` : ""}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${DARK};text-align:center;">
        ${item.qty}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid ${BORDER};font-size:14px;color:${DARK};text-align:right;font-family:'Courier New',monospace;">
        ${formatPrice(item.price * item.qty)}
      </td>
    </tr>`
    )
    .join("");
}

function wrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:${MIST};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${MIST};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid ${BORDER};">
${content}
</table>
<p style="margin:24px 0 0;font-size:12px;color:${MUTED};text-align:center;">
  &copy; ${new Date().getFullYear()} Aruviah &middot; <a href="{{siteUrl}}/legal/terms" style="color:${MUTED};">Terms</a> &middot; <a href="{{siteUrl}}/legal/privacy" style="color:${MUTED};">Privacy</a>
</p>
</td></tr>
</table>
</body>
</html>`;
}

function header(title: string): string {
  return `
<tr>
  <td style="background-color:${STREAM};padding:24px 32px;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Aruviah</h1>
  </td>
</tr>
<tr>
  <td style="padding:28px 32px 8px;">
    <h2 style="margin:0;font-size:18px;font-weight:600;color:${DARK};">${title}</h2>
  </td>
</tr>`;
}

export function buildOrderConfirmationHtml(params: {
  orderId: string;
  orderDate: string;
  items: OrderLineItem[];
  subtotal: number;
  shippingTotal: number;
  total: number;
  shipping: ShippingAddr;
  siteUrl: string;
}): string {
  const orderUrl = `${params.siteUrl}/account/orders/${params.orderId}`;
  const date = new Date(params.orderDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const content = `
${header("Order confirmed")}
<tr><td style="padding:0 32px 20px;">
  <p style="margin:8px 0 0;font-size:14px;color:${MUTED};">Thank you for your order! We&rsquo;ve received your payment and are preparing your items.</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${DARK};">
    <tr>
      <td style="padding:4px 0;color:${MUTED};">Order number</td>
      <td style="padding:4px 0;text-align:right;font-family:'Courier New',monospace;font-size:13px;">${params.orderId.slice(0, 8).toUpperCase()}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:${MUTED};">Date</td>
      <td style="padding:4px 0;text-align:right;">${date}</td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
    <tr style="background-color:${MIST};">
      <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Item</th>
      <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Total</th>
    </tr>
    ${itemRows(params.items)}
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${DARK};">
    <tr>
      <td style="padding:4px 0;color:${MUTED};">Subtotal</td>
      <td style="padding:4px 0;text-align:right;font-family:'Courier New',monospace;">${formatPrice(params.subtotal)}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:${MUTED};">Shipping</td>
      <td style="padding:4px 0;text-align:right;font-family:'Courier New',monospace;">${params.shippingTotal > 0 ? formatPrice(params.shippingTotal) : "Free"}</td>
    </tr>
    <tr>
      <td style="padding:8px 0 4px;font-weight:700;border-top:2px solid ${DARK};">Total</td>
      <td style="padding:8px 0 4px;text-align:right;font-weight:700;font-family:'Courier New',monospace;border-top:2px solid ${DARK};">${formatPrice(params.total)}</td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <h3 style="margin:0 0 6px;font-size:13px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;">Shipping to</h3>
  <p style="margin:0;font-size:14px;color:${DARK};line-height:1.5;">
    ${params.shipping.firstName} ${params.shipping.lastName}<br/>
    ${params.shipping.address}<br/>
    ${params.shipping.city}, ${params.shipping.zip}<br/>
    ${params.shipping.country}
  </p>
</td></tr>

<tr><td style="padding:0 32px 28px;">
  <a href="${orderUrl}" style="display:inline-block;padding:12px 28px;background-color:${STREAM};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View your order</a>
</td></tr>`;

  return wrapper(content).replace(/\{\{siteUrl\}\}/g, params.siteUrl);
}

export function buildShippedHtml(params: {
  orderId: string;
  carrier: string | null;
  trackNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery?: string | null;
  siteUrl: string;
}): string {
  const orderUrl = `${params.siteUrl}/account/orders/${params.orderId}`;

  const trackButton = params.trackingUrl
    ? `<a href="${params.trackingUrl}" style="display:inline-block;padding:12px 28px;background-color:${STREAM};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">Track package</a>`
    : params.trackNumber
      ? `<p style="font-size:14px;color:${DARK};"><strong>Tracking number:</strong> <span style="font-family:'Courier New',monospace;">${params.trackNumber}</span></p>`
      : "";

  const content = `
${header("Your order has shipped!")}
<tr><td style="padding:0 32px 20px;">
  <p style="margin:8px 0 0;font-size:14px;color:${MUTED};">Great news &mdash; your order is on its way.</p>
</td></tr>

<tr><td style="padding:0 32px 20px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${DARK};border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
    <tr>
      <td style="padding:12px 16px;color:${MUTED};background:${MIST};">Order</td>
      <td style="padding:12px 16px;text-align:right;background:${MIST};font-family:'Courier New',monospace;font-size:13px;">${params.orderId.slice(0, 8).toUpperCase()}</td>
    </tr>
    ${params.carrier ? `<tr><td style="padding:12px 16px;color:${MUTED};border-top:1px solid ${BORDER};">Carrier</td><td style="padding:12px 16px;text-align:right;border-top:1px solid ${BORDER};">${params.carrier}</td></tr>` : ""}
    ${params.trackNumber ? `<tr><td style="padding:12px 16px;color:${MUTED};border-top:1px solid ${BORDER};">Tracking</td><td style="padding:12px 16px;text-align:right;border-top:1px solid ${BORDER};font-family:'Courier New',monospace;font-size:13px;">${params.trackNumber}</td></tr>` : ""}
    ${params.estimatedDelivery ? `<tr><td style="padding:12px 16px;color:${MUTED};border-top:1px solid ${BORDER};">Est. delivery</td><td style="padding:12px 16px;text-align:right;border-top:1px solid ${BORDER};">${params.estimatedDelivery}</td></tr>` : ""}
  </table>
</td></tr>

<tr><td style="padding:0 32px 12px;">
  ${trackButton}
</td></tr>

<tr><td style="padding:0 32px 28px;">
  <a href="${orderUrl}" style="display:inline-block;padding:10px 24px;border:2px solid ${STREAM};color:${STREAM};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View order details</a>
</td></tr>`;

  return wrapper(content).replace(/\{\{siteUrl\}\}/g, params.siteUrl);
}
