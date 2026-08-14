const crypto = require("crypto");

const TELCELL_PAYMENT_URL = "https://telcellmoney.am/invoices";

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === "string") {
        return resolve(req.body);
      }

      if (typeof req.body === "object") {
        return resolve(new URLSearchParams(req.body).toString());
      }
    }

    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseFormBody(body) {
  const params = new URLSearchParams(body);
  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanText(value, maxLength = 120) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function md5(value) {
  return crypto.createHash("md5").update(value, "utf8").digest("hex");
}

function createDonationId() {
  const randomPart = Math.floor(Math.random() * 900000 + 100000);
  return `ARMZOO-${Date.now()}-${randomPart}`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method Not Allowed");
      return;
    }

    const shopId = process.env.TELCELL_SHOP_ID;
    const shopKey = process.env.TELCELL_SHOP_KEY;

    if (!shopId || !shopKey) {
      console.error("ARMZOO Telcell error: missing environment variables");

      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Telcell configuration is missing.");
      return;
    }

    const rawBody = await readRawBody(req);
    const form = parseFormBody(rawBody);

    const donorName = cleanText(form.donor_name, 80);
    const donorEmail = cleanText(form.donor_email, 120);
    const donorPhone = cleanText(form.donor_phone, 40);
    const purpose = cleanText(form.purpose || "General donation", 100);

    const amount = parseInt(form.amount, 10);

    if (!Number.isFinite(amount) || amount < 100) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid donation amount. Minimum donation is 100 AMD.");
      return;
    }

    if (amount > 10000000) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid donation amount.");
      return;
    }

    const donationId = createDonationId();

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

    const security_code = md5(securityString);

    console.log("ARMZOO Telcell donation created", {
      createdAt: new Date().toISOString(),
      donationId,
      donorName,
      donorEmail,
      donorPhone,
      amount,
      currency: "AMD",
      purpose,
      status: "PENDING"
    });

    const html = `
<!DOCTYPE html>
<html lang="hy">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting to Telcell | ARMZOO</title>
</head>
<body>
  <p>Խնդրում ենք սպասել․ Դուք տեղափոխվում եք Telcell վճարման էջ...</p>

  <form id="telcellForm" action="${TELCELL_PAYMENT_URL}" method="POST">
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
    res.setHeader("Cache-Control", "no-store");
    res.end(html);
  } catch (error) {
    console.error("ARMZOO Telcell payment initialization error", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Payment initialization failed.");
  }
};
