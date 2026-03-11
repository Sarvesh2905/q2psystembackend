const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/deptusers", require("./routes/deptusers"));
app.use("/api/salescontact", require("./routes/salescontact"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/buyer", require("./routes/buyer"));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`✅ Backend running on http://localhost:${PORT}`),
);
