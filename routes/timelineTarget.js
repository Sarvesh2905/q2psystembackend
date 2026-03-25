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

// NO status column in timeline_target — just total count
router.get("/counts", authMiddleware, async (req, res) => {
  try {
    const [[total]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM timeline_target",
    );
    res.json({ total: total.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Product,
              Enquiry,
              Technical_offer  AS TechnicalOffer,
              Priced_offer     AS PricedOffer,
              Price_book_order AS PriceBookOrder,
              Regret,
              Cancelled
       FROM timeline_target ORDER BY Product ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check", authMiddleware, async (req, res) => {
  const val = (req.query.product || "").toLowerCase().trim();
  if (!val) return res.json({ exists: false });
  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Product)) AS pr FROM timeline_target`,
    );
    const exists = rows.some((r) => r.pr === val);
    if (exists)
      return res.json({
        exists: true,
        message:
          "This Product already exists in Timeline Target. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/products", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Products FROM product WHERE status='Active' ORDER BY Products ASC`,
    );
    res.json(rows.map((r) => r.Products));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const {
    Product,
    Enquiry,
    TechnicalOffer,
    PricedOffer,
    PriceBookOrder,
    Regret,
    Cancelled,
  } = req.body;

  if (!Product || !Product.trim())
    return res.status(400).json({ message: "Product is required." });

  try {
    const [rows] = await pool.query(
      `SELECT LOWER(TRIM(Product)) AS pr FROM timeline_target`,
    );
    if (rows.some((r) => r.pr === Product.trim().toLowerCase()))
      return res.status(409).json({
        message:
          "This Product already exists in Timeline Target. Please enter a different one.",
      });

    await pool.query(
      `INSERT INTO timeline_target
        (Product, Enquiry, Technical_offer, Priced_offer,
         Price_book_order, Regret, Cancelled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        Product.trim(),
        Enquiry || 0,
        TechnicalOffer || 0,
        PricedOffer || 0,
        PriceBookOrder || 0,
        Regret || 0,
        Cancelled || 0,
      ],
    );
    res.json({ success: true, message: "Timeline Target added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const {
    Enquiry,
    TechnicalOffer,
    PricedOffer,
    PriceBookOrder,
    Regret,
    Cancelled,
  } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE timeline_target
       SET Enquiry=?, Technical_offer=?, Priced_offer=?,
           Price_book_order=?, Regret=?, Cancelled=?
       WHERE Sno=?`,
      [
        Enquiry || 0,
        TechnicalOffer || 0,
        PricedOffer || 0,
        PriceBookOrder || 0,
        Regret || 0,
        Cancelled || 0,
        sno,
      ],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({
      success: true,
      message: "Timeline Target updated successfully!",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// NO toggle route — timeline_target has no status column

module.exports = router;
