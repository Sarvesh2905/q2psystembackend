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


// ── GET all discounts (A-Z by Type then Category) ────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Type, Category, Market, Product, Discount
       FROM discount
       ORDER BY Type ASC, Category ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET Category + Product dropdown options ───────────────────────────────────
router.get("/options", authMiddleware, async (req, res) => {
  try {
    const [categories] = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Customertype' AND Status='Active' ORDER BY Data ASC`,
    );
    const [products] = await pool.query(
      `SELECT Products FROM product WHERE status='Active' ORDER BY Products ASC`,
    );
    res.json({
      categories: categories.map((r) =>
        r.Data.split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      ),
      products: products.map((r) => r.Products),
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate combination (Type + Category + Market + Product) ──────────
router.get("/check", authMiddleware, async (req, res) => {
  const { type, category, product, market } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as cnt FROM discount
       WHERE LOWER(Type)=? AND LOWER(Category)=? AND LOWER(Market)=? AND LOWER(Product)=?`,
      [
        (type || "").toLowerCase(),
        (category || "").toLowerCase(),
        (market || "").toLowerCase(),
        (product || "").toLowerCase(),
      ],
    );
    if (rows[0].cnt > 0)
      return res.json({
        exists: true,
        message:
          "This Discount combination already exists. Please enter a different one.",
      });
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK if discount change affects open quotes (edit focusout) ──────────────
router.get("/check/openquote", authMiddleware, async (req, res) => {
  const { category, product, discount } = req.query;
  const newDiscount = parseFloat(discount) || 0;
  try {
    const [existing] = await pool.query(
      `SELECT Discount FROM discount WHERE Category=? AND Product=?`,
      [category, product],
    );
    if (existing.length > 0 && existing[0].Discount !== newDiscount) {
      try {
        const [openQuotes] = await pool.query(
          `SELECT Quotenumber FROM quoteregister WHERE Customertype=? AND Product=?`,
          [category, product],
        );
        if (openQuotes.length > 0) {
          const list = openQuotes
            .map((q) => `<li style="width:150px">${q.Quotenumber}</li>`)
            .join("");
          return res.json({
            discountchange: true,
            message: `There are Open Quotes affected by this change:<ul>${list}</ul>`,
          });
        }
      } catch (_) {}
    }
    res.json({ discountchange: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD discount ──────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { Type, Category, Market, Product, Discount } = req.body;

  if (
    !Type ||
    !Category ||
    !Market ||
    !Product ||
    Discount === undefined ||
    Discount === ""
  )
    return res.status(400).json({
      message:
        "All fields (Type, Category, Market, Product, Discount) are required.",
    });

  try {
    // Duplicate check
    const [exists] = await pool.query(
      `SELECT COUNT(*) as cnt FROM discount
       WHERE LOWER(Type)=? AND LOWER(Category)=? AND LOWER(Market)=? AND LOWER(Product)=?`,
      [
        Type.toLowerCase(),
        Category.toLowerCase(),
        Market.toLowerCase(),
        Product.toLowerCase(),
      ],
    );
    if (exists[0].cnt > 0)
      return res.status(409).json({
        message:
          "This Discount combination already exists. Please enter a different one.",
      });

    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM discount",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO discount (Sno, Type, Category, Market, Product, Discount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newSno, Type, Category, Market, Product, parseFloat(Discount)],
    );
    res.json({ success: true, message: "Discount added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error: " + err.message });
  }
});

// ── EDIT discount (only Discount value is editable) ───────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { Discount } = req.body;

  if (Discount === undefined || Discount === "")
    return res.status(400).json({ message: "Discount value is required." });

  try {
    const [result] = await pool.query(
      `UPDATE discount SET Discount=? WHERE Sno=?`,
      [parseFloat(Discount), sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Discount updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
