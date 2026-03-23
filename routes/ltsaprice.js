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

// counts
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM ltsa_price WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM ltsa_price WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all active LTSA prices (with auto-expire)
router.get("/", authMiddleware, async (req, res) => {
  try {
    try {
      await pool.query(
        `UPDATE ltsa_price SET status='Inactive'
         WHERE Exp_Date < CURDATE() AND status='Active'`,
      );
    } catch {}

    const [rows] = await pool.query(
      `SELECT Sno, LTSA_Code, Customer_partno, Cfti_partno, Description,
              SplPrice, Start_Date, Exp_Date, Curr, Leadtime,
              DeliveryTerm, Product, Market, status
       FROM ltsa_price
       WHERE status='Active'
       ORDER BY Cfti_partno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// download LTSA full data
router.get("/download", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Manager")
    return res
      .status(403)
      .json({ message: "Access denied. Only Admin/Manager can download." });

  try {
    const [rows] = await pool.query(
      `SELECT LTSA_Code, Customer_partno, Cfti_partno, Description,
              SplPrice, Start_Date, Exp_Date,
              Curr, Leadtime, DeliveryTerm, Product, Market, status
       FROM ltsa_price
       ORDER BY Cfti_partno ASC`,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("LTSA Price Data");

    worksheet.columns = [
      { header: "LTSA_Code", key: "LTSA_Code", width: 14 },
      { header: "Customer_partno", key: "Customer_partno", width: 18 },
      { header: "Cfti_partno", key: "Cfti_partno", width: 18 },
      { header: "Description", key: "Description", width: 32 },
      { header: "SplPrice", key: "SplPrice", width: 14 },
      { header: "Start_Date", key: "Start_Date", width: 14 },
      { header: "Exp_Date", key: "Exp_Date", width: 14 },
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
        LTSA_Code: row.LTSA_Code || "",
        Customer_partno: row.Customer_partno || "",
        Cfti_partno: row.Cfti_partno || "",
        Description: row.Description || "",
        SplPrice: row.SplPrice || 0,
        Start_Date: row.Start_Date
          ? new Date(row.Start_Date).toISOString().split("T")[0]
          : "",
        Exp_Date: row.Exp_Date
          ? new Date(row.Exp_Date).toISOString().split("T")[0]
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

// add LTSA price
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
    await pool.query(
      `INSERT INTO ltsa_price
         (LTSA_Code, Customer_partno, Cfti_partno, Description,
          SplPrice, Start_Date, Exp_Date, Curr, Leadtime,
          DeliveryTerm, Product, Market, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Active')`,
      [
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

// edit LTSA price
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
    const [result] = await pool.query(
      `UPDATE ltsa_price SET Exp_Date=?, Leadtime=?, DeliveryTerm=? WHERE Sno=?`,
      [fmtDate(ExpDate) || null, Leadtime || null, DeliveryTerm || null, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "LTSA Price updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// toggle status
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    await pool.query("UPDATE ltsa_price SET status=? WHERE Sno=?", [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
