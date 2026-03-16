const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

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

async function autoExpire() {
  try {
    await pool.query(
      `UPDATE price SET status='Inactive' WHERE ExpDate < CURDATE() AND status='Active'`,
    );
  } catch (_) {}
}

// ── GET all active Standard prices ───────────────────────────────────────────
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

// ── GET dropdown options ──────────────────────────────────────────────────────
router.get("/options", authMiddleware, async (req, res) => {
  try {
    const [leadtimes] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Leadtime' AND Status='Active' ORDER BY Data ASC`,
    );
    const [deliveryterms] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Deliveryterm' AND Status='Active' ORDER BY Data ASC`,
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

// ── GET CFTI part numbers ─────────────────────────────────────────────────────
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

// ── CHECK duplicate Customer PN ───────────────────────────────────────────────
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
          message: "Customer Part Number already exists.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK open quote ──────────────────────────────────────────────────────────
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
           AND q.Opportunitystage IN
             (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))
         )`,
        [custpartno, cftipartno],
      );
    } else {
      [rows] = await pool.query(
        `SELECT DISTINCT d.Quotenumber FROM pricescheduledetails d
         WHERE d.CftiPartNo=?
         AND EXISTS (
           SELECT 1 FROM quoteregister q WHERE q.Quotenumber=d.Quotenumber
           AND q.Opportunitystage IN
             (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))
         )`,
        [cftipartno],
      );
    }
    if (rows.length > 0)
      return res.json({
        openquote: true,
        message: `There is an Open Quote with this CFTI Part Number. Editing Leadtime and DeliveryTerm is not allowed.`,
        quotes: rows.map((r) => r.Quotenumber),
      });
    res.json({ openquote: false });
  } catch {
    res.json({ openquote: false });
  }
});

// ── DOWNLOAD Standard with full data — Admin/Manager only ────────────────────
router.get("/download", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Manager")
    return res
      .status(403)
      .json({ message: "Access denied. Only Admin/Manager can download." });

  try {
    const [rows] = await pool.query(
      `SELECT LTSACode, Customerpartno, Cftipartno, Description,
              ListPrice, StartDate, ExpDate, Curr,
              Leadtime, DeliveryTerm, SPLCond, Remarks,
              Product, Market, status
       FROM price
       ORDER BY Cftipartno ASC`,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Price Data");

    worksheet.columns = [
      { header: "LTSACode", key: "LTSACode", width: 14 },
      { header: "Customerpartno", key: "Customerpartno", width: 18 },
      { header: "Cftipartno", key: "Cftipartno", width: 18 },
      { header: "Description", key: "Description", width: 32 },
      { header: "ListPrice", key: "ListPrice", width: 14 },
      { header: "StartDate", key: "StartDate", width: 14 },
      { header: "ExpDate", key: "ExpDate", width: 14 },
      { header: "Currency", key: "Currency", width: 10 },
      { header: "Leadtime", key: "Leadtime", width: 14 },
      { header: "DeliveryTerm", key: "DeliveryTerm", width: 16 },
      { header: "SPLCond", key: "SPLCond", width: 14 },
      { header: "Remarks", key: "Remarks", width: 14 },
      { header: "Product", key: "Product", width: 14 },
      { header: "Market", key: "Market", width: 10 },
      { header: "Status", key: "Status", width: 10 },
    ];

    const hr = worksheet.getRow(1);
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF8B0000" },
    };
    hr.alignment = { horizontal: "center", vertical: "middle" };
    hr.height = 20;

    rows.forEach((row) => {
      const added = worksheet.addRow({
        LTSACode: row.LTSACode || "DEFAULT00",
        Customerpartno: row.Customerpartno || "",
        Cftipartno: row.Cftipartno || "",
        Description: row.Description || "",
        ListPrice: row.ListPrice || 0,
        StartDate: row.StartDate
          ? new Date(row.StartDate).toISOString().split("T")[0]
          : "",
        ExpDate: row.ExpDate
          ? new Date(row.ExpDate).toISOString().split("T")[0]
          : "",
        Currency: row.Curr || "USD",
        Leadtime: row.Leadtime || "",
        DeliveryTerm: row.DeliveryTerm || "",
        SPLCond: row.SPLCond || "",
        Remarks: row.Remarks || "",
        Product: row.Product || "",
        Market: row.Market || "",
        Status: row.status || "Active",
      });
      if (added.number % 2 === 0)
        added.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF5F5" },
        };
    });

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    const today = new Date().toISOString().split("T")[0];
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=standard_price_${today}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: "Download error: " + err.message });
  }
});

// ── ADD Standard price ────────────────────────────────────────────────────────
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
      .json({ message: "All required fields must be filled." });

  LTSACode = LTSACode?.trim() || "DEFAULT00";
  Customerpartno = Customerpartno?.trim() || null;
  Cftipartno = Cftipartno.trim().toUpperCase();
  Description = Description.trim();
  Product = Product.trim().toUpperCase();
  Market = Market.trim().toUpperCase();
  SPLCond = SPLCond?.trim() || null;
  Remarks = Remarks?.trim() || null;

  const fmtDate = (d) => {
    if (!d) return null;
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };

  try {
    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM price");
    const newSno = (maxRow[0].maxSno || 0) + 1;
    await pool.query(
      `INSERT INTO price
         (Sno, LTSACode, Customerpartno, Cftipartno, Description,
          ListPrice, StartDate, ExpDate, Curr, Leadtime,
          DeliveryTerm, SPLCond, Remarks, Product, Market, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newSno,
        LTSACode,
        Customerpartno,
        Cftipartno,
        Description,
        parseFloat(ListPrice),
        fmtDate(StartDate),
        fmtDate(ExpDate) || null,
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

// ── EDIT Standard price ───────────────────────────────────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { ExpDate, Leadtime, DeliveryTerm, SPLCond, Remarks } = req.body;

  const fmtDate = (d) => {
    if (!d) return null;
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };

  try {
    await pool.query(
      `UPDATE price SET ExpDate=?, Leadtime=?, DeliveryTerm=?, SPLCond=?, Remarks=?
       WHERE Sno=?`,
      [
        fmtDate(ExpDate) || null,
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

// ── TOGGLE Standard status ────────────────────────────────────────────────────
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
