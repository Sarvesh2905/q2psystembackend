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

// ── GET all active LTSA prices ────────────────────────────────────────────────
// ── GET all active LTSA prices ────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    // safe auto-expire — won't crash if table is empty or has issues
    try {
      await pool.query(
        `UPDATE ltsaprice SET status='Inactive'
         WHERE ExpDate < CURDATE() AND status='Active'`
      );
    } catch (_) {}

    const [rows] = await pool.query(
      `SELECT Sno, LTSACode, Customerpartno, Cftipartno, Description,
              SplPrice, StartDate, ExpDate, Curr, Leadtime,
              DeliveryTerm, Product, Market, status
       FROM ltsaprice WHERE status='Active'
       ORDER BY Cftipartno ASC`
    );
    res.json(rows);
  } catch (err) {
    // Send detailed error so you can see exactly what's wrong
    res.status(500).json({ message: "Server error: " + err.message });
  }
});


// ── DOWNLOAD LTSA with full data ──────────────────────────────────────────────
router.get("/download", authMiddleware, async (req, res) => {
  // Role check — Admin and Manager only
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Manager")
    return res
      .status(403)
      .json({ message: "Access denied. Only Admin/Manager can download." });

  try {
    const [rows] = await pool.query(
      `SELECT LTSACode, Customerpartno, Cftipartno, Description,
              SplPrice, StartDate, ExpDate,
              Curr, Leadtime, DeliveryTerm, Product, Market, status
       FROM ltsaprice
       ORDER BY Cftipartno ASC`,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("LTSA Price Data");

    worksheet.columns = [
      { header: "LTSACode", key: "LTSACode", width: 14 },
      { header: "Customerpartno", key: "Customerpartno", width: 18 },
      { header: "Cftipartno", key: "Cftipartno", width: 18 },
      { header: "Description", key: "Description", width: 32 },
      { header: "SplPrice", key: "SplPrice", width: 14 },
      { header: "StartDate", key: "StartDate", width: 14 },
      { header: "ExpDate", key: "ExpDate", width: 14 },
      { header: "Currency", key: "Currency", width: 10 },
      { header: "Leadtime", key: "Leadtime", width: 14 },
      { header: "DeliveryTerm", key: "DeliveryTerm", width: 16 },
      { header: "Product", key: "Product", width: 14 },
      { header: "Market", key: "Market", width: 10 },
      { header: "Status", key: "Status", width: 10 },
    ];

    const hr = worksheet.getRow(1);
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1565C0" },
    };
    hr.alignment = { horizontal: "center", vertical: "middle" };
    hr.height = 20;

    rows.forEach((row) => {
      const added = worksheet.addRow({
        LTSACode: row.LTSACode || "",
        Customerpartno: row.Customerpartno || "",
        Cftipartno: row.Cftipartno || "",
        Description: row.Description || "",
        SplPrice: row.SplPrice || 0,
        StartDate: row.StartDate
          ? new Date(row.StartDate).toISOString().split("T")[0]
          : "",
        ExpDate: row.ExpDate
          ? new Date(row.ExpDate).toISOString().split("T")[0]
          : "",
        Currency: row.Curr || "USD",
        Leadtime: row.Leadtime || "",
        DeliveryTerm: row.DeliveryTerm || "",
        Product: row.Product || "",
        Market: row.Market || "",
        Status: row.status || "Active",
      });
      if (added.number % 2 === 0)
        added.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF0F4FF" },
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
      `attachment; filename=ltsa_price_${today}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: "Download error: " + err.message });
  }
});

// ── ADD LTSA price ────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let {
    LTSACode,
    Customerpartno,
    Cftipartno,
    Description,
    SplPrice,
    StartDate,
    ExpDate,
    Curr,
    Leadtime,
    DeliveryTerm,
    Product,
    Market,
  } = req.body;

  if (
    !LTSACode ||
    !Customerpartno ||
    !Cftipartno ||
    !Description ||
    !SplPrice ||
    !StartDate ||
    !Curr ||
    !Leadtime ||
    !DeliveryTerm ||
    !Product ||
    !Market
  )
    return res.status(400).json({ message: "All fields are required." });

  LTSACode = LTSACode.trim();
  Customerpartno = Customerpartno.trim();
  Cftipartno = Cftipartno.trim().toUpperCase();
  Description = Description.trim();
  Product = Product.trim().toUpperCase();
  Market = Market.trim().toUpperCase();

  const fmtDate = (d) => {
    if (!d) return null;
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };

  try {
    const [maxRow] = await pool.query("SELECT MAX(Sno) as m FROM ltsaprice");
    const newSno = (maxRow[0].m || 0) + 1;
    await pool.query(
      `INSERT INTO ltsaprice
         (Sno, LTSACode, Customerpartno, Cftipartno, Description,
          SplPrice, StartDate, ExpDate, Curr, Leadtime,
          DeliveryTerm, Product, Market, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Active')`,
      [
        newSno,
        LTSACode,
        Customerpartno,
        Cftipartno,
        Description,
        parseFloat(SplPrice),
        fmtDate(StartDate),
        fmtDate(ExpDate) || null,
        Curr,
        Leadtime,
        DeliveryTerm,
        Product,
        Market,
      ],
    );
    res.json({ success: true, message: "LTSA Price added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT LTSA price ───────────────────────────────────────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { ExpDate, Leadtime, DeliveryTerm } = req.body;

  const fmtDate = (d) => {
    if (!d) return null;
    if (d.includes("-") && d.split("-")[0].length === 4) return d;
    const [dd, mm, yyyy] = d.split("-");
    return `${yyyy}-${mm}-${dd}`;
  };

  try {
    await pool.query(
      `UPDATE ltsaprice SET ExpDate=?, Leadtime=?, DeliveryTerm=? WHERE Sno=?`,
      [fmtDate(ExpDate) || null, Leadtime || null, DeliveryTerm || null, sno],
    );
    res.json({ success: true, message: "LTSA Price updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TOGGLE LTSA status ────────────────────────────────────────────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query("UPDATE ltsaprice SET status=? WHERE Sno=?", [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
