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

router.get("/getcustomers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT customer_name AS customername, Location,
              customer_country AS customercountry,
              customer_type AS customertype
       FROM customer WHERE status='Active' ORDER BY customer_name ASC`,
    );
    res.json(
      rows.map((r) => ({
        customername: r.customername,
        location: r.Location,
        country: r.customercountry,
        custtype: r.customertype,
        currency: "",
      })),
    );
  } catch (err) {
    console.error("getcustomers", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getcustomerinfo", authMiddleware, async (req, res) => {
  const { customername } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT customer_country AS customercountry,
              customer_type AS customertype,
              Location
       FROM customer WHERE customer_name=? AND status='Active' LIMIT 1`,
      [customername],
    );
    if (!rows.length)
      return res.json({
        country: "",
        custtype: "",
        location: "",
        currency: "",
      });
    const r = rows[0];
    res.json({
      country: r.customercountry,
      custtype: r.customertype,
      location: r.Location,
      currency: "",
    });
  } catch (err) {
    console.error("getcustomerinfo", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getbuyers", authMiddleware, async (req, res) => {
  const { customer } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Buyer_name AS Buyername FROM buyer
       WHERE Customer=? AND Buyer_name IS NOT NULL AND status='Active'`,
      [customer],
    );
    res.json(rows.map((r) => r.Buyername));
  } catch (err) {
    console.error("getbuyers", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getappengineers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT dept_user_id AS deptuserid FROM dept_users
       WHERE status='Active' ORDER BY dept_user_id ASC`,
    );
    res.json(rows.map((r) => r.deptuserid));
  } catch (err) {
    console.error("getappengineers", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getsalesmanagers", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sales_contact_name AS salescontactname FROM sales_contact
       WHERE status='Active' ORDER BY sales_contact_name ASC`,
    );
    res.json(rows.map((r) => r.salescontactname));
  } catch (err) {
    console.error("getsalesmanagers", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getrfqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Opportunitytype' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    console.error("getrfqt", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqt", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data WHERE Type='Rfqcategory' ORDER BY Data ASC`,
    );
    res.json(rows.map((r) => r.Data));
  } catch (err) {
    console.error("getqt", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getqs", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Data FROM quote_data
       WHERE Type='Quotestage' AND Sno > 8 ORDER BY Sno ASC`,
    );
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    console.error("getqs", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getstatus", authMiddleware, async (req, res) => {
  const { quotestage } = req.query;
  try {
    let rows;
    const qs = (quotestage || "").toUpperCase();
    if (qs === "ENQUIRY") {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data
         WHERE Type='Opportunitystage' AND Status='Active' AND Sno > 30
         ORDER BY Sno ASC`,
      );
    } else if (qs === "TECHNICAL OFFER" || qs === "PRICED OFFER") {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data
         WHERE Type='Opportunitystage' AND Status='Active'
         AND Sno IN (22,23,24,25,26) ORDER BY Sno ASC`,
      );
    } else {
      [rows] = await pool.query(
        `SELECT Data FROM quote_data
         WHERE Type='Opportunitystage' AND Status='Active'
         ORDER BY Sno ASC`,
      );
    }
    res.json(rows.map((r) => capitalizeWords(r.Data)));
  } catch (err) {
    console.error("getstatus", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getendcountries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Country_name AS Countryname FROM country
       WHERE status='Active' ORDER BY Country_name ASC`,
    );
    res.json(rows.map((r) => r.Countryname));
  } catch (err) {
    console.error("getendcountries", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getindustries", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Industry FROM end_industry ORDER BY Industry ASC`,
    );
    res.json(rows.map((r) => r.Industry));
  } catch (err) {
    console.error("getindustries", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getenduse", authMiddleware, async (req, res) => {
  const { endind } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT Description FROM end_industry WHERE LOWER(Industry)=?`,
      [endind?.toLowerCase()],
    );
    res.json({ enduse: rows[0]?.Description });
  } catch (err) {
    console.error("getenduse", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getff", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT Facing_Factory AS FacingFactory FROM product
       WHERE status='Active'
       AND Facing_Factory IS NOT NULL AND Facing_Factory != ''
       ORDER BY Facing_Factory ASC`,
    );
    res.json(rows.map((r) => r.FacingFactory).filter(Boolean));
  } catch (err) {
    console.error("getff", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getproducts", authMiddleware, async (req, res) => {
  const { facingfactory } = req.query;
  try {
    let rows;
    if (facingfactory) {
      [rows] = await pool.query(
        `SELECT Products, Image, Prd_group AS Prdgroup FROM product
         WHERE status='Active'
         AND UPPER(TRIM(Facing_Factory))=UPPER(TRIM(?))
         ORDER BY Products ASC`,
        [facingfactory],
      );
    } else {
      [rows] = await pool.query(
        `SELECT Products, Image, Prd_group AS Prdgroup FROM product
         WHERE status='Active' ORDER BY Products ASC`,
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
    console.error("getproducts", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/getreasons", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Reason_Code AS ReasonCode FROM reason ORDER BY Reason_Code ASC`,
    );
    res.json(rows.map((r) => r.ReasonCode));
  } catch (err) {
    console.error("getreasons", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/fetchsno", authMiddleware, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT COUNT(Quote_number) as cnt,
              ROUND(MAX(CAST(SUBSTRING(Quote_number,9,4) AS UNSIGNED)),0) as sno
       FROM quote_register
       WHERE SUBSTRING(RFQ_REG_Date,1,4)=?`,
      [String(currentYear)],
    );
    const cnt = Number(rows[0].cnt) || 0;
    const sno = Number(rows[0].sno) || 0;
    const next = !cnt && sno === 0 ? 1 : sno + 1;
    const quoteNumber = `R${currentYear}${String(next).padStart(4, "0")}`;
    res.json({ sno: next, quoteNumber });
  } catch (err) {
    console.error("fetchsno", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT Sno,
              Quote_number         AS Quotenumber,
              Rev,
              RFQ_REG_Date         AS RFQREGDate,
              Sales_contact        AS Salescontact,
              Dept_user            AS Deptuser,
              Customer_name        AS Customername,
              Customer_type        AS Customertype,
              Customer_Country     AS CustomerCountry,
              Buyer_name           AS Buyername,
              Group_name           AS Groupname,
              Currency,
              RFQ_Type             AS RFQType,
              Project_name         AS Projectname,
              End_user_name        AS Endusername,
              End_Country          AS EndCountry,
              End_Industry         AS EndIndustry,
              RFQ_reference        AS RFQreference,
              RFQ_Date             AS RFQDate,
              RFQ_Category         AS RFQCategory,
              Quote_stage          AS Quotestage,
              Quote_submitted_date AS Quotesubmitteddate,
              Facing_factory       AS Facingfactory,
              Product,
              Total_line_items     AS Totallineitems,
              Win_prob             AS Winprob,
              Opportunity_stage    AS Opportunitystage,
              Expected_order_date  AS Expectedorderdate,
              Eff_Enq_Date         AS EffEnqDate,
              Customer_due_Date    AS CustomerdueDate,
              Proposed_due_Date    AS ProposeddueDate,
              Priority,
              Comments,
              Quoted_price         AS Quotedprice,
              Quote_value_USD      AS QuotevalueUSD,
              CFTI_quoted_GM       AS CFTIquotedGM,
              Reason,
              Revised_Date         AS RevisedDate,
              product_change       AS productchange
       FROM quote_register ORDER BY Sno DESC`,
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:quotenumber", authMiddleware, async (req, res) => {
  const { quotenumber } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT *,
              Quote_number         AS Quotenumber,
              RFQ_REG_Date         AS RFQREGDate,
              Sales_contact        AS Salescontact,
              Dept_user            AS Deptuser,
              Customer_name        AS Customername,
              Customer_type        AS Customertype,
              Customer_Country     AS CustomerCountry,
              Buyer_name           AS Buyername,
              Group_name           AS Groupname,
              RFQ_Type             AS RFQType,
              Project_name         AS Projectname,
              End_user_name        AS Endusername,
              End_Country          AS EndCountry,
              End_Industry         AS EndIndustry,
              RFQ_reference        AS RFQreference,
              RFQ_Date             AS RFQDate,
              RFQ_Category         AS RFQCategory,
              Quote_stage          AS Quotestage,
              Quote_submitted_date AS Quotesubmitteddate,
              Facing_factory       AS Facingfactory,
              Total_line_items     AS Totallineitems,
              Win_prob             AS Winprob,
              Opportunity_stage    AS Opportunitystage,
              Expected_order_date  AS Expectedorderdate,
              Eff_Enq_Date         AS EffEnqDate,
              Customer_due_Date    AS CustomerdueDate,
              Proposed_due_Date    AS ProposeddueDate,
              Quoted_price         AS Quotedprice,
              Quote_value_USD      AS QuotevalueUSD,
              CFTI_quoted_GM       AS CFTIquotedGM,
              Revised_Date         AS RevisedDate,
              product_change       AS productchange
       FROM quote_register WHERE Quote_number=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error("GET /:quotenumber", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/submit", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
    return res.status(403).json({ message: "Access denied." });

  const {
    Quotenumber,
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
  } = req.body;

  if (!Quotenumber || !Customername || !RFQDate || !Deptuser || !Salescontact)
    return res.status(400).json({ message: "Required fields missing." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO quote_register
        (Quote_number, Rev, RFQ_REG_Date, Sales_contact, Dept_user,
         Customer_name, Customer_type, Customer_Country, Buyer_name,
         Group_name, Currency, RFQ_Type, Project_name, End_user_name,
         End_Country, End_Industry, RFQ_reference, RFQ_Date, RFQ_Category,
         Quote_stage, Quote_submitted_date, Facing_factory, Product,
         Total_line_items, Win_prob, Opportunity_stage, Expected_order_date,
         Eff_Enq_Date, Customer_due_Date, Proposed_due_Date, Priority, Comments)
       VALUES (?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        Quotenumber,
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
      ],
    );

    if (RFQType) {
      const rfqUpper = RFQType.toUpperCase();
      const [ex] = await conn.query(
        `SELECT Sno FROM quote_data
         WHERE Data=? AND Type='Opportunitytype'`,
        [rfqUpper],
      );
      if (!ex.length)
        await conn.query(
          `INSERT INTO quote_data (Data, Type, Status)
           VALUES (?, 'Opportunitytype', 'Active')`,
          [rfqUpper],
        );
    }

    const products = Array.isArray(Product)
      ? Product
      : (Product || "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

    for (const prod of products) {
      await conn.query(
        `INSERT INTO quote_timeline
          (Quote_number, Dept_user, RFQ_Date, Product)
         VALUES (?, ?, ?, ?)`,
        [Quotenumber, Deptuser, parseDate(RFQDate), prod],
      );
    }

    await conn.commit();
    res.json({ success: true, message: "Enquiry registered successfully!" });
  } catch (err) {
    await conn.rollback();
    console.error("POST /submit", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

router.put("/:quotenumber", authMiddleware, async (req, res) => {
  const role = req.user.role;
  if (role !== "Admin" && role !== "Manager")
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

    const [existing] = await conn.query(
      `SELECT Quote_stage, Rev FROM quote_register WHERE Quote_number=?`,
      [quotenumber],
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Enquiry not found." });
    }

    const rev = parseInt(revision) || 0;

    const [cur] = await conn.query(
      `SELECT * FROM quote_register WHERE Quote_number=?`,
      [quotenumber],
    );
    if (cur.length) {
      const r = cur[0];
      await conn.query(
        `INSERT INTO quote_register_history
          (Quote_number, Rev, RFQ_REG_Date, Sales_contact, Dept_user,
           Customer_name, Customer_type, Customer_Country, Buyer_name,
           Group_name, Currency, RFQ_Type, Project_name, End_user_name,
           End_Country, End_Industry, RFQ_reference, RFQ_Date, RFQ_Category,
           Eff_Enq_Date, Customer_due_Date, Proposed_due_Date, Quote_stage,
           Quote_submitted_date, Facing_factory, Product, Total_line_items,
           Quoted_price, Quote_value_USD, Win_prob, CFTI_quoted_GM,
           Opportunity_stage, Comments, Expected_order_date, Revised_Date,
           Reason, Priority, product_change)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.Quote_number,
          r.Rev,
          r.RFQ_REG_Date,
          r.Sales_contact,
          r.Dept_user,
          r.Customer_name,
          r.Customer_type,
          r.Customer_Country,
          r.Buyer_name,
          r.Group_name,
          r.Currency,
          r.RFQ_Type,
          r.Project_name,
          r.End_user_name,
          r.End_Country,
          r.End_Industry,
          r.RFQ_reference,
          r.RFQ_Date,
          r.RFQ_Category,
          r.Eff_Enq_Date,
          r.Customer_due_Date,
          r.Proposed_due_Date,
          r.Quote_stage,
          r.Quote_submitted_date,
          r.Facing_factory,
          r.Product,
          r.Total_line_items,
          r.Quoted_price || 0,
          r.Quote_value_USD || 0,
          r.Win_prob,
          r.CFTI_quoted_GM || 0,
          r.Opportunity_stage,
          r.Comments,
          r.Expected_order_date,
          r.Revised_Date,
          r.Reason,
          r.Priority,
          r.product_change,
        ],
      );
    }

    await conn.query(
      `UPDATE quote_register SET
        RFQ_REG_Date=?, Sales_contact=?, Dept_user=?,
        Customer_name=?, Customer_type=?, Customer_Country=?,
        Buyer_name=?, Group_name=?, Currency=?, RFQ_Type=?,
        Project_name=?, End_user_name=?, End_Country=?, End_Industry=?,
        RFQ_reference=?, RFQ_Date=?, RFQ_Category=?, Quote_stage=?,
        Quote_submitted_date=?, Facing_factory=?, Product=?,
        Total_line_items=?, Win_prob=?, Opportunity_stage=?,
        Expected_order_date=?, Eff_Enq_Date=?, Customer_due_Date=?,
        Proposed_due_Date=?, Priority=?, Comments=?,
        Reason=?, Revised_Date=?, Rev=?
       WHERE Quote_number=?`,
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
    console.error("PUT /:quotenumber", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  } finally {
    conn.release();
  }
});

router.post("/generate-quote", authMiddleware, async (req, res) => {
  const { quotenumber } = req.body;
  if (!quotenumber)
    return res.status(400).json({ message: "Quote number is required." });

  try {
    const [rows] = await pool.query(
      `SELECT * FROM quote_register WHERE Quote_number=? LIMIT 1`,
      [quotenumber],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Enquiry not found." });

    const r = rows[0];

    const [existing] = await pool.query(
      `SELECT Sno FROM quote_timeline
       WHERE Quote_number=? AND Enquiry='Y' LIMIT 1`,
      [quotenumber],
    );
    if (existing.length)
      return res.status(409).json({
        message: "Quote already generated for this enquiry.",
      });

    await pool.query(
      `UPDATE quote_timeline
       SET Enquiry='Y', Last_updated_date=CURDATE()
       WHERE Quote_number=?`,
      [quotenumber],
    );

    const [updated] = await pool.query(
      `SELECT Sno FROM quote_timeline WHERE Quote_number=?`,
      [quotenumber],
    );
    if (!updated.length) {
      const products = (r.Product || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const prod of products) {
        await pool.query(
          `INSERT INTO quote_timeline
            (Quote_number, Dept_user, RFQ_Date, Enquiry, Product)
           VALUES (?, ?, ?, 'Y', ?)`,
          [r.Quote_number, r.Dept_user, r.RFQ_Date, prod],
        );
      }
    }

    res.json({ success: true, quoteNumber: quotenumber });
  } catch (err) {
    console.error("POST /generate-quote", err);
    res.status(500).json({ message: "Server error", detail: err.message });
  }
});

module.exports = router;
