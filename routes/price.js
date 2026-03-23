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
      `UPDATE price SET status='Inactive'
       WHERE Exp_Date < CURDATE() AND status='Active'`,
    );
  } catch (_) {}
}

// counts
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM price WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM price WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all active prices
router.get("/", authMiddleware, async (req, res) => {
  await autoExpire();
  try {
    const [rows] = await pool.query(
      `SELECT Sno, LTSA_Code, Customer_partno, Cfti_partno, Description,
              ListPrice, Start_Date, Exp_Date, Curr, Leadtime,
              DeliveryTerm, SPL_Cond, Remarks, Product, Market, status
       FROM price WHERE status='Active'
       ORDER BY Cfti_partno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// dropdown options
router.get("/options", authMiddleware, async (req, res) => {
  try {
    const [leadtimes] = await pool.query(
      `SELECT Data FROM quote_data
       WHERE Type='Leadtime' AND Status='Active' ORDER BY Data ASC`,
    );
    const [deliveryterms] = await pool.query(
      `SELECT Data FROM quote_data
       WHERE Type='Deliveryterm' AND Status='Active' ORDER BY Data ASC`,
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

// CFTI part numbers
router.get("/cftiparts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Cfti_partno FROM price
       WHERE (Start_Date <= CURDATE() OR Start_Date IS NULL)
         AND (Exp_Date IS NULL OR Exp_Date >= CURDATE())
         AND status='Active'
       ORDER BY Cfti_partno ASC`,
    );
    res.json(rows.map((r) => r.Cfti_partno));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate Customer PN check
router.get("/check/custpartno", authMiddleware, async (req, res) => {
  const { custpartno } = req.query;
  try {
    if (custpartno) {
      const [rows] = await pool.query(
        `SELECT Customer_partno FROM price WHERE LOWER(Customer_partno) = ?`,
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

// check open quote — price_schedule_details not in DB, safe fallback
router.get("/check/openquote", authMiddleware, async (req, res) => {
  res.json({ openquote: false });
});

// download full price list
router.get("/download", authMiddleware, async (req, res) => {
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Manager")
    return res
      .status(403)
      .json({ message: "Access denied. Only Admin/Manager can download." });

  try {
    const [rows] = await pool.query(
      `SELECT LTSA_Code, Customer_partno, Cfti_partno, Description,
              ListPrice, Start_Date, Exp_Date, Curr,
              Leadtime, DeliveryTerm, SPL_Cond, Remarks,
              Product, Market, status
       FROM price
       ORDER BY Cfti_partno ASC`,
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Price Data");

    worksheet.columns = [
      { header: "LTSA_Code", key: "LTSA_Code", width: 14 },
      { header: "Customer_partno", key: "Customer_partno", width: 18 },
      { header: "Cfti_partno", key: "Cfti_partno", width: 18 },
      { header: "Description", key: "Description", width: 32 },
      { header: "ListPrice", key: "ListPrice", width: 14 },
      { header: "Start_Date", key: "Start_Date", width: 14 },
      { header: "Exp_Date", key: "Exp_Date", width: 14 },
      { header: "Currency", key: "Currency", width: 10 },
      { header: "Leadtime", key: "Leadtime", width: 14 },
      { header: "DeliveryTerm", key: "DeliveryTerm", width: 16 },
      { header: "SPL_Cond", key: "SPL_Cond", width: 14 },
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
        LTSA_Code: row.LTSA_Code || "DEFAULT00",
        Customer_partno: row.Customer_partno || "",
        Cfti_partno: row.Cfti_partno || "",
        Description: row.Description || "",
        ListPrice: row.ListPrice || 0,
        Start_Date: row.Start_Date
          ? new Date(row.Start_Date).toISOString().split("T")[0]
          : "",
        Exp_Date: row.Exp_Date
          ? new Date(row.Exp_Date).toISOString().split("T")[0]
          : "",
        Currency: row.Curr || "USD",
        Leadtime: row.Leadtime || "",
        DeliveryTerm: row.DeliveryTerm || "",
        SPL_Cond: row.SPL_Cond || "",
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

// add price
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
    await pool.query(
      `INSERT INTO price
         (LTSA_Code, Customer_partno, Cfti_partno, Description,
          ListPrice, Start_Date, Exp_Date, Curr, Leadtime,
          DeliveryTerm, SPL_Cond, Remarks, Product, Market, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
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

// edit price
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
    const [result] = await pool.query(
      `UPDATE price SET Exp_Date=?, Leadtime=?, DeliveryTerm=?, SPL_Cond=?, Remarks=?
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
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Price updated successfully!" });
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
    await pool.query("UPDATE price SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
