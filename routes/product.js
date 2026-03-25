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
      "SELECT COUNT(*) AS cnt FROM product WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM product WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET all — alias DB column names to match frontend keys
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              Products,
              Description,
              Facing_Factory AS FacingFactory,
              Prd_group      AS Prdgroup,
              status
       FROM product ORDER BY Products ASC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// duplicate product check
router.get("/check", authMiddleware, async (req, res) => {
  const { product } = req.query;
  try {
    if (product) {
      const [rows] = await pool.query(
        `SELECT Products FROM product
         WHERE LOWER(REPLACE(TRIM(Products),' ','')) = ?`,
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

// ADD — frontend sends FacingFactory/Prdgroup, map to DB column names
router.post("/", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  let { Products, Description, FacingFactory, Prdgroup } = req.body;

  if (!Products || !FacingFactory || !Prdgroup)
    return res.status(400).json({
      message: "Product Name, Facing Factory and Group are required.",
    });

  Products = Products.trim().toUpperCase();
  FacingFactory = FacingFactory.trim().toUpperCase();
  Prdgroup = Prdgroup.trim().toUpperCase();
  Description = Description?.trim()
    ? Description.trim().charAt(0).toUpperCase() +
      Description.trim().slice(1).toLowerCase()
    : null;

  try {
    await pool.query(
      `INSERT INTO product
         (Products, Description, Facing_Factory, status, Image, Prd_group)
       VALUES (?,?,?,?,?,?)`,
      [Products, Description, FacingFactory, "Active", "default.png", Prdgroup],
    );
    res.json({ success: true, message: "Product added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({
        message: "The Product already exists. Please enter a different one.",
      });
    res.status(500).json({ message: "Server error" });
  }
});

// EDIT (Description only)
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
    if (status === "Inactive") {
      const [[prod]] = await pool.query(
        `SELECT Products FROM product WHERE Sno=?`,
        [sno],
      );
      if (prod) {
        // Check for open quotes: Opportunity_stage is not Regret, Cancelled, or Won
        const [openQuotes] = await pool.query(
          `SELECT Quote_number FROM quote_register
           WHERE FIND_IN_SET(?, REPLACE(Product, ', ', ','))
             AND (Opportunity_stage IS NULL
               OR UPPER(TRIM(Opportunity_stage)) NOT IN ('REGRET','CANCELLED','WON'))`,
          [prod.Products],
        );
        if (openQuotes.length > 0) {
          const qnos = openQuotes.map((q) => q.Quote_number).join(", ");
          return res.json({
            success: false,
            openquote: true,
            message: `There are Open Quotes with this Product: ${qnos}`,
          });
        }
      }
    }
    await pool.query("UPDATE product SET status=? WHERE Sno=?", [status, sno]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
