const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// ── Auto-expire records whose ExpDate has passed (runs on every GET) ──────────
async function autoExpire() {
  try {
    await pool.query(
      `UPDATE price SET status='Inactive' WHERE ExpDate < CURDATE() AND status='Active'`,
    );
  } catch (_) {}
}

// ── GET all active prices (ordered by Cftipartno ASC) ────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  await autoExpire();
  try {
    const [rows] = await pool.query(
      `SELECT Sno, LTSACode, Customerpartno, Cftipartno, Description,
              ListPrice, StartDate, ExpDate, Curr, Leadtime,
              DeliveryTerm, SPLCond, Remarks, Product, Market, status
       FROM price WHERE status='Active'
       ORDER BY Cftipartno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET Leadtime & DeliveryTerm options from quotedata ───────────────────────
router.get("/options", authMiddleware, async (req, res) => {
  try {
    const [leadtimes] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Leadtime' AND Status='Active' ORDER BY Data ASC`,
    );
    const [deliveryterms] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='DeliveryTerm' AND Status='Active' ORDER BY Data ASC`,
    );
    const [products] = await pool.query(
      `SELECT Products FROM product WHERE status='Active' ORDER BY Products ASC`,
    );
    res.json({
      leadtimes: leadtimes.map((r) => r.Data),
      deliveryterms: deliveryterms.map((r) => r.Data),
      products: products.map((r) => r.Products),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET CFTI part numbers for dropdown ───────────────────────────────────────
router.get("/cftiparts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Cftipartno FROM price
       WHERE (StartDate <= CURDATE() OR StartDate IS NULL)
       AND (ExpDate IS NULL OR ExpDate >= CURDATE())
       AND status='Active'
       ORDER BY Cftipartno ASC`,
    );
    res.json(rows.map((r) => r.Cftipartno));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Customerpartno (gepn) ────────────────────────────────────
router.get("/check/custpartno", authMiddleware, async (req, res) => {
  const { custpartno } = req.query;
  try {
    if (custpartno) {
      const [rows] = await pool.query(
        `SELECT Customerpartno FROM price WHERE LOWER(Customerpartno) = ?`,
        [custpartno.toLowerCase()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          message:
            "The Customer Part Number already exists. Please enter a different one.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK open quotes for a part (before allowing Leadtime/DeliveryTerm edit) ─
router.get("/check/openquote", authMiddleware, async (req, res) => {
  const { cftipartno, custpartno } = req.query;
  try {
    let rows;
    if (custpartno && custpartno !== "Y" && custpartno !== "N") {
      [rows] = await pool.query(
        `SELECT DISTINCT d.Quotenumber FROM pricescheduledetails d
         WHERE d.CustomerPartNo=? AND d.CftiPartNo=?
         AND EXISTS (
           SELECT 1 FROM quoteregister q WHERE q.Quotenumber=d.Quotenumber
           AND q.Opportunitystage IN (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))
         )`,
        [custpartno, cftipartno],
      );
    } else {
      [rows] = await pool.query(
        `SELECT DISTINCT d.Quotenumber FROM pricescheduledetails d
         WHERE d.CftiPartNo=?
         AND EXISTS (
           SELECT 1 FROM quoteregister q WHERE q.Quotenumber=d.Quotenumber
           AND q.Opportunitystage IN (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))
         )`,
        [cftipartno],
      );
    }
    if (rows.length > 0) {
      return res.json({
        openquote: true,
        message: `There is an Open Quote with this CFTI Part Number. Editing Leadtime and DeliveryTerm is not allowed.`,
        quotes: rows.map((r) => r.Quotenumber),
      });
    }
    res.json({ openquote: false });
  } catch (err) {
    // pricescheduledetails may not exist yet — allow edit
    res.json({ openquote: false });
  }
});

// ── ADD price ─────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
    LTSACode,
    Customerpartno,
    Cftipartno,
    Description,
    ListPrice,
    StartDate,
    ExpDate,
    Curr,
    Leadtime,
    DeliveryTerm,
    SPLCond,
    Remarks,
    Product,
    Market,
  } = req.body;

  // Mandatory fields
  if (
    !Cftipartno ||
    !Description ||
    !ListPrice ||
    !StartDate ||
    !Curr ||
    !Leadtime ||
    !DeliveryTerm ||
    !Product ||
    !Market
  )
    return res
      .status(400)
      .json({
        message:
          "CFTI Part No, Description, List Price, Start Date, Currency, Lead Time, Delivery Term, Product and Market are required.",
      });

  // Defaults / casing
  LTSACode = LTSACode?.trim() || "DEFAULT00";
  Customerpartno = Customerpartno?.trim() || null;
  Cftipartno = Cftipartno.trim().toUpperCase();
  Description = Description.trim();
  Product = Product.trim().toUpperCase();
  Market = Market.trim().toUpperCase();
  SPLCond = SPLCond?.trim() || null;
  Remarks = Remarks?.trim() || null;

  // Format dates YYYY-MM-DD
  const fmtDate = (d) => {
    if (!d) return null;
    // Support dd-mm-yyyy or yyyy-mm-dd
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };
  const startFmt = fmtDate(StartDate);
  const expFmt = fmtDate(ExpDate) || null;

  try {
    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM price");
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO price (Sno, LTSACode, Customerpartno, Cftipartno, Description,
        ListPrice, StartDate, ExpDate, Curr, Leadtime, DeliveryTerm,
        SPLCond, Remarks, Product, Market, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newSno,
        LTSACode,
        Customerpartno,
        Cftipartno,
        Description,
        parseFloat(ListPrice),
        startFmt,
        expFmt,
        Curr,
        Leadtime,
        DeliveryTerm,
        SPLCond,
        Remarks,
        Product,
        Market,
        "Active",
      ],
    );
    res.json({ success: true, message: "Price added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT price (only ExpDate, Leadtime, DeliveryTerm, SPLCond, Remarks editable) ─
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { ExpDate, Leadtime, DeliveryTerm, SPLCond, Remarks } = req.body;

  const fmtDate = (d) => {
    if (!d) return null;
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };
  const expFmt = fmtDate(ExpDate) || null;

  try {
    await pool.query(
      `UPDATE price SET ExpDate=?, Leadtime=?, DeliveryTerm=?, SPLCond=?, Remarks=? WHERE Sno=?`,
      [
        expFmt,
        Leadtime || null,
        DeliveryTerm || null,
        SPLCond || null,
        Remarks || null,
        sno,
      ],
    );
    res.json({ success: true, message: "Price updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TOGGLE status ─────────────────────────────────────────────────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query("UPDATE price SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
