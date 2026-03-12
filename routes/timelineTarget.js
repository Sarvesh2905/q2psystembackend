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

// ── GET all (A-Z by Product) ──────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Product, Enquiry, Technicaloffer, Pricedoffer,
              Pricebookorder, Regret, Cancelled
       FROM timelinetarget ORDER BY Product ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET products list (from product master, not yet in timelinetarget) ─────────
router.get("/available-products", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Products FROM product
       WHERE status = 'Active'
       AND Products NOT IN (SELECT Product FROM timelinetarget)
       ORDER BY Products ASC`,
    );
    res.json(rows.map((r) => r.Products));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Product ────────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.product || "").toLowerCase().trim();
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Product)) as nm FROM timelinetarget`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message: "Timeline target for this Product already exists.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD ───────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const {
    Product,
    Enquiry,
    Technicaloffer,
    Pricedoffer,
    Pricebookorder,
    Regret,
    Cancelled,
  } = req.body;

  if (!Product || !Product.trim())
    return res.status(400).json({ message: "Product is required." });

  const fields = {
    Enquiry,
    Technicaloffer,
    Pricedoffer,
    Pricebookorder,
    Regret,
    Cancelled,
  };
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null || val === "")
      return res.status(400).json({ message: `${key} is required.` });
    if (isNaN(Number(val)) || Number(val) < 0)
      return res
        .status(400)
        .json({ message: `${key} must be a non-negative number.` });
  }

  try {
    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM timelinetarget",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO timelinetarget
         (Sno, Product, Enquiry, Technicaloffer, Pricedoffer, Pricebookorder, Regret, Cancelled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSno,
        Product.trim(),
        Number(Enquiry),
        Number(Technicaloffer),
        Number(Pricedoffer),
        Number(Pricebookorder),
        Number(Regret),
        Number(Cancelled),
      ],
    );
    res.json({ success: true, message: "Timeline Target added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "Timeline target for this Product already exists." });
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (Product = LOCKED, all numeric fields editable) ──────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const {
    Enquiry,
    Technicaloffer,
    Pricedoffer,
    Pricebookorder,
    Regret,
    Cancelled,
  } = req.body;

  const fields = {
    Enquiry,
    Technicaloffer,
    Pricedoffer,
    Pricebookorder,
    Regret,
    Cancelled,
  };
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined || val === null || val === "")
      return res.status(400).json({ message: `${key} is required.` });
    if (isNaN(Number(val)) || Number(val) < 0)
      return res
        .status(400)
        .json({ message: `${key} must be a non-negative number.` });
  }

  try {
    await pool.query(
      `UPDATE timelinetarget
       SET Enquiry=?, Technicaloffer=?, Pricedoffer=?,
           Pricebookorder=?, Regret=?, Cancelled=?
       WHERE Sno=?`,
      [
        Number(Enquiry),
        Number(Technicaloffer),
        Number(Pricedoffer),
        Number(Pricebookorder),
        Number(Regret),
        Number(Cancelled),
        sno,
      ],
    );
    res.json({
      success: true,
      message: "Timeline Target updated successfully!",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
