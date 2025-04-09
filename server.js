const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Base directory and doodle storage path
const baseDir = process.cwd();
const doodleFolder = path.join(baseDir, "data", "doodles");

// Middleware setup
app.use(cors()); // Enable CORS for all domains (You can modify it later for more specific rules)
app.use(express.json({ limit: "10mb" }));
app.use("/data", express.static(path.join(baseDir, "data")));

// Ensure doodle folder exists
fs.mkdirSync(doodleFolder, { recursive: true }, (err) => {
  if (err) {
    console.error("Error creating doodle folder:", err);
  } else {
    console.log("✅ Doodle folder is ready.");
  }
});

// POST: Submit new doodle
app.post("/submit", (req, res) => {
  const { imageData } = req.body;
  if (!imageData) {
    console.error("Error: Missing imageData");
    return res.status(400).send("Missing imageData");
  }

  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `doodle-${Date.now()}.png`;
  const filePath = path.join(doodleFolder, filename);

  fs.writeFile(filePath, base64Data, "base64", (err) => {
    if (err) {
      console.error("Error saving doodle:", err);
      return res.status(500).send("Failed to save doodle");
    }
    console.log(`✅ Doodle saved at ${filePath}`);
    res.status(200).send("Saved successfully!");
  });
});

// DELETE: Remove a specific doodle
app.delete("/delete/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(doodleFolder, filename);

  // Prevent path traversal attacks
  if (!filename.endsWith(".png") || filename.includes("..")) {
    return res.status(400).send("Invalid filename");
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Error deleting doodle:", err);
      return res.status(500).send("Failed to delete doodle");
    }
    console.log(`🗑️ Deleted doodle: ${filename}`);
    res.status(200).send("Deleted successfully!");
  });
});

// GET: Serve doodle gallery page
app.get("/", (req, res) => {
  console.log("Handling gallery request...");
  fs.readdir(doodleFolder, (err, files) => {
    if (err) {
      console.error("Error reading doodles:", err);
      return res.status(500).send("Error reading doodles.");
    }

    const imageCards = files
      .filter(file => file.endsWith(".png"))
      .sort((a, b) => b.localeCompare(a))
      .map(file => ` 
        <div style="margin: 20px; display: inline-block;">
          <img src="/data/doodles/${file}" alt="${file}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
          <br>
          <button onclick="deleteImage('${file}')">🗑️ Delete</button>
        </div>
      `)
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>My Doodle Gallery</title>
          <style>
            body {
              background-color: #feb1cb;
              font-family: sans-serif;
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 2rem;
            }
            button {
              background: #ff4b5c;
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: 5px;
              cursor: pointer;
            }
            button:hover {
              background: #e04353;
            }
          </style>
        </head>
        <body>
          <h1>My Doodle Gallery</h1>
          ${imageCards || "<p>No doodles yet!</p>"}
          <script>
            function deleteImage(filename) {
              if (confirm("Are you sure you want to delete " + filename + "?")) {
                fetch('/delete/' + filename, { method: 'DELETE' })
                  .then(res => {
                    if (res.ok) {
                      alert("Deleted!");
                      location.reload();
                    } else {
                      alert("Failed to delete.");
                    }
                  });
              }
            }
          </script>
        </body>
      </html>
    `;
    res.send(html);
  });
});

// Optional test route
app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
