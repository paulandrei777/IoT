const express = require("express");
const cors = require("cors");

// Import routes
const itemRoutes = require("./routes/itemRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use routes
app.use("/api/items", itemRoutes); // <--- important

// Test route
app.get("/", (req, res) => {
  res.send("DominiFinds API Running ✅");
});

module.exports = app;