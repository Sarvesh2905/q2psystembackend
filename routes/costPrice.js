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
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM costprice WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM costprice WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ── GET all (A-Z by Cftipartno) ───────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Cftipartno, Description, CostPrice, Currency,
              Product, Market, status
       FROM costprice ORDER BY Cftipartno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Cftipartno ────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.cftipartno || "").toLowerCase().trim();
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Cftipartno)) as nm FROM costprice`,
    );
    const exists = rows.some((r) => r.nm === val);
    if (exists)
      return res.json({
        exists: true,
        message:
          "The CFTI Part No. already exists in Cost Price. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET products list for dropdown ───────────────────────────────────────────
router.get("/products", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Products FROM product WHERE status = 'Active' ORDER BY Products ASC`,
    );
    res.json(rows.map((r) => r.Products));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD ───────────────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Cftipartno, Description, CostPrice, Currency, Product, Market } =
    req.body;

  if (!Cftipartno || !Cftipartno.trim())
    return res.status(400).json({ message: "CFTI Part No. is required." });
  if (CostPrice === undefined || CostPrice === null || CostPrice === "")
    return res.status(400).json({ message: "Cost Price is required." });
  if (isNaN(Number(CostPrice)) || Number(CostPrice) < 0)
    return res
      .status(400)
      .json({ message: "Cost Price must be a non-negative number." });
  if (!Currency || !Currency.trim())
    return res.status(400).json({ message: "Currency is required." });

  Cftipartno = Cftipartno.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Cftipartno)) as nm FROM costprice`,
    );
    const normalised = Cftipartno.toLowerCase();
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "The CFTI Part No. already exists. Please enter a different one.",
      });

    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM costprice",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO costprice (Sno, Cftipartno, Description, CostPrice, Currency, Product, Market, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [
        newSno,
        Cftipartno,
        Description?.trim() || null,
        Number(CostPrice),
        Currency.trim().toUpperCase(),
        Product || null,
        Market?.toUpperCase() || null,
      ],
    );
    res.json({ success: true, message: "Cost Price added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT (Cftipartno = LOCKED; CostPrice, Description, Currency, Product, Market editable) ──
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Description, CostPrice, Currency, Product, Market } = req.body;

  if (CostPrice === undefined || CostPrice === null || CostPrice === "")
    return res.status(400).json({ message: "Cost Price is required." });
  if (isNaN(Number(CostPrice)) || Number(CostPrice) < 0)
    return res
      .status(400)
      .json({ message: "Cost Price must be a non-negative number." });
  if (!Currency || !Currency.trim())
    return res.status(400).json({ message: "Currency is required." });

  try {
    await pool.query(
      `UPDATE costprice
       SET Description=?, CostPrice=?, Currency=?, Product=?, Market=?
       WHERE Sno=?`,
      [
        Description?.trim() || null,
        Number(CostPrice),
        Currency.trim().toUpperCase(),
        Product || null,
        Market?.toUpperCase() || null,
        sno,
      ],
    );
    res.json({ success: true, message: "Cost Price updated successfully!" });
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
    await pool.query(`UPDATE costprice SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
