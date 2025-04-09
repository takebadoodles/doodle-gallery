const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Base directory and doodle storage path
const baseDir = process.cwd();
const doodleFolder = path.join(baseDir, "data", "doodles");

// Middleware setup
app.use(cors()); // Enable CORS for all domains (You can modify it later for more specific rules)
app.use(express.json({ limit: "10mb" }));
app.use("/data", express.static(path.join(baseDir, "data")));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: "your-secret-key", resave: false, saveUninitialized: true }));

// Google OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Google Drive API
const drive = google.drive({ version: "v3", auth: oauth2Client });

// Ensure doodle folder exists
fs.mkdirSync(doodleFolder, { recursive: true }, (err) => {
  if (err) {
    console.error("Error creating doodle folder:", err);
  } else {
    console.log("✅ Doodle folder is ready.");
  }
});

// Route to initiate OAuth login
app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });
  res.redirect(authUrl);
});

// OAuth2 callback route
app.get("/oauth2callback", (req, res) => {
  const code = req.query.code;
  oauth2Client.getToken(code, (err, tokens) => {
    if (err) {
      console.error("Error getting OAuth tokens:", err);
      return res.status(500).send("Failed to authenticate");
    }
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    res.redirect("/gallery");
  });
});

// POST: Submit new doodle (Save to Google Drive)
app.post("/submit", (req, res) => {
  const { imageData } = req.body;
  if (!imageData) {
    console.error("Error: Missing imageData");
    return res.status(400).send("Missing imageData");
  }

  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `doodle-${Date.now()}.png`;

  // Save image to Google Drive
  const fileMetadata = {
    name: filename,
    parents: ["root"],
  };
  const media = {
    mimeType: "image/png",
    body: Buffer.from(base64Data, "base64"),
  };

  drive.files.create(
    {
      resource: fileMetadata,
      media: media,
      fields: "id",
    },
    (err, file) => {
      if (err) {
        console.error("Error saving doodle to Google Drive:", err);
        return res.status(500).send("Failed to save doodle to Google Drive");
      }
      console.log(`✅ Doodle saved at Google Drive with ID: ${file.data.id}`);
      res.status(200).send("Saved successfully!");
    }
  );
});

// DELETE: Remove a specific doodle (Delete from Google Drive)
app.delete("/delete/:filename", (req, res) => {
  const { filename } = req.params;

  // Prevent path traversal attacks
  if (!filename.endsWith(".png") || filename.includes("..")) {
    return res.status(400).send("Invalid filename");
  }

  // Get file ID from Google Drive
  drive.files.list(
    {
      q: `name = '${filename}'`,
      fields: "files(id, name)",
    },
    (err, result) => {
      if (err) {
        console.error("Error fetching file from Google Drive:", err);
        return res.status(500).send("Failed to fetch file");
      }

      const file = result.data.files[0];
      if (file) {
        drive.files.delete({ fileId: file.id }, (err) => {
          if (err) {
            console.error("Error deleting file from Google Drive:", err);
            return res.status(500).send("Failed to delete doodle");
          }
          console.log(`🗑️ Deleted doodle: ${filename}`);
          res.status(200).send("Deleted successfully!");
        });
      } else {
        res.status(404).send("File not found");
      }
    }
  );
});

// GET: Serve doodle gallery page
app.get("/gallery", (req, res) => {
  if (!req.session.tokens) {
    return res.redirect("/auth/google");
  }

  oauth2Client.setCredentials(req.session.tokens);

  // Fetch files from Google Drive
  drive.files.list(
    {
      q: "mimeType = 'image/png'",
      fields: "files(id, name)",
    },
    (err, result) => {
      if (err) {
        console.error("Error reading doodles from Google Drive:", err);
        return res.status(500).send("Error reading doodles.");
      }

      const imageCards = result.data.files
        .map(
          (file) => `
          <div style="margin: 20px; display: inline-block;">
            <img src="https://drive.google.com/uc?id=${file.id}" alt="${file.name}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
            <br>
            <button onclick="deleteImage('${file.name}')">🗑️ Delete</button>
          </div>
        `
        )
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
    }
  );
});

// Optional test route
app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
