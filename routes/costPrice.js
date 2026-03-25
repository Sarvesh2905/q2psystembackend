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

// counts
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[active]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM cost_price WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM cost_price WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// all cost prices
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Cfti_partno, Description, Cost_Price, Currency,
              Product, Market, status
       FROM cost_price ORDER BY Cfti_partno ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate Cfti_partno check
router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.cftipartno || "").toLowerCase().trim();
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Cfti_partno)) as nm FROM cost_price`,
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

// products dropdown
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

// add cost price
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Cfti_partno, Description, Cost_Price, Currency, Product, Market } =
    req.body;

  if (!Cfti_partno || !Cfti_partno.trim())
    return res.status(400).json({ message: "CFTI Part No. is required." });
  if (Cost_Price === undefined || Cost_Price === null || Cost_Price === "")
    return res.status(400).json({ message: "Cost Price is required." });
  if (isNaN(Number(Cost_Price)) || Number(Cost_Price) < 0)
    return res
      .status(400)
      .json({ message: "Cost Price must be a non-negative number." });
  if (!Currency || !Currency.trim())
    return res.status(400).json({ message: "Currency is required." });

  Cfti_partno = Cfti_partno.trim().toUpperCase();

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Cfti_partno)) as nm FROM cost_price`,
    );
    const normalised = Cfti_partno.toLowerCase();
    if (rows.some((r) => r.nm === normalised))
      return res.status(409).json({
        message:
          "The CFTI Part No. already exists. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO cost_price
        (Cfti_partno, Description, Cost_Price, Currency, Product, Market, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
      [
        Cfti_partno,
        Description?.trim() || null,
        Number(Cost_Price),
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

// edit cost price
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Description, Cost_Price, Currency, Product, Market } = req.body;

  if (Cost_Price === undefined || Cost_Price === null || Cost_Price === "")
    return res.status(400).json({ message: "Cost Price is required." });
  if (isNaN(Number(Cost_Price)) || Number(Cost_Price) < 0)
    return res
      .status(400)
      .json({ message: "Cost Price must be a non-negative number." });
  if (!Currency || !Currency.trim())
    return res.status(400).json({ message: "Currency is required." });

  try {
    await pool.query(
      `UPDATE cost_price
       SET Description=?, Cost_Price=?, Currency=?, Product=?, Market=?
       WHERE Sno=?`,
      [
        Description?.trim() || null,
        Number(Cost_Price),
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
    await pool.query(`UPDATE cost_price SET status=? WHERE Sno=?`, [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
