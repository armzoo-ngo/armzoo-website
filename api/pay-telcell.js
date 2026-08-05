const crypto = require("crypto");

function parseFormBody(body) {
  const params = new URLSearchParams(body);
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const shopId = process.env.TELCELL_SHOP_ID;
  const shopKey = process.env.TELCELL_SHOP_KEY;

  if (!shopId || !shopKey) {
    res.statusCode = 500;
    res.end("Telcell settings are missing.");
    return;
  }

  let body = "";

  await new Promise((resolve, reject) => {
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", resolve);
    req.on("error", reject);
  });

  const form = parseFormBody(body);

  const amount = parseInt(form.amount, 10);
  const purpose = String(form.purpose || "General donation").trim();

  if (!Number.isFinite(amount) || amount < 100) {
    res.statusCode = 400;
    res.end("Invalid donation amount. Minimum donation is 100 AMD.");
    return;
  }

  const donationId = `ARMZOO-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const issuer = shopId;
  const action = "PostInvoice";
  const currency = "֏";
  const price = String(amount);

  const productText = `ARMZOO Donation - ${purpose}`;
  const product = Buffer.from(productText, "utf8").toString("base64");

  const issuerIdText = donationId;
  const issuer_id = Buffer.from(issuerIdText, "utf8").toString("base64");

  const valid_days = "10";
  const lang = "hy";

  const securityString =
    shopKey +
    issuer +
    currency +
    price +
    product +
    issuer_id +
    valid_days;

  const security_code = crypto
    .createHash("md5")
    .update(securityString, "utf8")
    .digest("hex");

  const html = `
<!DOCTYPE html>
<html lang="hy">
<head>
  <meta charset="UTF-8">
  <title>Redirecting to Telcell</title>
</head>
<body>
  <p>Խնդրում ենք սպասել․ Դուք տեղափոխվում եք Telcell վճարման էջ...</p>

  <form id="telcellForm" action="https://telcellmoney.am/invoices" method="POST">
    <input type="hidden" name="issuer" value="${escapeHtml(issuer)}">
    <input type="hidden" name="action" value="${escapeHtml(action)}">
    <input type="hidden" name="currency" value="${escapeHtml(currency)}">
    <input type="hidden" name="price" value="${escapeHtml(price)}">
    <input type="hidden" name="product" value="${escapeHtml(product)}">
    <input type="hidden" name="issuer_id" value="${escapeHtml(issuer_id)}">
    <input type="hidden" name="valid_days" value="${escapeHtml(valid_days)}">
    <input type="hidden" name="lang" value="${escapeHtml(lang)}">
    <input type="hidden" name="security_code" value="${escapeHtml(security_code)}">

    <button type="submit">Շարունակել դեպի Telcell</button>
  </form>

  <script>
    document.getElementById("telcellForm").submit();
  </script>
</body>
</html>
`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
};
