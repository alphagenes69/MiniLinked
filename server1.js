const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// resume upload folder
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage: storage });

// upload endpoint
app.post("/upload", upload.single("resume"), (req, res) => {
    res.json({
        success: true,
        message: "Resume uploaded!",
        fileName: req.file.filename
    });
});

// start server
app.listen(5000, () => console.log("Backend running on http://localhost:5000"));
