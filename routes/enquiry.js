const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
require("dotenv").config();

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

function parseDate(dateStr) {
  if (!dateStr || !String(dateStr).trim()) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function capitalizeWords(s) {
  if (!s) return s;
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── DROPDOWNS ───────────────────────────────────────────────────────────────

router.get("/getcustomers", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT customername, Location, customercountry, customertype, Category AS custcategory
       FROM customer WHERE status='Active' ORDER BY customername ASC`,
    );
    res.json(
      rows.map((r) => ({
        customername: r.customername,
        location: r.Location,
        country: r.customercountry,
        custtype: r.customertype,
        custcategory: r.custcategory,
        currency: "",
      })),
    );
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getcustomerinfo", authMiddleware, async (req, res) => {
  const { customername } = req.query;
  try {
    // Get customer info + currency from country master
    const rows = await pool.query(
      `SELECT c.customercountry, c.customertype, c.Location, c.Category,
              co.Currency
       FROM customer c
       LEFT JOIN country co ON UPPER(TRIM(co.Countryname)) = UPPER(TRIM(c.customercountry))
       WHERE c.customername=? AND c.status='Active' LIMIT 1`,
      [customername],
    );
    if (!rows.length)
      return res.json({
        country: "",
        custtype: "",
        location: "",
        currency: "",
        custcategory: "",
      });
    const r = rows[0];
    res.json({
      country: r.customercountry,
      custtype: r.customertype,
      location: r.Location,
      currency: r.Currency || "",
      custcategory: r.Category || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getbuyers", authMiddleware, async (req, res) => {
  const { customer } = req.query;
  try {
    const rows = await pool.query(
      `SELECT Buyername FROM buyer WHERE Customer=? AND Buyername IS NOT NULL AND status='Active'`,
      [customer],
    );
    res.json(rows.map((r) => r.Buyername));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getappengineers", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT deptuserid FROM deptusers WHERE status='Active' ORDER BY deptuserid ASC`,
    );
    res.json(rows.map((r) => r.deptuserid));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getsalesmanagers", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT salescontactname FROM salescontact WHERE status='Active' ORDER BY salescontactname ASC`,
    );
    res.json(rows.map((r) => r.salescontactname));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getrfqt", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Opportunitytype' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqt", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Rfqcategory' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqs", authMiddleware, async (req, res) => {
  try {
    // Only Enquiry stage visible on creation (Sno=8 from screenshot)
    const rows = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Quotestage' AND Sno=8 ORDER BY Sno ASC`,
    );
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getstatus", authMiddleware, async (req, res) => {
  const { quotestage } = req.query;
  try {
    let rows;
    const qs = (quotestage || "").toUpperCase();
    if (qs === "ENQUIRY") {
      rows = await pool.query(
        `SELECT Data FROM quotedata WHERE Type='Opportunitystage' AND Status='Active' AND Sno=30 ORDER BY Sno ASC`,
      );
    } else if (["TECHNICAL OFFER", "PRICED OFFER"].includes(qs)) {
      rows = await pool.query(
        `SELECT Data FROM quotedata WHERE Type='Opportunitystage' AND Status='Active' AND Sno IN (22,23,24,25,26) ORDER BY Sno ASC`,
      );
    } else {
      rows = await pool.query(
        `SELECT Data FROM quotedata WHERE Type='Opportunitystage' AND Status='Active' ORDER BY Sno ASC`,
      );
    }
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getendcountries", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Countryname FROM country WHERE status='Active' ORDER BY Countryname ASC`,
    );
    res.json(rows.map((r) => r.Countryname));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getindustries", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Industry FROM endindustry ORDER BY Industry ASC`,
    );
    res.json(rows.map((r) => r.Industry));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getenduse", authMiddleware, async (req, res) => {
  const { endind } = req.query;
  try {
    const rows = await pool.query(
      `SELECT Description FROM endindustry WHERE LOWER(Industry)=?`,
      [endind?.toLowerCase()],
    );
    res.json({ enduse: rows[0]?.Description || "" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Facing factories from quotedata table (Type=Facing_factory)
router.get("/getff", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Data FROM quotedata WHERE Type='Facing_factory' AND Status='Active' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data).filter(Boolean));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Products filtered by facing factory
router.get("/getproducts", authMiddleware, async (req, res) => {
  const { facingfactory } = req.query;
  try {
    let rows;
    if (facingfactory) {
      rows = await pool.query(
        `SELECT Products, Image, Prdgroup FROM product 
         WHERE status='Active' AND UPPER(TRIM(FacingFactory))=UPPER(TRIM(?)) ORDER BY Products ASC`,
        [facingfactory],
      );
    } else {
      rows = await pool.query(
        `SELECT Products, Image, Prdgroup FROM product WHERE status='Active' ORDER BY Products ASC`,
      );
    }
    res.json(
      rows
        .filter((r) => r.Products)
        .map((r) => ({
          name: r.Products,
          image: r.Image,
          prdgroup: r.Prdgroup,
        })),
    );
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getreasons", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT ReasonCode FROM reason ORDER BY ReasonCode ASC`,
    );
    res.json(rows.map((r) => r.ReasonCode));
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── ADD FACING FACTORY DYNAMICALLY ──────────────────────────────────────────
router.post("/addfacingfactory", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { value } = req.body;
  if (!value?.trim())
    return res.status(400).json({ message: "Value is required." });
  const val = value.trim().toUpperCase();
  try {
    const existing = await pool.query(
      `SELECT Sno FROM quotedata WHERE Type='Facing_factory' AND UPPER(TRIM(Data))=?`,
      [val],
    );
    if (existing.length)
      return res
        .status(409)
        .json({ message: "Facing Factory already exists." });
    await pool.query(
      `INSERT INTO quotedata (Data, Type, Status) VALUES (?, 'Facing_factory', 'Active')`,
      [val],
    );
    res.json({ success: true, message: "Facing Factory added successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── ADD OPPORTUNITY TYPE DYNAMICALLY ────────────────────────────────────────
router.post("/addopportunitytype", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { value } = req.body;
  if (!value?.trim())
    return res.status(400).json({ message: "Value is required." });
  const val = value.trim().toUpperCase();
  try {
    const existing = await pool.query(
      `SELECT Sno FROM quotedata WHERE Type='Opportunitytype' AND UPPER(TRIM(Data))=?`,
      [val],
    );
    if (existing.length)
      return res
        .status(409)
        .json({ message: "Opportunity Type already exists." });
    await pool.query(
      `INSERT INTO quotedata (Data, Type, Status) VALUES (?, 'Opportunitytype', 'Active')`,
      [val],
    );
    res.json({
      success: true,
      message: "Opportunity Type added successfully!",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── QUOTE NUMBER GENERATION (called on Save) ────────────────────────────────
// Legacy = Schroedahl factory → prefix L
// Regular = CFTI / RTK and others → prefix R
// Format: L/R + YY + MM + DD + "-" + 4-digit series + "-" + 2-letter AE prefix
// Separate running series for L and R
async function generateQuoteNumber(facingFactory, deptuser, date, conn) {
  const isLegacy = facingFactory?.toUpperCase() === "SCHROEDAHL";
  const prefix = isLegacy ? "L" : "R";

  // Date part
  const d = date ? new Date(date) : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const datePart = `${yy}${mm}${dd}`;

  // 2-letter AE prefix from deptuserid (e.g. "KARTHIK-KS" → "KS", "NITHYA-TN" → "TN")
  let aePrefix = "XX";
  if (deptuser) {
    const parts = deptuser.split("-");
    if (parts.length >= 2)
      aePrefix = parts[parts.length - 1].substring(0, 2).toUpperCase();
    else aePrefix = deptuser.substring(0, 2).toUpperCase();
  }

  // Get next series number for this prefix (L or R) — global running series per type
  const rows = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(Quotenumber, 9, 4) AS UNSIGNED)) AS maxsno 
     FROM quoteregister WHERE SUBSTRING(Quotenumber,1,1)=?`,
    [prefix],
  );
  const maxSno = Number(rows[0]?.maxsno) || 0;
  const nextSno = String(maxSno + 1).padStart(4, "0");

  return `${prefix}${datePart}-${nextSno}-${aePrefix}`;
}

// ─── GET ALL ENQUIRIES ────────────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT Sno, Quotenumber, Rev, RFQREGDate, Salescontact, Deptuser,
              Customername, Customertype, CustomerCountry, Buyername, Groupname,
              Currency, RFQType, Projectname, Endusername, EndCountry, EndIndustry,
              RFQreference, RFQDate, RFQCategory, Quotestage, Quotesubmitteddate,
              Facingfactory, Product, Totallineitems, Winprob, Opportunitystage,
              Expectedorderdate, EffEnqDate, CustomerdueDate, ProposeddueDate,
              Priority, Comments, Quotedprice, QuotevalueUSD, CFTIquotedGM,
              Reason, RevisedDate, productchange
       FROM quoteregister ORDER BY Sno DESC`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── GET SINGLE ENQUIRY ───────────────────────────────────────────────────────
router.get("/:quotenumber", authMiddleware, async (req, res) => {
  const { quotenumber } = req.params;
  try {
    const rows = await pool.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─── ADD ENQUIRY (quote number generated here on save) ────────────────────────
router.post("/submit", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });

  const {
    RFQREGDate,
    Salescontact,
    Deptuser,
    Customername,
    Customertype,
    CustomerCountry,
    Buyername,
    Groupname,
    Currency,
    RFQType,
    Projectname,
    Endusername,
    EndCountry,
    EndIndustry,
    RFQreference,
    RFQDate,
    RFQCategory,
    Quotestage,
    Facingfactory,
    Product,
    Totallineitems,
    Winprob,
    Opportunitystage,
    Expectedorderdate,
    EffEnqDate,
    CustomerdueDate,
    ProposeddueDate,
    Priority,
    Comments,
  } = req.body;

  if (!Customername || !RFQDate || !Deptuser || !Salescontact || !Facingfactory)
    return res.status(400).json({ message: "Required fields missing." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Generate quote number based on facing factory
    const quoteNumber = await generateQuoteNumber(
      Facingfactory,
      Deptuser,
      RFQREGDate,
      conn,
    );

    await conn.query(
      `INSERT INTO quoteregister 
        (Quotenumber, Rev, RFQREGDate, Salescontact, Deptuser, Customername, Customertype,
         CustomerCountry, Buyername, Groupname, Currency, RFQType, Projectname, Endusername,
         EndCountry, EndIndustry, RFQreference, RFQDate, RFQCategory, Quotestage,
         Quotesubmitteddate, Facingfactory, Product, Totallineitems, Winprob, Opportunitystage,
         Expectedorderdate, EffEnqDate, CustomerdueDate, ProposeddueDate, Priority, Comments)
       VALUES (?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        quoteNumber,
        parseDate(RFQREGDate),
        Salescontact || null,
        Deptuser || null,
        Customername || null,
        Customertype || null,
        CustomerCountry || null,
        Buyername || null,
        Groupname || null,
        Currency || null,
        RFQType ? RFQType.toUpperCase() : null,
        Projectname || null,
        Endusername || null,
        EndCountry || null,
        EndIndustry || null,
        RFQreference || null,
        parseDate(RFQDate),
        RFQCategory || null,
        Quotestage || null,
        null, // Quotesubmitteddate frozen on creation
        Facingfactory ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems || null,
        Winprob || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority || "Low",
        Comments || null,
      ],
    );

    // Insert into quotetimeline per product
    const products = Array.isArray(Product)
      ? Product
      : (Product || "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
    for (const prod of products) {
      await conn.query(
        `INSERT INTO quotetimeline (Quotenumber, Deptuser, RFQDate, Product) VALUES (?,?,?,?)`,
        [quoteNumber, Deptuser, parseDate(RFQDate), prod],
      );
    }

    await conn.commit();
    res.json({
      success: true,
      message: "Enquiry registered successfully!",
      quoteNumber,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

// ─── UPDATE ENQUIRY ───────────────────────────────────────────────────────────
router.put("/:quotenumber", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (!["Admin", "Manager"].includes(role))
    return res.status(403).json({ message: "Access denied." });
  const { quotenumber } = req.params;
  const {
    RFQREGDate,
    Salescontact,
    Deptuser,
    Customername,
    Customertype,
    CustomerCountry,
    Buyername,
    Groupname,
    Currency,
    RFQType,
    Projectname,
    Endusername,
    EndCountry,
    EndIndustry,
    RFQreference,
    RFQDate,
    RFQCategory,
    Quotestage,
    Quotesubmitteddate,
    Facingfactory,
    Product,
    Totallineitems,
    Winprob,
    Opportunitystage,
    Expectedorderdate,
    EffEnqDate,
    CustomerdueDate,
    ProposeddueDate,
    Priority,
    Comments,
    Reason,
    RevisedDate,
    revision,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await conn.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=?`,
      [quotenumber],
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Enquiry not found." });
    }

    let rev = parseInt(revision) || 0;
    const r = existing[0];

    // Save to history
    await conn.query(
      `INSERT INTO quoteregisterhistory 
        (Quotenumber,Rev,RFQREGDate,Salescontact,Deptuser,Customername,Customertype,CustomerCountry,
         Buyername,Groupname,Currency,RFQType,Projectname,Endusername,EndCountry,EndIndustry,
         RFQreference,RFQDate,RFQCategory,EffEnqDate,CustomerdueDate,ProposeddueDate,Quotestage,
         Quotesubmitteddate,Facingfactory,Product,Totallineitems,Quotedprice,QuotevalueUSD,Winprob,
         CFTIquotedGM,Opportunitystage,Comments,Expectedorderdate,RevisedDate,Reason,Priority,productchange)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        r.Quotenumber,
        r.Rev,
        r.RFQREGDate,
        r.Salescontact,
        r.Deptuser,
        r.Customername,
        r.Customertype,
        r.CustomerCountry,
        r.Buyername,
        r.Groupname,
        r.Currency,
        r.RFQType,
        r.Projectname,
        r.Endusername,
        r.EndCountry,
        r.EndIndustry,
        r.RFQreference,
        r.RFQDate,
        r.RFQCategory,
        r.EffEnqDate,
        r.CustomerdueDate,
        r.ProposeddueDate,
        r.Quotestage,
        r.Quotesubmitteddate,
        r.Facingfactory,
        r.Product,
        r.Totallineitems,
        r.Quotedprice || 0,
        r.QuotevalueUSD || 0,
        r.Winprob,
        r.CFTIquotedGM || 0,
        r.Opportunitystage,
        r.Comments,
        r.Expectedorderdate,
        r.RevisedDate,
        r.Reason,
        r.Priority,
        r.productchange,
      ],
    );

    await conn.query(
      `UPDATE quoteregister SET
        RFQREGDate=?,Salescontact=?,Deptuser=?,Customername=?,Customertype=?,CustomerCountry=?,
        Buyername=?,Groupname=?,Currency=?,RFQType=?,Projectname=?,Endusername=?,EndCountry=?,
        EndIndustry=?,RFQreference=?,RFQDate=?,RFQCategory=?,Quotestage=?,Quotesubmitteddate=?,
        Facingfactory=?,Product=?,Totallineitems=?,Winprob=?,Opportunitystage=?,Expectedorderdate=?,
        EffEnqDate=?,CustomerdueDate=?,ProposeddueDate=?,Priority=?,Comments=?,Reason=?,RevisedDate=?,Rev=?
       WHERE Quotenumber=?`,
      [
        parseDate(RFQREGDate),
        Salescontact || null,
        Deptuser || null,
        Customername || null,
        Customertype || null,
        CustomerCountry || null,
        Buyername || null,
        Groupname || null,
        Currency || null,
        RFQType ? RFQType.toUpperCase() : null,
        Projectname || null,
        Endusername || null,
        EndCountry || null,
        EndIndustry || null,
        RFQreference || null,
        parseDate(RFQDate),
        RFQCategory || null,
        Quotestage || null,
        parseDate(Quotesubmitteddate),
        Facingfactory ? Facingfactory.toUpperCase() : null,
        Array.isArray(Product) ? Product.join(", ") : Product || null,
        Totallineitems || null,
        Winprob || null,
        Opportunitystage || null,
        parseDate(Expectedorderdate),
        parseDate(EffEnqDate),
        parseDate(CustomerdueDate),
        parseDate(ProposeddueDate),
        Priority || "Low",
        Comments || null,
        Reason || null,
        parseDate(RevisedDate),
        rev,
        quotenumber,
      ],
    );

    await conn.commit();
    res.json({ success: true, message: "Enquiry updated successfully!" });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

// ─── GENERATE QUOTE (timeline update) ────────────────────────────────────────
router.post("/generate-quote", authMiddleware, async (req, res) => {
  const { quotenumber } = req.body;
  if (!quotenumber)
    return res.status(400).json({ message: "Quote number is required." });
  try {
    const rows = await pool.query(
      `SELECT * FROM quoteregister WHERE Quotenumber=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    const r = rows[0];
    const existing = await pool.query(
      `SELECT Sno FROM quotetimeline WHERE Quotenumber=? AND Enquiry='Y' LIMIT 1`,
      [quotenumber],
    );
    if (existing.length)
      return res.status(409).json({ message: "Quote already generated." });
    await pool.query(
      `UPDATE quotetimeline SET Enquiry='Y', Lastupdateddate=CURDATE() WHERE Quotenumber=?`,
      [quotenumber],
    );
    const updated = await pool.query(
      `SELECT Sno FROM quotetimeline WHERE Quotenumber=?`,
      [quotenumber],
    );
    if (!updated.length) {
      const products = (r.Product || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const prod of products) {
        await pool.query(
          `INSERT INTO quotetimeline (Quotenumber, Deptuser, RFQDate, Enquiry, Product) VALUES (?,?,?,'Y',?)`,
          [r.Quotenumber, r.Deptuser, r.RFQDate, prod],
        );
      }
    }
    res.json({ success: true, quoteNumber: quotenumber });
  } catch (err) {
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;
