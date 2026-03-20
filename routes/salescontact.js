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
      "SELECT COUNT(*) AS cnt FROM salescontact WHERE status='Active'",
    );
    const [[inactive]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM salescontact WHERE status='Inactive'",
    );
    res.json({ active: active.cnt, inactive: inactive.cnt });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── GET all (A-Z by salescontactname) ────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT Sno, salescontactname, email, mobile, landline, status FROM salescontact ORDER BY salescontactname ASC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ── CHECK duplicates ──────────────────────────────────────────────────────────
router.get("/check", authMiddleware, async (req, res) => {
  const { name, email, mobile, landline } = req.query;
  try {
    if (name) {
      const [rows] = await pool.query(
        'SELECT salescontactname FROM salescontact WHERE LOWER(REPLACE(TRIM(salescontactname)," ","")) = ?',
        [name.toLowerCase().replace(/\s/g, "")],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "name",
          message: "Sales Contact name already exists.",
        });
    }
    if (email) {
      const [rows] = await pool.query(
        "SELECT email FROM salescontact WHERE LOWER(TRIM(email)) = ?",
        [email.toLowerCase().trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "email",
          message: "Email already exists.",
        });
    }
    if (mobile) {
      const [rows] = await pool.query(
        "SELECT mobile FROM salescontact WHERE mobile = ?",
        [mobile.trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "mobile",
          message: "Mobile number already exists.",
        });
    }
    if (landline) {
      const [rows] = await pool.query(
        "SELECT landline FROM salescontact WHERE landline = ?",
        [landline.trim()],
      );
      if (rows.length > 0)
        return res.json({
          exists: true,
          field: "landline",
          message: "Landline already exists.",
        });
    }
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

  let { salescontactname, email, mobile, landline } = req.body;
  if (!salescontactname || !email)
    return res.status(400).json({ message: "Name and Email are required." });

  salescontactname = salescontactname
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  mobile = mobile?.trim() || null;
  landline = landline?.trim() || null;

  try {
    const [maxRow] = await pool.query(
      "SELECT MAX(Sno) as maxSno FROM salescontact",
    );
    const newSno = (maxRow[0].maxSno || 0) + 1;

    await pool.query(
      "INSERT INTO salescontact (Sno, salescontactname, email, mobile, landline, status) VALUES (?,?,?,?,?,?)",
      [newSno, salescontactname, email, mobile, landline, "Active"],
    );
    res.json({ success: true, message: "Sales contact added successfully!" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ message: "Sales Contact name already exists." });
    res.status(500).json({ message: "Server error" });
  }
});

// ── EDIT (name & email locked, only mobile & landline editable) ───────────────
router.put("/:sno", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const { sno } = req.params;
  let { mobile, landline } = req.body;
  mobile = mobile?.trim() || null;
  landline = landline?.trim() || null;

  try {
    const [result] = await pool.query(
      "UPDATE salescontact SET mobile = ?, landline = ? WHERE Sno = ?",
      [mobile, landline, sno],
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Record not found." });
    res.json({ success: true, message: "Sales contact updated successfully!" });
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
    await pool.query("UPDATE salescontact SET status = ? WHERE Sno = ?", [
      status,
      sno,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
