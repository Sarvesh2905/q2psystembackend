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

// ── GET all products (A-Z by Products) ───────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno, Products, Description, FacingFactory, Prdgroup, status
       FROM product ORDER BY Products ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicate Products name ─────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const { product } = req.query;
  try {
    if (product) {
      const [rows] = await pool.query(
        `SELECT Products FROM product WHERE LOWER(REPLACE(TRIM(Products),' ','')) = ?`,
        [product.toLowerCase().replace(/\s+/g, "")],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          message: "The Product already exists. Please enter a different one.",
        });
    }
    res.json({ exists: false });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── ADD product ───────────────────────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Products, Description, FacingFactory, Prdgroup } = req.body;

  if (!Products || !FacingFactory || !Prdgroup)
    return res
      .status(400)
      .json({
        message: "Product Name, Facing Factory and Group are required.",
      });

  // Apply casing as per original
  Products = Products.trim().toUpperCase();
  FacingFactory = FacingFactory.trim().toUpperCase();
  Prdgroup = Prdgroup.trim().toUpperCase();
  Description = Description?.trim()
    ? Description.trim().charAt(0).toUpperCase() +
      Description.trim().slice(1).toLowerCase()
    : null;

  try {
    const [maxRow] = await pool.query("SELECT MAX(Sno) as maxSno FROM product");
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      `INSERT INTO product (Sno, Products, Description, FacingFactory, status, Image, Prdgroup)
       VALUES (?,?,?,?,?,?,?)`,
      [newSno, Products, Description, FacingFactory, "Active", "", Prdgroup],
    );
    res.json({ success: true, message: "Product added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({
          message: "The Product already exists. Please enter a different one.",
        });
    res.status(500).json({ message: "Server error" });
  }
});

// ── EDIT product (only Description editable) ──────────────────────────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { Description } = req.body;

  Description = Description?.trim()
    ? Description.trim().charAt(0).toUpperCase() +
      Description.trim().slice(1).toLowerCase()
    : null;

  try {
    const [result] = await pool.query(
      `UPDATE product SET Description=? WHERE Sno=?`,
      [Description, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Product updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── TOGGLE status (check open quotes before going Inactive) ──────────────────
router.patch("/toggle/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  const { status } = req.body;
  if (!["Active", "Inactive"].includes(status))
    return res.status(400).json({ message: "Invalid status." });

  try {
    // Check open quotes when trying to go Inactive
    if (status === "Inactive") {
      const [openQuotes] = await pool.query(
        `SELECT Quotenumber FROM quoteregister
         WHERE Product IN (SELECT Products FROM product WHERE Sno=?)
         AND Opportunitystage IN (SELECT Data FROM quotedata WHERE Sno IN (22,24,27,29,30))`,
        [sno],
      );
      if (openQuotes.length > 0) {
        const qnos = openQuotes.map((q) => q.Quotenumber).join(", ");
        return res.json({
          success: false,
          openquote: true,
          message: `There are Open Quotes with this Product: ${qnos}`,
        });
      }
    }
    await pool.query("UPDATE product SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
