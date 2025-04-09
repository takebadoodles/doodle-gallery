const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");
const mime = require("mime-types");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Drive setup
const GOOGLE_DRIVE_FOLDER_ID = '13lFFV-q1Cse2xSWogmWr6VTLeaVd54V2'; // Replace with your Google Drive folder ID
const API_KEY = 'AIzaSyDn9C4IlvhmxCwTunE3OEf2oalh7Hwsefc'; // Replace with your API key

// Google Auth client setup
const auth = new google.auth.GoogleAuth({
  apiKey: API_KEY,
  scopes: ['https://www.googleapis.com/auth/drive.file']
});

const drive = google.drive({ version: 'v3', auth });

// Middleware setup
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/data", express.static(path.join(process.cwd(), "data")));

// POST: Submit new doodle (upload to Google Drive)
app.post("/submit", async (req, res) => {
  const { imageData } = req.body;
  if (!imageData) {
    console.error("Error: Missing imageData");
    return res.status(400).send("Missing imageData");
  }

  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `doodle-${Date.now()}.png`;
  const mimeType = mime.lookup(filename); // Get the MIME type based on the file extension

  try {
    // Upload to Google Drive
    const fileMetadata = {
      name: filename,
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };
    const media = {
      mimeType: mimeType,
      body: Buffer.from(base64Data, 'base64')
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id'
    });

    console.log(`✅ Doodle uploaded to Google Drive with ID: ${file.data.id}`);
    res.status(200).send("Saved successfully!");
  } catch (err) {
    console.error("Error uploading to Google Drive:", err);
    res.status(500).send("Failed to save doodle");
  }
});

// DELETE: Remove a specific doodle (from Google Drive)
app.delete("/delete/:filename", async (req, res) => {
  const { filename } = req.params;

  try {
    // Search for the file in Google Drive
    const filesList = await drive.files.list({
      q: `name = '${filename}' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents`,
      fields: 'files(id, name)'
    });

    const file = filesList.data.files[0];

    if (!file) {
      return res.status(404).send("File not found");
    }

    // Delete the file from Google Drive
    await drive.files.delete({ fileId: file.id });
    console.log(`🗑️ Deleted doodle: ${filename}`);
    res.status(200).send("Deleted successfully!");
  } catch (err) {
    console.error("Error deleting doodle from Google Drive:", err);
    res.status(500).send("Failed to delete doodle");
  }
});

// GET: Serve doodle gallery page (list files from Google Drive)
app.get("/", async (req, res) => {
  try {
    // List files in Google Drive folder
    const filesList = await drive.files.list({
      q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents`,
      fields: 'files(id, name, webViewLink)',
    });

    const files = filesList.data.files;

    if (files.length === 0) {
      return res.status(200).send("<p>No doodles yet!</p>");
    }

    const imageCards = files
      .map(file => `
        <div style="margin: 20px; display: inline-block;">
          <a href="${file.webViewLink}" target="_blank">
            <img src="https://drive.google.com/uc?export=view&id=${file.id}" alt="${file.name}" style="max-width:300px;margin:10px;border:2px solid #ccc;border-radius:8px;">
          </a>
          <br>
          <button onclick="deleteImage('${file.name}')">🗑️ Delete</button>
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
  } catch (err) {
    console.error("Error listing doodles from Google Drive:", err);
    res.status(500).send("Failed to load doodles");
  }
});

// Optional test route
app.get("/test", (req, res) => {
  res.send("Server is alive!");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
